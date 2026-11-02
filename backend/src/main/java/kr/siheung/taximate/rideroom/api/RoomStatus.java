package kr.siheung.taximate.rideroom.api;

import java.util.Set;

public enum RoomStatus {
    /** Created, host only, recruiting. */
    OPEN,
    /** At least one participant joined; coordinating meeting point/time/terms. Still joinable while seats remain. */
    COORDINATING,
    /** Every ACTIVE participant confirmed the current termsVersion. No join, chat read-only. */
    CONFIRMED,
    /** Host closed after the ride (or after CONFIRMED). Read-only. */
    CLOSED,
    /** Host cancelled / host trip cancelled. Read-only. */
    CANCELLED,
    /** departureWindowEnd passed before CONFIRMED. Read-only. */
    EXPIRED;

    public static final Set<RoomStatus> JOINABLE = Set.of(OPEN, COORDINATING);
    /** Statuses in which a trip counts as "in a room". */
    public static final Set<RoomStatus> ACTIVE = Set.of(OPEN, COORDINATING, CONFIRMED);
    /** Statuses in which chat writes are rejected with ROOM_READ_ONLY. */
    public static final Set<RoomStatus> READ_ONLY = Set.of(CONFIRMED, CLOSED, CANCELLED, EXPIRED);
}
