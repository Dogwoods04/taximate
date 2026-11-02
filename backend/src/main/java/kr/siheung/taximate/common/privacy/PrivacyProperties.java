package kr.siheung.taximate.common.privacy;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "taximate.privacy")
public record PrivacyProperties(int coordinateDecimals, int pathTrimMeters, int locationRetentionHours) {
    public PrivacyProperties {
        if (coordinateDecimals <= 0) coordinateDecimals = 3;
        if (pathTrimMeters < 0) pathTrimMeters = 200;
        if (locationRetentionHours <= 0) locationRetentionHours = 24;
    }
}
