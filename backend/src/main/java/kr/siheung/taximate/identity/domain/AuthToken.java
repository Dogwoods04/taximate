package kr.siheung.taximate.identity.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="auth_tokens")
public class AuthToken {
    @Id @Column(length=64) public String token;
    @Column(nullable=false) public UUID memberId;
    @Column(nullable=false) public OffsetDateTime createdAt;
    @Column(nullable=false) public OffsetDateTime lastUsedAt;
}
