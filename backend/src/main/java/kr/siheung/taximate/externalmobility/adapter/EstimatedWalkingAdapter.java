package kr.siheung.taximate.externalmobility.adapter;

import java.util.List;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort.WalkResult;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort.WalkSource;

/** Fallback walking estimate: straight line x1.3 at 1.2 m/s, path = [from, to]. */
public final class EstimatedWalkingAdapter {
    private EstimatedWalkingAdapter() {}
    public static WalkResult estimate(LatLng from, LatLng to) {
        double distance = GeoUtils.distanceMeters(from, to) * 1.3;
        return new WalkResult((int) Math.round(distance), (int) Math.ceil(distance / 1.2), WalkSource.ESTIMATE, List.of(from, to));
    }
}
