package kr.siheung.taximate.externalmobility.adapter.kakao;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.URI;
import java.time.Duration;
import java.util.*;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.common.place.*;
import kr.siheung.taximate.externalmobility.api.*;
import kr.siheung.taximate.externalmobility.adapter.Polylines;
import kr.siheung.taximate.externalmobility.application.KakaoProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.*;
import org.springframework.web.util.UriComponentsBuilder;

@Component
@ConditionalOnProperty(prefix="taximate.kakao", name="mode", havingValue="kakao")
public class KakaoMobilityAdapter implements RoutePort, PlaceSearchPort, MeetingPointPort {
    private final RestClient client;
    private final KakaoProperties props;
    public KakaoMobilityAdapter(KakaoProperties props, RestClient.Builder builder) {
        this.props = props;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(props.timeoutMillis()));
        factory.setReadTimeout(Duration.ofMillis(props.timeoutMillis()));
        client = builder.requestFactory(factory).defaultHeader("Authorization", "KakaoAK " + props.restApiKey()).build();
    }
    private <T> T get(URI uri, Class<T> type) {
        try {
            T result = client.get().uri(uri).retrieve().body(type);
            if (result == null) throw new MobilityException(MobilityException.Reason.PROVIDER_ERROR);
            return result;
        } catch (RestClientResponseException e) {
            throw new MobilityException(e.getStatusCode().value() == 429 ? MobilityException.Reason.QUOTA : MobilityException.Reason.PROVIDER_ERROR);
        } catch (RestClientException e) {
            throw new MobilityException(MobilityException.Reason.PROVIDER_ERROR);
        }
    }
    @Override public RouteResult findCarRoute(LatLng origin, LatLng destination) {
        var uri = UriComponentsBuilder.fromUriString(props.mobilityBaseUrl()).path("/v1/directions")
                .queryParam("origin", origin.lng() + "," + origin.lat())
                .queryParam("destination", destination.lng() + "," + destination.lat())
                .queryParam("priority", "RECOMMEND").build().encode().toUri();
        var response = get(uri, Directions.class);
        if (response.routes() == null || response.routes().isEmpty()) throw new MobilityException(MobilityException.Reason.NO_ROUTE);
        var route = response.routes().getFirst();
        if (route.resultCode() == null || route.resultCode() != 0) throw new MobilityException(MobilityException.Reason.NO_ROUTE);
        if (route.summary() == null || route.summary().distance() == null || route.summary().duration() == null)
            throw new MobilityException(MobilityException.Reason.PROVIDER_ERROR);
        List<LatLng> path = new ArrayList<>();
        for (var section : safe(route.sections())) for (var road : safe(section.roads())) {
            var vertices = safe(road.vertexes());
            if (vertices.size() % 2 != 0) throw new MobilityException(MobilityException.Reason.PROVIDER_ERROR);
            for (int i = 0; i < vertices.size(); i += 2) {
                var point = coordinate(vertices.get(i + 1), vertices.get(i));
                if (path.isEmpty() || !path.getLast().equals(point)) path.add(point);
            }
        }
        if (path.size() < 2) throw new MobilityException(MobilityException.Reason.NO_ROUTE);
        return new RouteResult("KAKAO", route.summary().distance(), route.summary().duration(), Polylines.limit(path), response.transId());
    }
    @Override public List<PlaceRef> search(String query, LatLng bias) {
        var builder = local("/v2/local/search/keyword.json").queryParam("query", "{query}").queryParam("size", 10);
        if (bias != null) builder.queryParam("x", bias.lng()).queryParam("y", bias.lat()).queryParam("radius", 20000);
        return safe(get(builder.encode().buildAndExpand(query).toUri(), Places.class).documents()).stream()
                .limit(10).map(p -> new PlaceRef(p.name(), p.address(), point(p), PlaceKind.SEARCH, p.id())).toList();
    }
    @Override public PlaceRef reverse(LatLng point) {
        var uri = local("/v2/local/geo/coord2address.json").queryParam("x", point.lng()).queryParam("y", point.lat()).build().encode().toUri();
        var documents = safe(get(uri, Addresses.class).documents());
        String address = documents.isEmpty() ? "" : documents.getFirst().label();
        return new PlaceRef("지도 선택 위치", address, point, PlaceKind.MAP_PICK, null);
    }
    @Override public List<MeetingPointDto> findNearby(LatLng center, int radiusMeters) {
        Map<String, MeetingPointDto> found = new LinkedHashMap<>();
        nearby(center, radiusMeters, "SW8", null, MeetingPointKind.LANDMARK, found);
        nearby(center, radiusMeters, null, "지하철역 출구", MeetingPointKind.STATION_EXIT, found);
        nearby(center, radiusMeters, null, "버스정류장", MeetingPointKind.BUS_STOP, found);
        nearby(center, radiusMeters, "AT4", null, MeetingPointKind.LANDMARK, found);
        return found.values().stream().sorted(Comparator.comparingDouble(p -> GeoUtils.distanceMeters(center, p.location()))).toList();
    }
    private void nearby(LatLng center, int radius, String category, String keyword, MeetingPointKind kind, Map<String, MeetingPointDto> out) {
        var builder = local(category == null ? "/v2/local/search/keyword.json" : "/v2/local/search/category.json")
                .queryParam("x", center.lng()).queryParam("y", center.lat()).queryParam("radius", radius)
                .queryParam("sort", "distance").queryParam("size", 15);
        if (category != null) builder.queryParam("category_group_code", category);
        else builder.queryParam("query", "{query}");
        URI uri = category == null ? builder.encode().buildAndExpand(keyword).toUri() : builder.build().encode().toUri();
        for (var p : safe(get(uri, Places.class).documents())) {
            LatLng location = point(p);
            if (GeoUtils.distanceMeters(center, location) <= radius)
                out.put(p.id(), new MeetingPointDto(p.id(), p.name(), kind, location, p.address()));
        }
    }
    private UriComponentsBuilder local(String path) { return UriComponentsBuilder.fromUriString(props.localBaseUrl()).path(path); }
    private static <T> List<T> safe(List<T> value) { return value == null ? List.of() : value; }
    private static LatLng point(Place p) {
        try { return coordinate(Double.valueOf(p.y()), Double.valueOf(p.x())); }
        catch (NumberFormatException | NullPointerException e) { throw new MobilityException(MobilityException.Reason.PROVIDER_ERROR); }
    }
    private static LatLng coordinate(Double lat, Double lng) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
            throw new MobilityException(MobilityException.Reason.PROVIDER_ERROR);
        return LatLng.of(lat, lng);
    }
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Directions(@JsonProperty("trans_id") String transId, List<Route> routes) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Route(@JsonProperty("result_code") Integer resultCode, Summary summary, List<Section> sections) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Summary(Integer distance, Integer duration) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Section(List<Road> roads) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Road(List<Double> vertexes) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Places(List<Place> documents) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Place(String id, @JsonProperty("place_name") String name, @JsonProperty("address_name") String address, String x, String y) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Addresses(List<AddressDocument> documents) {}
    @JsonIgnoreProperties(ignoreUnknown=true)
    record AddressDocument(Address address, @JsonProperty("road_address") Address roadAddress) {
        String label() { return roadAddress != null ? roadAddress.name() : address == null ? "" : address.name(); }
    }
    @JsonIgnoreProperties(ignoreUnknown=true)
    record Address(@JsonProperty("address_name") String name) {}
}
