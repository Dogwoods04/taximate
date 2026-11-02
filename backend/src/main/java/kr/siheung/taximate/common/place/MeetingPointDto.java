package kr.siheung.taximate.common.place;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kr.siheung.taximate.common.geo.LatLng;

/**
 * A public meeting place (station exit, bus stop, landmark, or a custom pin).
 * Exact coordinates are fine to share because the place is public, not a user's GPS fix.
 */
public record MeetingPointDto(
        @Size(max = 64) String id,
        @NotBlank @Size(max = 100) String name,
        @NotNull MeetingPointKind kind,
        @NotNull @Valid LatLng location,
        @Size(max = 200) String address) {
}
