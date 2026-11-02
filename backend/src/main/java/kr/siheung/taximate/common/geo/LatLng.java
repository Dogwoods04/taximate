package kr.siheung.taximate.common.geo;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/** WGS84 (EPSG:4326) coordinate. JSON: {"lat": 37.38, "lng": 126.80}. */
public record LatLng(
        @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat,
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double lng) {

    public static LatLng of(double lat, double lng) {
        return new LatLng(lat, lng);
    }
}
