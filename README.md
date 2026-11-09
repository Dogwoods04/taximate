# Siheung Taxi-Mate (MVP)

시흥시에서 **동선이 비슷한 이웃끼리** 택시를 함께 타도록 연결해 주는 서비스의 MVP입니다.
출발지·목적지를 검색하면 자동차 경로와 예상 택시요금을 계산하고, 출발지·목적지가 가깝고 출발 시간이 맞는 모집 방을 찾아 줍니다.
방에 들어가면 만날 장소·출발 시각을 정하고, 채팅으로 조율한 뒤 함께 택시를 잡아 요금을 나눕니다.

> ⚠️ 이 MVP는 승객 간 매칭과 조율만 다룹니다. 택시 호출·배차·결제·운임 자동 분할은 구현하지 않았습니다.
> 유상 택시 동승 중개의 적법성(여객자동차 운수사업법 등)과 위치정보사업 신고 요건, 외부 API(카카오·TMAP) 이용약관 준수 여부는 **검토되지 않았으며**, 이 저장소는 합법 운영을 보장하지 않습니다.

- 아키텍처: [`docs/architecture.md`](docs/architecture.md)
- API·상태·DTO 계약: [`docs/api-contract.md`](docs/api-contract.md) (TS 미러: `frontend/src/api/contract.ts`)
- 에이전트 작업 규칙 / 파일 소유: [`AGENTS.md`](AGENTS.md)

## 화면

웹 하나에서 접속 기기에 따라 다른 화면을 띄웁니다 (`frontend/src/lib/platform.ts`가 iOS · Android · 기타 모바일 · PC를 구분).

| 접속 | 화면 |
|---|---|
| 휴대폰 (iOS / Android) | 모바일 앱 (`frontend/src/mobile`) — 지도 + 아래 시트 구조 |
| PC | 서비스 소개 페이지 (`frontend/src/pc`) → **사용해보기**: 왼쪽 사용 가이드 + 오른쪽 핸드폰 프레임 속 실제 모바일 앱(iframe, 화면 높이에 맞춰 비율 확대) |
| PC에서 모바일 화면 직접 보기 | 주소 뒤에 `?view=mobile` (같은 탭에서 유지, `?view=pc`로 되돌림) |

### 모바일 앱 흐름

1. **시작 → 사용자 이름 → 성별(비공개) → 위치 정보 동의 → 외부 서비스(KAKAO API·TMAP API) 항목별 동의** — 하나라도 빠진 사용자는 다시 시작 화면부터 진행하고, 빠진 단계만 거칩니다.
2. **Home**: 카카오 지도(GPS 1회 조회, 내 위치로 돌아가기 버튼), 근처에 열린 방 카드(내 위치에서 가까운 출발지 순), "현재 내 방" 바. 방 카드를 누르면 예상 경로와 공공장소 이름이 보이는 방 소개 → **출발지까지 도보 경로(TMAP)·거리 확인 후 참여**.
3. **어디로 갈까요?**: 출발지·목적지를 검색으로 지정(전국 검색, 가까운 결과 우선) → 경로·시간 표시 → 비슷한 동선의 방 카드(태그: 출발지·목적지 거리, 경로 겹침, 우회) → 방 상세 → 참여, 또는 **새 방 만들기**(소개글, 큰 짐, 나 포함 탑승 인원, **같은 성별만**). 출발 조건 줄에서 출발 시간을 바꾸면 바로 다시 찾습니다.
4. **이동 중(방)**: 출발까지 남은 시간, 목적지, 예상 1인 요금(총 요금 ÷ 탑승 인원), 좌석(앞 1·뒤 2), 만날 장소(기본값 = 방 출발지, 방장이 "약속 바꾸기"에서 검색으로 변경), 전원 확정, 채팅(안 읽은 메시지 배지).
   - **채팅 속 장소 팝업**: 채팅에 장소·주소가 나오면 방장은 "만날 장소로 / 목적지로" 바꿀 수 있고, 참여자는 "방장에게 제안하기"를 보냅니다. 이미 현재 만날 장소·목적지인 곳은 띄우지 않습니다.
   - 방장이 내보내면 당사자 화면에 바로 알림 후 홈으로 이동. 끝난 방(종료·취소·만료)은 뒤로가기로도 다시 열리지 않습니다.
