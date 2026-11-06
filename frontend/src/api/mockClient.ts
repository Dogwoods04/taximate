import { ApiError, session, type ApiClient } from './client';
import type * as C from './contract';
import { REQUIRED_SERVICE_ITEMS } from './contract';
import { distance, mask, mockFare, preview, roundMeters, route, routeComparison } from './geo';

type Trip = { owner: string; value: C.TripIntent; endedAt?: string; demo?: boolean };
type Room = { sameGenderOnly: boolean; restrictedGender: C.Gender | null; id: string; source: string; host: string; status: C.RoomStatus; capacity: number; terms: C.RoomTerms; departureAt: string; termsVersion: number; meetingPoint: C.MeetingPoint | null; participants: (C.Participant & { tripId: string })[]; hidden: boolean; endedAt?: string; demo?: boolean };
type StoredMessage = C.Message & { clientMessageId?: string };
type State = { version: 1; members: C.Member[]; tokens: Record<string, string>; trips: Trip[]; rooms: Room[]; messages: StoredMessage[]; reports: C.Report[]; seededAt: string };
const key = 'taximate.mock.v3';
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const joinable = (r: Room) => ['OPEN', 'COORDINATING'].includes(r.status);
const searching = (t: C.TripIntent) => ['SEARCHING', 'NO_MATCH'].includes(t.status);
const activeTrip = (t: C.TripIntent) => ['DRAFT', 'SEARCHING', 'NO_MATCH'].includes(t.status);
function fail(code: C.ErrorCode, message: string = code): never { throw new ApiError(code, message); }
function valid(condition: unknown, message = '입력값을 확인해 주세요.'): asserts condition { if (!condition) fail('VALIDATION_FAILED', message); }
const active = (r: Room) => r.participants.filter(p => p.status === 'ACTIVE');
const seats = (r: Room) => r.capacity - active(r).reduce((n, p) => n + p.passengerCount, 0);
const events = new Map<string, Set<(event: C.RoomEvent) => void>>();
function emit(id: string, event: C.RoomEvent) { events.get(id)?.forEach(fn => fn(structuredClone(event))); }
const fixtures: C.PlaceRef[] = [
  ['정왕역', 37.3517, 126.7428], ['시흥시청', 37.3801, 126.8029], ['시흥시청역', 37.3821, 126.8057],
  ['배곧 한울공원', 37.3705, 126.7162], ['오이도역', 37.3624, 126.7387], ['월곶역', 37.3917, 126.7426],
  ['장곡동 행정복지센터', 37.3786, 126.7856], ['은계호수공원', 37.4392, 126.8023], ['목감도서관', 37.3817, 126.8607],
].map(([name, lat, lng], i) => ({ name: String(name), address: `경기도 시흥시 ${name} 일대`, location: { lat: Number(lat), lng: Number(lng) }, kind: 'SEARCH', providerPlaceId: `mock-${i}` }));
function blank(): State { return { version: 1, members: [], tokens: {}, trips: [], rooms: [], messages: [], reports: [], seededAt: now() }; }
let state: State = (() => {
  try { const data = JSON.parse(localStorage.getItem(key) || 'null') as State | null; if (data?.version === 1 && Array.isArray(data.rooms)) return data; } catch { /* A new demo starts if browser data is corrupt. */ }
  return blank();
})();
// Upgrade persisted demos without treating missing gender as a completed choice.
state.members.forEach(m => { m.authProvider ??= 'DEV'; m.gender ??= null; m.genderSource ??= null; });
state.rooms.forEach(r => { r.sameGenderOnly ??= false; r.restrictedGender ??= null; });
function eligible(r: Room, m = caller()) { return !r.sameGenderOnly || (!!r.restrictedGender && r.restrictedGender === m.gender); }
function save() { localStorage.setItem(key, JSON.stringify(state)); }
function member(id: string) { return state.members.find(m => m.id === id) ?? fail('NOT_FOUND'); }
function caller(write = false) {
  const id = state.tokens[session.get() || ''];
  const m = state.members.find(value => value.id === id) ?? fail('UNAUTHENTICATED');
  if (write && m.status === 'RESTRICTED') fail('MEMBER_RESTRICTED');
  return m;
}
function consent() { const m = caller(true); if (!m.locationConsent) fail('LOCATION_CONSENT_REQUIRED'); return m; }
function admin() { const m = caller(true); if (m.role !== 'ADMIN') fail('FORBIDDEN'); return m; }
function getTrip(id: string) { return state.trips.find(t => t.value.id === id) ?? fail('NOT_FOUND'); }
function ownedTrip(id: string) { const t = getTrip(id); if (t.owner !== caller().id) fail('FORBIDDEN'); return t; }
function room(id: string) { return state.rooms.find(r => r.id === id) ?? fail('NOT_FOUND'); }
function participant(r: Room, id = caller().id) { return active(r).find(p => p.memberId === id) ?? fail('FORBIDDEN'); }
function host(r: Room) { if (r.host !== caller(true).id) fail('FORBIDDEN'); }
function editable(r: Room) { if (!joinable(r)) fail('ROOM_READ_ONLY'); }
function freeTrip(t: Trip) { if (state.rooms.some(r => (joinable(r) || r.status === 'CONFIRMED') && active(r).some(p => p.tripId === t.value.id))) fail('ALREADY_IN_ROOM'); }
function changed(r: Room) { save(); emit(r.id, { type: 'ROOM_UPDATED', payload: { roomId: r.id, status: r.status, termsVersion: r.termsVersion } }); }
function addMessage(r: Room, body: string, sender?: C.Member, clientMessageId?: string): StoredMessage {
  const message: StoredMessage = { id: uuid(), roomId: r.id, body, type: sender ? 'TEXT' : 'SYSTEM', senderId: sender?.id ?? null, senderNickname: sender?.nickname ?? null, hidden: false, createdAt: now(), clientMessageId };
  state.messages.push(message); save(); emit(r.id, { type: 'MESSAGE_CREATED', payload: message }); return message;
}
function cancelTrip(t: Trip) {
  t.value.status = 'CANCELLED'; t.endedAt = now();
  for (const r of state.rooms.filter(joinable)) {
    const p = active(r).find(p => p.tripId === t.value.id);
    if (!p) continue;
    if (p.role === 'HOST') { r.status = 'CANCELLED'; r.endedAt = now(); }
    else { p.status = 'LEFT'; if (active(r).length === 1) r.status = 'OPEN'; }
    changed(r);
  }
}
function refreshDemo() {
  // Seeded rooms stay discoverable: while nobody has joined, their departure keeps rolling forward.
  state.rooms.filter(r => r.demo && r.status === 'OPEN' && active(r).length === 1).forEach((r, i) => {
    if (Date.parse(r.departureAt) > Date.now() + 60000) return;
    const t = state.trips.find(t => t.value.id === r.source);
    if (!t) return;
    r.departureAt = new Date(Date.now() + (5 + i) * 60000).toISOString();
    t.value.desiredDepartureAt = r.departureAt; t.value.status = 'SEARCHING'; delete t.endedAt;
    t.value.expiresAt = new Date(Date.parse(r.departureAt) + t.value.maxWaitMinutes * 60000).toISOString();
    if (t.value.route) t.value.route.expiresAt = new Date(Date.now() + 1800000).toISOString();
  });
  // Seeded solo searchers (not in a room) feed similarSearchingCount; keep them searching too.
  state.trips.filter(t => t.demo && Date.parse(t.value.desiredDepartureAt) <= Date.now() + 60000).forEach(t => {
    t.value.desiredDepartureAt = new Date(Date.now() + 8 * 60000).toISOString(); t.value.status = 'SEARCHING'; delete t.endedAt;
    t.value.expiresAt = new Date(Date.parse(t.value.desiredDepartureAt) + t.value.maxWaitMinutes * 60000).toISOString();
    if (t.value.route) t.value.route.expiresAt = new Date(Date.now() + 1800000).toISOString();
  });
}
function sweep() {
  refreshDemo();
  for (const t of state.trips) if (activeTrip(t.value) && Date.parse(t.value.expiresAt) <= Date.now()) { t.value.status = 'EXPIRED'; t.endedAt = now(); }
  for (const r of state.rooms.filter(joinable)) {
    const t = state.trips.find(t => t.value.id === r.source);
    if (!t || Date.parse(r.departureAt) + t.value.maxWaitMinutes * 60000 <= Date.now()) { r.status = 'EXPIRED'; r.endedAt = now(); changed(r); }
  }
  // The demo has no background service: purge on access and while the page is open.
  state.trips = state.trips.filter(t => !t.endedAt || Date.now() - Date.parse(t.endedAt) < 86400000);
  state.messages = state.messages.filter(m => { const r = state.rooms.find(r => r.id === m.roomId); return !r?.endedAt || Date.now() - Date.parse(r.endedAt) < 30 * 86400000; });
  save();
}
function makeMember(nickname: string): C.Member {
  const m: C.Member = { id: uuid(), nickname, authProvider: 'DEV', role: nickname === 'admin' ? 'ADMIN' : 'USER', status: 'ACTIVE', gender: null, genderSource: null, locationConsent: null, servicesConsent: null }; state.members.push(m); return m;
}
function makeTrip(m: C.Member, body: C.CreateTripRequest): Trip {
  const t: Trip = { owner: m.id, value: { ...structuredClone(body), id: uuid(), status: 'SEARCHING', route: route(body.origin.location, body.destination.location), routeError: null, expiresAt: new Date(Date.parse(body.desiredDepartureAt) + body.maxWaitMinutes * 60000).toISOString(), createdAt: now() } }; state.trips.push(t); return t;
}
function makeRoom(t: Trip, capacity: number, terms: C.RoomTerms, departureAt = t.value.desiredDepartureAt, sameGenderOnly = false): Room {
  const m = member(t.owner);
  const r: Room = { sameGenderOnly, restrictedGender: sameGenderOnly ? m.gender : null, id: uuid(), source: t.value.id, host: m.id, status: 'OPEN', capacity, terms: structuredClone(terms), departureAt, termsVersion: 1, meetingPoint: null, participants: [{ memberId: m.id, nickname: m.nickname, role: 'HOST', status: 'ACTIVE', passengerCount: t.value.passengerCount, confirmed: false, joinedAt: now(), tripId: t.value.id }], hidden: false };
  state.rooms.push(r); return r;
}
function seed() {
  if (state.rooms.some(r => r.demo && joinable(r))) return;
  // [origin fixture, destination fixture, lat offset]: 정왕역→시흥시청 rooms at ~90m/~110m (NEAR) and ~310m/~380m (EXTENDED).
  const specs = [[0, 1, .0008], [0, 1, .0028], [0, 1, -.001], [2, 5, 0], [3, 4, 0], [0, 1, -.0034]];
  specs.forEach(([from, to, offset], i) => {
    const nickname = ['정왕산책', '퇴근길메이트', '시흥이웃', '장곡바람', '배곧하늘', '정왕새벽'][i];
    const m = state.members.find(m => m.nickname === nickname) ?? makeMember(nickname);
    m.locationConsent = { id: uuid(), policyVersion: 'v1', agreedAt: now() }; m.servicesConsent = { id: uuid(), policyVersion: 'v1', items: ['KAKAO', 'TMAP'], agreedAt: now() };
    const origin = structuredClone(fixtures[from]); origin.location.lat += offset;
    const destination = structuredClone(fixtures[to]); destination.location.lng += .0003;
    const t = makeTrip(m, { origin, destination, desiredDepartureAt: new Date(Date.now() + (5 + i) * 60000).toISOString(), maxWaitMinutes: 30, maxDetourMinutes: 15, passengerCount: 1 });
    const r = makeRoom(t, 3, { farePolicy: i === 1 ? 'DISTANCE_PRORATED' : 'EQUAL_SPLIT', luggageAllowed: i !== 2, note: '만나는 장소에서 함께 택시를 기다려요.' });
    m.gender = i % 2 ? 'MALE' : 'FEMALE'; m.genderSource = 'SELF';
    r.sameGenderOnly = i < 2; r.restrictedGender = r.sameGenderOnly ? m.gender : null;
    r.demo = true;
    r.meetingPoint = { name: `${fixtures[from].name} 앞 만남 장소`, kind: 'STATION_EXIT', location: fixtures[from].location };
    addMessage(r, '동행방이 열렸어요. 약속을 확인하고 확정해 주세요.');
  });
  // Solo searchers without a room: 정왕역→시흥시청 and 정왕역→월곶역 (shown as "N명이 찾고 있어요").
  ([['혼자퇴근', 0, 1], ['월곶가는길', 0, 5], ['월곶친구', 0, 5]] as const).forEach(([nickname, from, to]) => {
    const m = state.members.find(m => m.nickname === nickname) ?? makeMember(nickname);
    m.locationConsent = { id: uuid(), policyVersion: 'v1', agreedAt: now() }; m.servicesConsent = { id: uuid(), policyVersion: 'v1', items: ['KAKAO', 'TMAP'], agreedAt: now() };
    const origin = structuredClone(fixtures[from]); origin.location.lat += .0012;
    const t = makeTrip(m, { origin, destination: structuredClone(fixtures[to]), desiredDepartureAt: new Date(Date.now() + 8 * 60000).toISOString(), maxWaitMinutes: 30, maxDetourMinutes: 15, passengerCount: 1 });
    m.gender = Math.random() < .5 ? 'MALE' : 'FEMALE'; m.genderSource = 'SELF';
    t.demo = true;
  });
  save();
}
seed();
function summary(r: Room): C.RoomSummary {
  const t = state.trips.find(t => t.value.id === r.source)?.value;
  return { sameGenderOnly: r.sameGenderOnly, id: r.id, status: r.status, hostNickname: member(r.host).nickname, approxOrigin: mask(t?.origin.location ?? { lat: 37.37, lng: 126.78 }), approxDestination: mask(t?.destination.location ?? { lat: 37.38, lng: 126.80 }), originLabel: t?.origin.name ? `${t.origin.name} 주변` : '출발 지역', destinationLabel: t?.destination.name ? `${t.destination.name} 주변` : '도착 지역', departureAt: r.departureAt, departureWindowEnd: new Date(Date.parse(r.departureAt) + (t?.maxWaitMinutes ?? 15) * 60000).toISOString(), capacity: r.capacity, seatsLeft: seats(r), participantCount: active(r).length, terms: r.terms, meetingPoint: r.meetingPoint, estimatedTaxiFareWon: t?.route ? t.route.taxiFareWon ?? mockFare(t.route.distanceMeters) : null, routeDistanceMeters: t?.route?.distanceMeters ?? null, routeDurationSeconds: t?.route?.durationSeconds ?? null, originName: t && t.origin.kind !== 'GPS' && t.origin.kind !== 'MAP_PICK' ? t.origin.name ?? null : null, destinationName: t && t.destination.kind !== 'GPS' && t.destination.kind !== 'MAP_PICK' ? t.destination.name ?? null : null };
}
function detail(r: Room, justLeft = false): C.RoomDetail {
  const m = caller(), p = active(r).find(p => p.memberId === m.id);
  if (!p && !justLeft && !eligible(r,m)) fail('NOT_FOUND');
  return { ...summary(r), myRole: p?.role ?? 'NONE', myTripId: p?.tripId ?? null, termsVersion: r.termsVersion, readOnly: !joinable(r), canJoin: !p && joinable(r) && !r.hidden && seats(r) > 0, canConfirm: !!p && !p.confirmed && joinable(r) && !!r.meetingPoint, allConfirmed: active(r).length >= 2 && active(r).every(p => p.confirmed), participants: r.participants.map(({ tripId: _tripId, ...person }) => p ? person : { ...person, memberId: '', passengerCount: 0, confirmed: false, joinedAt: '' }), routePreview: preview(state.trips.find(t => t.value.id === r.source)?.value.route?.path ?? []) };
}
function checkConfirmed(r: Room) {
  if (joinable(r) && r.meetingPoint && active(r).length >= 2 && active(r).every(p => p.confirmed)) {
    r.status = 'CONFIRMED';
    active(r).forEach(p => { const t = getTrip(p.tripId); t.value.status = 'MATCHED'; t.endedAt = now(); });
    addMessage(r, '모두 동승을 확정했어요. 이후 채팅과 약속은 변경할 수 없어요.');
  }
  changed(r);
}
function simulateConfirm(r: Room) {
  const version = r.termsVersion;
  setTimeout(() => {
    sweep();
    if (!joinable(r) || version !== r.termsVersion) return;
    active(r).filter(p => !Object.values(state.tokens).includes(p.memberId)).forEach(p => { p.confirmed = true; });
    checkConfirmed(r);
  }, 2000);
}
function validateTerms(t: C.RoomTerms) { valid(['EQUAL_SPLIT', 'DISTANCE_PRORATED', 'DISCUSS'].includes(t.farePolicy) && typeof t.luggageAllowed === 'boolean' && (t.note?.length ?? 0) <= 200); }
function validatePoint(p: C.LatLng) { valid(Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180); }
function validateDeparture(date: string) { valid(Number.isFinite(Date.parse(date)) && Date.parse(date) >= Date.now() - 300000 && Date.parse(date) <= Date.now() + 7 * 86400000, '출발 시간은 5분 전부터 7일 이내로 선택해 주세요.'); }
const apiCall = <T>(fn: () => T): Promise<T> => Promise.resolve().then(() => { sweep(); const result = fn(); save(); return structuredClone(result); });
function compare(mine: C.TripIntent, other: C.TripIntent, departureAt: string) {
  if (!searching(other) || !other.route || !mine.route) return null;
  const origin = distance(mine.origin.location, other.origin.location), destination = distance(mine.destination.location, other.destination.location);
  const diff = (Date.parse(departureAt) - Date.parse(mine.desiredDepartureAt)) / 60000;
  const detour = Math.ceil((origin + destination) / 400);
  const { cosine, overlap } = routeComparison(mine.route.path, other.route.path);
  // Contract matching: step 1 needs both ends within 500 m; then only the departure window is a hard check.
  // Direction, overlap and detour feed the score (x clamp(cosine, 0, 1)) — nearby buildings often get different car routes.
  if (origin > 500 || destination > 500 || Math.abs(diff) > Math.min(30, mine.maxWaitMinutes + other.maxWaitMinutes)) return null;
  return { origin, destination, diff, detour, cosine, overlap: origin <= 200 && destination <= 200 ? 1 : overlap };
}
export const mockClient: ApiClient = {
  identity: {
    options: () => apiCall(() => ({ devLogin: true, kakao: true })),
    kakaoLogin: () => apiCall(() => {
      let m = state.members.find(m => m.authProvider === 'KAKAO');
      const isNew = !m;
      if (!m) {
        let nickname = '카카오이웃', n = 1;
        while (state.members.some(m => m.nickname === nickname)) nickname = '카카오이웃' + n++;
        m = makeMember(nickname); m.authProvider = 'KAKAO'; m.gender = 'FEMALE'; m.genderSource = 'KAKAO';
      }
      const token = uuid(); state.tokens[token] = m.id;
      return { token, member: m, isNew, suggestedNickname: m.nickname };
    }),
    rename: b => apiCall(() => {
      const m = caller(true), nickname = b.nickname.trim(); valid(nickname.length >= 2 && nickname.length <= 20);
      if (nickname === 'admin' || state.members.some(other => other.id !== m.id && other.nickname === nickname)) fail('NICKNAME_TAKEN');
      m.nickname = nickname; return m;
    }),
    login: b => apiCall(() => { const nickname = b.nickname.trim(); valid(nickname.length >= 2 && nickname.length <= 20); const m = state.members.find(m => m.nickname === nickname) ?? makeMember(nickname); if (m.authProvider !== 'DEV') fail('NICKNAME_TAKEN'); const token = uuid(); state.tokens[token] = m.id; return { token, member: m }; }),
    me: () => apiCall(() => caller()),
    setGender: b => apiCall(() => { const m = caller(true); valid(['MALE','FEMALE','UNDISCLOSED'].includes(b.gender)); if (m.genderSource === 'KAKAO') fail('GENDER_SOURCE_LOCKED'); m.gender = b.gender; m.genderSource = 'SELF'; return m; }),
    agree: b => apiCall(() => { valid(b.policyVersion.trim()); const m = caller(true); return m.locationConsent = { id: uuid(), policyVersion: b.policyVersion, agreedAt: now() }; }),
    withdraw: () => apiCall(() => { const m = caller(); m.locationConsent = null; state.trips.filter(t => t.owner === m.id && activeTrip(t.value)).forEach(cancelTrip); }),
    agreeServices: b => apiCall(() => { valid(b.policyVersion.trim()); const items = [...new Set(b.items)]; valid(REQUIRED_SERVICE_ITEMS.every(i => items.includes(i))); const m = caller(true); return m.servicesConsent = { id: uuid(), policyVersion: b.policyVersion, items, agreedAt: now() }; }),
    withdrawServices: () => apiCall(() => { caller().servicesConsent = null; }),
  },
  places: {
    search: q => apiCall(() => { caller(); valid(q.trim()); return fixtures.filter(p => `${p.name} ${p.address}`.includes(q.trim())).slice(0, 10); }),
    reverse: p => apiCall(() => { caller(); validatePoint(p); const nearest = [...fixtures].sort((a, b) => distance(a.location, p) - distance(b.location, p))[0]; return { location: p, kind: 'MAP_PICK', name: `${nearest.name} 인근 지도 선택`, address: '경기도 시흥시 · 모식도 선택 위치' }; }),
  },
  routes: {
    // Mock: no pedestrian network; straight-line estimate like the backend fallback.
    walk: (f, t) => apiCall(() => { caller(); validatePoint(f); validatePoint(t); const d = distance(f, t) * 1.3; return { source: 'ESTIMATE' as const, distanceMeters: Math.round(d), durationSeconds: Math.ceil(d / 1.2), path: [f, t] }; }),
  },
  trips: {
    create: b => apiCall(() => { const m = consent(); if (state.trips.some(t => t.owner === m.id && activeTrip(t.value))) fail('ACTIVE_TRIP_EXISTS'); validatePoint(b.origin.location); validatePoint(b.destination.location); validateDeparture(b.desiredDepartureAt); valid(Number.isInteger(b.passengerCount) && b.passengerCount >= 1 && b.passengerCount <= 3); valid(Number.isInteger(b.maxWaitMinutes) && b.maxWaitMinutes >= 0 && b.maxWaitMinutes <= 60 && Number.isInteger(b.maxDetourMinutes) && b.maxDetourMinutes >= 0 && b.maxDetourMinutes <= 30); valid(distance(b.origin.location, b.destination.location) >= 50, '출발지와 도착지를 다르게 선택해 주세요.'); return makeTrip(m, b).value; }),
    active: () => apiCall(() => state.trips.find(t => t.owner === caller().id && activeTrip(t.value))?.value ?? null),
    get: id => apiCall(() => ownedTrip(id).value),
    route: id => apiCall(() => { consent(); const t = ownedTrip(id).value; if (!activeTrip(t)) fail('TRIP_NOT_SEARCHABLE'); t.route = route(t.origin.location, t.destination.location); t.routeError = null; t.status = 'SEARCHING'; return t; }),
    cancel: id => apiCall(() => { const t = ownedTrip(id); if (!activeTrip(t.value)) fail('TRIP_NOT_SEARCHABLE'); cancelTrip(t); return t.value; }),
    candidates: id => apiCall(() => {
      consent(); const mine = ownedTrip(id).value;
      if (!searching(mine)) fail('TRIP_NOT_SEARCHABLE');
      if (!mine.route || Date.parse(mine.route.expiresAt) <= Date.now()) fail('ROUTE_EXPIRED');
      const candidates: C.MatchCandidate[] = [];
      for (const r of state.rooms) {
        if (!eligible(r) || !joinable(r) || r.hidden || r.host === caller().id || seats(r) < mine.passengerCount || !member(r.host).locationConsent || member(r.host).status !== 'ACTIVE') continue;
        const hostTrip = getTrip(r.source).value, c = compare(mine, hostTrip, r.departureAt);
        if (!c) continue;
        const overlapRatio = Math.round(c.overlap * 100) / 100;
        candidates.push({ roomId: r.id, tier: c.origin <= 200 ? 'NEAR' : 'EXTENDED', originDistanceMeters: roundMeters(c.origin), destinationDistanceMeters: roundMeters(c.destination), departureDiffMinutes: Math.round(c.diff), overlapRatio, estimatedDetourMinutes: c.detour, seatsLeft: seats(r), score: Math.round(100 * Math.min(1, Math.max(0, c.cosine)) * (.25 * (1 - c.origin / 500) + .15 * (1 - c.destination / 500) + .30 * c.overlap + .20 * (1 - Math.abs(c.diff) / 30) + .1 * Math.max(0, 1 - c.detour / Math.max(1, mine.maxDetourMinutes)))), reasons: [`출발지 ${roundMeters(c.origin)}m`, `목적지 ${roundMeters(c.destination)}m`, `경로 ${Math.round(overlapRatio * 100)}% 겹침`, `추가 이동 약 ${c.detour}분`], room: summary(r), routePreview: preview(hostTrip.route!.path) });
      }
      candidates.sort((a, b) => (a.tier === b.tier ? b.score - a.score : a.tier === 'NEAR' ? -1 : 1));
      mine.status = candidates.length ? 'SEARCHING' : 'NO_MATCH';
      const similarSearchingCount = state.trips.filter(t => t.owner !== caller().id && member(t.owner).locationConsent && member(t.owner).status === 'ACTIVE' && t.value.status === 'SEARCHING' && !state.rooms.some(r => (joinable(r) || r.status === 'CONFIRMED') && active(r).some(p => p.tripId === t.value.id)) && compare(mine, t.value, t.value.desiredDepartureAt)).length;
      return { tripId: id, generatedAt: now(), policy: { priorityRadiusMeters: 200, maxRadiusMeters: 500 }, candidates: candidates.slice(0, 20), similarSearchingCount };
    }),
  },
  rooms: {
    destination: (id, b) => apiCall(() => {
      const r = room(id); host(r); editable(r); if (r.hidden) fail('ROOM_NOT_JOINABLE');
      const t = ownedTrip(r.source).value; if (!searching(t)) fail('TRIP_NOT_SEARCHABLE');
      validatePoint(b.destination.location);
      const nextRoute = route(t.origin.location, b.destination.location);
      t.destination = b.destination; t.route = nextRoute; t.routeError = null; t.status = 'SEARCHING';
      r.termsVersion++; active(r).forEach(p => { p.confirmed = false; });
      addMessage(r, `방장이 목적지를 ${b.destination.name || '새 장소'}(으)로 바꿨어요`); changed(r); return detail(r);
    }),
    create: b => apiCall(() => { consent(); const t = ownedTrip(b.sourceTripId); if (!searching(t.value)) fail('TRIP_NOT_SEARCHABLE'); freeTrip(t); valid(Number.isInteger(b.capacity) && b.capacity >= 2 && b.capacity <= 4 && b.capacity >= t.value.passengerCount); validateTerms(b.terms); if (b.departureAt) validateDeparture(b.departureAt); if (b.sameGenderOnly && !['MALE','FEMALE'].includes(caller().gender ?? '')) fail('GENDER_REQUIRED'); const r = makeRoom(t, b.capacity, b.terms, b.departureAt, b.sameGenderOnly); addMessage(r, '동행방을 만들었어요. 만날 장소를 정해 주세요.'); return detail(r); }),
    open: near => apiCall(() => {
      const m = caller(); if (near) validatePoint(near);
      const list = state.rooms.filter(r => eligible(r,m) && joinable(r) && !r.hidden && seats(r) > 0 && !active(r).some(p => p.memberId === m.id)).map(summary).filter(r => Date.parse(r.departureWindowEnd) > Date.now());
      if (!near) return list.sort((a, b) => Date.parse(a.departureAt) - Date.parse(b.departureAt)).slice(0, 10);
      return list.map(r => ({ r, d: distance(r.approxOrigin, near) })).filter(x => x.d <= 3000).sort((a, b) => a.d - b.d).slice(0, 10).map(x => x.r);
    }),
    mine: () => apiCall(() => state.rooms.filter(r => active(r).some(p => p.memberId === caller().id) && (!r.endedAt || Date.now() - Date.parse(r.endedAt) <= 86400000)).map(summary).reverse()),
    get: id => apiCall(() => { caller(); return detail(room(id)); }),
    join: (id, b) => apiCall(() => {
      const m = consent(), r = room(id);
      if (active(r).some(p => p.memberId === m.id)) return detail(r);
      if (!eligible(r,m)) fail('GENDER_RESTRICTED');
      if (!joinable(r) || r.hidden) fail('ROOM_NOT_JOINABLE');
      const t = ownedTrip(b.tripId); if (!searching(t.value)) fail('TRIP_NOT_SEARCHABLE'); freeTrip(t); if (seats(r) < t.value.passengerCount) fail('ROOM_FULL');
      r.participants = r.participants.filter(p => p.memberId !== m.id);
      r.participants.push({ memberId: m.id, nickname: m.nickname, role: 'MEMBER', status: 'ACTIVE', passengerCount: t.value.passengerCount, confirmed: false, joinedAt: now(), tripId: b.tripId }); r.status = 'COORDINATING';
      addMessage(r, `${m.nickname}님이 참여했어요.`); changed(r);
      setTimeout(() => { sweep(); if (joinable(r) && active(r).some(p => p.memberId === m.id)) addMessage(r, '반가워요! 만날 장소와 약속을 확인해 주세요. 확정하시면 저도 확인할게요.', member(r.host)); }, 1200);
      return detail(r);
    }),
    leave: id => apiCall(() => { caller(true); const r = room(id); editable(r); const p = participant(r); if (p.role === 'HOST') fail('FORBIDDEN'); p.status = 'LEFT'; if (active(r).length === 1) r.status = 'OPEN'; addMessage(r, `${p.nickname}님이 나갔어요.`); changed(r); return detail(r, true); }),
    remove: (id, mid) => apiCall(() => { const r = room(id); host(r); editable(r); const p = participant(r, mid); if (p.role === 'HOST') fail('FORBIDDEN'); p.status = 'REMOVED'; if (active(r).length === 1) r.status = 'OPEN'; addMessage(r, `${p.nickname}님이 방에서 제외되었어요.`); changed(r); return detail(r); }),
    plan: (id, b) => apiCall(() => { const r = room(id); host(r); editable(r); validateTerms(b.terms); validatePoint(b.meetingPoint.location); valid(b.meetingPoint.name.trim()); validateDeparture(b.departureAt); r.meetingPoint = b.meetingPoint; r.departureAt = b.departureAt; r.terms = b.terms; r.termsVersion++; active(r).forEach(p => { p.confirmed = false; }); addMessage(r, `약속이 변경되었어요 (버전 ${r.termsVersion}). 다시 확정해 주세요.`); changed(r); return detail(r); }),
    confirm: (id, b) => apiCall(() => { consent(); const r = room(id), p = participant(r); if (b.termsVersion !== r.termsVersion) fail('TERMS_VERSION_MISMATCH'); if (p.confirmed) return detail(r); editable(r); if (!r.meetingPoint) fail('MEETING_POINT_REQUIRED'); p.confirmed = true; checkConfirmed(r); simulateConfirm(r); return detail(r); }),
    close: id => apiCall(() => { const r = room(id); host(r); if (r.status !== 'CONFIRMED') fail('ROOM_NOT_JOINABLE'); r.status = 'CLOSED'; r.endedAt = now(); changed(r); return detail(r); }),
    cancel: id => apiCall(() => { const r = room(id); host(r); editable(r); r.status = 'CANCELLED'; r.endedAt = now(); changed(r); return detail(r); }),
    suggestions: id => apiCall(() => {
      const r = room(id); participant(r);
      const origins = active(r).map(p => getTrip(p.tripId).value.origin.location);
      return fixtures.map(place => { const max = Math.max(...origins.map(p => distance(p, place.location))); return { point: { name: `${place.name} 앞 만남 장소`, kind: 'LANDMARK' as const, location: place.location }, tier: max <= 200 ? 'NEAR' as const : 'EXTENDED' as const, maxWalkMeters: roundMeters(max), walkMinutesMax: Math.ceil(max * 1.3 / 70), walkSource: 'ESTIMATE' as const, actual: max }; }).filter(p => p.actual <= 500).sort((a, b) => a.actual - b.actual).slice(0, 5).map(({ actual: _actual, ...p }) => p);
    }),
  },
  messages: {
    list: (id, after, limit = 50) => apiCall(() => { participant(room(id)); const messages = state.messages.filter(m => m.roomId === id); const index = after ? messages.findIndex(m => m.id === after) + 1 : 0; return messages.slice(index, index + Math.min(100, Math.max(1, limit))).map(({ clientMessageId: _client, ...m }) => m); }),
    send: (id, b) => apiCall(() => { const m = caller(true), r = room(id); participant(r); const previous = state.messages.find(message => message.roomId === id && message.senderId === m.id && message.clientMessageId === b.clientMessageId); if (previous) return previous; editable(r); valid(b.body.trim().length > 0 && b.body.length <= 500 && b.clientMessageId); return addMessage(r, b.body.trim(), m, b.clientMessageId); }),
  },
  reports: { create: b => apiCall(() => {
    const m = caller(true); valid(['SPAM', 'ABUSE', 'NO_SHOW', 'FRAUD', 'PRIVACY', 'OTHER'].includes(b.reason) && (b.detail?.length ?? 0) <= 500);
    const target = b.targetType === 'ROOM' ? summary(room(b.targetId)).originLabel : b.targetType === 'MEMBER' ? member(b.targetId).nickname : (() => { const message = state.messages.find(m => m.id === b.targetId) ?? fail('NOT_FOUND'); participant(room(message.roomId)); return message.body; })();
    const report: C.Report = { ...b, id: uuid(), reporterId: m.id, reporterNickname: m.nickname, detail: b.detail ?? null, status: 'OPEN', targetPreview: target, createdAt: now(), resolvedAt: null, resolutionNote: null }; state.reports.push(report); return report;
  }) },
  admin: {
    reports: status => apiCall(() => { admin(); return state.reports.filter(r => !status || r.status === status).reverse(); }),
    action: (id, b) => apiCall(() => {
      admin(); const report = state.reports.find(r => r.id === id) ?? fail('NOT_FOUND'); valid(report.status === 'OPEN', '이미 처리된 신고예요.');
      if (b.action === 'HIDE_ROOM') { valid(report.targetType === 'ROOM'); const r = room(report.targetId); r.hidden = true; changed(r); }
      else if (b.action === 'HIDE_MESSAGE') { valid(report.targetType === 'MESSAGE'); const m = state.messages.find(m => m.id === report.targetId) ?? fail('NOT_FOUND'); m.hidden = true; m.body = null; emit(m.roomId, { type: 'MESSAGE_HIDDEN', payload: { messageId: m.id } }); }
      else if (b.action === 'RESTRICT_MEMBER') { const targetId = report.targetType === 'MEMBER' ? report.targetId : report.targetType === 'ROOM' ? room(report.targetId).host : state.messages.find(m => m.id === report.targetId)?.senderId; valid(targetId); member(targetId).status = 'RESTRICTED'; state.trips.filter(t => t.owner === targetId && activeTrip(t.value)).forEach(cancelTrip); }
      else valid(b.action === 'DISMISS');
      report.status = b.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED'; report.resolutionNote = b.note ?? null; report.resolvedAt = now(); return report;
    }),
    metrics: () => apiCall(() => { admin(); const trips = state.trips.filter(t => Date.now() - Date.parse(t.value.createdAt) <= 7 * 86400000); const count = (status: C.TripStatus) => trips.filter(t => t.value.status === status).length; return { periodDays: 7, openReports: state.reports.filter(r => r.status === 'OPEN').length, reportsInPeriod: state.reports.filter(r => Date.now() - Date.parse(r.createdAt) <= 7 * 86400000).length, tripsCreated: trips.length, tripsMatched: count('MATCHED'), tripsNoMatch: count('NO_MATCH'), tripsExpired: count('EXPIRED'), matchFailureRate: trips.length ? (count('NO_MATCH') + count('EXPIRED')) / trips.length : 0, roomsCreated: state.rooms.length, roomsConfirmed: state.rooms.filter(r => ['CONFIRMED', 'CLOSED'].includes(r.status)).length }; }),
  },
  subscribe(id, callback) {
    participant(room(id));
    const listeners = events.get(id) ?? new Set(); listeners.add(callback); events.set(id, listeners);
    const timer = setInterval(sweep, 10000);
    return () => { listeners.delete(callback); clearInterval(timer); if (!listeners.size) events.delete(id); };
  },
};

