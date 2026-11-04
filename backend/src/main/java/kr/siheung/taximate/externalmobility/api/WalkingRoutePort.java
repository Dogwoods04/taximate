package kr.siheung.taximate.externalmobility.api;

import java.util.List;
import java.util.Optional;
import kr.siheung.taximate.common.geo.LatLng;

public interface WalkingRoutePort {
    Optional<WalkResult> walk(LatLng from, LatLng to);

    /** {@code path} runs from -> to (at most 300 points); for ESTIMATE it is the straight segment [from, to]. */
    record WalkResult(int distanceMeters, int durationSeconds, WalkSource source, List<LatLng> path) {
        public WalkResult {
            path = path == null ? List.of() : List.copyOf(path);
        }
        public WalkResult(int distanceMeters, int durationSeconds, WalkSource source) {
            this(distanceMeters, durationSeconds, source, List.of());
        }
    }

    /** WALKING_API = a pedestrian routing provider (TMAP) answered; ESTIMATE = straight line x1.3 at 1.2 m/s. */
    enum WalkSource { WALKING_API, ESTIMATE }
}
