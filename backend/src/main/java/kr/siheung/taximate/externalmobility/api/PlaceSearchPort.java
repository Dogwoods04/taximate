package kr.siheung.taximate.externalmobility.api;

import java.util.List;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.PlaceRef;

public interface PlaceSearchPort {
    List<PlaceRef> search(String query, LatLng bias);
    PlaceRef reverse(LatLng point);
}
