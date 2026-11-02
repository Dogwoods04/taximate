package kr.siheung.taximate.matching.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("taximate.meeting-point")
public record MeetingPointProperties(@DefaultValue("200") int nearRadiusMeters, @DefaultValue("500") int maxRadiusMeters,
        @DefaultValue("5") int maxSuggestions, @DefaultValue("3") int walkingCheckLimit) {
    public MeetingPointProperties {
        if (nearRadiusMeters < 0 || maxRadiusMeters <= 0 || nearRadiusMeters > maxRadiusMeters
                || maxSuggestions <= 0 || walkingCheckLimit < 0)
            throw new IllegalArgumentException("Invalid meeting-point thresholds");
    }
}
