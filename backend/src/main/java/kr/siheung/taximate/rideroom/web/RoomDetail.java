package kr.siheung.taximate.rideroom.web;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.util.*;
import kr.siheung.taximate.common.geo.LatLng;
import kr.siheung.taximate.rideroom.api.RoomSummaryDto;
public record RoomDetail(@JsonUnwrapped RoomSummaryDto summary,String myRole,UUID myTripId,
        int termsVersion,boolean readOnly,boolean canJoin,boolean canConfirm,boolean allConfirmed,
        List<?> participants,List<LatLng> routePreview,
        /* The caller's other CONFIRMED room whose ride has not finished (blocks joining this one), else null. */
        UUID ongoingRideRoomId) {}
