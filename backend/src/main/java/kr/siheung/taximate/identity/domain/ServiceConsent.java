package kr.siheung.taximate.identity.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="service_consents")
public class ServiceConsent {
    @Id public UUID id;
    @Column(nullable=false) public UUID memberId;
    @Column(nullable=false,length=32) public String policyVersion;
    /** Comma-separated, sorted {@link ServiceItem} names, e.g. "KAKAO,TMAP". */
    @Column(nullable=false,length=64) public String items;
    @Column(nullable=false) public OffsetDateTime agreedAt;
    public OffsetDateTime withdrawnAt;
}
