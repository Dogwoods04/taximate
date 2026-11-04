package kr.siheung.taximate.externalmobility.api;

import kr.siheung.taximate.common.geo.LatLng;
import java.util.List;

public interface RoutePort {
    RouteResult findCarRoute(LatLng origin, LatLng destination);
    record RouteResult(String provider, int distanceMeters, int durationSeconds,
                       List<LatLng> path, Integer taxiFareWon, String providerRequestId) {}
}
