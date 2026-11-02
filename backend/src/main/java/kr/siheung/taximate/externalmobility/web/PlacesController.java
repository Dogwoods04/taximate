package kr.siheung.taximate.externalmobility.web;

import java.util.List;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.PlaceRef;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.externalmobility.api.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/places")
public class PlacesController {
    private final PlaceSearchPort places;
    public PlacesController(PlaceSearchPort places) { this.places = places; }
    @GetMapping("/search")
    public List<PlaceRef> search(@CurrentMember AuthenticatedMember me, @RequestParam String query,
                               @RequestParam(required=false) Double lat, @RequestParam(required=false) Double lng) {
        if (query.isBlank() || query.length() > 100) throw new ApiException(ErrorCode.VALIDATION_FAILED, "query must contain 1–100 characters");
        LatLng bias = lat == null && lng == null ? null : coordinate(lat, lng);
        try { return places.search(query.trim(), bias); } catch (MobilityException e) { throw failure(e); }
    }
    @GetMapping("/reverse")
    public PlaceRef reverse(@CurrentMember AuthenticatedMember me, @RequestParam Double lat, @RequestParam Double lng) {
        try { return places.reverse(coordinate(lat, lng)); } catch (MobilityException e) { throw failure(e); }
    }
    private static LatLng coordinate(Double lat, Double lng) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "Valid lat and lng are required together");
        return LatLng.of(lat, lng);
    }
    private static ApiException failure(MobilityException e) {
        return new ApiException(ErrorCode.EXTERNAL_API_ERROR, "장소 정보를 불러올 수 없습니다", java.util.Map.of("reason", e.reason().name()));
    }
}
