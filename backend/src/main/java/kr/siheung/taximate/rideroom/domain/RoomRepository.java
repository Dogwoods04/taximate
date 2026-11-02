package kr.siheung.taximate.rideroom.domain;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface RoomRepository extends JpaRepository<RideRoom,UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RideRoom r where r.id=:id")
    Optional<RideRoom> lockById(@Param("id") UUID id);
}
