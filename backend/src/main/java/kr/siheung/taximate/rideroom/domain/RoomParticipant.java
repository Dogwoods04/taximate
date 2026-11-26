package kr.siheung.taximate.rideroom.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="room_participants",uniqueConstraints=@UniqueConstraint(columnNames={"room_id","member_id"}))
public class RoomParticipant {
    public enum Role { HOST, MEMBER }
    /** FINISHED: ended their own confirmed ride ("이동 완료"); like LEFT, no longer counts as in the room. */
    public enum Status { ACTIVE, LEFT, REMOVED, FINISHED }
    @Id public UUID id;
    @Column(nullable=false) public UUID roomId;
    @Column(nullable=false) public UUID memberId;
    @Column(nullable=false) public UUID tripId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Role role;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public Status status;
    public int passengerCount;
    public Integer confirmedTermsVersion;
    @Column(nullable=false) public OffsetDateTime joinedAt;
    public OffsetDateTime leftAt;
}
