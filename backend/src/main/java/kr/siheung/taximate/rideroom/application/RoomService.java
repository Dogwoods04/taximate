package kr.siheung.taximate.rideroom.application;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.common.geo.GeoUtils;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.PlaceKind;
import kr.siheung.taximate.common.place.PlaceRef;
import kr.siheung.taximate.common.privacy.LocationMasker;
import kr.siheung.taximate.identity.api.*;
import kr.siheung.taximate.trip.api.*;
import kr.siheung.taximate.rideroom.api.*;
import kr.siheung.taximate.rideroom.domain.*;
import kr.siheung.taximate.rideroom.domain.RoomParticipant.*;
import kr.siheung.taximate.rideroom.web.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Transactional
public class RoomService implements RideRoomApi {
    @PersistenceContext private EntityManager em;
    private final RoomRepository rooms;
    private final TripApi trips;
    private final IdentityApi identity;
    private final LocationMasker masker;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final NearbyRoomsProperties nearby;
    private final OngoingRides rides;
    private final RoomLifecycleProperties lifecycle;
    public RoomService(RoomRepository rooms,TripApi trips,IdentityApi identity,LocationMasker masker,Clock clock,ApplicationEventPublisher events,NearbyRoomsProperties nearby,
            OngoingRides rides,RoomLifecycleProperties lifecycle) {
        this.rooms=rooms; this.trips=trips; this.identity=identity; this.masker=masker; this.clock=clock; this.events=events; this.nearby=nearby;
        this.rides=rides; this.lifecycle=lifecycle;
    }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private ApiException error(ErrorCode c) { return new ApiException(c,c.name()); }
    private RideRoom room(UUID id) { return rooms.findById(id).orElseThrow(()->ApiException.notFound("Room")); }
    private RideRoom lock(UUID id) { return rooms.lockById(id).orElseThrow(()->ApiException.notFound("Room")); }
    private List<RoomParticipant> participants(UUID id) {
        return em.createQuery("from RoomParticipant where roomId=:id order by joinedAt,id",RoomParticipant.class).setParameter("id",id).getResultList();
    }
    private List<RoomParticipant> active(UUID id) { return participants(id).stream().filter(p->p.status==Status.ACTIVE).toList(); }
    private RoomParticipant participant(UUID roomId,UUID memberId) { return participants(roomId).stream().filter(p->p.memberId.equals(memberId)).findFirst().orElse(null); }
    private RoomParticipant requireParticipant(UUID id,UUID memberId) {
        RoomParticipant p=participant(id,memberId);
        if(p==null || p.status!=Status.ACTIVE) throw ApiException.forbidden("Active participation required");
        return p;
    }
    private void host(RideRoom r,UUID memberId) { if(!r.hostMemberId.equals(memberId)) throw ApiException.forbidden("Host required"); }
    private void joinable(RideRoom r) { if(!RoomStatus.JOINABLE.contains(r.status)) throw error(ErrorCode.ROOM_READ_ONLY); }
    private int seats(RideRoom r) { return r.capacity-active(r.id).stream().mapToInt(p->p.passengerCount).sum(); }
    private void changed(RideRoom r,String text) { r.updatedAt=now(); events.publishEvent(new RoomChangedEvent(r.id,r.status,r.termsVersion,text)); }
    private TripIntentView searchable(UUID tripId,UUID memberId) {
        // Serializes assignment across different room locks and application instances.
        // pg_advisory_xact_lock returns void; wrap it so the JDBC result is a plain integer.
        em.createNativeQuery("select 1 from (select pg_advisory_xact_lock(hashtextextended(:key, 1))) l").setParameter("key",tripId.toString()).getSingleResult();
        TripIntentView t=trips.getOwnedTrip(tripId,memberId);
        if(!TripStatus.SEARCHABLE.contains(t.status()) || !t.expiresAt().isAfter(now())) throw error(ErrorCode.TRIP_NOT_SEARCHABLE);
        if(!findTripIdsInActiveRooms(List.of(tripId)).isEmpty()) throw error(ErrorCode.ALREADY_IN_ROOM);
        // A confirmed ride must be finished first (also covers trips created before this rule existed).
        rides.requireNoRideInProgress(memberId);
        return t;
    }
    private RoomParticipant add(RideRoom r,UUID memberId,TripIntentView t,Role role) {
        RoomParticipant p=participant(r.id,memberId);
        boolean created=p==null;
        if(created) { p=new RoomParticipant(); p.id=UUID.randomUUID(); p.roomId=r.id; p.memberId=memberId; }
        p.tripId=t.id(); p.role=role; p.status=Status.ACTIVE; p.passengerCount=t.passengerCount(); p.joinedAt=now(); p.leftAt=null; p.confirmedTermsVersion=null;
        // Persist only after all NOT NULL fields are set: Hibernate builds the INSERT from the state at persist() time.
        if(created) em.persist(p);
        return p;
    }
    public RoomDetail create(UUID memberId,RoomRequests.Create request) {
        identity.requireActive(memberId); TripIntentView t=searchable(request.sourceTripId(),memberId);
        if(t.passengerCount()>request.capacity()) throw error(ErrorCode.ROOM_FULL);
        RideRoom r=new RideRoom(); r.id=UUID.randomUUID(); r.hostMemberId=memberId; r.sourceTripId=t.id(); r.status=RoomStatus.OPEN;
        // Every room is same-gender only (shared-taxi rule): the host's gender decides who can find and join it.
        // request.sameGenderOnly is ignored and kept only for older clients.
        r.sameGenderOnly=true; r.restrictedGender=identity.getGender(memberId);
        if(!binary(r.restrictedGender)) throw error(ErrorCode.GENDER_REQUIRED);
        r.capacity=request.capacity(); r.departureAt=request.departureAt()==null?t.desiredDepartureAt():request.departureAt();
        r.departureWindowEnd=r.departureAt.plusMinutes(t.maxWaitMinutes());
        if(!r.departureWindowEnd.isAfter(now())) throw error(ErrorCode.VALIDATION_FAILED);
        r.terms(request.terms()); r.termsVersion=1; r.createdAt=r.updatedAt=now();
        // Default meeting place = the host's origin when it is a public place picked by search (never a GPS/map pin):
        // everyone gathers where the host starts; the host can change it later from "약속 바꾸기".
        String originName=publicName(t.origin());
        if(originName!=null) r.meetingPoint(new kr.siheung.taximate.common.place.MeetingPointDto(null,
                originName.length()>100?originName.substring(0,100):originName,
                kr.siheung.taximate.common.place.MeetingPointKind.CUSTOM,t.origin().location(),null));
        em.persist(r);
        add(r,memberId,t,Role.HOST); changed(r,"모집방이 만들어졌습니다"); return detail(r.id,memberId);
    }
    private static boolean binary(Gender g) { return g==Gender.MALE || g==Gender.FEMALE; }
    /** Same gender as the room, always. A legacy room without a recorded gender is open to no one new. */
    private boolean eligible(RideRoom r,UUID memberId) { return r.restrictedGender!=null && r.restrictedGender==identity.getGender(memberId); }
    public RoomDetail join(UUID id,UUID memberId,UUID tripId,Integer passengerCount) {
        RideRoom r=lock(id); identity.requireActive(memberId); RoomParticipant existing=participant(id,memberId);
        if(existing!=null && existing.status==Status.ACTIVE) return detail(id,memberId);
        if(!binary(identity.getGender(memberId))) throw error(ErrorCode.GENDER_REQUIRED);
        if(!eligible(r,memberId)) throw error(ErrorCode.GENDER_RESTRICTED);
        if(!RoomStatus.JOINABLE.contains(r.status) || r.hidden || !r.departureWindowEnd.isAfter(now()) || (existing!=null && existing.status==Status.REMOVED)) throw error(ErrorCode.ROOM_NOT_JOINABLE);
        TripIntentView t=searchable(tripId,memberId);
        int party=passengerCount==null?t.passengerCount():passengerCount;
        if(party<1 || party>3) throw new ApiException(ErrorCode.VALIDATION_FAILED,"본인을 포함해 1~3명을 선택해 주세요");
        if(seats(r)<party) throw error(ErrorCode.ROOM_FULL);
        // Joins the surrounding transaction: any later failure rolls the trip count back too.
        t=trips.updatePassengerCount(tripId,memberId,party);
        add(r,memberId,t,Role.MEMBER); r.status=RoomStatus.COORDINATING;
        changed(r,identity.getMember(memberId).nickname()+"님이 참여했습니다"); return detail(id,memberId);
    }
    public RoomDetail plan(UUID id,UUID memberId,RoomRequests.Plan plan) {
        RideRoom r=lock(id); host(r,memberId); identity.requireActive(memberId); joinable(r);
        r.departureAt=plan.departureAt(); r.departureWindowEnd=r.departureAt.plusMinutes(trips.getTrip(r.sourceTripId).maxWaitMinutes());
        if(!r.departureWindowEnd.isAfter(now())) throw error(ErrorCode.VALIDATION_FAILED);
        r.meetingPoint(plan.meetingPoint()); r.terms(plan.terms()); r.termsVersion++;
        active(id).forEach(p->p.confirmedTermsVersion=null); changed(r,"만남 장소와 탑승 조건이 변경되었습니다. 다시 확인해 주세요"); return detail(id,memberId);
    }
    public RoomDetail destination(UUID id,UUID memberId,RoomRequests.Destination request) {
        RideRoom r=lock(id); host(r,memberId); identity.requireActive(memberId); joinable(r);
        if(r.hidden || !r.departureWindowEnd.isAfter(now())) throw error(ErrorCode.ROOM_NOT_JOINABLE);
        trips.updateDestination(r.sourceTripId,memberId,request.destination());
        r.termsVersion++; active(id).forEach(p->p.confirmedTermsVersion=null);
        String name=request.destination().name();
        changed(r,"방장이 목적지를 "+(name==null || name.isBlank()?"새 장소":name)+"(으)로 바꿨어요");
        return detail(id,memberId);
    }
    public RoomDetail confirm(UUID id,UUID memberId,int version) {
        RideRoom r=lock(id); identity.requireActive(memberId); RoomParticipant p=requireParticipant(id,memberId);
        if(version!=r.termsVersion) throw error(ErrorCode.TERMS_VERSION_MISMATCH);
        if(r.status==RoomStatus.CONFIRMED && Objects.equals(p.confirmedTermsVersion,version)) return detail(id,memberId);
        joinable(r); if(r.meetingPoint()==null) throw error(ErrorCode.MEETING_POINT_REQUIRED);
        // A member whose gender changed after joining cannot confirm a ride with the other gender.
        if(!eligible(r,memberId)) throw error(ErrorCode.GENDER_RESTRICTED);
        if(Objects.equals(p.confirmedTermsVersion,version)) return detail(id,memberId);
        p.confirmedTermsVersion=version;
        changed(r,identity.getMember(memberId).nickname()+"님이 탑승 조건을 확인했습니다");
        List<RoomParticipant> a=active(id);
        if(a.size()>=2 && a.stream().allMatch(x->Objects.equals(x.confirmedTermsVersion,r.termsVersion))) {
            r.status=RoomStatus.CONFIRMED; r.confirmedAt=now(); trips.markMatched(a.stream().map(x->x.tripId).toList()); changed(r,"모두 확인하여 동승이 확정되었습니다");
        }
        return detail(id,memberId);
    }
    private void depart(RideRoom r,RoomParticipant p,Status status) {
        p.status=status; p.leftAt=now(); p.confirmedTermsVersion=null; trips.releaseToSearching(p.tripId);
        if(r.status==RoomStatus.COORDINATING && active(r.id).stream().noneMatch(x->x.role==Role.MEMBER)) r.status=RoomStatus.OPEN;
        changed(r,identity.getMember(p.memberId).nickname()+(status==Status.REMOVED?"님이 내보내졌습니다":"님이 나갔습니다"));
    }
    public RoomDetail leave(UUID id,UUID memberId) {
        RideRoom r=lock(id); joinable(r); RoomParticipant p=requireParticipant(id,memberId);
        if(p.role==Role.HOST) throw ApiException.forbidden("Host must cancel the room");
        depart(r,p,Status.LEFT); return detail(id,memberId,true);
    }
    public RoomDetail remove(UUID id,UUID hostId,UUID memberId) {
        RideRoom r=lock(id); host(r,hostId); joinable(r); RoomParticipant p=requireParticipant(id,memberId);
        if(p.role==Role.HOST) throw ApiException.forbidden("Cannot remove host");
        depart(r,p,Status.REMOVED); return detail(id,hostId);
    }
    private void end(RideRoom r,RoomStatus status) { end(r,status,null); }
    private void end(RideRoom r,RoomStatus status,String text) {
        r.status=status; r.closedAt=now(); active(r.id).forEach(p->trips.releaseToSearching(p.tripId));
        changed(r,text!=null?text:status==RoomStatus.CLOSED?"동승이 종료되었습니다":status==RoomStatus.EXPIRED?"모집 시간이 만료되었습니다":"모집방이 취소되었습니다");
        // The ride's purpose is over: destroy precise locations of trips that ended with this room (MATCHED etc.).
        // Trips released back to searching stay ACTIVE and are untouched by the trip module.
        Set<UUID> tripIds=new HashSet<>(); tripIds.add(r.sourceTripId); participants(r.id).forEach(p->tripIds.add(p.tripId));
        trips.eraseEndedLocations(tripIds);
    }
    public RoomDetail cancel(UUID id,UUID memberId) { RideRoom r=lock(id); host(r,memberId); joinable(r); end(r,RoomStatus.CANCELLED); return detail(id,memberId); }
    public RoomDetail close(UUID id,UUID memberId) {
        RideRoom r=lock(id); host(r,memberId); if(r.status!=RoomStatus.CONFIRMED) throw error(ErrorCode.ROOM_NOT_JOINABLE);
        end(r,RoomStatus.CLOSED); return detail(id,memberId);
    }
    /**
     * 이동 완료: a participant ends their own confirmed ride and may start another one. The host finishing closes
     * the room for everyone (same as close). Members' other trips stay untouched; this ride's locations are erased.
     */
    public RoomDetail finish(UUID id,UUID memberId) {
        RideRoom r=lock(id);
        RoomParticipant p=participant(id,memberId);
        if(!RoomStatus.ACTIVE.contains(r.status) && p!=null) return detail(id,memberId,true); // already ended: nothing left to finish
        if(p==null || p.status!=Status.ACTIVE) throw ApiException.forbidden("Active participation required");
        if(r.status!=RoomStatus.CONFIRMED) throw error(ErrorCode.ROOM_NOT_JOINABLE);
        if(p.role==Role.HOST) { end(r,RoomStatus.CLOSED); return detail(id,memberId); }
        p.status=Status.FINISHED; p.leftAt=now();
        trips.eraseEndedLocations(List.of(p.tripId));
        changed(r,identity.getMember(memberId).nickname()+"님이 이동을 마쳤습니다");
        return detail(id,memberId,true);
    }
    @EventListener public void tripCancelled(TripCancelledEvent e) {
        List<UUID> ids=em.createQuery("select p.roomId from RoomParticipant p where p.tripId=:trip and p.status=:active",UUID.class)
            .setParameter("trip",e.tripId()).setParameter("active",Status.ACTIVE).getResultList();
        for(UUID id:ids) { RideRoom r=lock(id); if(!RoomStatus.ACTIVE.contains(r.status)) continue;
            RoomParticipant p=participant(id,e.memberId()); if(p==null) continue;
            if(p.role==Role.HOST) end(r,RoomStatus.CANCELLED); else depart(r,p,Status.LEFT);
        }
    }
    /**
     * 회원 탈퇴 (after the trip module cancelled the active trip, which already cancelled/left the JOINABLE rooms of
     * that trip): leave every room where the member is still ACTIVE. Hosted OPEN/COORDINATING rooms are cancelled,
     * a hosted CONFIRMED room is closed (nobody else could close it), otherwise the member leaves. Ended rooms are
     * history and untouched. Same transitions as the user actions, so system messages and socket events fire.
     */
    @EventListener @org.springframework.core.annotation.Order(20)
    public void memberWithdrawn(MemberWithdrawnEvent e) {
        List<UUID> ids=em.createQuery("select p.roomId from RoomParticipant p where p.memberId=:member and p.status=:active order by p.roomId",UUID.class)
            .setParameter("member",e.memberId()).setParameter("active",Status.ACTIVE).getResultList();
        for(UUID id:ids) { RideRoom r=lock(id); if(!RoomStatus.ACTIVE.contains(r.status)) continue;
            RoomParticipant p=participant(id,e.memberId()); if(p==null || p.status!=Status.ACTIVE) continue;
            if(p.role==Role.HOST) end(r,r.status==RoomStatus.CONFIRMED?RoomStatus.CLOSED:RoomStatus.CANCELLED); else depart(r,p,Status.LEFT);
        }
    }
    /** Rooms the member hosts (any status); used by moderation to scrub report previews on withdrawal. */
    public List<UUID> hostedRoomIds(UUID memberId) {
        return em.createQuery("select r.id from RideRoom r where r.hostMemberId=:member",UUID.class).setParameter("member",memberId).getResultList();
    }
    public List<UUID> expiring() { return em.createQuery("select r.id from RideRoom r where r.status in :statuses and r.departureWindowEnd<:now",UUID.class).setParameter("statuses",RoomStatus.JOINABLE).setParameter("now",now()).getResultList(); }
    public void expire(UUID id) { RideRoom r=lock(id); if(RoomStatus.JOINABLE.contains(r.status) && r.departureWindowEnd.isBefore(now())) end(r,RoomStatus.EXPIRED); }
    /** CONFIRMED rooms nobody finished, confirmedAutoCloseMinutes after their departure window ended. */
    public List<UUID> overdueConfirmed() {
        return em.createQuery("select r.id from RideRoom r where r.status=:confirmed and r.departureWindowEnd<:before",UUID.class)
            .setParameter("confirmed",RoomStatus.CONFIRMED).setParameter("before",now().minusMinutes(lifecycle.confirmedAutoCloseMinutes())).getResultList();
    }
    /** Safety net: a forgotten confirmed ride ends by itself so it never stays "현재 내 방" or blocks the next ride. */
    public void autoClose(UUID id) {
        RideRoom r=lock(id);
        if(r.status==RoomStatus.CONFIRMED && r.departureWindowEnd.isBefore(now().minusMinutes(lifecycle.confirmedAutoCloseMinutes())))
            end(r,RoomStatus.CLOSED,"출발 시간이 한참 지나 동행이 자동으로 종료되었습니다");
    }
    public RoomStatus requireActiveParticipant(UUID id,UUID memberId) { RideRoom r=room(id); requireParticipant(id,memberId); return r.status; }
    public void requireWritable(UUID id,UUID memberId) { RideRoom r=lock(id); requireParticipant(id,memberId); identity.requireActive(memberId); joinable(r); }
    public RoomSummaryDto summary(UUID id) { return summary(room(id)); }
    private RoomSummaryDto summary(RideRoom r) {
        return summary(r,trips.getTrip(r.sourceTripId));
    }
    private RoomSummaryDto summary(RideRoom r,TripIntentView t) {
        List<RoomParticipant> a=active(r.id);
        return new RoomSummaryDto(r.id,r.status,identity.getMember(r.hostMemberId).nickname(),masker.approximate(t.origin()==null?null:t.origin().location()),masker.approximate(t.destination()==null?null:t.destination().location()),masker.areaLabel(t.origin()),masker.areaLabel(t.destination()),r.departureAt,r.departureWindowEnd,r.capacity,r.capacity-a.stream().mapToInt(p->p.passengerCount).sum(),a.size(),r.terms(),r.meetingPoint(),t.route()==null?null:t.route().taxiFareWon(),publicName(t.origin()),publicName(t.destination()),r.sameGenderOnly,t.route()==null?null:t.route().distanceMeters(),t.route()==null?null:t.route().durationSeconds());
    }
    private static final Set<PlaceKind> NAMED_KINDS=EnumSet.of(PlaceKind.SEARCH,PlaceKind.STATION_EXIT,PlaceKind.BUS_STOP,PlaceKind.LANDMARK);
    /** Public place/building name only (never PlaceRef.address); null for GPS/MAP_PICK or blank names. */
    private static String publicName(PlaceRef p) {
        return p==null||p.kind()==null||!NAMED_KINDS.contains(p.kind())||p.name()==null||p.name().isBlank()?null:p.name().strip();
    }
    public record ParticipantDto(UUID memberId,String nickname,Role role,Status status,int passengerCount,boolean confirmed,OffsetDateTime joinedAt) {}
    public RoomDetail detail(UUID id,UUID memberId) { return detail(id,memberId,false); }
    // Leaving must remain possible after a member changes their private gender.
    private RoomDetail detail(UUID id,UUID memberId,boolean justLeft) {
        RideRoom r=room(id); List<RoomParticipant> ps=participants(id); RoomParticipant mine=ps.stream().filter(p->p.memberId.equals(memberId)&&p.status==Status.ACTIVE).findFirst().orElse(null);
        if(mine==null && !justLeft && !eligible(r,memberId)) throw ApiException.notFound("Room");
        boolean all=active(id).size()>=2 && active(id).stream().allMatch(p->Objects.equals(p.confirmedTermsVersion,r.termsVersion));
        Map<UUID,MemberSnapshot> names=identity.getMembers(ps.stream().map(p->p.memberId).toList());
        // Non-members see only ACTIVE participants (same Participant shape, no location data); members also see LEFT/REMOVED/FINISHED history.
        List<ParticipantDto> visible=ps.stream().filter(p->mine!=null||p.status==Status.ACTIVE)
            .map(p->new ParticipantDto(p.memberId,names.get(p.memberId).nickname(),p.role,p.status,p.passengerCount,Objects.equals(p.confirmedTermsVersion,r.termsVersion),p.joinedAt)).toList();
        TripIntentView t=trips.getTrip(r.sourceTripId);
        boolean writable=RoomStatus.JOINABLE.contains(r.status), enabled=identity.getMember(memberId).status()==MemberStatus.ACTIVE;
        RoomParticipant previous=ps.stream().filter(p->p.memberId.equals(memberId)).findFirst().orElse(null);
        // Another confirmed ride not finished yet: this room cannot be joined until it is.
        UUID ongoing=mine!=null?null:rides.confirmedRoomOf(memberId).filter(other->!other.equals(id)).orElse(null);
        return new RoomDetail(summary(r),mine==null?"NONE":mine.role.name(),mine==null?null:mine.tripId,r.termsVersion,!writable,
            enabled&&mine==null&&ongoing==null&&writable&&!r.hidden&&seats(r)>0&&r.departureWindowEnd.isAfter(now())&&(previous==null||previous.status!=Status.REMOVED),
            enabled&&mine!=null&&writable&&r.meetingPoint()!=null&&!Objects.equals(mine.confirmedTermsVersion,r.termsVersion),all,visible,
            t.route()==null?List.of():masker.trimPathEnds(t.route().path()),ongoing);
    }
    public List<RoomSummaryDto> mine(UUID memberId) {
        return em.createQuery("select r from RideRoom r, RoomParticipant p where p.roomId=r.id and p.memberId=:member and p.status=:active and (r.status in :statuses or r.closedAt>=:since) order by r.createdAt desc",RideRoom.class)
            .setParameter("member",memberId).setParameter("active",Status.ACTIVE).setParameter("statuses",RoomStatus.ACTIVE).setParameter("since",now().minusHours(24)).getResultList().stream().map(this::summary).toList();
    }
    /** Placeholder for an empty JPQL IN list (no trip has this id). */
    private static final UUID NO_TRIP=new UUID(0L,0L);
    /** Within this distance a meeting point counts as the room's own origin (the default meeting point). */
    private static final double SAME_PLACE_METERS=1.0;
    /**
     * Home "근처 열린 방": recruiting rooms whose boarding spot is near the caller's reference point.
     * The boarding spot is the room's meeting point (a public place, exact) or, without one, the host origin
     * approximated by LocationMasker, never the destination. Distances are rounded to 10 m before filtering and
     * ordering, so the list, the map pins and the card labels agree. {@code lat}/{@code lng} are request-local
     * (one-shot GPS fix or a searched place) and are never stored or logged.
     */
    @Transactional(readOnly=true)
    public NearbyRooms open(UUID memberId,Double lat,Double lng,Integer radiusMeters) {
        if(lat==null || lng==null || !Double.isFinite(lat) || !Double.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
            throw new ApiException(ErrorCode.VALIDATION_FAILED,"Provide lat and lng of the reference point in valid coordinate ranges");
        int radius=radiusMeters==null?nearby.defaultRadiusMeters():radiusMeters;
        if(radius < 1 || radius > nearby.maxRadiusMeters())
            throw new ApiException(ErrorCode.VALIDATION_FAILED,"radiusMeters must be between 1 and "+nearby.maxRadiusMeters());
        LatLng center=LatLng.of(lat,lng);
        // A distance up to radius+5 m still rounds to the radius, so the database pre-filters use that reach.
        double reach=radius+5;
        // 1) Spatial filtering in the database, before any ordering or limit.
        //    Without a meeting point the room boards at the host origin: the trip module's GiST index finds those
        //    origins, widened by the masking error so that every masked origin in range is kept.
        Set<UUID> hostTrips=new HashSet<>(trips.findTripIdsWithOriginWithin(center,reach+masker.approximationErrorMeters()));
        if(hostTrips.isEmpty()) hostTrips.add(NO_TRIP);
        //    With a meeting point the room boards there: a bounding box on the stored coordinates.
        double dLat=Math.toDegrees(reach/GeoUtils.EARTH_RADIUS_M);
        double dLng=dLat/Math.max(0.01,Math.cos(Math.toRadians(lat)));
        List<RideRoom> candidates=em.createQuery("""
                select r from RideRoom r
                where r.status in :statuses and r.hidden=false and r.departureAt>:now
                and r.restrictedGender=:gender
                and not exists (select p.id from RoomParticipant p
                    where p.roomId=r.id and p.memberId=:member and p.status=:active)
                and r.capacity > (select coalesce(sum(p.passengerCount),0) from RoomParticipant p
                    where p.roomId=r.id and p.status=:active)
                and ((r.meetingPointName is not null
                        and r.meetingPointLat between :minLat and :maxLat and r.meetingPointLng between :minLng and :maxLng)
                    or (r.meetingPointName is null and r.sourceTripId in :hostTrips))
                """,RideRoom.class)
            .setParameter("statuses",RoomStatus.JOINABLE).setParameter("now",now())
            .setParameter("member",memberId).setParameter("active",Status.ACTIVE).setParameter("gender",identity.getGender(memberId))
            .setParameter("minLat",lat-dLat).setParameter("maxLat",lat+dLat)
            .setParameter("minLng",lng-dLng).setParameter("maxLng",lng+dLng)
            .setParameter("hostTrips",hostTrips).getResultList();
        // 2) Exact public distance to the boarding spot, then radius, order (distance, departure, id) and limit.
        Map<UUID,TripIntentView> hosts=trips.getTrips(candidates.stream().map(r->r.sourceTripId).toList())
            .stream().collect(Collectors.toMap(TripIntentView::id,t->t));
        record Nearby(RideRoom room,TripIntentView trip,int distance,String basis) {}
        List<Nearby> matched=candidates.stream().filter(r->hosts.containsKey(r.sourceTripId))
            .map(r->{
                TripIntentView t=hosts.get(r.sourceTripId);
                LatLng origin=t.origin()==null?null:t.origin().location();
                kr.siheung.taximate.common.place.MeetingPointDto point=r.meetingPoint();
                LatLng boarding=point!=null?point.location():masker.approximate(origin);
                String basis=point!=null && (origin==null || GeoUtils.distanceMeters(origin,point.location())>SAME_PLACE_METERS)
                    ?"MEETING_POINT":"ORIGIN";
                int distance=boarding==null?Integer.MAX_VALUE:masker.roundDistance(GeoUtils.distanceMeters(center,boarding));
                return new Nearby(r,t,distance,basis);
            })
            .filter(n->n.distance()<=radius)
            .sorted(Comparator.comparingInt(Nearby::distance)
                .thenComparing(n->n.room().departureAt).thenComparing(n->n.room().id))
            .toList();
        List<NearbyRooms.Room> shown=matched.stream().limit(nearby.maxResults())
            .map(n->new NearbyRooms.Room(summary(n.room(),n.trip()),n.distance(),n.basis())).toList();
        return new NearbyRooms(radius,shown,matched.size()>nearby.maxResults());
    }
    @Override public List<RoomMatchView> findJoinableRoomsBySourceTripIds(Collection<UUID> ids,UUID requesterMemberId) {
        if(ids.isEmpty()) return List.of();
        return em.createQuery("from RideRoom where sourceTripId in :ids and status in :statuses and hidden=false and departureWindowEnd>:now",RideRoom.class)
            .setParameter("ids",ids).setParameter("statuses",RoomStatus.JOINABLE).setParameter("now",now()).getResultList().stream().filter(r->eligible(r,requesterMemberId)).filter(r->seats(r)>0)
            .map(r->new RoomMatchView(r.id,r.sourceTripId,r.hostMemberId,r.status,r.capacity,seats(r),r.departureAt,r.departureWindowEnd,active(r.id).stream().map(p->p.tripId).toList(),summary(r))).toList();
    }
    @Override public Set<UUID> findTripIdsInActiveRooms(Collection<UUID> ids) {
        if(ids.isEmpty()) return Set.of();
        Set<UUID> found=new HashSet<>(em.createQuery("select p.tripId from RoomParticipant p, RideRoom r where p.roomId=r.id and p.tripId in :ids and p.status=:active and r.status in :statuses",UUID.class).setParameter("ids",ids).setParameter("active",Status.ACTIVE).setParameter("statuses",RoomStatus.ACTIVE).getResultList());
        found.addAll(em.createQuery("select r.sourceTripId from RideRoom r where r.sourceTripId in :ids and r.status in :statuses",UUID.class).setParameter("ids",ids).setParameter("statuses",RoomStatus.ACTIVE).getResultList()); return found;
    }
    @Override public List<UUID> getActiveParticipantTripIds(UUID id,UUID requester) { requireActiveParticipant(id,requester); return active(id).stream().map(p->p.tripId).toList(); }
    public void hide(UUID id) { RideRoom r=lock(id); r.hidden=true; changed(r,null); }
    public List<UUID> endedBefore(OffsetDateTime before) { return em.createQuery("select id from RideRoom where status in :statuses and closedAt<:before",UUID.class).setParameter("statuses",Set.of(RoomStatus.CLOSED,RoomStatus.CANCELLED,RoomStatus.EXPIRED)).setParameter("before",before).getResultList(); }
    public record RoomStats(long created,long confirmed) {}
    public RoomStats statsSince(OffsetDateTime since) {
        long created=em.createQuery("select count(r) from RideRoom r where r.createdAt>=:since",Long.class).setParameter("since",since).getSingleResult();
        long confirmed=em.createQuery("select count(r) from RideRoom r where r.createdAt>=:since and r.confirmedAt is not null",Long.class).setParameter("since",since).getSingleResult();
        return new RoomStats(created,confirmed);
    }
}
