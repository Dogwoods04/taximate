package kr.siheung.taximate.trip.web;

import java.time.OffsetDateTime;
import java.util.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.PlaceRef;
import kr.siheung.taximate.trip.api.*;

public record TripResponse(UUID id, TripStatus status, PlaceRef origin, PlaceRef destination,
        OffsetDateTime desiredDepartureAt, int maxWaitMinutes, int maxDetourMinutes, int passengerCount,
        RouteResponse route, String routeError, OffsetDateTime expiresAt, OffsetDateTime createdAt) {
    public record RouteResponse(UUID id, String provider, int distanceMeters, int durationSeconds,
            List<LatLng> path, Integer taxiFareWon, OffsetDateTime calculatedAt, OffsetDateTime expiresAt) {
        public static RouteResponse from(RouteView r) {
            return r == null ? null : new RouteResponse(r.snapshotId(), r.provider(), r.distanceMeters(), r.durationSeconds(), r.path(), r.taxiFareWon(), r.calculatedAt(), r.expiresAt());
        }
    }
}
