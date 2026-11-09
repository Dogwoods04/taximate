package kr.siheung.taximate.common.privacy;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "taximate.privacy")
public record PrivacyProperties(int coordinateDecimals, int pathTrimMeters, int locationRetentionHours) {
    public PrivacyProperties {
        if (coordinateDecimals <= 0) coordinateDecimals = 3;
        if (pathTrimMeters < 0) pathTrimMeters = 200;
        // 0 = destroy precise trip coordinates as soon as the trip's purpose ends (위치정보법: 목적 달성 시 지체 없이 파기).
        if (locationRetentionHours < 0) locationRetentionHours = 0;
    }
}
