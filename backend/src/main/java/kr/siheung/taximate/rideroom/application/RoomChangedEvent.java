package kr.siheung.taximate.rideroom.application;
import java.util.UUID;
import kr.siheung.taximate.rideroom.api.RoomStatus;
/** Synchronous system-message persistence; socket delivery occurs after commit. */
public record RoomChangedEvent(UUID roomId, RoomStatus status, int termsVersion, String systemMessage) {}