5. 시트는 손잡이로 끌어 올리고 내릴 수 있고, 올린 만큼 지도가 흐려집니다. Android에서는 키보드가 올라오면 채팅 시트가 뒤로가기 버튼 아래까지 올라갑니다.

## 구성

| 경로 | 내용 |
|---|---|
| `backend/` | Spring Boot 3.5 · Java 21 · Gradle wrapper. 도메인 모듈러 모놀리스 (`identity`, `trip`, `matching`, `rideroom`, `conversation`, `moderation`, `externalmobility`, `common`) |
| `frontend/src/mobile/` | 모바일 앱 (React 18 · TypeScript · Tailwind CSS 3 · Vite) |
| `frontend/src/pc/` | PC 소개 페이지 · 사용해보기 화면 · 자체 디자인 핸드폰 프레임 |
| `frontend/src/api`, `frontend/src/lib` | 공용 API 클라이언트(`http` / 브라우저 안 `mock`), 기기 판별, 공용 유틸 |
| `docker-compose.yml` | PostgreSQL 16 + PostGIS 3.4, Redis 7 |
| `.github/workflows/pages.yml` | 프론트엔드를 GitHub Pages(`/taximate/`)로 배포 |

## 빠른 실행

### A. 화면만 보기 (백엔드·DB·키 없이)

```bash
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173  (기본 VITE_API_MODE=mock)
```
`mock` 모드: 시흥 장소 fixture, 가상 모집 방(같은 성별 방 포함), 가상 참여자 응답·확정까지 브라우저에서 시뮬레이션합니다.
`admin` 닉네임으로 시작하면 운영자 화면을 볼 수 있습니다. 데이터는 localStorage(`taximate.mock.v3`)에 저장됩니다.

### B. 전체 스택

```bash
docker compose up -d                      # PostGIS :5432, Redis :6379
cd backend
./gradlew bootRun                          # Windows: gradlew.bat bootRun  → http://localhost:8080
cd ../frontend
echo "VITE_API_MODE=http" > .env.local
npm run dev
```
메모리가 부족한 PC에서는 Gradle 데몬 대신 jar로 실행하는 편이 안정적입니다.

```bash
cd backend
./gradlew bootJar --no-daemon
LOCK_MODE=redis java -Xms128m -Xmx384m -XX:+UseSerialGC -jar build/libs/taximate-0.1.0-SNAPSHOT.jar
```
백엔드는 `backend/.env`(git 제외)를 설정으로 읽습니다. Redis 없이 단일 인스턴스로 돌릴 땐 `LOCK_MODE=local`(기본값).

Flyway 마이그레이션은 모듈마다 번호 범위가 있습니다(identity V10–19, trip V20–29·V60–69, rideroom V30–39, …).
현재 V1 · V10 · V11(외부 서비스 동의) · V12(성별) · V20 · V30 · V31(같은 성별 방) · V40 · V50 · V60(택시요금)이며,
낮은 번호가 나중에 추가될 수 있어 `spring.flyway.out-of-order: true`입니다.

### C. 공개 테스트 (GitHub Pages + 로컬 백엔드 터널)

프론트는 GitHub Pages(`https://<owner>.github.io/taximate/`), 백엔드는 내 PC에서 실행하고 Cloudflare Quick Tunnel로 공개합니다.
PC·Docker·백엔드·터널이 켜져 있을 때만 동작하는 **임시 테스트용**입니다.

1. 로컬 스택 실행 (B와 동일). `backend/.env`의 `CORS_ORIGINS`에 `https://<owner>.github.io` 포함
2. `cloudflared tunnel --url http://localhost:8080` → 출력되는 `https://xxxx.trycloudflare.com` 확인
3. 저장소 변수 갱신 후 재배포: `gh variable set API_BASE_URL --body https://xxxx.trycloudflare.com` → `gh workflow run pages.yml`
4. 카카오 콘솔 JavaScript SDK 도메인에 `https://<owner>.github.io` 등록, 저장소 시크릿 `KAKAO_JS_KEY`에 JavaScript 키

`API_BASE_URL`이 비어 있으면 Pages 빌드는 mock 모드로 배포됩니다. Quick Tunnel 주소는 실행할 때마다 바뀌므로 3단계를 다시 해야 하고,
배포 직후에는 GitHub Pages 캐시 때문에 잠시 이전 주소가 보일 수 있습니다. 이미 열린 화면은 새로고침해야 새 주소로 연결됩니다.

