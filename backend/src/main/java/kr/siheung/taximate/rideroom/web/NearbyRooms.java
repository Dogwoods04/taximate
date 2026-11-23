package kr.siheung.taximate.rideroom.web;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.util.List;
import kr.siheung.taximate.rideroom.api.RoomSummaryDto;

/**
 * GET /api/rooms/open response: recruiting rooms whose boarding spot is within {@code radiusMeters} of the
 * caller's reference point, nearest first.
 *
 * @param radiusMeters radius actually applied
 * @param hasMore      more rooms matched than the configured maxResults
 */
public record NearbyRooms(int radiusMeters, List<Room> rooms, boolean hasMore) {
    /**
     * A RoomSummary plus its distance from the reference point.
     *
     * @param distanceMeters straight-line distance to the boarding spot, rounded to 10 m (LocationMasker)
     * @param distanceBasis  MEETING_POINT = the host set a meeting point away from the room's origin;
     *                       ORIGIN = the room boards at its origin (the default meeting point, or the
     *                       masked approxOrigin when no meeting point is set)
     */
    public record Room(@JsonUnwrapped RoomSummaryDto summary, int distanceMeters, String distanceBasis) {
    }
}
