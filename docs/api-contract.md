# Siheung Taxi-Mate — API Contract (MVP v1)

## 2026-11-23 lead-approved change — one ride at a time

A confirmed ride lasts until it is finished. While a member is an ACTIVE participant of a CONFIRMED room:
- `POST /api/trips`, `POST /api/rooms` and `POST /api/rooms/{id}/join` → 409 `RIDE_IN_PROGRESS` (checked through `trip.api.TripStartGuard`, implemented by ride-room `OngoingRides`, and again in the room's trip check).
- `RoomDetail.ongoingRideRoomId` names that room on other rooms' details and `canJoin` is false there.

The ride ends by:
- `POST /api/rooms/{id}/finish` (any ACTIVE participant of a CONFIRMED room, "이동 완료"): a member becomes `FINISHED` (leaves "my rooms", locations of that trip erased, system message); the host finishing closes the room for everyone (same as `/close`). Already ended room → 200 with the current detail. Not CONFIRMED → 409 `ROOM_NOT_JOINABLE`.
- `POST /api/rooms/{id}/close` (host) as before.
- Automatically: `RoomExpiryJob` closes a CONFIRMED room `taximate.rooms.lifecycle.confirmed-auto-close-minutes` (180) after its `departureWindowEnd`.

`GET /api/rooms/mine` lists only rooms where the caller is still ACTIVE, so a finished or ended ride is no longer the current room (ended rooms stay as 24-hour history, as before).

## 2026-11-20 lead-approved change — nearby open rooms

`GET /api/rooms/open` lists recruiting rooms whose **boarding spot** is near a reference point, nearest first.
- `lat`, `lng` (required): the caller's one-shot GPS fix taken after location consent, or a public place the caller picked by search. Request-local: never stored or logged. The map viewport is never used. Missing/invalid → 400 `VALIDATION_FAILED`.
- `radiusMeters` (optional): default `taximate.rooms.nearby.default-radius-meters` (500); 1…`max-radius-meters` (3000) else 400 `VALIDATION_FAILED`. The client widens with an explicit value (3000).
- Eligible: status ∈ JOINABLE, not hidden, seatsLeft > 0, `departureAt` > now, caller not an ACTIVE participant, and the room's `restricted_gender` equals the caller's gender (every room is same-gender only).
- Boarding spot = `meetingPoint.location` when set (a public place, already exact in `RoomSummary`), else `approxOrigin` (host origin through `LocationMasker`). The destination is never used.
- `distanceMeters` = great-circle distance to the boarding spot rounded to 10 m; a room is included iff `distanceMeters ≤ radiusMeters`. Order: `distanceMeters`, `departureAt`, `id`; at most `max-results` (20), `hasMore` when more matched.
- Filtering happens in the database before ordering/limit: a bounding box on `ride_rooms` meeting-point coordinates, and for rooms without one `TripApi.findTripIdsWithOriginWithin` (PostGIS `ST_DWithin` on the origin GiST index, widened by `LocationMasker.approximationErrorMeters()`); the exact public distance is then computed in Java. No new precise coordinate of another user is returned.

## 2026-11-16 lead-approved removal

The shared-destination recommendation UI, algorithm, DTO and both destination-suggestions endpoints are removed at the user's request. Ordinary place search, route-based room matching, manually chosen destination updates and origin meeting-point suggestions remain available.

## 2026-11-14 lead-approved extension

- `POST /api/rooms/{id}/join` accepts `{ tripId, passengerCount?: number }` (1–3, including the account holder). If omitted use the trip count. Validate and update the owned searchable trip and participant atomically under the existing room lock, check total remaining seats, and keep an already-active join idempotent.
- Recent destinations/favorites are device-local storage scoped to the member, removable individually and on account withdrawal. Recent history is saved automatically; the save toggle is retired and old disabled settings no longer prevent future saves. Keep at most 12 recent entries; prune entries older than 30 days on the next read. No GPS/map-pick history is saved automatically. Favorites have a 30-entry cap and persist until removed. Destination search results support adding/removing favorites without selecting the destination.


Source of truth for frontend ⇄ backend and between backend modules.
TypeScript mirror: `frontend/src/api/contract.ts`. Java cross-module interfaces: `backend/.../{identity,trip,rideroom}/api/`.
Change this file (lead) **before** changing either side.

## Conventions

- Base path `/api`, JSON, camelCase. IDs are UUID strings.
- Time: ISO-8601 with offset (`2026-11-02T18:30:00+09:00`). Server zone Asia/Seoul.
- Auth: `Authorization: Bearer <token>` on every `/api/**` call except `/api/auth/options`, `/api/auth/dev-login`, and `/api/auth/kakao`. Missing/invalid → 401 `UNAUTHENTICATED`.
- Errors: HTTP status + body `{ "code": ErrorCode, "message": string, "details": object }`.
  ErrorCode values: see `common/error/ErrorCode.java`.
- Idempotency: `POST /rooms/{id}/join` and `POST /rooms/{id}/confirm` are naturally idempotent
  (repeat → same 200 result, no duplicate row). Clients may also send `Idempotency-Key` (ignored by server in MVP beyond natural idempotency).
- **Privacy:** any coordinate describing *another* user is rounded (`approx*`, 3 decimals ≈110m), distances are rounded to 10m,
  and route polylines have 200m trimmed from both ends. Precise coordinates are returned only to the trip owner.
  Meeting points are public places and are exact.

## Shared shapes

```ts
LatLng        { lat: number, lng: number }
PlaceKind     'GPS' | 'MAP_PICK' | 'SEARCH' | 'BUS_STOP' | 'STATION_EXIT' | 'LANDMARK'
PlaceRef      { name?: string, address?: string, location: LatLng, kind: PlaceKind, providerPlaceId?: string }
MeetingPointKind 'BUS_STOP' | 'STATION_EXIT' | 'LANDMARK' | 'CUSTOM'
MeetingPoint  { id?: string, name: string, kind: MeetingPointKind, location: LatLng, address?: string }
ProximityTier 'NEAR' (≤200m) | 'EXTENDED' (200–500m)
```

## Status names (fixed)

| Entity | Values |
|---|---|
| TripStatus | DRAFT, SEARCHING, MATCHED, NO_MATCH, CANCELLED, EXPIRED |
| RoomStatus | OPEN, COORDINATING, CONFIRMED, CLOSED, CANCELLED, EXPIRED |
| ParticipantRole | HOST, MEMBER |
| ParticipantStatus | ACTIVE, LEFT, REMOVED, FINISHED (ended their own confirmed ride) |
| MemberStatus | ACTIVE, RESTRICTED, WITHDRAWN (회원 탈퇴; nickname becomes `탈퇴회원-xxxxxxxx`, reserved) |
| MemberRole | USER, ADMIN |
| MessageType | TEXT, SYSTEM |
| ReportTargetType | ROOM, MESSAGE, MEMBER |
| ReportReason | SPAM, ABUSE, NO_SHOW, FRAUD, PRIVACY, OTHER |
| ReportStatus | OPEN, RESOLVED, DISMISSED |
| ModerationAction | HIDE_ROOM, HIDE_MESSAGE, RESTRICT_MEMBER, DISMISS |
| FarePolicy | EQUAL_SPLIT, DISTANCE_PRORATED, DISCUSS |

### Trip lifecycle
`DRAFT →(route ok) SEARCHING ⇄ NO_MATCH`; `SEARCHING|NO_MATCH →(room CONFIRMED) MATCHED`; any active → `CANCELLED` (user / consent withdrawn); active → `EXPIRED` at `desiredDepartureAt + maxWaitMinutes` (scheduler, every minute).
A member has at most one trip in {DRAFT, SEARCHING, NO_MATCH} → else 409 `ACTIVE_TRIP_EXISTS`.

### Room lifecycle
`OPEN →(first join) COORDINATING`; `COORDINATING →(last MEMBER leaves) OPEN`;
`OPEN|COORDINATING →(all ACTIVE participants confirmed current termsVersion, ≥2 participants, meetingPoint set) CONFIRMED`;
`CONFIRMED → CLOSED` (host); `OPEN|COORDINATING → CANCELLED` (host / host trip cancelled); `OPEN|COORDINATING → EXPIRED` at `departureWindowEnd` (scheduler).
Changing meeting point / departure / terms increments `termsVersion` and clears all confirmations.
READ_ONLY = {CONFIRMED, CLOSED, CANCELLED, EXPIRED}: no join, no messages (409 `ROOM_READ_ONLY`).

---

## identity (owner: backend-domain)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/auth/options` | — | `{ devLogin: boolean, kakao: boolean, devLoginPrefix: string | null }` — `devLoginPrefix` = `taximate.auth.dev-login-nickname-prefix` (`DEV_LOGIN_NICKNAME_PREFIX`, e.g. 샘플) or null |
| POST | `/api/auth/kakao` | `{ code, redirectUri }` | `{ token, member: Member, isNew: boolean, suggestedNickname: string }`; allow-listed redirect only (400); invalid code 401 / provider failure 502 `KAKAO_AUTH_FAILED`. |
| PUT | `/api/me/nickname` | `{ nickname: string(2–20) }` | Own `Member`; trimmed, unique, reserved admin names rejected (409 `NICKNAME_TAKEN`); role unchanged. |
| POST | `/api/auth/dev-login` | `{ nickname: string(2–20) }` | `{ token: string, member: Member }` — creates member if new. Enabled only when `taximate.auth.dev-login-enabled`. Nicknames in `taximate.auth.admin-nicknames` get ADMIN. When `devLoginPrefix` is set, only nicknames starting with it (or admin nicknames) are accepted, else 403 `DEV_LOGIN_RESTRICTED`; a DEV member renaming (`PUT /api/me/nickname`) must keep the prefix (400 `VALIDATION_FAILED`). |
| PUT | `/api/me/gender` | `{ gender: MALE | FEMALE }` | Own `Member`; sets SELF; 400 `VALIDATION_FAILED` for UNDISCLOSED; 409 `GENDER_SOURCE_LOCKED` for KAKAO. |
| GET | `/api/me` | – | `Member` |
| DELETE | `/api/me` | – | 204. **회원 탈퇴**: publishes `MemberWithdrawnEvent`; active trip cancelled, rooms left (hosted OPEN/COORDINATING rooms cancelled), own message bodies deleted, precise trip coordinates erased, consents/gender/kakao_id removed, nickname replaced by a non-identifying placeholder, status WITHDRAWN; all tokens invalid (401 afterwards). Report records are kept without the member's personal data. |
| POST | `/api/me/age-confirmation` | `{ over14: true }` | Own `Member` (`ageConfirmed: true`); stores the confirmation time. `over14` false/missing → 400 `VALIDATION_FAILED`. |
| POST | `/api/me/consents/location` | `{ policyVersion: string }` | `LocationConsent` |
| DELETE | `/api/me/consents/location` | – | 204. Publishes `LocationConsentWithdrawnEvent` → active trips cancelled. |
| POST | `/api/me/consents/services` | `{ policyVersion: string(1–32), items: ServiceItem[] }` | `ServicesConsent`. `items` must contain every required item (`KAKAO`, `TMAP`) else 400 `VALIDATION_FAILED`. Re-agreeing (same or newer version) replaces the current record; history rows are kept (withdrawn_at set). |
| DELETE | `/api/me/consents/services` | – | 204. Marks the current record withdrawn. The app then asks again before the map screens. |

```ts
Member          { authProvider: 'DEV' | 'KAKAO', gender: 'MALE' | 'FEMALE' | 'UNDISCLOSED' | null, genderSource: 'SELF' | 'KAKAO' | null, id, nickname, role: MemberRole, status: MemberStatus, locationConsent: LocationConsent | null, servicesConsent: ServicesConsent | null, ageConfirmed: boolean }
LocationConsent { id, policyVersion, agreedAt }   // only current (non-withdrawn) consent is returned
ServiceItem     = 'KAKAO' | 'TMAP'            // external services: Kakao Maps/Local/Mobility, TMAP pedestrian route
ServicesConsent { id, policyVersion, items: ServiceItem[], agreedAt }   // only current (non-withdrawn) record
```

### Private gender and same-gender eligibility
**Every room is same-gender only** (shared-taxi rule). UNDISCLOSED/null members must pick MALE or FEMALE (the app sends them to the gender step) before they can create, find or join rooms. UNDISCLOSED remains only as a legacy stored value.
Own Member responses (/me and dev-login) include gender: MALE | FEMALE | UNDISCLOSED | null and genderSource: SELF | KAKAO | null. PUT /api/me/gender {gender} returns own Member, sets SELF and gender_updated_at; KAKAO source rejects SELF updates with 409 GENDER_SOURCE_LOCKED. Gender is never included in other public DTOs. Internal IdentityApi.getGender is for eligibility only. Kakao login fills/overrides SELF only with consented provider gender. Kakao accounts cannot be accessed using dev-login. New Kakao names use numeric suffixes on collision and never use reserved admin names; Kakao tokens are never persisted.

## places / external-mobility (owner: mobility-matching)

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/places/search` | `query` (required), `lat`,`lng` (optional bias) | `PlaceRef[]` (kind `SEARCH`, ≤10) |
| GET | `/api/places/reverse` | `lat`,`lng` | `PlaceRef` (address filled; kind `MAP_PICK`) |
| GET | `/api/routes/walk` | `fromLat`,`fromLng`,`toLat`,`toLng` (required) | `WalkRoute` — pedestrian route for the "is the boarding spot walkable?" check. Signed-in only. Coordinates are passed to the provider and never stored or logged. Provider TMAP pedestrian (`taximate.walking.tmap-app-key`); no key / provider error / >20km straight line → `ESTIMATE` (straight line ×1.3 at 1.2 m/s, `path` = [from, to]). |

```ts
WalkRoute { source: 'TMAP' | 'ESTIMATE', distanceMeters: number, durationSeconds: number, path: LatLng[] /* from -> to, simplified (≤300 pts) */ }
```

Kakao REST key never reaches the browser. In `mock` mode results come from fixtures (Siheung: 정왕역, 시흥시청역, 배곧, 월곶역, 오이도역, 시흥시청, 은계, 목감, 장곡 …).

## trip (owner: mobility-matching)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/trips` | `CreateTripRequest` | 201 `TripIntent`. Requires consent (428 `LOCATION_CONSENT_REQUIRED`). 409 `RIDE_IN_PROGRESS` while the caller's confirmed ride has not finished. Computes car route once. If route API fails → trip saved as DRAFT and response still 201 with `route: null` and `routeError: 'ROUTE_UNAVAILABLE'`. |
| GET | `/api/trips/active` | – | `TripIntent` or 204 |
| GET | `/api/trips/{id}` | – | `TripIntent` (owner only) |
| POST | `/api/trips/{id}/route` | – | `TripIntent` — re-search route (DRAFT retry or refresh). 503 `ROUTE_UNAVAILABLE` if provider fails and no unexpired snapshot exists. |
| POST | `/api/trips/{id}/cancel` | – | `TripIntent` (status CANCELLED) |

```ts
CreateTripRequest {
  origin: PlaceRef, destination: PlaceRef,
  desiredDepartureAt: string,          // now-5min … now+7days
  maxWaitMinutes: number,              // 0–60, default 15
  maxDetourMinutes: number,            // 0–30, default 10
  passengerCount: number               // 1–3
}
TripIntent {
  id, status: TripStatus, origin: PlaceRef, destination: PlaceRef,     // precise: owner only
  desiredDepartureAt, maxWaitMinutes, maxDetourMinutes, passengerCount,
  route: RouteSnapshot | null, routeError: 'ROUTE_UNAVAILABLE' | null,
  expiresAt, createdAt
}
RouteSnapshot { id, provider: 'KAKAO' | 'MOCK', distanceMeters, durationSeconds, path: LatLng[],
                taxiFareWon: number | null,   // whole-route taxi fare KRW: Kakao summary.fare.taxi; MOCK = 4800 + 100 per started 131m beyond 1.6km
                calculatedAt, expiresAt }
```

## matching (owner: mobility-matching)

| Method | Path | Response |
|---|---|---|
| GET | `/api/trips/{id}/candidates` | `MatchCandidatesResponse` (owner only; trip must be SEARCHING/NO_MATCH else 409 `TRIP_NOT_SEARCHABLE`; route expired → 409 `ROUTE_EXPIRED`). Sets trip NO_MATCH when 0 room candidates, SEARCHING otherwise. |
| GET | `/api/rooms/{roomId}/meeting-point-suggestions` | `MeetingPointSuggestion[]` (ACTIVE participants only) |

Algorithm:
1. **Spatial hard filter (PostGIS `geography`, meters, GiST):** other members' trips with status ∈ SEARCHABLE, not expired, consent present,
   `ST_DWithin(origin, mine, 500)` AND `ST_DWithin(destination, mine, 500)`.
2. **Room lookup:** `RideRoomApi.findJoinableRoomsBySourceTripIds(hostTrips)`; drop rooms with `seatsLeft < my passengerCount`.
3. **Route checks.** If my origin AND my destination are each within `max-radius-meters` (500 m) of the host trip's origin/destination (always the case after step 1), the room is a candidate.
   The only conditions are: joinable, enough seats, not hidden, and |departure diff| <= min(30, my maxWait + host maxWait).
   Direction cosine, route overlap and estimated detour are NOT rejections in this case. Nearby buildings often get a completely different traffic-aware car route, so these values only feed the score and reasons.
   - Overlap: fraction of my resampled path within 150 m of the host path, the lesser of the two directions. It counts as 1.0 when both ends are <= 200 m.
   - Detour: closeness against min(maxDetourMinutes).
   - Direction: the final score is multiplied by clamp(cosine, 0, 1).
   Outside the radius, the old hard filters apply (cosine >= 0.7, overlap >= 0.5, detour <= both maxDetourMinutes).
   Reasons: "출발지 Xm", "목적지 Xm", "경로 N% 겹침", "추가 이동 약 N분".
   `similarSearchingCount` uses the same rule.

4. **Score** 0–100 = weighted (origin distance 0.25, destination 0.15, overlap 0.30, departure 0.20, detour 0.10).
5. **Order:** tier NEAR (origin ≤200m) first, then EXTENDED; within tier by score desc. Max 20.
Same-gender eligibility is applied by RideRoomApi.findJoinableRoomsBySourceTripIds(hostTrips, requesterMemberId) before scoring. All active-room trips are excluded from the solo count independently of room visibility.

6. `similarSearchingCount` = solo SEARCHING trips passing steps 1+3 that are not in any active room (`RideRoomApi.findTripIdsInActiveRooms`).
7. `otherTimeCandidates` = rooms that pass every step except the departure window (same places, another time).
   Ordered by |departureDiffMinutes| ascending, max 20. The app lists them under "다른 시간에 출발하는 방".

```ts
MatchCandidatesResponse {
  tripId, generatedAt,
  policy: { priorityRadiusMeters: 200, maxRadiusMeters: 500 },
  candidates: MatchCandidate[],
  similarSearchingCount: number,
  otherTimeCandidates: MatchCandidate[]   // same places, outside the time window
}
MatchCandidate {
  roomId, tier: ProximityTier,
  originDistanceMeters: number, destinationDistanceMeters: number,   // rounded 10m
  departureDiffMinutes: number,           // candidate room departure − my desired (signed)
  overlapRatio: number,                   // 0–1, 2 decimals
  estimatedDetourMinutes: number,
  seatsLeft: number, score: number,       // 0–100 integer
  reasons: string[],                      // short Korean UI chips, e.g. "출발지 120m", "경로 82% 겹침"
  room: RoomSummary,
  routePreview: LatLng[]                  // host route, ends trimmed
}
MeetingPointSuggestion {
  point: MeetingPoint, tier: ProximityTier,
  maxWalkMeters: number,                  // farthest participant origin → point (rounded 10m)
  walkMinutesMax: number | null,          // walking route for top N only, else estimate
  walkSource: 'WALKING_API' | 'ESTIMATE'
}
```
Meeting-point candidates: public POIs (station exit / bus stop / landmark) within 500m of the participants' origin centroid,
NEAR = every participant ≤200m straight-line, EXTENDED = ≤500m. Walking route API only for the top `walking-check-limit` (3).

## ride-room (owner: backend-domain)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/rooms` | `CreateRoomRequest` | 201 `RoomDetail`. Source trip must be owner's and SEARCHING/NO_MATCH, not in an active room (409 `ALREADY_IN_ROOM`). `meetingPoint` defaults to the host origin (kind `CUSTOM`, name = origin place name) when that origin was picked by search; GPS/map-pick origins leave it null. The host changes it with `PUT /plan`. |
| GET | `/api/rooms/open` | `?lat&lng` (required reference point; never stored) `&radiusMeters` (optional, default 500, max 3000) | `NearbyRooms` — see the 2026-11-20 section: JOINABLE, not hidden, seatsLeft > 0, departureAt > now, not mine, same gender as the caller; boarding spot (meeting point, else approxOrigin) within the radius; ordered by distance then departureAt; ≤20 with `hasMore`. |
| GET | `/api/rooms/mine` | – | `RoomSummary[]` (rooms where I am ACTIVE, status ∈ ACTIVE ∪ recent read-only 24h) |
| GET | `/api/rooms/{id}` | – | `RoomDetail` (any signed-in user; non-members get only ACTIVE `participants` (same `Participant` shape — no location data); `routePreview` is the end-trimmed host route for everyone) |
| POST | `/api/rooms/{id}/join` | `{ tripId, passengerCount?: number }` | `RoomDetail`. Under lock `room:{id}` and a transaction with row lock, validate requested count 1–3 (account holder included; omitted uses trip.passengerCount), status ∈ JOINABLE, enough seats, not hidden, trip owned & searchable & not in another room. Update the trip count and participant atomically. Errors `VALIDATION_FAILED`, `ROOM_NOT_JOINABLE`, `ROOM_FULL`, `ALREADY_IN_ROOM`. Same member re-join while ACTIVE → 200 same result without changing the existing count. |
| POST | `/api/rooms/{id}/leave` | – | `RoomDetail`. MEMBER only, not after CONFIRMED. Host must cancel instead. |
| POST | `/api/rooms/{id}/participants/{memberId}/remove` | – | `RoomDetail` (host only, before CONFIRMED) |
| PUT | `/api/rooms/{id}/plan` | `UpdatePlanRequest` | `RoomDetail` (host only, JOINABLE only). termsVersion++ and confirmations cleared. SYSTEM message posted. |
| PUT | `/api/rooms/{id}/destination` | `UpdateDestinationRequest` | `RoomDetail` (host only, JOINABLE, not hidden). Recalculates host route/fare atomically; termsVersion++ and confirmations cleared. 503 `ROUTE_UNAVAILABLE` rolls back all changes. |
| POST | `/api/rooms/{id}/confirm` | `{ termsVersion }` | `RoomDetail`. 409 `TERMS_VERSION_MISMATCH` if stale, 409 `MEETING_POINT_REQUIRED`. When everyone confirmed → CONFIRMED, `TripApi.markMatched`. |
| POST | `/api/rooms/{id}/close` | – | `RoomDetail` (host, from CONFIRMED) |
| POST | `/api/rooms/{id}/finish` | – | `RoomDetail`. 이동 완료 from CONFIRMED: member → FINISHED; host → room CLOSED. See the 2026-11-23 section. |
| POST | `/api/rooms/{id}/cancel` | – | `RoomDetail` (host, from OPEN/COORDINATING) |

```ts
CreateRoomRequest { sameGenderOnly?: boolean /* ignored: every room is same-gender only */, sourceTripId, capacity: number /*2–4 persons incl. host*/, terms: RoomTerms, departureAt?: string /*default trip.desiredDepartureAt*/ }
JoinRoomRequest { tripId: string, passengerCount?: number /*1–3 including self; defaults to trip count*/ }
UpdatePlanRequest { meetingPoint: MeetingPoint, departureAt: string, terms: RoomTerms }
UpdateDestinationRequest { destination: PlaceRef }
RoomTerms   { farePolicy: FarePolicy, luggageAllowed: boolean, note?: string /*≤200*/ }
RoomSummary {
  id, status: RoomStatus, hostNickname, sameGenderOnly: boolean,
  approxOrigin: LatLng, approxDestination: LatLng, originLabel: string, destinationLabel: string,
  departureAt, departureWindowEnd,        // window end = departureAt + host maxWaitMinutes
  capacity, seatsLeft, participantCount, // participantCount counts member accounts; total riders = capacity − seatsLeft
  terms: RoomTerms, meetingPoint: MeetingPoint | null,
  estimatedTaxiFareWon: number | null,    // host route RouteSnapshot.taxiFareWon; per-person uses total riders, including companions
  routeDistanceMeters: number | null,     // host route RouteSnapshot.distanceMeters (null if no route)
  routeDurationSeconds: number | null,    // host route RouteSnapshot.durationSeconds; room map bubble "N분 · N km"
  originName: string | null,              // host origin PlaceRef.name if kind ∈ {SEARCH, STATION_EXIT, BUS_STOP, LANDMARK} (public place/building name), else null. Never the address.
  destinationName: string | null          // same for the destination
}
NearbyRooms { radiusMeters: number, rooms: NearbyRoom[], hasMore: boolean }
NearbyRoom extends RoomSummary {
  distanceMeters: number,                 // reference point → boarding spot, straight line, rounded 10m (not a walking distance)
  distanceBasis: 'MEETING_POINT' | 'ORIGIN' // MEETING_POINT: host-set meeting point away from the origin; ORIGIN: boards at the origin
}
RoomDetail extends RoomSummary {
  myRole: 'HOST' | 'MEMBER' | 'NONE', myTripId: string | null,
  termsVersion: number, readOnly: boolean,
  canJoin: boolean, canConfirm: boolean, allConfirmed: boolean,
  participants: Participant[],
  routePreview: LatLng[],                 // host route with both ends trimmed (LocationMasker.trimPathEnds), for any signed-in user
  ongoingRideRoomId: string | null        // caller's other CONFIRMED room not finished yet (then canJoin=false), else null
}
Participant { memberId, nickname, role: 'HOST' | 'MEMBER', status: 'ACTIVE' | 'LEFT' | 'REMOVED' | 'FINISHED', passengerCount, confirmed: boolean, joinedAt }
```

### Same-gender rooms
Creation stores the host gender privately as restricted_gender; only MALE/FEMALE can create (409 GENDER_REQUIRED otherwise). Open lists and matching candidates exclude ineligible callers before limits; non-member detail returns 404 NOT_FOUND. Join returns 409 GENDER_REQUIRED when the caller has no MALE/FEMALE gender and 403 GENDER_RESTRICTED on mismatch; confirm also returns 403 GENDER_RESTRICTED if a member's gender no longer matches. Rooms with a null restricted_gender (legacy) take no new members; active-member retry remains idempotent. Existing active participants retain access after gender changes; the creation snapshot never changes. Only sameGenderOnly is public.

### Room destination changes
`PUT /api/rooms/{id}/destination` accepts `UpdateDestinationRequest` and returns `RoomDetail`.
Only the host of a non-hidden JOINABLE room may call it. The room distributed lock and row lock wrap one transaction.
`TripApi.updateDestination(tripId, memberId, destination)` locks the host's source trip, updates its destination and calculates one new car route snapshot including taxi fare; members' trips are unchanged.
Routing failure returns 503 `ROUTE_UNAVAILABLE` and rolls back all changes (no previous-route fallback).
Success increments `termsVersion`, clears every confirmation, posts `방장이 목적지를 ○○(으)로 바꿨어요`, and emits `ROOM_UPDATED`.
Clients reload the room and their trip to refresh destination, route and fare.

## conversation (owner: backend-domain)

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/rooms/{id}/messages` | `?after=<messageId>&limit=50` | `Message[]` ascending. ACTIVE participants only (403 otherwise). Hidden messages → `body: null, hidden: true`. |
| POST | `/api/rooms/{id}/messages` | `{ body: string(1–500), clientMessageId: string }` | 201 `Message`. 409 `ROOM_READ_ONLY` when room ∈ READ_ONLY. Duplicate `clientMessageId` from same sender → returns existing. |

WebSocket (push only): `ws://<host>/ws/rooms/{roomId}?token=<token>` — ACTIVE participants only.
Server → client frames: `{ "type": RoomEventType, "payload": ... }`

```ts
Message   { id, roomId, senderId: string | null, senderNickname: string | null, type: 'TEXT' | 'SYSTEM', body: string | null, hidden: boolean, createdAt }
RoomEvent =
  | { type: 'MESSAGE_CREATED', payload: Message }
  | { type: 'MESSAGE_HIDDEN',  payload: { messageId } }
  | { type: 'ROOM_UPDATED',    payload: { roomId, status: RoomStatus, termsVersion: number } }   // client refetches GET /rooms/{id}
```
Retention: messages deleted `retention-days` (30) after the room reaches CLOSED/CANCELLED/EXPIRED (daily job).

## moderation (owner: backend-domain)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/reports` | `{ targetType, targetId, reason, detail? (≤500) }` | 201 `Report` |
| GET | `/api/admin/reports` | `?status=OPEN` | `Report[]` (ADMIN) |
| POST | `/api/admin/reports/{id}/actions` | `{ action: ModerationAction, note? }` | `Report` (ADMIN). HIDE_ROOM hides room from candidates and blocks join; HIDE_MESSAGE masks message; RESTRICT_MEMBER → `IdentityApi.restrictMember`. |
| GET | `/api/admin/metrics` | – | `AdminMetrics` (ADMIN) |

```ts
Report       { id, reporterId, reporterNickname, targetType, targetId, reason, detail: string | null, status: ReportStatus, targetPreview: string | null, createdAt, resolvedAt: string | null, resolutionNote: string | null }
AdminMetrics { periodDays: 7, openReports, reportsInPeriod, tripsCreated, tripsMatched, tripsNoMatch, tripsExpired, matchFailureRate /*0–1: (noMatch+expired)/created*/, roomsCreated, roomsConfirmed }
```

---

## Module dependency rules (backend)

```
common  ←  everyone
identity.api ← trip, rideroom, conversation, moderation, matching
trip.api     ← rideroom, matching, moderation
rideroom.api ← matching
(rideroom internal) ← conversation, moderation   — same owner, still go through public application services
```
No module imports another module's `internal`/entity/repository packages. Cross-module async signals use the event records in `*.api`
(`LocationConsentWithdrawnEvent`, `TripCancelledEvent`) via `ApplicationEventPublisher`, synchronous `@EventListener` (same transaction).
Flyway version ranges: V1 lead · V10–19 identity · V20–29 trip · V30–39 rideroom · V40–49 conversation · V50–59 moderation · V60–69 matching/places.
