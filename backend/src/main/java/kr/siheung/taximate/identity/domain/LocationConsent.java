package kr.siheung.taximate.identity.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="location_consents")
public class LocationConsent {
    @Id public UUID id;
    @Column(nullable=false) public UUID memberId;
    @Column(nullable=false,length=100) public String policyVersion;
    @Column(nullable=false) public OffsetDateTime agreedAt;
    public OffsetDateTime withdrawnAt;
}
