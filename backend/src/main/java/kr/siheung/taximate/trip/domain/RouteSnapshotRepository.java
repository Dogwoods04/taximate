package kr.siheung.taximate.trip.domain;

import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface RouteSnapshotRepository extends JpaRepository<RouteSnapshot, UUID> {
    @Modifying @Query("update RouteSnapshot r set r.pathJson='[]', r.originLat=null, r.originLng=null, r.destinationLat=null, r.destinationLng=null, r.providerRequestId=null where r.tripIntentId=:tripId")
    int purgeForTrip(@Param("tripId") UUID tripId);
}
