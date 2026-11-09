package kr.siheung.taximate.trip.application;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import kr.siheung.taximate.matching.api.MatchingTrips;
import kr.siheung.taximate.trip.api.*;
import kr.siheung.taximate.trip.domain.TripRepository;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripSpatialQuery implements MatchingTrips {
    private final NamedParameterJdbcTemplate jdbc;
    private final TripRepository trips;
    private final Clock clock;
    public TripSpatialQuery(NamedParameterJdbcTemplate jdbc, TripRepository trips, Clock clock) {
        this.jdbc=jdbc; this.trips=trips; this.clock=clock;
    }
    @Override @Transactional(readOnly=true)
    public List<NearbyTrip> findNearby(TripIntentView mine, int maxRadiusMeters) {
        if (mine.origin() == null || mine.destination() == null) return List.of();   // ended trip, location destroyed
        var params = Map.of("me", mine.requesterId(), "olat", mine.origin().location().lat(),
                "olng", mine.origin().location().lng(), "dlat", mine.destination().location().lat(),
                "dlng", mine.destination().location().lng(), "maxR", maxRadiusMeters);
        return jdbc.query("""
                SELECT t.id, ST_Distance(t.origin_geog, p.origin) AS origin_distance,
                       ST_Distance(t.destination_geog, p.destination) AS destination_distance
                FROM trip_intents t CROSS JOIN (SELECT
                  ST_SetSRID(ST_MakePoint(:olng,:olat),4326)::geography AS origin,
                  ST_SetSRID(ST_MakePoint(:dlng,:dlat),4326)::geography AS destination) p
                WHERE t.status IN ('SEARCHING','NO_MATCH') AND t.expires_at > now()
                  AND t.requester_id <> :me AND t.route_snapshot_id IS NOT NULL
                  AND t.location_consent_reference IS NOT NULL
                  AND ST_DWithin(t.origin_geog, p.origin, :maxR)
                  AND ST_DWithin(t.destination_geog, p.destination, :maxR)
                ORDER BY origin_distance, t.id
                """, params, (rs, row) -> new NearbyTrip(rs.getObject("id", UUID.class),
                rs.getDouble("origin_distance"), rs.getDouble("destination_distance")));
    }
    @Override @Transactional
    public void recordSearchResult(UUID tripId, boolean hasCandidates) {
        trips.lockById(tripId).ifPresent(t -> {
            if (TripStatus.SEARCHABLE.contains(t.status)) {
                t.status=hasCandidates ? TripStatus.SEARCHING : TripStatus.NO_MATCH;
                t.updatedAt=OffsetDateTime.now(clock);
            }
        });
    }
}
