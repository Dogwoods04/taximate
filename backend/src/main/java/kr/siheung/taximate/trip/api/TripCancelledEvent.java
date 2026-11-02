package kr.siheung.taximate.trip.api;

import java.util.UUID;

/**
 * Published synchronously inside the cancelling transaction when a TripIntent becomes CANCELLED
 * (user cancel or consent withdrawal). ride-room listens: a host's room is CANCELLED, a
 * participant leaves (seat freed). Not published for EXPIRED (ride-room expires rooms itself).
 */
public record TripCancelledEvent(UUID tripId, UUID memberId) {
}
