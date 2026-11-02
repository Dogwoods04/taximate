# Siheung Taxi-Mate — frontend

Vite + React 18 + TypeScript + Tailwind. Mobile-first (≈400px), Korean UI.

```sh
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc --noEmit && vite build
```

Env (`.env.local`, see `.env.example`):

| var | default | |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` = in-browser fake backend (localStorage `taximate.mock.v2`); `http` = real backend |
| `VITE_API_BASE_URL` | `http://localhost:8080` | REST `/api/**` + WS `/ws/rooms/{id}` |
| `VITE_KAKAO_JS_KEY` | – | optional; without it the map is a schematic SVG of Siheung |

Mock demo: log in with any nickname (`admin` → ADMIN), agree to the location notice, search 정왕역 → 시흥시청
(4 candidates: 2 NEAR, 2 EXTENDED) or 정왕역 → 월곶역 (no rooms, "2명이 찾고 있어요" → 이 동선으로 모집하기).
After joining, the host replies in chat and auto-confirms ~2s after you confirm. As a host in mock mode,
"데모 참여자 추가" adds a simulated member. Reset the demo by clearing the site's localStorage.

Layout: `src/api` (contract, `ApiClient`, http/mock clients), `src/components` (MapView, sheets, report dialog),
`src/pages` (one per route), `src/lib` (auth/toast context, ErrorCode → Korean messages, formatting).
