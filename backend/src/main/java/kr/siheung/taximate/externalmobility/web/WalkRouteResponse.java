package kr.siheung.taximate.externalmobility.web;

import java.util.List;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort.WalkResult;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort.WalkSource;

/** Contract {@code WalkRoute}: source "TMAP" | "ESTIMATE". */
public record WalkRouteResponse(String source, int distanceMeters, int durationSeconds, List<LatLng> path) {
    static WalkRouteResponse of(WalkResult r) {
        return new WalkRouteResponse(r.source() == WalkSource.WALKING_API ? "TMAP" : "ESTIMATE",
                r.distanceMeters(), r.durationSeconds(), r.path());
    }
}
