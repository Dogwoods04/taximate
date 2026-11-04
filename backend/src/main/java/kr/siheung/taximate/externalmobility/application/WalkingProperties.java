package kr.siheung.taximate.externalmobility.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** TMAP pedestrian routing. Blank key => every walk is a straight-line estimate. */
@ConfigurationProperties("taximate.walking")
public record WalkingProperties(String tmapAppKey, String tmapBaseUrl, int timeoutMillis) {
    public WalkingProperties {
        tmapAppKey = tmapAppKey == null ? "" : tmapAppKey.trim();
        if (tmapBaseUrl == null || tmapBaseUrl.isBlank()) tmapBaseUrl = "https://apis.openapi.sk.com";
        if (timeoutMillis <= 0) timeoutMillis = 3000;
    }
    public boolean tmapEnabled() { return !tmapAppKey.isEmpty(); }
    @Override public String toString() { return "WalkingProperties[tmapEnabled=" + tmapEnabled() + ", tmapBaseUrl=" + tmapBaseUrl + "]"; }
}
