# Siheung Taxi-Mate (MVP)

시흥시에서 **동선이 비슷한 승객끼리** 택시 동승을 조율하도록 연결하는 서비스의 MVP입니다.
출발지·목적지를 정하면 자동차 경로를 계산하고, 출발·도착이 가까우며 실제 경로와 출발시간이 비슷한 모집 방을 찾아 줍니다.
버스정류장·역 출구·랜드마크는 **만나기 쉬운 탑승 장소 추천**에만 사용합니다.

> ⚠️ 이 MVP는 승객 간 매칭과 조율만 다룹니다. 택시 호출·배차·결제·운임 자동 분할은 구현하지 않았습니다.
> 유상 택시 동승 중개의 적법성(여객자동차 운수사업법 등)과 위치정보사업 신고 요건은 **검토되지 않았으며**, 이 저장소는 합법 운영을 보장하지 않습니다.

- 아키텍처: [`docs/architecture.md`](docs/architecture.md)
- API·상태·DTO 계약: [`docs/api-contract.md`](docs/api-contract.md) (TS 미러: `frontend/src/api/contract.ts`)
- 에이전트 작업 규칙 / 파일 소유: [`AGENTS.md`](AGENTS.md)

## 구성

| 경로 | 내용 |
|---|---|
| `backend/` | Spring Boot 3.5 · Java 21 · Gradle wrapper. 도메인 모듈러 모놀리스 (`identity`, `trip`, `matching`, `rideroom`, `conversation`, `moderation`, `externalmobility`, `common`) |
| `frontend/` | React 18 · TypeScript · Tailwind CSS 3 · Vite. `mock` 모드는 브라우저 안의 가짜 백엔드로 전체 흐름 동작 |
| `docker-compose.yml` | PostgreSQL 16 + PostGIS 3.4, Redis 7 |

## 빠른 실행

### A. 화면만 보기 (백엔드·DB·카카오 키 없이)

```bash
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173  (기본 VITE_API_MODE=mock)
```
`mock` 모드: 시흥 장소 fixture, 가상 모집 방(정왕역·시흥시청역·배곧 일대), 가상 참여자 응답·확정까지 브라우저에서 시뮬레이션합니다.
`admin` 닉네임으로 로그인하면 운영자 화면을 볼 수 있습니다. 데이터는 localStorage(`taximate.mock.v1`)에 저장됩니다.

### B. 전체 스택

```bash
docker compose up -d                      # PostGIS :5432, Redis :6379
cd backend
./gradlew bootRun                          # Windows: gradlew.bat bootRun  → http://localhost:8080
# Flyway가 V1(확장) → V10 identity → V20 trip → V30 room → V40 messages → V50 moderation 을 적용
cd ../frontend
echo "VITE_API_MODE=http" > .env.local
npm run dev
```
Redis 없이 단일 인스턴스로 돌릴 땐 `LOCK_MODE=local`(기본값). 운영/다중 인스턴스에선 `LOCK_MODE=redis`.

### C. 공개 테스트 (GitHub Pages + 로컬 백엔드 터널)

프론트는 GitHub Pages(`https://<owner>.github.io/taximate/`), 백엔드는 내 PC에서 실행하고 Cloudflare Quick Tunnel로 공개합니다.
PC·Docker·터널이 켜져 있을 때만 동작하는 **임시 테스트용**입니다.

1. 로컬 스택 실행 (B와 동일, `backend/.env`에 `CORS_ORIGINS`에 `https://<owner>.github.io` 포함)
2. `cloudflared tunnel --url http://localhost:8080` → 출력되는 `https://xxxx.trycloudflare.com` 확인
3. 저장소 변수 갱신 후 재배포: `gh variable set API_BASE_URL --body https://xxxx.trycloudflare.com` → `gh workflow run pages.yml`
4. 카카오 콘솔 JavaScript SDK 도메인에 `https://<owner>.github.io` 등록, 저장소 시크릿 `KAKAO_JS_KEY`에 JavaScript 키

`API_BASE_URL`이 비어 있으면 Pages 빌드는 mock 모드로 배포됩니다. Quick Tunnel 주소는 실행할 때마다 바뀌므로 3단계를 다시 해야 합니다.
개발용 닉네임 로그인은 비밀번호가 없어 **닉네임만 알면 그 계정으로 로그인됩니다** — 신뢰하는 사람과의 테스트에만 쓰세요.

## 환경 변수

백엔드 (`application.yml` 기본값, 실제 키는 환경 변수로만 주입 — 코드/저장소에 넣지 마세요). 예시: [`.env.example`](.env.example)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/taximate` / `taximate` / `taximate` | PostGIS 필요 |
| `KAKAO_MODE` | `mock` | `mock` = fixture 어댑터, `kakao` = 실제 API |
| `KAKAO_REST_API_KEY` | (빈 값) | `KAKAO_MODE=kakao`인데 비어 있으면 **기동 실패**(fail-fast) |
| `LOCK_MODE` | `local` | `local` = JVM 내 락, `redis` = Redisson |
| `REDIS_URL` | `redis://localhost:6379` | `LOCK_MODE=redis`일 때 |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | REST + WebSocket 허용 origin |
| `DEV_LOGIN_ENABLED` | `true` | 닉네임 개발 로그인. **운영에서는 false + 실제 인증으로 교체** |
| `ADMIN_NICKNAMES` | `admin` | 쉼표 구분, 이 닉네임은 ADMIN 권한 |

매칭·프라이버시 임계값은 `application.yml`의 `taximate.matching.*`, `taximate.meeting-point.*`, `taximate.privacy.*`에서 조정합니다.

