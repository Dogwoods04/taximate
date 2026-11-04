package kr.siheung.taximate.externalmobility.adapter.tmap;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.externalmobility.adapter.EstimatedWalkingAdapter;
import kr.siheung.taximate.externalmobility.adapter.Polylines;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort;
import kr.siheung.taximate.externalmobility.application.WalkingProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.*;

/**
 * Pedestrian routing via TMAP ({@code POST /tmap/routes/pedestrian?version=1}) when {@code taximate.walking.tmap-app-key}
 * is set; otherwise, or on any provider failure, the straight-line estimate. Never throws for provider problems.
 * Coordinates are never logged: only HTTP status / exception type / latency.
 */
@Component
public class TmapWalkingAdapter implements WalkingRoutePort {
    private static final Logger log = LoggerFactory.getLogger(TmapWalkingAdapter.class);
    static final double MAX_STRAIGHT_METERS = 20_000;
    static final int MAX_POINTS = 300;
    // TMAP docs: startName/endName are required and must be UTF-8 URL-encoded.
    private static final String START_NAME = URLEncoder.encode("출발", StandardCharsets.UTF_8); // 출발
    private static final String END_NAME = URLEncoder.encode("도착", StandardCharsets.UTF_8);   // 도착

    private final WalkingProperties props;
    private final RestClient client;

    public TmapWalkingAdapter(WalkingProperties props, RestClient.Builder builder) {
        this.props = props;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(props.timeoutMillis()));
        factory.setReadTimeout(Duration.ofMillis(props.timeoutMillis()));
        this.client = builder.requestFactory(factory).baseUrl(props.tmapBaseUrl()).build();
    }

    @Override public Optional<WalkResult> walk(LatLng from, LatLng to) {
        if (!props.tmapEnabled() || GeoUtils.distanceMeters(from, to) > MAX_STRAIGHT_METERS)
            return Optional.of(EstimatedWalkingAdapter.estimate(from, to));
        long started = System.nanoTime();
        try {
            JsonNode body = client.post().uri("/tmap/routes/pedestrian?version=1")
                    .header("appKey", props.tmapAppKey())
                    .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
                    .body(request(from, to))
                    .retrieve().body(JsonNode.class);
            WalkResult parsed = parse(body);
            if (parsed != null) return Optional.of(parsed);
            log.warn("TMAP pedestrian route unusable (empty/invalid geometry) after {} ms; using estimate", elapsed(started));
        } catch (RestClientResponseException e) {
            log.warn("TMAP pedestrian route failed: HTTP {} after {} ms; using estimate", e.getStatusCode().value(), elapsed(started));
        } catch (RestClientException e) {
            log.warn("TMAP pedestrian route failed: {} after {} ms; using estimate", e.getClass().getSimpleName(), elapsed(started));
        } catch (RuntimeException e) {
            log.warn("TMAP pedestrian route parse failure: {} after {} ms; using estimate", e.getClass().getSimpleName(), elapsed(started));
        }
        return Optional.of(EstimatedWalkingAdapter.estimate(from, to));
    }

    private static Map<String, Object> request(LatLng from, LatLng to) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("startX", String.valueOf(from.lng()));
        body.put("startY", String.valueOf(from.lat()));
        body.put("endX", String.valueOf(to.lng()));
        body.put("endY", String.valueOf(to.lat()));
        body.put("startName", START_NAME);
        body.put("endName", END_NAME);
        body.put("reqCoordType", "WGS84GEO");
        body.put("resCoordType", "WGS84GEO");
        return body;
    }

    /** GeoJSON FeatureCollection -> WalkResult, or null if unusable. */
    static WalkResult parse(JsonNode body) {
        if (body == null) return null;
        JsonNode features = body.path("features");
        if (!features.isArray() || features.isEmpty()) return null;
        JsonNode summary = features.get(0).path("properties");
        Double distance = number(summary.get("totalDistance"));
        Double time = number(summary.get("totalTime"));
        if (distance == null || time == null || distance < 0 || time < 0) return null;
        List<LatLng> path = new ArrayList<>();
        for (JsonNode feature : features) {
            JsonNode geometry = feature.path("geometry");
            if (!"LineString".equals(geometry.path("type").asText())) continue;
            JsonNode coords = geometry.path("coordinates");
            if (!coords.isArray()) continue;
            for (JsonNode c : coords) {
                if (!c.isArray() || c.size() < 2) return null;
                Double lng = number(c.get(0));
                Double lat = number(c.get(1));
                if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
                LatLng point = LatLng.of(lat, lng);
                if (path.isEmpty() || !path.getLast().equals(point)) path.add(point);
            }
        }
        if (path.size() < 2) return null;
        return new WalkResult((int) Math.round(distance), (int) Math.round(time), WalkSource.WALKING_API,
                Polylines.limit(path, MAX_POINTS));
    }

    /** TMAP returns numbers, but tolerate numeric strings. */
    private static Double number(JsonNode node) {
        if (node == null || node.isNull()) return null;
        double value;
        if (node.isNumber()) value = node.asDouble();
        else if (node.isTextual()) {
            try { value = Double.parseDouble(node.asText().trim()); } catch (NumberFormatException e) { return null; }
        } else return null;
        return Double.isFinite(value) ? value : null;
    }

    private static long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000; }
}
