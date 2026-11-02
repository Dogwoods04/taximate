# AGENTS.md — rules for agents working in this repo

Read `docs/architecture.md` and `docs/api-contract.md` first. The contract is fixed; ask the lead to change it.

## File ownership (shared working tree — never edit files you don't own)

| Owner | Paths |
|---|---|
| lead | root files (`README.md`, `AGENTS.md`, `docker-compose.yml`, `.env.example`, `.git*`), `docs/**`, `backend/build.gradle`, `backend/settings.gradle`, `backend/gradle*`, `backend/src/main/resources/application.yml`, `backend/src/main/resources/db/migration/V1__*`, `backend/src/main/java/kr/siheung/taximate/TaximateApplication.java`, `.../common/**`, `.../identity/api/**`, `.../trip/api/**`, `.../rideroom/api/**`, `frontend/src/api/contract.ts` |
| backend-domain | `.../identity/**` (except `api/`), `.../rideroom/**` (except `api/`), `.../conversation/**`, `.../moderation/**`, `.../notification/**`, migrations `V10–V19`, `V30–V59` |
| mobility-matching | `.../externalmobility/**`, `.../trip/**` (except `api/`), `.../matching/**`, migrations `V20–V29`, `V60–V69`, `backend/src/main/resources/fixtures/**` |
| frontend | `frontend/**` except `frontend/src/api/contract.ts` |

`...` = `backend/src/main/java/kr/siheung/taximate`.

## Backend conventions

- Package layout per module: `<module>/api` (public), `<module>/application` (services), `<module>/domain` (entities, repos), `<module>/web` (controllers, request/response DTOs), `<module>/internal` as needed.
- Never import another module's `domain`/`application`/`web`/`internal` packages. Use `*.api` interfaces or `*.api` events.
- Use `ApiException(ErrorCode, msg)` for business errors, `@CurrentMember AuthenticatedMember` for the caller, inject `java.time.Clock`.
- Anything describing another user's location goes through `common.privacy.LocationMasker`.
- JPA `ddl-auto=validate`: every table/column comes from a Flyway migration in your version range.
- Config: bind `taximate.<module>.*` with `@ConfigurationProperties` records with sane defaults; keys already listed in `application.yml`.
- No secrets in code. Kakao keys only via env vars.

## Process

- Do not add or run tests unless the user asks. Compile checks (`./gradlew compileJava`, `npm run build`) are fine.
  If a compile error is in a file you do not own, don't fix it — note it in your report.
- Do not commit; the lead integrates.
