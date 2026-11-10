package kr.siheung.taximate.matching.web;

import java.time.OffsetDateTime;
import java.util.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.rideroom.api.RoomSummaryDto;

public record MatchCandidatesResponse(UUID tripId, OffsetDateTime generatedAt, Policy policy,
        List<Candidate> candidates, long similarSearchingCount,
        /* Same origin/destination area, departing outside the searcher's time window; nearest time first. */
        List<Candidate> otherTimeCandidates) {
    public record Policy(int priorityRadiusMeters,int maxRadiusMeters) {}
    public enum Tier { NEAR, EXTENDED }
    public record Candidate(UUID roomId,Tier tier,int originDistanceMeters,int destinationDistanceMeters,
            double departureDiffMinutes,double overlapRatio,double estimatedDetourMinutes,int seatsLeft,int score,
            List<String> reasons,RoomSummaryDto room,List<LatLng> routePreview) {}
}
