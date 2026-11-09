package kr.siheung.taximate.common.error;

import org.springframework.http.HttpStatus;

/** Stable error codes shared with the frontend (frontend/src/api/contract.ts ErrorCode). */
public enum ErrorCode {
    KAKAO_AUTH_FAILED(HttpStatus.BAD_GATEWAY),
    NICKNAME_TAKEN(HttpStatus.CONFLICT),
    GENDER_REQUIRED(HttpStatus.CONFLICT),
    GENDER_SOURCE_LOCKED(HttpStatus.CONFLICT),
    GENDER_RESTRICTED(HttpStatus.FORBIDDEN),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    FORBIDDEN(HttpStatus.FORBIDDEN),
    NOT_FOUND(HttpStatus.NOT_FOUND),
    MEMBER_RESTRICTED(HttpStatus.FORBIDDEN),
    /** Nickname login is limited to demo nicknames (taximate.auth.dev-login-nickname-prefix). */
    DEV_LOGIN_RESTRICTED(HttpStatus.FORBIDDEN),
    LOCATION_CONSENT_REQUIRED(HttpStatus.PRECONDITION_REQUIRED),
    ACTIVE_TRIP_EXISTS(HttpStatus.CONFLICT),
    TRIP_NOT_SEARCHABLE(HttpStatus.CONFLICT),
    ROUTE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE),
    ROUTE_EXPIRED(HttpStatus.CONFLICT),
    ROOM_NOT_JOINABLE(HttpStatus.CONFLICT),
    ROOM_FULL(HttpStatus.CONFLICT),
    ROOM_READ_ONLY(HttpStatus.CONFLICT),
    ALREADY_IN_ROOM(HttpStatus.CONFLICT),
    TERMS_VERSION_MISMATCH(HttpStatus.CONFLICT),
    MEETING_POINT_REQUIRED(HttpStatus.CONFLICT),
    LOCK_TIMEOUT(HttpStatus.SERVICE_UNAVAILABLE),
    EXTERNAL_API_ERROR(HttpStatus.BAD_GATEWAY),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
