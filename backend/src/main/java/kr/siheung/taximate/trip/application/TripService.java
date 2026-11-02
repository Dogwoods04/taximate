package kr.siheung.taximate.trip.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.lock.DistributedLock;
import kr.siheung.taximate.common.privacy.PrivacyProperties;
import kr.siheung.taximate.externalmobility.api.*;
import kr.siheung.taximate.identity.api.*;
import kr.siheung.taximate.trip.api.*;
import kr.siheung.taximate.trip.domain.*;
import kr.siheung.taximate.trip.web.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class TripService implements TripApi {
    private final TripRepository trips;
    private final RouteSnapshotRepository routes;
    private final IdentityApi identity;
    private final RoutePort provider;
    private final Clock clock;
    private final ObjectMapper mapper;
    private final RouteProperties routeProperties;
    private final PrivacyProperties privacy;
    private final ApplicationEventPublisher events;
    private final DistributedLock locks;
    private final TransactionTemplate tx;
    public TripService(TripRepository trips, RouteSnapshotRepository routes, IdentityApi identity, RoutePort provider,
            Clock clock, ObjectMapper mapper, RouteProperties routeProperties, PrivacyProperties privacy,
            ApplicationEventPublisher events, DistributedLock locks, PlatformTransactionManager manager) {
        this.trips=trips; this.routes=routes; this.identity=identity; this.provider=provider; this.clock=clock;
        this.mapper=mapper; this.routeProperties=routeProperties; this.privacy=privacy; this.events=events;
        this.locks=locks; this.tx=new TransactionTemplate(manager);
    }
    public TripResponse create(UUID memberId, CreateTripRequest request) {
        return locks.withLock("trip-member:" + memberId, () -> {
            try {
                return tx.execute(s -> {
                    var now=now();
                    var consent=identity.requireLocationConsent(memberId);
                    if (request.desiredDepartureAt().isBefore(now.minusMinutes(5)) || request.desiredDepartureAt().isAfter(now.plusDays(7)))
                        throw new ApiException(ErrorCode.VALIDATION_FAILED, "Departure must be within now-5min and now+7days");
                    validatePoint(request.origin().location()); validatePoint(request.destination().location());
                    if (!trips.findByRequesterIdAndStatusIn(memberId, TripStatus.ACTIVE).isEmpty())
                        throw new ApiException(ErrorCode.ACTIVE_TRIP_EXISTS, "이미 활성 이동 요청이 있습니다");
                    TripIntent t=new TripIntent();
                    t.id=UUID.randomUUID(); t.requesterId=memberId; t.status=TripStatus.DRAFT;
                    t.setPlaces(request.origin(), request.destination()); t.desiredDepartureAt=request.desiredDepartureAt();
                    t.maxWaitMinutes=request.maxWaitMinutes(); t.maxDetourMinutes=request.maxDetourMinutes(); t.passengerCount=request.passengerCount();
                    t.locationConsentReference=consent; t.expiresAt=t.desiredDepartureAt.plusMinutes(t.maxWaitMinutes);
                    t.createdAt=now; t.updatedAt=now;
                    t=trips.saveAndFlush(t);
                    try { calculate(t); } catch (MobilityException e) { t.routeError=ErrorCode.ROUTE_UNAVAILABLE.name(); }
                    return response(t);
                });
            } catch (DataIntegrityViolationException e) {
                if (!trips.findByRequesterIdAndStatusIn(memberId, TripStatus.ACTIVE).isEmpty())
                    throw new ApiException(ErrorCode.ACTIVE_TRIP_EXISTS, "이미 활성 이동 요청이 있습니다");
                throw e;
            }
        });
    }
    @Transactional(readOnly=true)
    public TripResponse active(UUID memberId) {
        return trips.findByRequesterIdAndStatusIn(memberId, TripStatus.ACTIVE).stream().findFirst().map(this::response).orElse(null);
    }
    @Transactional(readOnly=true)
    public TripResponse ownedResponse(UUID id, UUID memberId) { return response(owned(id, memberId, false)); }
    @Transactional
    public TripResponse refresh(UUID id, UUID memberId) {
        TripIntent t=owned(id, memberId, true);
        if (!TripStatus.ACTIVE.contains(t.status) || !t.expiresAt.isAfter(now()))
            throw new ApiException(ErrorCode.TRIP_NOT_SEARCHABLE, "종료된 이동 요청입니다");
        identity.requireLocationConsent(memberId);
        try { calculate(t); }
        catch (MobilityException e) {
            var existing=route(t);
            if (existing == null || !existing.expiresAt().isAfter(now()))
                throw new ApiException(ErrorCode.ROUTE_UNAVAILABLE, "경로를 불러올 수 없습니다", Map.of("reason", e.reason().name()));
        }
        return response(t);
    }
    @Transactional
    public TripResponse cancel(UUID id, UUID memberId) {
        TripIntent t=owned(id, memberId, true); cancelActive(t); return response(t);
    }
    private void calculate(TripIntent t) {
        var result=provider.findCarRoute(t.origin().location(), t.destination().location());
        if (result.path() == null || result.path().size() < 2 || result.distanceMeters() < 0 || result.durationSeconds() < 0)
            throw new MobilityException(MobilityException.Reason.NO_ROUTE);
        RouteSnapshot r=new RouteSnapshot(); r.id=UUID.randomUUID(); r.tripIntentId=t.id;
        r.provider=result.provider(); r.originLat=t.originLat; r.originLng=t.originLng;
        r.destinationLat=t.destinationLat; r.destinationLng=t.destinationLng;
        try { r.pathJson=mapper.writeValueAsString(result.path()); }
        catch (JsonProcessingException e) { throw new IllegalStateException("Cannot serialize route", e); }
        r.distanceMeters=result.distanceMeters(); r.durationSeconds=result.durationSeconds();
        r.providerRequestId=result.providerRequestId(); r.calculatedAt=now();
        r.expiresAt=r.calculatedAt.plusMinutes(routeProperties.snapshotTtlMinutes());
        routes.saveAndFlush(r); t.routeSnapshotId=r.id; t.routeError=null; t.status=TripStatus.SEARCHING; t.updatedAt=now();
    }
    @Override @Transactional(readOnly=true)
    public TripIntentView getTrip(UUID tripId) { return view(required(tripId, false)); }
    @Override @Transactional(readOnly=true)
    public TripIntentView getOwnedTrip(UUID tripId, UUID memberId) { return view(owned(tripId, memberId, false)); }
    @Override @Transactional(readOnly=true)
    public List<TripIntentView> getTrips(Collection<UUID> ids) { return trips.findAllById(ids).stream().map(this::view).toList(); }
    @Override @Transactional
    public void markMatched(Collection<UUID> ids) {
        ids.stream().distinct().sorted().forEach(id -> {
            TripIntent t=required(id, true);
            if (TripStatus.ACTIVE.contains(t.status)) t.end(TripStatus.MATCHED, now());
        });
    }
    @Override @Transactional
    public void releaseToSearching(UUID id) {
        TripIntent t=required(id, true);
        if (t.status == TripStatus.NO_MATCH) { t.status=TripStatus.SEARCHING; t.updatedAt=now(); }
    }
    @Override @Transactional(readOnly=true)
    public TripStats statsSince(OffsetDateTime since) {
        Map<TripStatus,Long> counts=new EnumMap<>(TripStatus.class);
        for (Object[] row : trips.countsSince(since)) counts.put((TripStatus)row[0], ((Number)row[1]).longValue());
        return new TripStats(counts.values().stream().mapToLong(Long::longValue).sum(), counts.getOrDefault(TripStatus.MATCHED,0L),
                counts.getOrDefault(TripStatus.NO_MATCH,0L), counts.getOrDefault(TripStatus.EXPIRED,0L), counts.getOrDefault(TripStatus.CANCELLED,0L));
    }
    @EventListener @Transactional
    public void consentWithdrawn(LocationConsentWithdrawnEvent event) {
        trips.findActiveIds(event.memberId(), TripStatus.ACTIVE).stream()
                .forEach(id -> { TripIntent t=required(id,true); t.locationConsentReference=null; cancelActive(t); });
    }
    private void cancelActive(TripIntent t) {
        if (TripStatus.ACTIVE.contains(t.status)) {
            t.end(TripStatus.CANCELLED, now()); events.publishEvent(new TripCancelledEvent(t.id, t.requesterId));
        }
    }
    @Scheduled(fixedDelay=60000) @Transactional
    public void expire() { var now=now(); trips.lockExpired(TripStatus.ACTIVE, now).forEach(t -> t.end(TripStatus.EXPIRED, now)); }
    @Scheduled(fixedDelay=3600000) @Transactional
    public void purgeLocations() {
        for (TripIntent t : trips.lockForPurge(now().minusHours(privacy.locationRetentionHours()))) {
            t.purgeLocation(); t.updatedAt=now(); routes.purgeForTrip(t.id);
        }
    }
    private TripIntent required(UUID id, boolean lock) {
        return (lock ? trips.lockById(id) : trips.findById(id)).orElseThrow(() -> ApiException.notFound("Trip"));
    }
    private TripIntent owned(UUID id, UUID memberId, boolean lock) {
        var t=required(id,lock); if (!t.requesterId.equals(memberId)) throw ApiException.forbidden("본인의 이동 요청만 조회할 수 있습니다"); return t;
    }
    private RouteView route(TripIntent t) {
        if (t.routeSnapshotId == null) return null;
        return routes.findById(t.routeSnapshotId).map(r -> {
            try { return new RouteView(r.id,r.provider,r.distanceMeters,r.durationSeconds,
                    mapper.readValue(r.pathJson,new TypeReference<List<LatLng>>(){}),r.calculatedAt,r.expiresAt); }
            catch (JsonProcessingException e) { throw new IllegalStateException("Invalid stored route",e); }
        }).orElse(null);
    }
    private TripIntentView view(TripIntent t) {
        return new TripIntentView(t.id,t.requesterId,t.status,t.origin(),t.destination(),t.desiredDepartureAt,
                t.maxWaitMinutes,t.maxDetourMinutes,t.passengerCount,route(t),t.expiresAt);
    }
    private TripResponse response(TripIntent t) {
        return new TripResponse(t.id,t.status,t.origin(),t.destination(),t.desiredDepartureAt,t.maxWaitMinutes,t.maxDetourMinutes,
                t.passengerCount,TripResponse.RouteResponse.from(route(t)),t.routeError,t.expiresAt,t.createdAt);
    }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private static void validatePoint(LatLng p) {
        if (!Double.isFinite(p.lat()) || !Double.isFinite(p.lng())) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Invalid coordinates");
    }
}
