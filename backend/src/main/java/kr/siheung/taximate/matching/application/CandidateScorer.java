package kr.siheung.taximate.matching.application;

import java.time.*;
import java.util.*;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.trip.api.TripIntentView;
import org.springframework.stereotype.Component;

/** Pure scoring over stored routes: never performs a provider request. */
@Component
public class CandidateScorer {
    private final MatchingProperties props;
    public CandidateScorer(MatchingProperties props) { this.props=props; }
    public Optional<Score> evaluate(TripIntentView mine, TripIntentView host, OffsetDateTime departure,
                                    double originDistance, double destinationDistance, OffsetDateTime now) {
        if (host.route() == null || host.origin() == null || host.destination() == null
                || !host.route().expiresAt().isAfter(now) || !host.expiresAt().isAfter(now)
                || mine.route().path().size() < 2 || host.route().path().size() < 2) return Optional.empty();
        var mo=mine.origin().location(); var md=mine.destination().location();
        var ho=host.origin().location(); var hd=host.destination().location();
        if (GeoUtils.distanceMeters(mo,md) < 1 || GeoUtils.distanceMeters(ho,hd) < 1) return Optional.empty();
        double direction=GeoUtils.bearingCosine(GeoUtils.bearingDegrees(mo,md),GeoUtils.bearingDegrees(ho,hd));
        if (direction < props.minDirectionCosine()) return Optional.empty();
        double overlap=Math.min(overlap(mine.route().path(),host.route().path()),overlap(host.route().path(),mine.route().path()));
        if (overlap < props.minOverlapRatio()) return Optional.empty();
        double departureDiff=Duration.between(mine.desiredDepartureAt(), departure).toMillis()/60000.0;
        double waitLimit=Math.min(props.maxDepartureDiffMinutes(),mine.maxWaitMinutes()+host.maxWaitMinutes());
        if (Math.abs(departureDiff) > waitLimit) return Optional.empty();
        double detour=(GeoUtils.distanceMeters(ho,mo)+GeoUtils.distanceMeters(md,hd))*1.3/8.3/60;
        double detourLimit=Math.min(mine.maxDetourMinutes(),host.maxDetourMinutes());
        if (detour > detourLimit) return Optional.empty();
        var w=props.weights();
        double value=(w.originDistance()*closeness(originDistance,props.maxRadiusMeters())
                +w.destinationDistance()*closeness(destinationDistance,props.maxRadiusMeters())+w.overlap()*overlap
                +w.departureTime()*closeness(Math.abs(departureDiff),waitLimit)+w.detour()*closeness(detour,detourLimit))/w.total();
        return Optional.of(new Score(overlap,departureDiff,detour,(int)Math.round(Math.max(0,Math.min(1,value))*100)));
    }
    private double overlap(List<LatLng> from, List<LatLng> to) {
        var samples=GeoUtils.resample(from,50);
        return samples.isEmpty() ? 0 : samples.stream().filter(p -> GeoUtils.distanceToPathMeters(p,to) <= props.overlapBufferMeters()).count()/(double)samples.size();
    }
    private static double closeness(double value,double limit) { return limit == 0 ? (value == 0 ? 1 : 0) : Math.max(0,1-value/limit); }
    public record Score(double overlapRatio,double departureDiffMinutes,double estimatedDetourMinutes,int score) {}
}
