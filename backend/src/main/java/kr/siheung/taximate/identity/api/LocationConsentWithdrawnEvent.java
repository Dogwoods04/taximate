package kr.siheung.taximate.identity.api;

import java.util.UUID;

/**
 * Published (Spring ApplicationEventPublisher, synchronous, inside the withdrawing transaction)
 * when a member withdraws location consent. The trip module listens and cancels that member's
 * active TripIntents (which in turn emits TripCancelledEvent).
 */
public record LocationConsentWithdrawnEvent(UUID memberId) {
}
