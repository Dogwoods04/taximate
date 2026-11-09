package kr.siheung.taximate.identity.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import kr.siheung.taximate.common.auth.MemberRole;
import kr.siheung.taximate.identity.api.MemberStatus;

@Entity @Table(name = "members")
public class Member {
    @Id public UUID id;
    @Column(unique=true) public Long kakaoId;
    @Column(nullable=false,length=16) public String authProvider = "DEV";
    @Enumerated(EnumType.STRING) @Column(length=16) public kr.siheung.taximate.identity.api.Gender gender;
    @Enumerated(EnumType.STRING) @Column(length=16) public GenderSource genderSource;
    public OffsetDateTime genderUpdatedAt;
    @Column(nullable=false, unique=true, length=20) public String nickname;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) public MemberRole role;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) public MemberStatus status;
    @Column(length=1000) public String restrictedReason;
    @Column(nullable=false) public OffsetDateTime createdAt;
    /** Self-declared "over 14" confirmation time (null = not confirmed). */
    public OffsetDateTime ageConfirmedAt;
    public OffsetDateTime withdrawnAt;
}
