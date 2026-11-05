# 택시메이트 (Siheung Taxi-Mate) — frontend

Vite + React 18 + TypeScript + Tailwind. Mobile UI built from the Figma mockups in `images/`, plus a PC site. Korean copy.

```sh
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc --noEmit && vite build
```

Env (`.env.local`, see `.env.example`):

| var | default | |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` = in-browser fake backend (localStorage `taximate.mock.v3`); `http` = real backend |
| `VITE_API_BASE_URL` | `http://localhost:8080` | REST `/api/**` + WS `/ws/rooms/{id}` |
| `VITE_KAKAO_JS_KEY` | – | optional; without it (or if the SDK fails to load) the map is a schematic SVG of Siheung |
| `VITE_BASE` | `/` | deploy sub-path, e.g. `/taximate/` for GitHub Pages |

## Flow

Start → 사용자 이름 (dev-login) → 위치 정보 동의 → Home → Select sheet → On the way.

- **Home**: one GPS fix on entry / recenter (`getCurrentPosition`, never stored); falls back to 시흥시청.
  Cards = `GET /api/rooms/open` near that fix. "지금 ▾" sets the departure. "현재 내 방" opens my active room.
- **Select**: origin and destination only via place search. Both set → trip is created, route drawn and fitted,
  candidates searched. Tap a room → room introduction → "이 방 선택하기" (join). No match → "새 방 만들기"
  (capacity fixed at 3, fare split equally). Closing the sheet cancels the trip it created.
- **On the way**: countdown to departure, page 1 = fare / seats / meeting point / 전원 확정, page 2 = chat.

The map is one persistent layer (`mobile/components/map/MapLayout.tsx`) under Home, Select and On the way;
screens set its layers and call `focus` / `fit` with the pixels their sheet covers, so it animates between states.

Mock demo: any nickname (`admin` → 운영자 menu). Search 정왕역 → 시흥시청 (rooms found) or 정왕역 → 월곶역
(no rooms, "2명이 찾고 있어요" → 새 방 만들기). After joining, the host replies in chat and auto-confirms ~2s after you confirm.
As a host in mock mode, "데모 참여자 추가" adds a simulated member. Reset the demo by clearing the site's localStorage.

Layout:
- `src/api` (contract, `ApiClient`, http/mock clients), `src/lib` (auth/toast context, errors, formatting, geolocation, `platform.ts`) — shared.
- `src/mobile` — the phone app (`MobileApp.tsx`, `screens/`, `components/` incl. the map, `endedRooms.ts`, `useKeyboard.ts`).
- `src/pc` — the PC site: `/` landing, `/try` usage guide + phone frame running the mobile app in a same-origin iframe.
  Any other path opened on a PC goes to `/try?path=…`. Screenshots in `src/pc/assets` are captured from the mock app.

Platform (`src/lib/platform.ts`, decided once at boot in `src/App.tsx`): Android / iOS (incl. iPadOS reporting as Mac + touch) /
other mobile UA / coarse-pointer-only small screen → mobile app; everything else → PC site. Inside an iframe, or with
`?view=mobile` (kept for the tab in sessionStorage; `?view=pc` undoes it), the mobile app is forced. `<html>` gets
`data-platform` (ios|android|mobile|pc) and `data-view`. Outside iOS the app frame follows `visualViewport` (`--app-h`) and the
viewport meta asks for `interactive-widget=resizes-content`, so sheets sit above the on-screen keyboard; while typing in a room
chat the On-the-way sheet expands to just under the back button.

Ended rooms (CLOSED / CANCELLED / EXPIRED) never reopen in On the way: on load or on an update it toasts the reason and
replaces the entry with Home; 내 방 lists them for 24h but doesn't open them. CONFIRMED rooms stay open.
