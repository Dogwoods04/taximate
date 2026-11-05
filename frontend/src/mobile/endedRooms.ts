import type { RoomStatus } from '../api/contract';

/** Rooms whose session is over: they never reopen in the On-the-way screen. CONFIRMED rooms are still riding. */
export const ENDED_STATUSES: RoomStatus[] = ['CLOSED', 'CANCELLED', 'EXPIRED'];
export const isEnded = (status: RoomStatus) => ENDED_STATUSES.includes(status);

export const endedReason: Partial<Record<RoomStatus, string>> = {
  CLOSED: '이동이 끝난 방이에요.',
  CANCELLED: '방장이 방을 취소했어요.',
  EXPIRED: '시간이 지나 방이 종료됐어요.',
};

// Remembered for this tab so Back/Forward onto an ended room redirects at once, without a fetch.
const KEY = 'taximate.endedRooms';
function read(): Record<string, RoomStatus> {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') as Record<string, RoomStatus>; } catch { return {}; }
}
export function rememberEnded(id: string, status: RoomStatus) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: status })); } catch { /* best effort */ }
}
export function knownEnded(id: string): RoomStatus | undefined { return read()[id]; }
