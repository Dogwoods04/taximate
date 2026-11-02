package kr.siheung.taximate.identity.api;

import java.util.UUID;
import kr.siheung.taximate.common.auth.MemberRole;

public record MemberSnapshot(UUID id, String nickname, MemberRole role, MemberStatus status) {
}
