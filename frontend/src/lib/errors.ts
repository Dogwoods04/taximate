import { ApiError } from '../api/client';
import type { ErrorCode } from '../api/contract';

export const errorMessages: Record<ErrorCode, string> = {
  KAKAO_AUTH_FAILED: '카카오 로그인에 실패했어요. 다시 시도해 주세요.',
  NICKNAME_TAKEN: '이미 사용 중이거나 사용할 수 없는 이름이에요. 다른 이름을 입력해 주세요.',
  GENDER_REQUIRED: '내 정보에서 성별을 선택해야 같은 성별만 타는 방을 만들 수 있어요.',
  GENDER_RESTRICTED: '이 방의 참여 조건에 맞지 않아요.',
  GENDER_SOURCE_LOCKED: '카카오에서 가져온 성별은 직접 변경할 수 없어요.',
  VALIDATION_FAILED: '입력값을 확인해 주세요.',
  UNAUTHENTICATED: '로그인이 필요해요. 다시 로그인해 주세요.',
  FORBIDDEN: '이 작업을 할 권한이 없어요.',
  NOT_FOUND: '요청한 정보를 찾을 수 없어요.',
  MEMBER_RESTRICTED: '이용이 제한된 계정이에요. 운영자에게 문의해 주세요.',
  LOCATION_CONSENT_REQUIRED: '위치 정보 이용 동의가 필요해요.',
  ACTIVE_TRIP_EXISTS: '이미 진행 중인 이동이 있어요.',
  TRIP_NOT_SEARCHABLE: '지금은 동행을 찾을 수 없는 이동 상태예요.',
  ROUTE_UNAVAILABLE: '경로를 계산하지 못했어요. 잠시 후 다시 시도해 주세요.',
  ROUTE_EXPIRED: '경로 정보가 만료되었어요. 경로를 다시 검색해 주세요.',
  ROOM_NOT_JOINABLE: '지금은 참여할 수 없는 동행방이에요.',
  ROOM_FULL: '좌석이 모두 찼어요.',
  ROOM_READ_ONLY: '확정되었거나 종료된 방이라 변경할 수 없어요.',
  ALREADY_IN_ROOM: '이미 다른 동행방에 참여 중이에요.',
  TERMS_VERSION_MISMATCH: '약속 내용이 바뀌었어요. 새 내용을 확인하고 다시 확정해 주세요.',
  MEETING_POINT_REQUIRED: '만날 장소가 정해져야 확정할 수 있어요.',
  LOCK_TIMEOUT: '요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.',
  EXTERNAL_API_ERROR: '서버 또는 외부 서비스에 연결하지 못했어요.',
  INTERNAL_ERROR: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    // Validation messages carry the specific field problem; everything else uses the fixed Korean text.
    if (error.code === 'VALIDATION_FAILED' && error.message && error.message !== error.code) return error.message;
    return errorMessages[error.code] ?? errorMessages.INTERNAL_ERROR;
  }
  return errorMessages.INTERNAL_ERROR;
}

export const isApiError = (error: unknown, code?: ErrorCode): error is ApiError =>
  error instanceof ApiError && (!code || error.code === code);
