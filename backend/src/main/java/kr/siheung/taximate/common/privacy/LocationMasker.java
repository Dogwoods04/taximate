package kr.siheung.taximate.common.privacy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import kr.siheung.taximate.common.geo.GeoUtils;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.PlaceKind;
import kr.siheung.taximate.common.place.PlaceRef;
import org.springframework.stereotype.Component;

/**
 * Everything that leaves the server describing ANOTHER user's location must pass through here.
 * The owner of a trip may see their own precise coordinates; nobody else may.
 */
@Component
public class LocationMasker {
    private final PrivacyProperties props;

    public LocationMasker(PrivacyProperties props) {
        this.props = props;
    }

    /** Round to a coarse grid (default 3 decimals, roughly 110m). */
    public LatLng approximate(LatLng p) {
        if (p == null) return null;
        return LatLng.of(round(p.lat()), round(p.lng()));
    }

    /** Round a distance for display to others (10m steps). */
    public int roundDistance(double meters) {
        return (int) (Math.round(meters / 10.0) * 10);
    }

    /** Drop the first/last pathTrimMeters of a route so the exact start/end are not revealed. */
    public List<LatLng> trimPathEnds(List<LatLng> path) {
        if (path == null || path.size() < 3) return List.of();
        double trim = props.pathTrimMeters();
        double total = GeoUtils.pathLengthMeters(path);
        if (total <= trim * 2) return List.of();
        List<LatLng> out = new ArrayList<>();
        double acc = 0;
        for (int i = 0; i < path.size(); i++) {
            if (i > 0) acc += GeoUtils.distanceMeters(path.get(i - 1), path.get(i));
            if (acc >= trim && acc <= total - trim) out.add(path.get(i));
        }
        return out;
    }

    /**
     * Coarse, human label for another user's point. Public places (station exit, bus stop, landmark)
     * keep their name; anything else is reduced to the first 3 address tokens (e.g. "경기 시흥시 정왕동").
     */
    public String areaLabel(PlaceRef place) {
        if (place == null) return "위치 비공개";
        if (place.kind() == PlaceKind.STATION_EXIT || place.kind() == PlaceKind.BUS_STOP
                || place.kind() == PlaceKind.LANDMARK) {
            if (place.name() != null && !place.name().isBlank()) return place.name();
        }
        if (place.address() != null && !place.address().isBlank()) {
            String[] tokens = place.address().trim().split("\\s+");
            return String.join(" ", Arrays.copyOf(tokens, Math.min(3, tokens.length))) + " 부근";
        }
        return "지도 선택 위치 부근";
    }

    private double round(double v) {
        return BigDecimal.valueOf(v).setScale(props.coordinateDecimals(), RoundingMode.HALF_UP).doubleValue();
    }
}
