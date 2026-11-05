package kr.siheung.taximate.rideroom.web;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import kr.siheung.taximate.common.place.MeetingPointDto;
import kr.siheung.taximate.rideroom.api.RoomTermsDto;
public final class RoomRequests {
    private RoomRequests() {}
    public record Create(@NotNull UUID sourceTripId,@Min(2) @Max(4) int capacity,@NotNull @Valid RoomTermsDto terms,OffsetDateTime departureAt,Boolean sameGenderOnly) {}
    public record Plan(@NotNull @Valid MeetingPointDto meetingPoint,@NotNull OffsetDateTime departureAt,@NotNull @Valid RoomTermsDto terms) {}
    public record Join(@NotNull UUID tripId) {}
    public record Destination(@NotNull @Valid kr.siheung.taximate.common.place.PlaceRef destination) {}
    public record Confirm(@Min(1) int termsVersion) {}
}
