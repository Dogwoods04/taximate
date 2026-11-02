# Architecture (MVP)

Single deployable Spring Boot 3.5 app (Java 21) — domain-oriented modular monolith — plus a React 18 SPA.

```
frontend (Vite, React 18, TS, Tailwind)
   │  REST /api/**  +  WS /ws/rooms/{id}
   ▼
backend  kr.siheung.taximate
 ├─ common            LatLng/PlaceRef/MeetingPoint, ErrorCode, @CurrentMember, DistributedLock, LocationMasker, Clock
 ├─ identity          members, dev-login tokens, location consent, restriction       → identity.api.IdentityApi
 ├─ trip              TripIntent, RouteSnapshot, PostGIS points, expiry job          → trip.api.TripApi
 ├─ externalmobility  ports: RoutePort, PlaceSearchPort, MeetingPointPort, WalkingRoutePort
 │                    adapters: kakao (REST) | mock (fixtures)  — selected by taximate.kakao.mode
 ├─ matching          radius search (via trip spatial query), route scoring, meeting-point suggestions
 ├─ rideroom          RideRoom, participants, seats, plan/terms, confirm/close       → rideroom.api.RideRoomApi
 ├─ conversation      room messages, WS push, retention job
 ├─ moderation        reports, admin actions, metrics
 └─ notification      (MVP: in-room WS events only — lives in conversation)
   │
   ├─ PostgreSQL 16 + PostGIS 3.4   (Flyway)
   └─ Redis 7 (Redisson lock)        — optional in dev: taximate.lock.mode=local
```

## Key decisions

1. **Coordinates**: entities keep `lat/lng double` columns; Postgres adds `GENERATED ALWAYS ... STORED geography(Point,4326)` columns with GiST indexes.
   Radius search uses `ST_DWithin(geog, geog, meters)` — meters because the type is `geography`, not `geometry`. No hibernate-spatial needed.
2. **Routes**: one Directions call per trip registration / explicit re-search, stored as `RouteSnapshot` (simplified polyline JSON, ≤ ~200 points).
   Candidate scoring never calls Kakao. Provider DTOs stay inside `externalmobility.adapter.kakao`.
3. **Matching = hard filters then score.** Radius alone never matches. All thresholds in `taximate.matching.*`.
4. **Rooms are the unit of matching.** Candidates are joinable rooms whose host trip passes the filters; solo searchers are counted
   (`similarSearchingCount`) to motivate “이 동선으로 모집하기”.
5. **Join concurrency**: `DistributedLock.withLock("room:"+id)` (Redisson or local) wraps a `@Transactional` method that
   `SELECT … FOR UPDATE`s the room row and re-checks status/seats; `@Version` on the room as a second guard; unique (room_id, member_id).
6. **Privacy**: other users only see `LocationMasker` output (≈110m grid, 10m-rounded distances, route ends trimmed 200m, area labels).
   No background GPS: the browser asks for one fix when the user taps “현재 위치”. Precise trip coordinates are nulled
   `location-retention-hours` after the trip ends (trip job).
7. **Auth (MVP)**: dev-login by nickname → opaque bearer token stored in DB. Replace with real auth (e.g. Kakao Login) before launch.
8. **Cross-module calls**: public interfaces in `*.api` for synchronous same-transaction work; two events for fan-out
   (`LocationConsentWithdrawnEvent`, `TripCancelledEvent`). No event bus beyond Spring's in-process publisher.
