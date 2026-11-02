package kr.siheung.taximate.identity.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Public API of the identity module. Other modules depend on this interface only,
 * never on identity's entities or repositories. Implemented by the identity module.
 */
public interface IdentityApi {

    /** @throws kr.siheung.taximate.common.error.ApiException NOT_FOUND */
    MemberSnapshot getMember(UUID memberId);

    /** Missing ids are simply absent from the result. */
    Map<UUID, MemberSnapshot> getMembers(Collection<UUID> memberIds);

    /** @throws kr.siheung.taximate.common.error.ApiException MEMBER_RESTRICTED when status != ACTIVE */
    void requireActive(UUID memberId);

    /**
     * Requires ACTIVE status and a current (not withdrawn) location consent.
     * @return the consent record id, stored on TripIntent as locationConsentReference
     * @throws kr.siheung.taximate.common.error.ApiException MEMBER_RESTRICTED / LOCATION_CONSENT_REQUIRED
     */
    UUID requireLocationConsent(UUID memberId);

    /** Moderator action. Idempotent. */
    void restrictMember(UUID memberId, String reason);
}
