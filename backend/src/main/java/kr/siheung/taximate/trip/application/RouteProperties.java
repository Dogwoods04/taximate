package kr.siheung.taximate.trip.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("taximate.route")
public record RouteProperties(int snapshotTtlMinutes) {
    public RouteProperties { if (snapshotTtlMinutes <= 0) snapshotTtlMinutes = 30; }
}