개발용 닉네임 로그인은 비밀번호가 없어 **닉네임만 알면 그 계정으로 로그인됩니다** — 신뢰하는 사람과의 테스트에만 쓰세요.

### 체험용 더미 방

`DEMO_KEEPALIVE_PREFIX`(예: `샘플`)를 설정하면, 방장 닉네임이 그 값으로 시작하는 방은 출발이 20분 안으로 다가올 때마다
1~2.5시간 뒤로 옮겨져 계속 체험할 수 있습니다(5분마다, 그리고 백엔드가 켜질 때 만료 처리보다 먼저 실행). 실제 사용자 방은 건드리지 않습니다.
`.env`는 properties 형식이라 한글은 `샘플`처럼 유니코드 이스케이프로 적습니다.

## 환경 변수

백엔드 (`application.yml` 기본값, 실제 키는 환경 변수/`backend/.env`로만 주입 — 코드·저장소에 넣지 마세요). 예시: [`.env.example`](.env.example)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/taximate` / `taximate` / `taximate` | PostGIS 필요 |
| `KAKAO_MODE` | `mock` | `mock` = fixture 어댑터, `kakao` = 실제 API |
| `KAKAO_REST_API_KEY` | (빈 값) | `KAKAO_MODE=kakao`인데 비어 있으면 **기동 실패**(fail-fast) |
| `TMAP_APP_KEY` | (빈 값) | TMAP 보행자 경로안내 appKey. 비어 있거나 오류면 직선거리 추정으로 대체 |
| `DEMO_KEEPALIVE_PREFIX` | (빈 값 = 끔) | 체험용 더미 방 방장 닉네임 접두사 |
| `LOCK_MODE` | `local` | `local` = JVM 내 락, `redis` = Redisson |
| `REDIS_URL` | `redis://localhost:6379` | `LOCK_MODE=redis`일 때 |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | REST + WebSocket 허용 origin |
| `DEV_LOGIN_ENABLED` | `true` | 닉네임 개발 로그인. **운영에서는 false로 끄고 카카오 로그인 사용** |
| `ADMIN_NICKNAMES` | `admin` | 쉼표 구분, 이 닉네임은 ADMIN 권한 |
| `DEV_LOGIN_NICKNAME_PREFIX` | (빈 값 = 제한 없음) | 예: `샘플`. 설정하면 닉네임 로그인은 이 접두사로 시작하는 체험용 닉네임(과 `ADMIN_NICKNAMES`)만 허용(그 외 403 `DEV_LOGIN_RESTRICTED`), 닉네임 계정은 이름을 바꿔도 접두사 유지. `backend/.env`에는 `샘플`처럼 유니코드 이스케이프로 적기 |

매칭·프라이버시 임계값은 `application.yml`의 `taximate.matching.*`, `taximate.meeting-point.*`, `taximate.privacy.*`, 도보 경로는 `taximate.walking.*`에서 조정합니다.

프론트엔드 (`frontend/.env.local`, 예시: `frontend/.env.example`)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` 또는 `http` |
| `VITE_API_BASE_URL` | `http://localhost:8080` | `http` 모드 백엔드 주소 |
| `VITE_KAKAO_JS_KEY` | (빈 값) | 있으면 Kakao Maps JS SDK 지도, 없으면 SVG 대체 지도 |

## 외부 API 설정

