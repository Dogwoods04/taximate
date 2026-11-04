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
 * @param taxiFareWon estimated taxi fare for the whole route in KRW (Kakao summary.fare.taxi;
 *                    MOCK: Gyeonggi meter estimate). null when the provider gave none.
 */
public record RouteView(
        UUID snapshotId,
        String provider,
        int distanceMeters,
        int durationSeconds,
        List<LatLng> path,
        Integer taxiFareWon,
        OffsetDateTime calculatedAt,
        OffsetDateTime expiresAt) {
}
