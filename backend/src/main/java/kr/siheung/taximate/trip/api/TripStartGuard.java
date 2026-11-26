package kr.siheung.taximate.trip.api;

import java.util.UUID;

/**
 * Lets another module veto a member's new trip (POST /api/trips), e.g. ride-room while the member's confirmed ride
 * has not finished. Called inside the trip-creation transaction; throw an ApiException to refuse.
 * Implementations must not depend on TripApi (TripService is built after them).
 */
public interface TripStartGuard {
    void checkCanStart(UUID memberId);
}