### 카카오
1. [Kakao Developers](https://developers.kakao.com)에서 앱 생성.
2. **REST API 키** → 백엔드 `KAKAO_REST_API_KEY`. 사용 API:
   - 로컬: `GET https://dapi.kakao.com/v2/local/search/keyword.json`(전국 검색, 위치는 정렬 힌트로만 사용), `/v2/local/search/category.json`, `/v2/local/geo/coord2address.json`
   - 카카오모빌리티 길찾기: `GET https://apis-navi.kakaomobility.com/v1/directions` (자동차, 실시간 교통 반영, 응답의 택시요금 사용) — 별도 이용 신청·쿼터 확인 필요
3. **JavaScript 키** → 프론트 `VITE_KAKAO_JS_KEY`. 앱 설정 > 플랫폼 > Web에 `http://localhost:5173`, `http://127.0.0.1:5173`, `https://<owner>.github.io` 등록.
4. REST 키는 브라우저로 내려가지 않습니다(장소 검색·경로는 백엔드 프록시). JS 키는 도메인 제한이 걸린 공개 키입니다.
5. 지도 하단 카카오 로고·저작권 표시는 시트·패널 위로 올려 항상 보이게 합니다(축척 막대만 숨김).

### TMAP (도보 경로)
[SK open API](https://openapi.sk.com)에서 앱을 만들고 **TMAP 보행자 경로안내** 상품을 신청한 뒤 appKey를 `TMAP_APP_KEY`에 넣습니다.
`GET /api/routes/walk`가 내 위치 → 방 출발지 도보 경로를 돌려주며(좌표는 저장·로그하지 않음), 만날 장소 추천의 도보 시간에도 쓰입니다.
신청 직후에는 키 활성화까지 몇 분 걸릴 수 있습니다(그동안 403 `INVALID_API_KEY`).

길찾기(자동차) 호출은 이동 요청 **등록/재검색 시 1회**(그리고 방장의 목적지 변경 시 1회)뿐이며, 후보 비교는 저장된 `RouteSnapshot`으로만 계산합니다.
호출 실패·쿼터 초과 시 이동 요청은 `DRAFT`(+`routeError`)로 저장되고, 재검색 실패 시 만료 전 스냅샷이 있으면 그대로 사용합니다.

## 매칭 규칙 요약

1. **공간 필터 (PostGIS `geography`, 미터)**: 상대 이동 요청의 출발지·목적지가 각각 500m 이내 (`ST_DWithin` + GiST). 활성·위치동의·경로 보유 요청만.
2. **반경 안이면 후보**: 출발지·목적지가 모두 500m 안이면, 참여 가능 상태·빈 자리·숨김 아님·출발시간 차 ≤ min(30분, 양측 대기 허용 합)만 확인하고 후보로 냅니다.
   카카오 길찾기는 실시간 교통을 반영해 가까운 건물끼리도 전혀 다른 길을 줄 수 있으므로, 방향·경로 겹침·우회는 **점수에만** 반영합니다(반대 방향이면 점수 크게 감소).
3. **같은 성별만** 방은 방장과 같은 성별의 사용자에게만 후보·목록·상세가 보이고 참여할 수 있습니다.
4. **점수(0–100)**: 출발지 거리 25% · 목적지 15% · 경로 겹침 30% · 시간 20% · 우회 10%.
5. **정렬**: 출발지 200m 이내(`NEAR`) 우선 → 200–500m(`EXTENDED`), 각 구간 내 점수순.
6. 후보 방이 없으면 비슷한 동선의 대기자 수와 함께 **새 방 만들기**를 안내합니다.
7. Home의 "근처에 열린 방"(`GET /api/rooms/open`)은 내 위치(1회 GPS, 저장하지 않음) 3km 안의 참여 가능한 방을 가까운 출발지 순으로 보여 줍니다.

## 위치·개인정보 노출

- 다른 사용자에게는 방장이 **검색으로 고른 공공장소·건물 이름**(예: 정왕역 4호선 → 시흥시청)과 **양 끝 200m를 잘라낸 예상 경로**만 보입니다. 주소·GPS 위치는 공개하지 않습니다.
  방을 만들 때 "집 주소 대신 가까운 공공장소를 고르라"는 안내를 보여 줍니다.
- 좌표는 약 110m 격자로 반올림해 제공하고, 거리는 10m 단위입니다. 이동 종료 24시간 후 정밀 좌표·경로를 삭제합니다.
- GPS는 Home 진입·내 위치 버튼·도보 경로 확인 때 1회만 조회합니다(백그라운드 추적 없음).
- 성별은 본인만 볼 수 있고, 같은 성별 방에는 "같은 성별만" 표시만 붙습니다(어느 성별인지는 공개하지 않음).
  성별 값의 출처(본인 선택 `SELF` / 카카오 `KAKAO`)를 함께 저장해 두어, 카카오 로그인 도입 시 카카오 값으로 채울 수 있습니다.
- 위치 정보 동의와 외부 서비스(KAKAO·TMAP) 동의는 서버에 기록되며(버전·시각, 철회 이력 보존) 메뉴에서 철회할 수 있습니다.

## 동시성·안전

- 방 참여/확정/계획·목적지 변경: `DistributedLock("room:{id}")`(Redisson 또는 로컬) → 트랜잭션 안에서 `SELECT … FOR UPDATE`로 상태·좌석 재검증 → `@Version`. 같은 이동 요청의 동시 배정은 PostgreSQL advisory lock으로 직렬화.
- 참여·확정 API는 재요청 시 같은 결과(중복 행 없음). 메시지는 `clientMessageId`로 중복 방지.
- 만날 장소·출발 시각·목적지 변경 시 `termsVersion` 증가 → 전원 재확정 필요. `CONFIRMED` 이후 신규 참여·메시지 전송 차단(`ROOM_READ_ONLY`).
- 방에서 내보내진 사용자에게는 방 상태 변경 이벤트 하나만 전달한 뒤 WebSocket 연결을 닫습니다(채팅 내용은 전달하지 않음).
- 신고(방/메시지/회원) → 운영자 조치(방 숨김, 메시지 숨김, 계정 제한, 기각)와 7일 지표(매칭 실패율 등).

## MVP 범위 밖 / 미구현

- 본인 확인, 앱 로그인 토큰 만료·폐기 (카카오 로그인은 지원)
- 택시 호출·배차·결제·운임 분할 처리, 기사·사업자 앱
- 푸시 알림(앱 밖) — 방 안 WebSocket 이벤트만
- 위치정보 이용약관·개인정보 처리방침 정식 문서, 위치기반서비스사업 신고, 외부 API 약관(출처 표시 등) 검토
- 상시 운영 배포(현재는 PC + Quick Tunnel 임시 공개), 실제 iOS 기기 검증
- 자동화 테스트(요청에 따라 추가하지 않음), 부하 테스트
- 메시지 보존 30일 후 삭제는 일 배치. 신고 증거 보존 정책은 미정

### 카카오 로그인

카카오 로그인과 닉네임 체험 로그인을 함께 지원합니다. 운영에서는 `DEV_LOGIN_ENABLED=false`로 닉네임 체험을 끄세요.

1. Kakao Developers에서 같은 앱의 **카카오 로그인 활성화**를 켜고, JavaScript 키의 **JavaScript SDK 도메인**에 실제 origin을 등록하세요: `http://localhost:5173`, `http://127.0.0.1:5173`, Pages는 `https://<owner>.github.io`.
2. **Redirect URI**에 `http://localhost:5173/auth/kakao`, `http://127.0.0.1:5173/auth/kakao`, 배포 주소 `https://<owner>.github.io/taximate/auth/kakao`를 등록하고 백엔드 `KAKAO_REDIRECT_URIS`에도 쉼표로 나열하세요. 사용자 도메인은 해당 origin + 배포 base + `auth/kakao`입니다.
3. **동의항목**에서 닉네임(`profile_nickname`)을 설정하고 성별(`gender`)은 앱 권한이 허용하면 선택 동의로 설정하세요. 성별이 제공되지 않으면 앱에서 직접 선택합니다. 이메일·전화번호는 요청하지 않습니다.
4. 같은 앱의 REST API 키를 백엔드 `KAKAO_REST_API_KEY`, JavaScript 키를 프론트 `VITE_KAKAO_JS_KEY`에 설정하세요. **Client Secret**을 활성화한 경우 백엔드 `KAKAO_CLIENT_SECRET`에 넣으세요. 키와 시크릿은 저장소에 커밋하지 마세요.

[공식 JavaScript 로그인 문서](https://developers.kakao.com/docs/en/kakaologin/js)에 따라 JS SDK로 받은 코드를 서버에서 REST 키로 교환합니다. REST 키와 카카오 토큰은 브라우저에 전달하지 않으며, 카카오 토큰도 저장하지 않습니다. [공식 SDK 다운로드](https://developers.kakao.com/docs/en/javascript/download)의 2.8.4 버전과 SRI를 사용합니다. PC 체험 iframe은 최상위 창에서 인증한 뒤 `/try`로 돌아와 이름·동의 단계를 마칩니다. mock 모드는 카카오 계정을 쓰지 않는 시뮬레이션입니다.

## 상태 이름

`TripStatus`: DRAFT, SEARCHING, MATCHED, NO_MATCH, CANCELLED, EXPIRED ·
`RoomStatus`: OPEN, COORDINATING, CONFIRMED, CLOSED, CANCELLED, EXPIRED — 전이 규칙은 [`docs/api-contract.md`](docs/api-contract.md).
