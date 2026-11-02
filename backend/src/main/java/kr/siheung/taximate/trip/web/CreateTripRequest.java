package kr.siheung.taximate.trip.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import kr.siheung.taximate.common.place.PlaceRef;

public record CreateTripRequest(@NotNull @Valid PlaceRef origin, @NotNull @Valid PlaceRef destination,
        @NotNull OffsetDateTime desiredDepartureAt, @Min(0) @Max(60) Integer maxWaitMinutes,
        @Min(0) @Max(30) Integer maxDetourMinutes, @NotNull @Min(1) @Max(3) Integer passengerCount) {
    public CreateTripRequest {
        if (maxWaitMinutes == null) maxWaitMinutes=15;
        if (maxDetourMinutes == null) maxDetourMinutes=10;
    }
}