프론트엔드 (`frontend/.env.local`, 예시: `frontend/.env.example`)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` 또는 `http` |
| `VITE_API_BASE_URL` | `http://localhost:8080` | `http` 모드 백엔드 주소 |
| `VITE_KAKAO_JS_KEY` | (빈 값) | 있으면 Kakao Maps JS SDK 지도, 없으면 SVG 대체 지도 |

## 카카오 API 설정

1. [Kakao Developers](https://developers.kakao.com)에서 앱 생성.
2. **REST API 키** → 백엔드 `KAKAO_REST_API_KEY`. 사용 API:
   - 로컬: `GET https://dapi.kakao.com/v2/local/search/keyword.json`, `/v2/local/search/category.json`(SW8 지하철역, AT4 관광명소), `/v2/local/geo/coord2address.json`
   - 카카오모빌리티 길찾기: `GET https://apis-navi.kakaomobility.com/v1/directions` (자동차, RECOMMEND) — 카카오모빌리티 개발자 콘솔에서 별도 이용 신청·쿼터 확인 필요
3. **JavaScript 키** → 프론트 `VITE_KAKAO_JS_KEY`. 앱 설정 > 플랫폼 > Web에 `http://localhost:5173`, `http://127.0.0.1:5173` 도메인 등록.
4. REST 키는 브라우저로 내려가지 않습니다(장소 검색은 백엔드 `/api/places/*` 프록시). JS 키는 도메인 제한이 걸린 공개 키입니다.

길찾기 호출은 이동 요청 **등록/재검색 시 1회**뿐이며, 후보 비교는 저장된 `RouteSnapshot`으로만 계산합니다.
호출 실패·쿼터 초과 시 이동 요청은 `DRAFT`(+`routeError`)로 저장되고, 재검색 실패 시 만료 전 스냅샷이 있으면 그대로 사용합니다.

## 매칭 규칙 요약

1. **공간 필터 (PostGIS `geography`, 미터)**: 상대 이동 요청의 출발지·목적지가 모두 500m 이내 (`ST_DWithin` + GiST 인덱스). 활성·위치동의·경로 보유 요청만.
2. **동선 하드 필터**: 방향 코사인 ≥ 0.7, 경로 겹침(150m 버퍼, 50m 샘플, 양방향 최소) ≥ 50%, 출발시간 차 ≤ min(30분, 양측 대기 허용 합), 합류 우회 추정 ≤ 양측 허용 우회.
3. **점수(0–100)**: 출발지 거리 25% · 도착지 15% · 겹침 30% · 시간 20% · 우회 10%.
4. **정렬**: 출발지 200m 이내(`NEAR`) 우선 → 200–500m(`EXTENDED`), 각 구간 내 점수순. 반경만 맞는 후보는 자동 매칭하지 않음.
5. 후보 방이 없으면 비슷한 동선의 대기자 수와 함께 **“이 동선으로 모집하기”**(입력값 유지) 제공.
6. **공통 탑승 장소**: 참여자 출발지 중심 500m 내 역 출구·정류장·랜드마크 추천, 모두 200m 이내면 `NEAR`. 도보 시간은 상위 3곳만 계산.

## 동시성·안전

- 방 참여/확정/계획 변경: `DistributedLock("room:{id}")`(Redisson 또는 로컬) → 트랜잭션 안에서 `SELECT … FOR UPDATE`로 상태·좌석 재검증 → `@Version`. 같은 이동 요청의 동시 배정은 PostgreSQL advisory lock으로 직렬화.
- 참여·확정 API는 재요청 시 같은 결과(중복 행 없음). 메시지는 `clientMessageId`로 중복 방지.
- 계획 변경 시 `termsVersion` 증가 → 전원 재확정 필요. `CONFIRMED` 이후 신규 참여·메시지 전송 차단(`ROOM_READ_ONLY`).
- **위치 최소 노출**: 다른 사용자에겐 약 110m 격자로 반올림한 좌표, 10m 단위 거리, 양 끝 200m를 잘라낸 경로, 동 단위 지역명만 제공. GPS는 사용자가 누를 때 1회만 조회(백그라운드 추적 없음). 이동 종료 24시간 후 정밀 좌표·경로 삭제.
- 신고(방/메시지/회원) → 운영자 조치(방 숨김, 메시지 숨김, 계정 제한, 기각)와 7일 지표(매칭 실패율 등).

## MVP 범위 밖 / 미구현

- 실제 인증(카카오 로그인 등), 본인 확인, 토큰 만료·폐기 — 현재는 개발용 닉네임 로그인
- 택시 호출·배차·결제·운임 계산/분할, 기사·사업자 앱
- 푸시 알림(앱 밖) — 방 안 WebSocket 이벤트만
- 실제 도보 경로 API — 현재 직선거리 × 1.3, 1.2m/s 추정(`WalkingRoutePort`로 교체 가능)
- 위치정보 이용약관·개인정보 처리방침 정식 문서, 위치기반서비스사업 신고
- 자동화 테스트(요청에 따라 추가하지 않음), 부하 테스트, 운영 배포 설정
- 메시지 보존 30일 후 삭제는 일 배치. 신고 증거 보존 정책은 미정

## 상태 이름

`TripStatus`: DRAFT, SEARCHING, MATCHED, NO_MATCH, CANCELLED, EXPIRED ·
`RoomStatus`: OPEN, COORDINATING, CONFIRMED, CLOSED, CANCELLED, EXPIRED — 전이 규칙은 [`docs/api-contract.md`](docs/api-contract.md).
