package kr.siheung.taximate.matching.application;

import java.util.*;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.common.place.*;
import kr.siheung.taximate.common.privacy.LocationMasker;
import kr.siheung.taximate.externalmobility.api.*;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort.WalkSource;
import kr.siheung.taximate.matching.web.MeetingPointSuggestion;
import kr.siheung.taximate.matching.web.MatchCandidatesResponse.Tier;
import kr.siheung.taximate.rideroom.api.RideRoomApi;
import kr.siheung.taximate.trip.api.TripApi;
import org.springframework.stereotype.Service;

@Service
public class MeetingPointService {
    private final RideRoomApi rooms;
    private final TripApi trips;
    private final MeetingPointPort points;
    private final WalkingRoutePort walking;
    private final MeetingPointProperties props;
    private final LocationMasker masker;
    public MeetingPointService(RideRoomApi rooms,TripApi trips,MeetingPointPort points,WalkingRoutePort walking,
            MeetingPointProperties props,LocationMasker masker) {
        this.rooms=rooms; this.trips=trips; this.points=points; this.walking=walking; this.props=props; this.masker=masker;
    }
    public List<MeetingPointSuggestion> suggestions(UUID roomId,UUID memberId) {
        var ids=rooms.getActiveParticipantTripIds(roomId,memberId);
        var participantTrips=trips.getTrips(ids);
        if (ids.isEmpty() || participantTrips.size() != new HashSet<>(ids).size()
                || participantTrips.stream().anyMatch(t -> t.origin() == null || t.origin().location() == null)) return List.of();
        var origins=participantTrips.stream().map(t -> t.origin().location()).toList();
        LatLng center=LatLng.of(origins.stream().mapToDouble(LatLng::lat).average().orElseThrow(),origins.stream().mapToDouble(LatLng::lng).average().orElseThrow());
        List<MeetingPointDto> nearby;
        try { nearby=points.findNearby(center,props.maxRadiusMeters()); }
        catch (MobilityException e) { throw new ApiException(ErrorCode.EXTERNAL_API_ERROR,"만남 장소를 불러올 수 없습니다",Map.of("reason",e.reason().name())); }
        var ranked=nearby.stream().filter(p -> p.kind() != MeetingPointKind.CUSTOM)
                .filter(p -> GeoUtils.distanceMeters(center,p.location()) <= props.maxRadiusMeters())
                .map(p -> new Ranked(p,origins.stream().mapToDouble(o -> GeoUtils.distanceMeters(o,p.location())).max().orElseThrow()))
                .filter(p -> p.maxDistance() <= props.maxRadiusMeters())
                .sorted(Comparator.comparing((Ranked p) -> p.maxDistance() <= props.nearRadiusMeters() ? Tier.NEAR : Tier.EXTENDED)
                        .thenComparingDouble(Ranked::maxDistance).thenComparing(p -> p.point().name()))
                .limit(props.maxSuggestions()).toList();
        List<MeetingPointSuggestion> result=new ArrayList<>();
        for (int i=0;i<ranked.size();i++) {
            var candidate=ranked.get(i); double seconds=0; boolean allApi=i < props.walkingCheckLimit();
            for (var origin : origins) {
                double duration=GeoUtils.distanceMeters(origin,candidate.point().location())*1.3/1.2;
                if (i < props.walkingCheckLimit()) {
                    try {
                        var route=walking.walk(origin,candidate.point().location());
                        if (route.isPresent()) { duration=route.get().durationSeconds(); allApi &= route.get().source() == WalkSource.WALKING_API; }
                        else allApi=false;
                    } catch (MobilityException e) { allApi=false; }
                }
                seconds=Math.max(seconds,duration);
            }
            result.add(new MeetingPointSuggestion(candidate.point(),candidate.maxDistance() <= props.nearRadiusMeters() ? Tier.NEAR : Tier.EXTENDED,
                    masker.roundDistance(candidate.maxDistance()),Math.ceil(seconds/60),allApi ? WalkSource.WALKING_API : WalkSource.ESTIMATE));
        }
        return result;
    }
    private record Ranked(MeetingPointDto point,double maxDistance) {}
}
