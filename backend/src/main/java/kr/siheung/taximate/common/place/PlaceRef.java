package kr.siheung.taximate.common.place;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kr.siheung.taximate.common.geo.LatLng;

/** A user-chosen point (origin/destination). JSON contract: docs/api-contract.md#placeref */
public record PlaceRef(
        @Size(max = 100) String name,
        @Size(max = 200) String address,
        @NotNull @Valid LatLng location,
        @NotNull PlaceKind kind,
        @Size(max = 64) String providerPlaceId) {
}
