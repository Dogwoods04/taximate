package kr.siheung.taximate.matching.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("taximate.matching")
public record MatchingProperties(@DefaultValue("200") int priorityRadiusMeters, @DefaultValue("500") int maxRadiusMeters,
        @DefaultValue("0.7") double minDirectionCosine, @DefaultValue("0.5") double minOverlapRatio,
        @DefaultValue("150") int overlapBufferMeters, @DefaultValue("30") int maxDepartureDiffMinutes,
        @DefaultValue("20") int maxCandidates, @DefaultValue Weights weights) {
    public MatchingProperties {
        if (weights == null) weights=new Weights(.25,.15,.30,.20,.10);
        if (priorityRadiusMeters < 0 || maxRadiusMeters <= 0 || priorityRadiusMeters > maxRadiusMeters
                || minDirectionCosine < -1 || minDirectionCosine > 1 || minOverlapRatio < 0 || minOverlapRatio > 1
                || overlapBufferMeters <= 0 || maxDepartureDiffMinutes < 0 || maxCandidates <= 0)
            throw new IllegalArgumentException("Invalid matching thresholds");
    }
    public record Weights(@DefaultValue("0.25") double originDistance, @DefaultValue("0.15") double destinationDistance,
            @DefaultValue("0.30") double overlap, @DefaultValue("0.20") double departureTime, @DefaultValue("0.10") double detour) {
        public Weights {
            if (originDistance < 0 || destinationDistance < 0 || overlap < 0 || departureTime < 0 || detour < 0
                    || !Double.isFinite(originDistance+destinationDistance+overlap+departureTime+detour)
                    || originDistance+destinationDistance+overlap+departureTime+detour <= 0)
                throw new IllegalArgumentException("Matching weights must be nonnegative and have a positive total");
        }
        public double total() { return originDistance+destinationDistance+overlap+departureTime+detour; }
    }
}