// Explicit demo control, outside the API contract: a simulated member joins the host's room.
export function addDemoParticipant(id: string): Promise<void> {
  return apiCall(() => {
    const r = room(id); host(r); editable(r); if (seats(r) < 1) fail('ROOM_FULL');
    const source = getTrip(r.source).value;
    const m = makeMember(`체험메이트${state.members.length}`); m.locationConsent = { id: uuid(), policyVersion: 'v1', agreedAt: now() }; m.servicesConsent = { id: uuid(), policyVersion: 'v1', items: ['KAKAO', 'TMAP'], agreedAt: now() };
    m.gender = r.restrictedGender ?? (Math.random() < .5 ? 'MALE' : 'FEMALE'); m.genderSource = 'SELF';
    const t = makeTrip(m, { ...source, desiredDepartureAt: r.departureAt, passengerCount: 1 });
    r.participants.push({ memberId: m.id, nickname: m.nickname, role: 'MEMBER', status: 'ACTIVE', passengerCount: 1, confirmed: false, joinedAt: now(), tripId: t.value.id });
    r.status = 'COORDINATING'; addMessage(r, '안녕하세요! 약속을 확인하고 함께 갈게요.', m); changed(r);
    if (active(r).some(p => p.memberId === r.host && p.confirmed)) simulateConfirm(r);
  });
}
