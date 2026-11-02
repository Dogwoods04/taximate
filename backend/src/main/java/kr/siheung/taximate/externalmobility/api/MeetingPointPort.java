package kr.siheung.taximate.externalmobility.api;

import java.util.List;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.common.place.MeetingPointDto;

public interface MeetingPointPort {
    List<MeetingPointDto> findNearby(LatLng center, int radiusMeters);
}
