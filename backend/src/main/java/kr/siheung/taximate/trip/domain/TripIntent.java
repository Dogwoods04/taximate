package kr.siheung.taximate.trip.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.*;
import kr.siheung.taximate.trip.api.TripStatus;

@Entity
@Table(name="trip_intents")
public class TripIntent {
    @Id public UUID id;
    public UUID requesterId;
    @Enumerated(EnumType.STRING) @Column(length=20) public TripStatus status;
    public Double originLat, originLng, destinationLat, destinationLng;
    @Column(length=100) public String originName, destinationName;
    @Column(length=200) public String originAddress, destinationAddress;
    @Enumerated(EnumType.STRING) @Column(length=20) public PlaceKind originKind, destinationKind;
    @Column(length=64) public String originProviderPlaceId, destinationProviderPlaceId;
    public OffsetDateTime desiredDepartureAt, expiresAt, createdAt, updatedAt, endedAt;
    public int maxWaitMinutes, maxDetourMinutes, passengerCount;
    public UUID routeSnapshotId, locationConsentReference;
    @Column(length=40) public String routeError;
    public PlaceRef origin() { return originLat == null ? null : new PlaceRef(originName, originAddress, LatLng.of(originLat, originLng), originKind, originProviderPlaceId); }
    public PlaceRef destination() { return destinationLat == null ? null : new PlaceRef(destinationName, destinationAddress, LatLng.of(destinationLat, destinationLng), destinationKind, destinationProviderPlaceId); }
    public void setPlaces(PlaceRef origin, PlaceRef destination) {
        originLat=origin.location().lat(); originLng=origin.location().lng(); originName=origin.name(); originAddress=origin.address(); originKind=origin.kind(); originProviderPlaceId=origin.providerPlaceId();
        destinationLat=destination.location().lat(); destinationLng=destination.location().lng(); destinationName=destination.name(); destinationAddress=destination.address(); destinationKind=destination.kind(); destinationProviderPlaceId=destination.providerPlaceId();
    }
    public void end(TripStatus status, OffsetDateTime now) { this.status=status; endedAt=now; updatedAt=now; }
    public void purgeLocation() {
        originLat=null; originLng=null; destinationLat=null; destinationLng=null;
        originName=null; originAddress=null; destinationName=null; destinationAddress=null;
        originProviderPlaceId=null; destinationProviderPlaceId=null;
    }
}
