package kr.siheung.taximate.common.error;

import java.util.Map;

/** JSON error body: {"code":"ROOM_FULL","message":"...","details":{}} */
public record ErrorResponse(String code, String message, Map<String, Object> details) {
}
