package kr.siheung.taximate.trip.domain;

import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.*;
import kr.siheung.taximate.trip.api.TripStatus;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface TripRepository extends JpaRepository<TripIntent, UUID> {
    List<TripIntent> findByRequesterIdAndStatusIn(UUID memberId, Collection<TripStatus> statuses);
    @Query("select t.id from TripIntent t where t.requesterId=:memberId and t.status in :statuses order by t.id")
    List<UUID> findActiveIds(@Param("memberId") UUID memberId, @Param("statuses") Collection<TripStatus> statuses);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select t from TripIntent t where t.id=:id")
    Optional<TripIntent> lockById(@Param("id") UUID id);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select t from TripIntent t where t.status in :statuses and t.expiresAt < :now order by t.id")
    List<TripIntent> lockExpired(@Param("statuses") Collection<TripStatus> statuses, @Param("now") OffsetDateTime now);
    /**
     * Safety-net sweep: ended trips that still hold coordinates. MATCHED trips are normally erased when their room
     * ends; while the room may still be CONFIRMED they are only swept once their own window is long past.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select t from TripIntent t where t.endedAt <= :cutoff and (t.originLat is not null or t.destinationLat is not null) and (t.status <> :matched or t.expiresAt < :matchedCutoff) order by t.id")
    List<TripIntent> lockForPurge(@Param("cutoff") OffsetDateTime cutoff, @Param("matched") TripStatus matched, @Param("matchedCutoff") OffsetDateTime matchedCutoff);
    @Query("select t.id from TripIntent t where t.requesterId=:memberId order by t.id")
    List<UUID> findIdsByRequester(@Param("memberId") UUID memberId);
    @Query("select t.status, count(t) from TripIntent t where t.createdAt >= :since group by t.status")
    List<Object[]> countsSince(@Param("since") OffsetDateTime since);
}
