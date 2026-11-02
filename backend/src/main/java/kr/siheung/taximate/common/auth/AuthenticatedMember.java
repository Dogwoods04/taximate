package kr.siheung.taximate.common.auth;

import java.util.UUID;

/** The caller, resolved from "Authorization: Bearer <token>" by the identity module. */
public record AuthenticatedMember(UUID memberId, String nickname, MemberRole role) {
    public boolean isAdmin() {
        return role == MemberRole.ADMIN;
    }
}
