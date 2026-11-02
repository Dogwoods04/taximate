package kr.siheung.taximate.conversation.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="messages",uniqueConstraints=@UniqueConstraint(columnNames={"room_id","sender_id","client_message_id"}))
public class Message {
    public enum Type { TEXT, SYSTEM }
    @Id public UUID id;
    @Column(nullable=false) public UUID roomId;
    public UUID senderId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Type type;
    @Column(nullable=false,columnDefinition="text") public String body;
    @Column(length=100) public String clientMessageId;
    public boolean hidden;
    @Column(nullable=false) public OffsetDateTime createdAt;
}
