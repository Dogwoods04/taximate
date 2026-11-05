package kr.siheung.taximate.trip.api;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Public API of the trip module (TripIntent + RouteSnapshot). Implemented by the trip module.
 * Callers: ride-room, matching, moderation.
 */
public interface TripApi {

    /** Called inside the room transaction; replaces destination and route atomically, or throws ROUTE_UNAVAILABLE. */
    void updateDestination(UUID tripId, UUID memberId, kr.siheung.taximate.common.place.PlaceRef destination);

    /** @throws kr.siheung.taximate.common.error.ApiException NOT_FOUND */
    TripIntentView getTrip(UUID tripId);

    /**
     * Same as getTrip but also checks requesterId == memberId.
     * @throws kr.siheung.taximate.common.error.ApiException NOT_FOUND / FORBIDDEN
     */
    TripIntentView getOwnedTrip(UUID tripId, UUID memberId);

    /** Missing ids are skipped. Order not guaranteed. */
    List<TripIntentView> getTrips(Collection<UUID> tripIds);

    /**
     * Called by ride-room inside the CONFIRM transaction. Sets status MATCHED for each
     * trip currently in an ACTIVE status. Idempotent.
     */
    void markMatched(Collection<UUID> tripIds);

    /**
     * Called by ride-room when a trip leaves a room before confirmation (left / removed /
     * room cancelled or expired). If the trip is NO_MATCH it becomes SEARCHING; MATCHED,
     * CANCELLED, EXPIRED trips are left unchanged. Idempotent.
     */
    void releaseToSearching(UUID tripId);

    /** For operator metrics. Counts trips created at or after {@code since}, grouped by current status. */
    TripStats statsSince(OffsetDateTime since);

    record TripStats(long created, long matched, long noMatch, long expired, long cancelled) {
    }
}
