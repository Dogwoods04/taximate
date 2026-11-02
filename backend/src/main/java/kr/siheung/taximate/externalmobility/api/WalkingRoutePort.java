package kr.siheung.taximate.externalmobility.api;

import java.util.Optional;
import kr.siheung.taximate.common.geo.LatLng;

public interface WalkingRoutePort {
    Optional<WalkResult> walk(LatLng from, LatLng to);
    record WalkResult(int distanceMeters, int durationSeconds, WalkSource source) {}
    enum WalkSource { WALKING_API, ESTIMATE }
}
