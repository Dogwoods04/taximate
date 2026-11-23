package kr.siheung.taximate.rideroom.application;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Optional;
import java.util.UUID;
import kr.siheung.taximate.common.error.ApiException;
import kr.siheung.taximate.common.error.ErrorCode;
import kr.siheung.taximate.rideroom.api.RoomStatus;
import kr.siheung.taximate.rideroom.domain.RoomParticipant;
import kr.siheung.taximate.trip.api.TripStartGuard;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * A confirmed ride lasts until the member finishes it ("이동 완료"), the host closes the room, or the room is closed
 * automatically. Until then the member may not start another trip, open a room or join one (409 RIDE_IN_PROGRESS).
 * Depends only on the database so that the trip module can use it without a dependency cycle.
 */
@Component
public class OngoingRides implements TripStartGuard {
    @PersistenceContext private EntityManager em;

    /** The CONFIRMED room in which the member is still an ACTIVE participant, if any (newest first). */
    @Transactional(readOnly=true)
    public Optional<UUID> confirmedRoomOf(UUID memberId) {
        return em.createQuery("""
                select r.id from RideRoom r, RoomParticipant p
                where p.roomId=r.id and p.memberId=:member and p.status=:active and r.status=:confirmed
                order by r.confirmedAt desc
                """, UUID.class)
            .setParameter("member", memberId).setParameter("active", RoomParticipant.Status.ACTIVE)
            .setParameter("confirmed", RoomStatus.CONFIRMED).setMaxResults(1).getResultList().stream().findFirst();
    }

    /** Throws RIDE_IN_PROGRESS while the member's confirmed ride has not finished. */
    public void requireNoRideInProgress(UUID memberId) {
        if (confirmedRoomOf(memberId).isPresent())
            throw new ApiException(ErrorCode.RIDE_IN_PROGRESS, "확정된 동행이 아직 끝나지 않았습니다. 이동을 마친 뒤 새 동행을 시작해 주세요");
    }

    @Override
    public void checkCanStart(UUID memberId) { requireNoRideInProgress(memberId); }
}
