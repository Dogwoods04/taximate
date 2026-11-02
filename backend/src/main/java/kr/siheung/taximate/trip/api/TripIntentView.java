package kr.siheung.taximate.trip.api;

import java.time.OffsetDateTime;
import java.util.UUID;
import kr.siheung.taximate.common.place.PlaceRef;

/**
 * Internal read model of a TripIntent for other modules. Contains PRECISE origin/destination:
 * mask with LocationMasker before exposing to anyone other than requesterId.
 *
 * @param route     null while status == DRAFT
 * @param expiresAt desiredDepartureAt + maxWaitMinutes
 */
public record TripIntentView(
        UUID id,
        UUID requesterId,
        TripStatus status,
        PlaceRef origin,
        PlaceRef destination,
        OffsetDateTime desiredDepartureAt,
        int maxWaitMinutes,
        int maxDetourMinutes,
        int passengerCount,
        RouteView route,
        OffsetDateTime expiresAt) {
}
