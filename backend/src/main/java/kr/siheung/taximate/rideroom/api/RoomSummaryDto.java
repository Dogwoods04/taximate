package kr.siheung.taximate.rideroom.api;

import java.time.OffsetDateTime;
import java.util.UUID;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.MeetingPointDto;

/**
 * Public, privacy-safe room card. Safe to show to any signed-in user.
 * approxOrigin/approxDestination are LocationMasker.approximate() of the host trip's points;
 * labels come from LocationMasker.areaLabel().
 *
 * @param seatsLeft capacity - sum(passengerCount of ACTIVE participants incl. host)
 * @param meetingPoint null until host sets one
 * @param originName      public place/building name of the host trip origin (PlaceRef.name) when it was chosen by
 *                        search (kind SEARCH, STATION_EXIT, BUS_STOP, LANDMARK); null for GPS/MAP_PICK. Never an address.
 * @param destinationName same for the destination.
 * @param routeDistanceMeters  host trip route length (RouteView.distanceMeters), null if no route yet.
 * @param routeDurationSeconds host trip route driving time (RouteView.durationSeconds), null if no route yet.
 * @param estimatedTaxiFareWon whole-route taxi fare of the host trip route (RouteView.taxiFareWon), null if unknown.
 *                             The UI shows per-person fare = estimatedTaxiFareWon / participantCount.
 */
public record RoomSummaryDto(
        UUID id,
        RoomStatus status,
        String hostNickname,
        LatLng approxOrigin,
        LatLng approxDestination,
        String originLabel,
        String destinationLabel,
        OffsetDateTime departureAt,
        OffsetDateTime departureWindowEnd,
        int capacity,
        int seatsLeft,
        int participantCount,
        RoomTermsDto terms,
        MeetingPointDto meetingPoint,
        Integer estimatedTaxiFareWon,
        String originName,
        String destinationName,
        boolean sameGenderOnly,
        Integer routeDistanceMeters,
        Integer routeDurationSeconds) {
}
