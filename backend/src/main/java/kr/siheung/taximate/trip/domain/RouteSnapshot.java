package kr.siheung.taximate.trip.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name="route_snapshots")
public class RouteSnapshot {
    @Id public UUID id;
    public UUID tripIntentId;
    @Column(length=20) public String provider;
    public Double originLat, originLng, destinationLat, destinationLng;
    @Column(columnDefinition="text") public String pathJson;
    public int distanceMeters, durationSeconds;
    public Integer taxiFareWon;
    public OffsetDateTime calculatedAt, expiresAt;
    public String providerRequestId;
}
