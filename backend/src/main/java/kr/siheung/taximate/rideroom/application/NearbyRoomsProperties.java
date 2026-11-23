package kr.siheung.taximate.rideroom.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Home "근처 열린 방" (GET /api/rooms/open).
 *
 * @param defaultRadiusMeters radius used when the client omits radiusMeters
 * @param maxRadiusMeters     widest radius a client may ask for (the "넓혀 보기" step must not exceed it)
 * @param maxResults          rooms returned after distance ordering; hasMore tells the client more matched
 */
@ConfigurationProperties("taximate.rooms.nearby")
public record NearbyRoomsProperties(@DefaultValue("500") int defaultRadiusMeters,
        @DefaultValue("3000") int maxRadiusMeters, @DefaultValue("20") int maxResults) {
    public NearbyRoomsProperties {
        if (defaultRadiusMeters <= 0 || maxRadiusMeters < defaultRadiusMeters || maxResults <= 0)
            throw new IllegalArgumentException("Invalid taximate.rooms.nearby settings");
    }
}
