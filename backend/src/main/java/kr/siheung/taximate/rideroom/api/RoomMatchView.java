package kr.siheung.taximate.rideroom.api;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Internal view the matching module scores against.
 *
 * @param activeParticipantTripIds trip ids of ACTIVE participants, host's sourceTripId included
 */
public record RoomMatchView(
        UUID roomId,
        UUID sourceTripId,
        UUID hostMemberId,
        RoomStatus status,
        int capacity,
        int seatsLeft,
        OffsetDateTime departureAt,
        OffsetDateTime departureWindowEnd,
        List<UUID> activeParticipantTripIds,
        RoomSummaryDto summary) {
}
