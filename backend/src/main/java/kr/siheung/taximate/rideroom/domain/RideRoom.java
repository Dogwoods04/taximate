package kr.siheung.taximate.rideroom.domain;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import kr.siheung.taximate.rideroom.api.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.*;
@Entity @Table(name="ride_rooms")
public class RideRoom {
    @Id public UUID id;
    @Column(nullable=false) public UUID hostMemberId;
    @Column(nullable=false) public UUID sourceTripId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) public RoomStatus status;
    public int capacity;
    @Column(nullable=false) public boolean sameGenderOnly;
    @Enumerated(EnumType.STRING) @Column(length=16) public kr.siheung.taximate.identity.api.Gender restrictedGender;
    @Column(nullable=false) public OffsetDateTime departureAt;
    @Column(nullable=false) public OffsetDateTime departureWindowEnd;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=30) public FarePolicy farePolicy;
    public boolean luggageAllowed;
    @Column(length=200) public String termsNote;
    @Column(length=64) public String meetingPointId;
    @Column(length=100) public String meetingPointName;
    @Enumerated(EnumType.STRING) @Column(length=30) public MeetingPointKind meetingPointKind;
    public Double meetingPointLat;
    public Double meetingPointLng;
    @Column(length=200) public String meetingPointAddress;
    public int termsVersion;
    public boolean hidden;
    @Version public long version;
    @Column(nullable=false) public OffsetDateTime createdAt;
    @Column(nullable=false) public OffsetDateTime updatedAt;
    public OffsetDateTime confirmedAt;
    public OffsetDateTime closedAt;
    public RoomTermsDto terms() { return new RoomTermsDto(farePolicy,luggageAllowed,termsNote); }
    public void terms(RoomTermsDto t) { farePolicy=t.farePolicy(); luggageAllowed=t.luggageAllowed(); termsNote=t.note(); }
    public MeetingPointDto meetingPoint() {
        return meetingPointName==null?null:new MeetingPointDto(meetingPointId,meetingPointName,meetingPointKind,LatLng.of(meetingPointLat,meetingPointLng),meetingPointAddress);
    }
    public void meetingPoint(MeetingPointDto p) {
        meetingPointId=p.id(); meetingPointName=p.name(); meetingPointKind=p.kind(); meetingPointLat=p.location().lat(); meetingPointLng=p.location().lng(); meetingPointAddress=p.address();
    }
}
