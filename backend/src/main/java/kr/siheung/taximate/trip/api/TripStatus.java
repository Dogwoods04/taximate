package kr.siheung.taximate.trip.api;

import java.util.Set;

public enum TripStatus {
    /** Created but no usable route yet (route API failed). Retry via POST /api/trips/{id}/route. */
    DRAFT,
    /** Route computed; visible to other users' searches. */
    SEARCHING,
    /** The trip's room reached CONFIRMED. Terminal for matching. */
    MATCHED,
    /** Last candidate search found nothing. Still visible to others; returns to SEARCHING on next hit. */
    NO_MATCH,
    CANCELLED,
    /** desiredDepartureAt + maxWaitMinutes passed without MATCHED. */
    EXPIRED;

    /** Statuses that other users' radius searches may see. */
    public static final Set<TripStatus> SEARCHABLE = Set.of(SEARCHING, NO_MATCH);

    /** Non-terminal statuses (a member may have at most one trip in these). */
    public static final Set<TripStatus> ACTIVE = Set.of(DRAFT, SEARCHING, NO_MATCH);
}
