package kr.siheung.taximate.rideroom.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="room_participants",uniqueConstraints=@UniqueConstraint(columnNames={"room_id","member_id"}))
public class RoomParticipant {
    public enum Role { HOST, MEMBER }
    public enum Status { ACTIVE, LEFT, REMOVED }
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
