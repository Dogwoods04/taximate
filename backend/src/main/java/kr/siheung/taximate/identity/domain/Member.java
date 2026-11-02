package kr.siheung.taximate.identity.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import kr.siheung.taximate.common.auth.MemberRole;
import kr.siheung.taximate.identity.api.MemberStatus;

@Entity @Table(name = "members")
public class Member {
    @Id public UUID id;
    @Column(nullable=false, unique=true, length=20) public String nickname;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) public MemberRole role;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) public MemberStatus status;
    @Column(length=1000) public String restrictedReason;
    @Column(nullable=false) public OffsetDateTime createdAt;
}
