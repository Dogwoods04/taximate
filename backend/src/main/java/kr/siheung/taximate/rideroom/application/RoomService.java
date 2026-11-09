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
    public RoomService(RoomRepository rooms,TripApi trips,IdentityApi identity,LocationMasker masker,Clock clock,ApplicationEventPublisher events) {
        this.rooms=rooms; this.trips=trips; this.identity=identity; this.masker=masker; this.clock=clock; this.events=events;
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
        r.sameGenderOnly=Boolean.TRUE.equals(request.sameGenderOnly());
        if(r.sameGenderOnly) {
            r.restrictedGender=identity.getGender(memberId);
            if(r.restrictedGender!=Gender.MALE && r.restrictedGender!=Gender.FEMALE) throw error(ErrorCode.GENDER_REQUIRED);
        }
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
    private boolean eligible(RideRoom r,UUID memberId) { return !r.sameGenderOnly || (r.restrictedGender!=null && r.restrictedGender==identity.getGender(memberId)); }
    public RoomDetail join(UUID id,UUID memberId,UUID tripId) {
        RideRoom r=lock(id); identity.requireActive(memberId); RoomParticipant existing=participant(id,memberId);
        if(existing!=null && existing.status==Status.ACTIVE) return detail(id,memberId);
        if(!eligible(r,memberId)) throw error(ErrorCode.GENDER_RESTRICTED);
        if(!RoomStatus.JOINABLE.contains(r.status) || r.hidden || !r.departureWindowEnd.isAfter(now()) || (existing!=null && existing.status==Status.REMOVED)) throw error(ErrorCode.ROOM_NOT_JOINABLE);
        TripIntentView t=searchable(tripId,memberId);
        if(seats(r)<t.passengerCount()) throw error(ErrorCode.ROOM_FULL);
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
    private void end(RideRoom r,RoomStatus status) {
        r.status=status; r.closedAt=now(); active(r.id).forEach(p->trips.releaseToSearching(p.tripId));
        changed(r,status==RoomStatus.CLOSED?"동승이 종료되었습니다":status==RoomStatus.EXPIRED?"모집 시간이 만료되었습니다":"모집방이 취소되었습니다");
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
        // Non-members see only ACTIVE participants (same Participant shape, no location data); members also see LEFT/REMOVED history.
        List<ParticipantDto> visible=ps.stream().filter(p->mine!=null||p.status==Status.ACTIVE)
            .map(p->new ParticipantDto(p.memberId,names.get(p.memberId).nickname(),p.role,p.status,p.passengerCount,Objects.equals(p.confirmedTermsVersion,r.termsVersion),p.joinedAt)).toList();
        TripIntentView t=trips.getTrip(r.sourceTripId);
        boolean writable=RoomStatus.JOINABLE.contains(r.status), enabled=identity.getMember(memberId).status()==MemberStatus.ACTIVE;
        RoomParticipant previous=ps.stream().filter(p->p.memberId.equals(memberId)).findFirst().orElse(null);
        return new RoomDetail(summary(r),mine==null?"NONE":mine.role.name(),mine==null?null:mine.tripId,r.termsVersion,!writable,
            enabled&&mine==null&&writable&&!r.hidden&&seats(r)>0&&r.departureWindowEnd.isAfter(now())&&(previous==null||previous.status!=Status.REMOVED),
            enabled&&mine!=null&&writable&&r.meetingPoint()!=null&&!Objects.equals(mine.confirmedTermsVersion,r.termsVersion),all,visible,
            t.route()==null?List.of():masker.trimPathEnds(t.route().path()));
    }
    public List<RoomSummaryDto> mine(UUID memberId) {
        return em.createQuery("select r from RideRoom r, RoomParticipant p where p.roomId=r.id and p.memberId=:member and p.status=:active and (r.status in :statuses or r.closedAt>=:since) order by r.createdAt desc",RideRoom.class)
            .setParameter("member",memberId).setParameter("active",Status.ACTIVE).setParameter("statuses",RoomStatus.ACTIVE).setParameter("since",now().minusHours(24)).getResultList().stream().map(this::summary).toList();
    }
    @Transactional(readOnly=true)
    public List<RoomSummaryDto> open(UUID memberId,Double lat,Double lng) {
        if((lat==null)!=(lng==null) || (lat!=null &&
                (!Double.isFinite(lat) || !Double.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)))
            throw new ApiException(ErrorCode.VALIDATION_FAILED,"Provide both lat and lng in valid coordinate ranges");
        // Bound the Java distance search to the earliest 500 eligible departures.
        // Caller coordinates are request-local only; host locations cross the TripApi boundary.
        List<RideRoom> eligible=em.createQuery("""
                select r from RideRoom r
                where r.status in :statuses and r.hidden=false and r.departureWindowEnd>:now
                and (r.sameGenderOnly=false or r.restrictedGender=:gender)
                and not exists (select p.id from RoomParticipant p
                    where p.roomId=r.id and p.memberId=:member and p.status=:active)
                and r.capacity > (select coalesce(sum(p.passengerCount),0) from RoomParticipant p
                    where p.roomId=r.id and p.status=:active)
                order by r.departureAt,r.id
                """,RideRoom.class)
            .setParameter("statuses",RoomStatus.JOINABLE).setParameter("now",now())
            .setParameter("member",memberId).setParameter("active",Status.ACTIVE)
            .setParameter("gender",identity.getGender(memberId)).setMaxResults(lat==null?10:500).getResultList();
        if(lat==null) return eligible.stream().map(this::summary).toList();
        LatLng caller=LatLng.of(lat,lng);
        Map<UUID,TripIntentView> hosts=trips.getTrips(eligible.stream().map(r->r.sourceTripId).toList())
            .stream().collect(Collectors.toMap(TripIntentView::id,t->t));
        record Nearby(RideRoom room,TripIntentView trip,double distance) {}
        return eligible.stream().filter(r->hosts.containsKey(r.sourceTripId))
            .map(r->{
                TripIntentView t=hosts.get(r.sourceTripId);
                LatLng origin=masker.approximate(t.origin()==null?null:t.origin().location());
                return new Nearby(r,t,origin==null?Double.POSITIVE_INFINITY:GeoUtils.distanceMeters(caller,origin));
            })
            .filter(n->n.distance()<=3000)
            .sorted(Comparator.comparingDouble(Nearby::distance)
                .thenComparing(n->n.room().departureAt).thenComparing(n->n.room().id))
            .limit(10).map(n->summary(n.room(),n.trip())).toList();
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
