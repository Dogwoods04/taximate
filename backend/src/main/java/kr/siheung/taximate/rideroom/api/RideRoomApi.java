package kr.siheung.taximate.rideroom.api;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Public API of the ride-room module. Implemented by ride-room; used by matching. */
public interface RideRoomApi {

    /**
     * Rooms whose host sourceTripId is in {@code hostTripIds}, status in JOINABLE,
     * not hidden by a moderator, seatsLeft > 0.
     */
    List<RoomMatchView> findJoinableRoomsBySourceTripIds(Collection<UUID> hostTripIds);

    /**
     * Of the given trip ids, those currently attached to a room in RoomStatus.ACTIVE
     * (as host source trip or as an ACTIVE participant's trip).
     */
    Set<UUID> findTripIdsInActiveRooms(Collection<UUID> tripIds);

    /**
     * Trip ids of the room's ACTIVE participants (host included), for meeting-point suggestions.
     * @throws kr.siheung.taximate.common.error.ApiException NOT_FOUND, FORBIDDEN if requester is not an ACTIVE participant
     */
    List<UUID> getActiveParticipantTripIds(UUID roomId, UUID requesterMemberId);
}
