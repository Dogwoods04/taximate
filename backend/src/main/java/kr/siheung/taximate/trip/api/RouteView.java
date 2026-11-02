package kr.siheung.taximate.trip.api;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import kr.siheung.taximate.common.geo.LatLng;

/**
 * Internal, provider-neutral view of a RouteSnapshot. Contains PRECISE geometry:
 * never return it as-is to anyone but the trip owner (use LocationMasker.trimPathEnds).
 *
 * @param provider "KAKAO" or "MOCK"
 * @param path     simplified car route polyline, origin -> destination
 */
public record RouteView(
        UUID snapshotId,
        String provider,
        int distanceMeters,
        int durationSeconds,
        List<LatLng> path,
        OffsetDateTime calculatedAt,
        OffsetDateTime expiresAt) {
}
