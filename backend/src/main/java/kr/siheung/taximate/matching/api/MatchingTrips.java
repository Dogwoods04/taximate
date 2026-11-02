package kr.siheung.taximate.matching.api;

import java.util.List;
import java.util.UUID;
import kr.siheung.taximate.trip.api.TripIntentView;

/** Matching-owned port implemented by trip; never exposes entities or repositories. */
public interface MatchingTrips {
    List<NearbyTrip> findNearby(TripIntentView mine, int maxRadiusMeters);
    void recordSearchResult(UUID tripId, boolean hasCandidates);
    record NearbyTrip(UUID id, double originDistanceMeters, double destinationDistanceMeters) {}
}
