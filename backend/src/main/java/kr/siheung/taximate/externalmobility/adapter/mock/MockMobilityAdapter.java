package kr.siheung.taximate.externalmobility.adapter.mock;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.*;
import kr.siheung.taximate.common.geo.*;
import kr.siheung.taximate.common.place.*;
import kr.siheung.taximate.externalmobility.api.*;
import kr.siheung.taximate.externalmobility.adapter.Polylines;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix="taximate.kakao", name="mode", havingValue="mock", matchIfMissing=true)
public class MockMobilityAdapter implements RoutePort, PlaceSearchPort, MeetingPointPort {
    private final List<MeetingPointDto> places;
    public MockMobilityAdapter(ObjectMapper mapper) throws IOException {
        try (var stream = new ClassPathResource("fixtures/siheung-places.json").getInputStream()) {
            places = mapper.readValue(stream, new TypeReference<List<MeetingPointDto>>() {});
        }
    }
    @Override public RouteResult findCarRoute(LatLng origin, LatLng destination) {
        List<LatLng> corners = List.of(origin, LatLng.of(destination.lat(), origin.lng()), destination);
        double distance = GeoUtils.pathLengthMeters(corners);
        var path = Polylines.limit(GeoUtils.resample(corners, Math.max(100, distance / 190)));
        int distanceMeters = (int) Math.round(distance);
        int taxiFareWon = 4800 + 100 * (int) Math.ceil(Math.max(0, distanceMeters - 1600) / 131.0);
        return new RouteResult("MOCK", distanceMeters, (int) Math.ceil(distance / 8.3 + 60), path, taxiFareWon, null);
    }
    @Override public List<PlaceRef> search(String query, LatLng bias) {
        String normalized = query.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
        return places.stream().filter(p -> (p.name() + p.address()).replaceAll("\\s+", "")
                .toLowerCase(Locale.ROOT).contains(normalized))
                .sorted(Comparator.comparingDouble(p -> bias == null ? 0 : GeoUtils.distanceMeters(bias, p.location())))
                .limit(10).map(p -> new PlaceRef(p.name(), p.address(), p.location(), PlaceKind.SEARCH, p.id())).toList();
    }
    @Override public PlaceRef reverse(LatLng point) {
        var nearest = places.stream().min(Comparator.comparingDouble(p -> GeoUtils.distanceMeters(point, p.location()))).orElseThrow();
        return new PlaceRef("지도 선택 위치", nearest.address() + " 부근 (모의 주소)", point, PlaceKind.MAP_PICK, null);
    }
    @Override public List<MeetingPointDto> findNearby(LatLng center, int radiusMeters) {
        return places.stream().filter(p -> GeoUtils.distanceMeters(center, p.location()) <= radiusMeters)
                .sorted(Comparator.comparingDouble(p -> GeoUtils.distanceMeters(center, p.location()))).toList();
    }
}
