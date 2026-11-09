package kr.siheung.taximate.identity.api;

import java.util.UUID;

/**
 * Published (Spring ApplicationEventPublisher, synchronous, inside the withdrawing transaction) when a member
 * withdraws their account (DELETE /api/me). By then the member row is already anonymized (placeholder nickname,
 * status WITHDRAWN). Each module erases or detaches its own data in its own listener:
 * trip cancels the active trip and erases precise coordinates; ride-room leaves rooms (hosted OPEN/COORDINATING
 * rooms are cancelled); conversation deletes the member's message bodies; moderation drops personal data
 * from report rows. A listener failure rolls the whole withdrawal back.
 */
public record MemberWithdrawnEvent(UUID memberId) {
}
