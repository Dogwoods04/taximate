# Mobility / trip / matching implementation handoff

Implemented only the assigned modules, V20 migration, and the Siheung fixture; fixed contracts were not edited.

## Files and behavior

- `externalmobility`: four provider-neutral ports, typed provider failures (including QUOTA), conditional Kakao and Mock adapters, estimated walking, validated place endpoints. Kakao startup requires an environment-provided key.
- `trip`: entities/repositories, TripApi implementation, owner endpoints, transactional cancellation events, consent withdrawal, minute expiry job and hourly privacy purge. V20 adds generated geography columns, GiST indexes, route snapshots and the partial unique active-trip index.
- `matching`: spatial query port, pure symmetric route-overlap scoring, room candidate endpoint and participant-only public meeting-point suggestions. Candidate scoring never requests external routes.
- `fixtures/siheung-places.json`: 32 public places with approximate coordinates, intended only for deterministic mock mode.

## Decisions where the task left details open

- `matching.api.MatchingTrips` is a matching-owned port implemented by `trip.application.TripSpatialQuery`; this avoids editing lead-owned `trip/api` or importing another module's implementation packages.
- Score components are clamped linear proximity values relative to each applicable hard-filter limit, with normalized configured weights. Zero time/detour tolerance scores an exact match as 1.
- Both providers return walking source ESTIMATE, distance times 1.3 and duration at 1.2 m/s. `WalkResult` carries source explicitly so a future walking provider can report WALKING_API.
- A station returned by SW8 is a LANDMARK; separate exit keyword results are STATION_EXIT. Public attractions use AT4. Results are deduplicated by provider place id and filtered by actual distance.
- Route failures preserve the fixed DRAFT/ROUTE_UNAVAILABLE behavior; refresh failure retains an unexpired snapshot. Error details on failing refresh/place requests distinguish QUOTA from other provider failures.
- Privacy purge also clears snapshot endpoint coordinates and provider request ids, plus trip provider-place ids. Historical metrics and route distance/duration remain; purged trip origin/destination read models are null.
- Matching rejects expired host snapshots; solo counts include only SEARCHING trips outside all active rooms. Equal scores have a deterministic UUID tie-break.

## Kakao endpoints

- `https://apis-navi.kakaomobility.com/v1/directions` (RECOMMEND, lng/lat order; trans_id retained)
- `https://dapi.kakao.com/v2/local/search/keyword.json`
- `https://dapi.kakao.com/v2/local/search/category.json` (SW8, AT4)
- `https://dapi.kakao.com/v2/local/geo/coord2address.json`

References: [Directions](https://developers.kakaomobility.com/guide/navi-api/directions), [Local APIs](https://developers.kakao.com/docs/ko/local/dev-guide).

## Validation and integration

`backend/gradlew.bat compileJava` passed. No tests were added or run, no commit was made, and live Kakao calls / database migrations were not executed. The first sandboxed compile could not create its Gradle lock file; the authorized compile outside the sandbox succeeded.

Orca coordination is unavailable in this terminal: both `orca skills get orchestration` and the requested `orca orchestration check` returned CommandNotFoundException. No worker_done delivery has been confirmed.
