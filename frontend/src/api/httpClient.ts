import { ApiError, session, type ApiClient } from './client';
import type { ErrorResponse, RoomEvent } from './contract';

const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ApiError('EXTERNAL_API_ERROR', '서버에 연결하지 못했어요. 연결 상태를 확인해 주세요.'); }
  if (!response.ok) {
    const error = await response.json().catch(() => null) as ErrorResponse | null;
    throw new ApiError(error?.code || (response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR'), error?.message || '요청을 처리하지 못했어요.', error?.details);
  }
  return response.status === 204 ? null as T : response.json() as Promise<T>;
}
const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  return params.toString();
};
const rid = (id: string) => `/rooms/${encodeURIComponent(id)}`;
const tid = (id: string) => `/trips/${encodeURIComponent(id)}`;
export const httpClient: ApiClient = {
  identity: { options: () => request('/auth/options'), kakaoLogin: b => request('/auth/kakao', 'POST', b), rename: b => request('/me/nickname', 'PUT', b), setGender: b => request('/me/gender', 'PUT', b), login: b => request('/auth/dev-login', 'POST', b), me: () => request('/me'), confirmAge: b => request('/me/age-confirmation', 'POST', b), deleteAccount: () => request('/me', 'DELETE'),agree: b => request('/me/consents/location', 'POST', b), withdraw: () => request('/me/consents/location', 'DELETE'), agreeServices: b => request('/me/consents/services', 'POST', b), withdrawServices: () => request('/me/consents/services', 'DELETE') },
  places: { search: (q, p) => request(`/places/search?${query({ query: q, ...p })}`), reverse: p => request(`/places/reverse?${query({ ...p })}`) },
  routes: { walk: (f, t) => request(`/routes/walk?${query({ fromLat: f.lat, fromLng: f.lng, toLat: t.lat, toLng: t.lng })}`) },
  trips: { create: b => request('/trips', 'POST', b), active: () => request('/trips/active'), get: id => request(tid(id)), route: id => request(`${tid(id)}/route`, 'POST'), cancel: id => request(`${tid(id)}/cancel`, 'POST'), candidates: id => request(`${tid(id)}/candidates`) },
  rooms: {
    destination: (id, b) => request(`${rid(id)}/destination`, 'PUT', b),
    create: b => request('/rooms', 'POST', b), open: p => request(`/rooms/open${p ? `?${query({ lat: p.lat, lng: p.lng })}` : ''}`), mine: () => request('/rooms/mine'), get: id => request(rid(id)),
    join: (id, b) => request(`${rid(id)}/join`, 'POST', b), leave: id => request(`${rid(id)}/leave`, 'POST'), remove: (id, mid) => request(`${rid(id)}/participants/${encodeURIComponent(mid)}/remove`, 'POST'),
    plan: (id, b) => request(`${rid(id)}/plan`, 'PUT', b), confirm: (id, b) => request(`${rid(id)}/confirm`, 'POST', b), close: id => request(`${rid(id)}/close`, 'POST'), cancel: id => request(`${rid(id)}/cancel`, 'POST'), suggestions: id => request(`${rid(id)}/meeting-point-suggestions`),
  },
  messages: { list: (id, after, limit = 50) => request(`${rid(id)}/messages?${query({ after, limit })}`), send: (id, b) => request(`${rid(id)}/messages`, 'POST', b) },
  reports: { create: b => request('/reports', 'POST', b) },
  admin: { reports: status => request(`/admin/reports?${query({ status })}`), action: (id, b) => request(`/admin/reports/${encodeURIComponent(id)}/actions`, 'POST', b), metrics: () => request('/admin/metrics') },
  subscribe(id, callback) {
    let stopped = false, attempt = 0;
    let socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped || !session.get()) return;
      const url = new URL(`${base}/ws/rooms/${encodeURIComponent(id)}`);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('token', session.get()!);
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempt = 0;
        // Refresh on reconnection as events may have been missed while offline.
        void httpClient.rooms.get(id).then(room => { if (!stopped) callback({ type: 'ROOM_UPDATED', payload: { roomId: id, status: room.status, termsVersion: room.termsVersion } }); }).catch(() => {});
      };
      socket.onmessage = message => {
        try {
          const event = JSON.parse(String(message.data)) as RoomEvent;
          if (['ROOM_UPDATED', 'MESSAGE_CREATED', 'MESSAGE_HIDDEN'].includes(event.type)) callback(event);
        } catch { /* Ignore malformed frames; REST remains authoritative. */ }
      };
      socket.onclose = event => {
        if (!stopped && ![1008, 4001, 4003, 4401, 4403].includes(event.code)) timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  },
};
