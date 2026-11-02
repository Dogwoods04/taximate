package kr.siheung.taximate.externalmobility.adapter;

import java.util.Optional;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort;
import org.springframework.stereotype.Component;

/** Both configured providers use an explicit estimate; no public Kakao walking REST is assumed. */
@Component
public class EstimatedWalkingAdapter implements WalkingRoutePort {
    @Override public Optional<WalkResult> walk(LatLng from, LatLng to) {
        double distance = GeoUtils.distanceMeters(from, to) * 1.3;
        return Optional.of(new WalkResult((int) Math.round(distance),
                (int) Math.ceil(distance / 1.2), WalkSource.ESTIMATE));
    }
}
