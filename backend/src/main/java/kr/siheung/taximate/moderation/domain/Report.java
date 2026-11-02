package kr.siheung.taximate.moderation.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="reports")
public class Report {
    public enum TargetType { ROOM, MESSAGE, MEMBER }
    public enum Reason { SPAM, ABUSE, NO_SHOW, FRAUD, PRIVACY, OTHER }
    public enum Status { OPEN, RESOLVED, DISMISSED }
    @Id public UUID id;
    @Column(nullable=false) public UUID reporterId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public TargetType targetType;
    @Column(nullable=false) public UUID targetId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Reason reason;
    @Column(length=500) public String detail;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Status status;
    @Column(length=500) public String targetPreview;
    @Column(nullable=false) public OffsetDateTime createdAt;
    public OffsetDateTime resolvedAt;
    public UUID resolvedBy;
    @Column(length=1000) public String resolutionNote;
}
