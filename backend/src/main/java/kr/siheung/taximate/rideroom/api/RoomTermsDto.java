package kr.siheung.taximate.rideroom.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RoomTermsDto(
        @NotNull FarePolicy farePolicy,
        boolean luggageAllowed,
        @Size(max = 200) String note) {
}
