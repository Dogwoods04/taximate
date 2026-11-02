package kr.siheung.taximate.matching.application;

import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.common.privacy.LocationMasker;
import kr.siheung.taximate.matching.api.MatchingTrips;
import kr.siheung.taximate.matching.web.MatchCandidatesResponse;
import kr.siheung.taximate.matching.web.MatchCandidatesResponse.*;
import kr.siheung.taximate.rideroom.api.RideRoomApi;
import kr.siheung.taximate.trip.api.*;
import org.springframework.stereotype.Service;

@Service
public class MatchingService {
    private final TripApi trips;
    private final MatchingTrips spatial;
    private final RideRoomApi rooms;
    private final CandidateScorer scorer;
    private final MatchingProperties props;
    private final LocationMasker masker;
    private final Clock clock;
    public MatchingService(TripApi trips,MatchingTrips spatial,RideRoomApi rooms,CandidateScorer scorer,
            MatchingProperties props,LocationMasker masker,Clock clock) {
        this.trips=trips; this.spatial=spatial; this.rooms=rooms; this.scorer=scorer; this.props=props; this.masker=masker; this.clock=clock;
    }
    public MatchCandidatesResponse candidates(UUID tripId,UUID memberId) {
        var mine=trips.getOwnedTrip(tripId,memberId); var now=OffsetDateTime.now(clock);
        if (!TripStatus.SEARCHABLE.contains(mine.status()) || !mine.expiresAt().isAfter(now))
            throw new ApiException(ErrorCode.TRIP_NOT_SEARCHABLE,"검색 가능한 이동 요청이 아닙니다");
        if (mine.route() == null || !mine.route().expiresAt().isAfter(now)) throw new ApiException(ErrorCode.ROUTE_EXPIRED,"경로를 다시 검색해 주세요");
        var nearby=spatial.findNearby(mine,props.maxRadiusMeters());
        var distances=nearby.stream().collect(Collectors.toMap(MatchingTrips.NearbyTrip::id,Function.identity()));
        var ids=nearby.stream().map(MatchingTrips.NearbyTrip::id).toList();
        var hosts=trips.getTrips(ids).stream().filter(t -> TripStatus.SEARCHABLE.contains(t.status()))
                .collect(Collectors.toMap(TripIntentView::id,Function.identity()));
        List<Candidate> candidates=new ArrayList<>();
        if (!ids.isEmpty()) for (var room : rooms.findJoinableRoomsBySourceTripIds(ids)) {
            if (room.seatsLeft() < mine.passengerCount() || !room.departureWindowEnd().isAfter(now)) continue;
            var host=hosts.get(room.sourceTripId()); var distance=distances.get(room.sourceTripId());
            if (host == null || distance == null || room.activeParticipantTripIds().contains(tripId)) continue;
            scorer.evaluate(mine,host,room.departureAt(),distance.originDistanceMeters(),distance.destinationDistanceMeters(),now).ifPresent(s -> {
                int origin=masker.roundDistance(distance.originDistanceMeters()), destination=masker.roundDistance(distance.destinationDistanceMeters());
                candidates.add(new Candidate(room.roomId(),distance.originDistanceMeters() <= props.priorityRadiusMeters() ? Tier.NEAR : Tier.EXTENDED,
                        origin,destination,round(s.departureDiffMinutes()),round(s.overlapRatio()),round(s.estimatedDetourMinutes()),room.seatsLeft(),s.score(),
                        List.of("출발지 "+origin+"m","경로 "+Math.round(s.overlapRatio()*100)+"% 겹침","추가 이동 약 "+Math.round(s.estimatedDetourMinutes())+"분"),
                        room.summary(),masker.trimPathEnds(host.route().path())));
            });
        }
        candidates.sort(Comparator.comparing(Candidate::tier).thenComparing(Comparator.comparingInt(Candidate::score).reversed()).thenComparing(Candidate::roomId));
        var inRooms=ids.isEmpty() ? Set.<UUID>of() : rooms.findTripIdsInActiveRooms(ids);
        long similar=hosts.values().stream().filter(h -> h.status() == TripStatus.SEARCHING && !inRooms.contains(h.id())).filter(h -> {
            var d=distances.get(h.id()); return scorer.evaluate(mine,h,h.desiredDepartureAt(),d.originDistanceMeters(),d.destinationDistanceMeters(),now).isPresent();
        }).count();
        spatial.recordSearchResult(tripId,!candidates.isEmpty());
        return new MatchCandidatesResponse(tripId,now,new Policy(props.priorityRadiusMeters(),props.maxRadiusMeters()),
                candidates.stream().limit(props.maxCandidates()).toList(),similar);
    }
    private static double round(double value) { return Math.round(value*100)/100.0; }
}
