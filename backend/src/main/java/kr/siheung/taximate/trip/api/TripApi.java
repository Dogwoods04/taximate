package kr.siheung.taximate.trip.api;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import kr.siheung.taximate.common.geo.LatLng;

/**
 * Public API of the trip module (TripIntent + RouteSnapshot). Implemented by the trip module.
 * Callers: ride-room, matching, moderation.
 */
public interface TripApi {

    /** Inside the locked room transaction: extend active trips through the room window plus their normal wait margin. Never shorten or revive. */
    void extendExpiryForRoom(Collection<UUID> tripIds, OffsetDateTime departureWindowEnd);

    /** Called inside the room transaction; replaces destination and route atomically, or throws ROUTE_UNAVAILABLE. */
    void updateDestination(UUID tripId, UUID memberId, kr.siheung.taximate.common.place.PlaceRef destination);

    /** Called inside the locked room join transaction; preserves the route and changes the owned trip party size. */
    TripIntentView updatePassengerCount(UUID tripId, UUID memberId, int passengerCount);

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
     * Ids of trips whose precise origin lies within {@code radiusMeters} of {@code center} (PostGIS ST_DWithin on the
     * origin GiST index). Internal, coarse pre-filter for the nearby-room list: ride-room still computes the public
     * (LocationMasker) distance itself and never exposes the precise origin. Trips whose location was destroyed
     * never match. {@code center} is request-local and is not stored or logged.
     */
    Set<UUID> findTripIdsWithOriginWithin(LatLng center, double radiusMeters);

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

    /**
     * Called by ride-room when a room reaches CLOSED / CANCELLED / EXPIRED: the ride's purpose has ended, so
     * precise coordinates of every listed trip that is no longer ACTIVE (MATCHED, CANCELLED, EXPIRED) are
     * destroyed now (origin/destination, place names/addresses, route path). ACTIVE trips (released back to
     * searching) are left untouched. Idempotent; missing ids are skipped.
     */
    void eraseEndedLocations(Collection<UUID> tripIds);

    /** For operator metrics. Counts trips created at or after {@code since}, grouped by current status. */
    TripStats statsSince(OffsetDateTime since);

    record TripStats(long created, long matched, long noMatch, long expired, long cancelled) {
    }
}
