import type { FarePolicy, MeetingPointKind, ReportReason, ReportStatus, ReportTargetType, RoomStatus, TripStatus } from '../api/contract';

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO-8601 with the browser's local offset, e.g. 2026-11-02T18:30:00+09:00 */
export function toOffsetIso(date: Date): string {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `오늘 ${time}` : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
}

/** Room ends for display: the public place/building name the host picked, else the area label. */
export const originTitle = (r: { originName?: string | null; originLabel: string }) => r.originName || r.originLabel;
export const destinationTitle = (r: { destinationName?: string | null; destinationLabel: string }) => r.destinationName || r.destinationLabel;

/** People riding in a room (each participant may bring companions): capacity − seats left. */
export const riders = (r: { capacity: number; seatsLeft: number }) => r.capacity - r.seatsLeft;

export function formatDiff(raw: number): string {
  const min = Math.round(raw); // the API may send fractional minutes
  if (min === 0) return '출발 시간 같음';
  return min > 0 ? `${min}분 늦게 출발` : `${-min}분 일찍 출발`;
}

export const farePolicyLabel: Record<FarePolicy, string> = {
  EQUAL_SPLIT: '똑같이 나누기',
  DISTANCE_PRORATED: '이동 거리 비례',
  DISCUSS: '만나서 협의',
};

export const meetingKindLabel: Record<MeetingPointKind, string> = {
  BUS_STOP: '버스정류장', STATION_EXIT: '역 출구', LANDMARK: '랜드마크', CUSTOM: '약속 장소',
};

export const roomStatusInfo: Record<RoomStatus, { label: string; desc: string; tone: string }> = {
  OPEN: { label: '모집 중', desc: '함께 갈 동행을 기다리고 있어요.', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  COORDINATING: { label: '조율 중', desc: '만날 장소와 약속을 정하고, 모두 “동승 확정”을 누르면 확정돼요.', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CONFIRMED: { label: '동승 확정', desc: '모두 확정했어요. 약속 장소에서 만나 함께 택시를 잡으세요. 채팅과 약속은 이제 잠겨요.', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  CLOSED: { label: '이동 완료', desc: '방장이 방을 닫았어요.', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  CANCELLED: { label: '취소됨', desc: '방장이 모집을 취소했어요.', tone: 'bg-red-50 text-red-700 ring-red-200' },
  EXPIRED: { label: '만료됨', desc: '출발 가능 시간이 지나 자동으로 만료되었어요.', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export const tripStatusLabel: Record<TripStatus, string> = {
  DRAFT: '경로 확인 필요', SEARCHING: '동행 찾는 중', MATCHED: '동행 확정', NO_MATCH: '아직 동행 없음', CANCELLED: '취소됨', EXPIRED: '만료됨',
};

export const reportReasonLabel: Record<ReportReason, string> = {
  SPAM: '스팸·홍보', ABUSE: '욕설·괴롭힘', NO_SHOW: '약속 불이행(노쇼)', FRAUD: '사기·금전 요구', PRIVACY: '개인정보 노출', OTHER: '기타',
};

export const reportStatusLabel: Record<ReportStatus, string> = { OPEN: '처리 대기', RESOLVED: '조치 완료', DISMISSED: '기각' };

export const targetTypeLabel: Record<ReportTargetType, string> = { ROOM: '동행방', MESSAGE: '메시지', MEMBER: '회원' };

export const formatWon = (won: number) => `${won.toLocaleString('ko-KR')}원`;

/** Per-person share of a whole-route fare, rounded to 100 KRW. */
export function perPersonFare(total: number | null | undefined, people: number): number | null {
  if (total == null || people < 1) return null;
  return Math.round(total / people / 100) * 100;
}

/** Countdown text: mm:ss below an hour, h:mm from an hour on. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${pad(m)}` : `${pad(m)}:${pad(s)}`;
}

/** "5분 후 출발" / "곧 출발" / "오늘 오후 6:30 출발". */
export function formatDepartureRelative(iso: string, now = Date.now()): string {
  const diff = Math.round((Date.parse(iso) - now) / 60000);
  if (Number.isNaN(diff)) return '-';
  if (diff <= 0) return '곧 출발';
  if (diff < 60) return `${diff}분 후 출발`;
  return `${formatTime(iso)} 출발`;
}

export const minutesOf = (seconds: number) => Math.max(1, Math.round(seconds / 60));
