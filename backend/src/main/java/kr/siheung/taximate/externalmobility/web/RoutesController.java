package kr.siheung.taximate.externalmobility.web;

import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.externalmobility.adapter.EstimatedWalkingAdapter;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort;
import org.springframework.web.bind.annotation.*;

/** Pedestrian route for the "walk to the boarding spot" view. Coordinates are neither stored nor logged. */
@RestController
@RequestMapping("/api/routes")
public class RoutesController {
    private final WalkingRoutePort walking;
    public RoutesController(WalkingRoutePort walking) { this.walking = walking; }

    @GetMapping("/walk")
    public WalkRouteResponse walk(@CurrentMember AuthenticatedMember me,
                                  @RequestParam Double fromLat, @RequestParam Double fromLng,
                                  @RequestParam Double toLat, @RequestParam Double toLng) {
        LatLng from = coordinate(fromLat, fromLng, "from");
        LatLng to = coordinate(toLat, toLng, "to");
        var result = walking.walk(from, to).orElseGet(() -> EstimatedWalkingAdapter.estimate(from, to));
        if (result.path().size() < 2) result = EstimatedWalkingAdapter.estimate(from, to);
        return WalkRouteResponse.of(result);
    }

    private static LatLng coordinate(Double lat, Double lng, String name) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "Valid " + name + "Lat and " + name + "Lng are required");
        return LatLng.of(lat, lng);
    }
}
