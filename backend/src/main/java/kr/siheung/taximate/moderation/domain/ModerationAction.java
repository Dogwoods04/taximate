package kr.siheung.taximate.moderation.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="moderation_actions")
public class ModerationAction {
    public enum Action { HIDE_ROOM, HIDE_MESSAGE, RESTRICT_MEMBER, DISMISS }
    @Id public UUID id;
    @Column(nullable=false) public UUID reportId;
    @Column(nullable=false) public UUID adminId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=30) public Action action;
    @Column(length=1000) public String note;
    @Column(nullable=false) public OffsetDateTime createdAt;
}
