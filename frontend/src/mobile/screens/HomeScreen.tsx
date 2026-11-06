import GenderChip from '../components/GenderChip';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isMock } from '../../api';
import type { LatLng, PlaceRef, RoomDetail, RoomSummary } from '../../api/contract';
import { useApp, useErrorHandler } from '../../lib/app';
import { destinationTitle, originTitle, formatClock, formatDepartureRelative, formatDistance, toLocalInput, toOffsetIso } from '../../lib/format';
import { distanceMeters, locateOnce, SIHEUNG_CITY_HALL } from '../../lib/geolocate';
import { useMap } from '../components/map/MapLayout';
import type { MapMarker } from '../components/map/markers';
import { ArrowIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, LocateIcon, MenuIcon, PersonIcon } from '../components/icons';
import { FramePortal, Sheet, useSlideIn } from '../components/ui';
import { DateTimePicker, formatLocalChoice, roundUp5 } from '../components/DateTimePicker';
import SelectSheet from './SelectSheet';

export type DepartureChoice = { kind: 'now' } | { kind: 'plus'; minutes: 15 | 30 } | { kind: 'custom'; local: string };
export const departureDate = (d: DepartureChoice): Date =>
  d.kind === 'now' ? new Date() : d.kind === 'plus' ? new Date(Date.now() + d.minutes * 60000) : new Date(d.local);
const departureLabel = (d: DepartureChoice) =>
  d.kind === 'now' ? '지금' : d.kind === 'plus' ? `${d.minutes}분 후` : formatClock(new Date(d.local).toISOString());

const ACTIVE_ROOM = ['OPEN', 'COORDINATING', 'CONFIRMED'];
type Gps = { state: 'pending' } | { state: 'ok'; point: LatLng } | { state: 'failed' };

export default function HomeScreen() {
  const map = useMap();
  const navigate = useNavigate();
  const onError = useErrorHandler();
  const { toast } = useApp();
  const [gps, setGps] = useState<Gps>({ state: 'pending' });
  const [openRooms, setOpenRooms] = useState<RoomSummary[] | null>(null);
  const [myRoom, setMyRoom] = useState<RoomSummary | null | undefined>(undefined);
  const [departure, setDeparture] = useState<DepartureChoice>({ kind: 'now' });
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [select, setSelect] = useState<{ destination?: PlaceRef; room?: RoomSummary; key: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(360);

  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setPanelH(node.offsetHeight));
    ro.observe(node);
    setPanelH(node.offsetHeight);
    return () => ro.disconnect();
  }, []);
  // Map is visible above the panel; the fade (≈90px) still shows map, so centre a bit above it.
  const homeInsets = useCallback(() => ({ top: 0, left: 0, right: 0, bottom: panelH + 40 }), [panelH]);

  /** One GPS fix: on Home entry and on the recenter button. Kept in memory only. */
  const locate = useCallback(async (): Promise<LatLng | null> => {
    try {
      const point = await locateOnce();
      setGps({ state: 'ok', point });
      return point;
    } catch {
      setGps({ state: 'failed' });
      setGpsNotice(true);
      return null;
    }
  }, []);

  const loadRooms = useCallback(async (near: LatLng | null) => {
    try {
      const [open, mine] = await Promise.all([api.rooms.open(near ?? undefined), api.rooms.mine()]);
      setOpenRooms(open);
      setMyRoom(mine.find(r => ACTIVE_ROOM.includes(r.status)) ?? null);
    } catch (error) { setOpenRooms([]); setMyRoom(null); onError(error); }
  }, [onError]);

  useEffect(() => { void locate().then(loadRooms); }, [locate, loadRooms]);
  useEffect(() => { if (!gpsNotice) return; const t = setTimeout(() => setGpsNotice(false), 4500); return () => clearTimeout(t); }, [gpsNotice]);

  const here = gps.state === 'ok' ? gps.point : null;
  const nearRooms = useMemo(() => {
    if (!openRooms) return null;
    if (!here) return openRooms;
    return [...openRooms].sort((a, b) => distanceMeters(here, a.approxOrigin) - distanceMeters(here, b.approxOrigin));
  }, [openRooms, here]);
  // Where I board for my active room: shown on every screen as the square "pickup" marker.
  const pickup = myRoom ? (myRoom.meetingPoint ? { position: myRoom.meetingPoint.location, label: myRoom.meetingPoint.name } : { position: myRoom.approxOrigin, label: myRoom.originName || '내 방 출발지' }) : null;

  // Home map layers + centring (re-applied whenever the Select sheet closes).
  const center = gps.state === 'ok' ? gps.point : SIHEUNG_CITY_HALL;
  useEffect(() => {
    if (select || leaving || gps.state === 'pending') return;
    const markers: MapMarker[] = (openRooms ?? []).map(r => ({ position: r.approxOrigin, kind: 'room' as const }));
    if (gps.state === 'ok') markers.push({ position: gps.point, kind: 'me' });
    if (pickup) markers.push({ ...pickup, kind: 'pickup' });
    map.setLayers({ markers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [select, leaving, gps, openRooms, myRoom]);
  useEffect(() => {
    if (select || leaving || gps.state === 'pending') return;
    // With an active room, frame me and my boarding spot together so I can walk there by the map.
    if (pickup && gps.state === 'ok') map.fit([gps.point, pickup.position], homeInsets());
    else map.focus(center, homeInsets(), 'street');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [select, leaving, gps, panelH, myRoom]);

  // Keep Kakao's logo above the bottom panel and its 144px fade.
  useEffect(() => { if (!select && !leaving) map.setAttributionInset(panelH + 144); }, [map, select, leaving, panelH]);

  const recenter = async () => {
    const point = await locate();
    if (point) map.focus(point, homeInsets(), 'street');
    else map.focus(SIHEUNG_CITY_HALL, homeInsets(), 'street');
  };

  const openSelect = (destination?: PlaceRef) => {
    if (myRoom && myRoom.status !== 'CONFIRMED') { toast('이미 참여 중인 방이 있어요. 아래 ‘현재 내 방’에서 확인해 주세요.'); return; }
    setSelect({ destination, key: Date.now() });
  };
  /** Room card: open that room's introduction directly. */
  const openRoom = (room: RoomSummary) => {
    if (myRoom && myRoom.status !== 'CONFIRMED') { toast('이미 참여 중인 방이 있어요. 아래 ‘현재 내 방’에서 확인해 주세요.'); return; }
    setSelect({ room, key: Date.now() });
  };

  const onRoomReady = (room: RoomDetail) => {
    setLeaving(true);
    setSelect(null);
    navigate(`/rooms/${room.id}`);
  };

  const hidden = !!select;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* top-left menu */}
      <button type="button" onClick={() => setMenu(true)} aria-label="메뉴"
        className={`round-btn pointer-events-auto absolute left-6 top-[max(24px,env(safe-area-inset-top))] transition duration-300 ${hidden ? 'pointer-events-none -translate-y-4 opacity-0' : ''}`}>
        <MenuIcon />
      </button>

      {gpsNotice && (
        <div className="animate-pop absolute inset-x-0 top-[max(96px,calc(env(safe-area-inset-top)+72px))] flex justify-center px-6">
          <p className="rounded-full bg-ink px-4 py-2.5 text-[0.8125rem] font-medium text-white shadow-float">현재 위치를 확인할 수 없어 시흥시청을 중심으로 보여드려요</p>
        </div>
      )}

      {/* recenter, bottom-left of the visible map */}
      <button type="button" onClick={recenter} aria-label="내 위치로 이동"
        className={`round-btn pointer-events-auto absolute left-6 z-10 h-12 w-12 transition duration-300 ${hidden ? 'pointer-events-none opacity-0' : ''}`}
        style={{ bottom: panelH + 20 }}>
        <LocateIcon size={22} />
      </button>

      {/* bottom panel; the map fades and blurs into it */}
      <div ref={panel} className={`ease-sheet pointer-events-auto absolute inset-x-0 bottom-0 transition duration-500 ${hidden ? 'pointer-events-none translate-y-16 opacity-0' : ''}`}>
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-36 bg-gradient-to-b from-white/0 via-white/70 to-white" />
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-36 backdrop-blur-[6px] [mask-image:linear-gradient(to_bottom,transparent,black)]" />
        <div className="relative bg-white px-6 pt-1">
          <WhereTo label={departureLabel(departure)} onOpen={() => openSelect()} onTime={() => setPicking(true)} />
          <RoomCards rooms={nearRooms} here={here} onPick={r => openRoom(r)} />
        </div>
        <MyRoomBar room={myRoom} onOpen={() => myRoom && navigate(`/rooms/${myRoom.id}`)} />
      </div>

      {select && (
        <SelectSheet
          key={select.key}
          initialDestination={select.destination}
          initialRoom={select.room}
          bias={gps.state === 'ok' ? gps.point : undefined}
          departureAt={() => toOffsetIso(departureDate(departure))}
          departureText={departureLabel(departure)}
          onEditDeparture={() => setPicking(true)}
          onClose={() => setSelect(null)}
          onRoomReady={onRoomReady}
        />
      )}
      {picking && <DeparturePicker value={departure} onChange={setDeparture} onClose={() => setPicking(false)} />}
      {menu && <Menu onClose={() => setMenu(false)} />}
    </div>
  );
}

function WhereTo({ label, onOpen, onTime }: { label: string; onOpen(): void; onTime(): void }) {
  return (
    <div className="flex h-[56px] items-center rounded-full border border-line bg-white pl-5 pr-1.5">
      <button type="button" onClick={onOpen} className="flex h-full flex-1 items-center gap-4 text-left">
        <ArrowIcon size={22} className="-scale-x-100" />
        <span className="text-[1.0625rem] font-medium">어디로 갈까요?</span>
      </button>
      <button type="button" onClick={onTime} aria-label={`출발 시간: ${label}`} className="flex h-[44px] items-center gap-2 rounded-full bg-fog px-4 text-[0.9375rem] font-medium text-mute-dark transition active:scale-95 [--clock-hand:#EFEFEF]">
        <ClockIcon size={18} className="text-mute" />
        {label}
        <ChevronDownIcon size={16} className="text-mute" />
      </button>
    </div>
  );
}

function RoomCards({ rooms, here, onPick }: { rooms: RoomSummary[] | null; here: LatLng | null; onPick(r: RoomSummary): void }) {
  const card = 'min-h-[11.75rem] w-[calc((100%-16px)/2)] shrink-0 snap-start rounded-card';
  if (!rooms) {
    return (
      <div className="mt-5 flex gap-4" aria-label="불러오는 중">
        <div className={`${card} animate-pulse bg-sun/50`} />
        <div className={`${card} animate-pulse border border-line bg-fog-soft`} />
      </div>
    );
  }
  if (!rooms.length) {
    return (
      <div className="mt-5 flex h-[150px] flex-col justify-center rounded-card border border-dashed border-line bg-fog-soft px-6">
        <p className="text-[1.0625rem] font-semibold">근처에 열린 방이 아직 없어요</p>
        <p className="mt-1.5 text-sm leading-relaxed text-mute">어디로 갈지 검색하고, 같은 방향 이웃이 찾을 수 있게 첫 방을 열어 보세요.</p>
      </div>
    );
  }
  return (
    <div className="no-scrollbar -mx-6 mt-5 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6">
      {rooms.map((r, i) => {
        const yellow = i === 0;
        return (
          <button key={r.id} type="button" onClick={() => onPick(r)}
            className={`${card} flex flex-col p-5 text-left transition active:scale-[.98] ${yellow ? 'bg-sun' : 'border border-line bg-white'}`}>
            <GenderChip enabled={r.sameGenderOnly} />
            <span className="line-clamp-2 text-[1.125rem] font-bold leading-snug tracking-tight">{destinationTitle(r)}</span>
            <span className={`mt-1.5 text-[0.9375rem] ${yellow ? 'text-ink/80' : 'text-mute'}`}>{formatDepartureRelative(r.departureAt)}</span>
            <span className={`mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[0.8125rem] ${yellow ? 'text-ink/70' : 'text-mute'}`}><span aria-label="출발" className="h-2 w-2 shrink-0 self-center rounded-[2px] bg-[#4F46E5]" /><span className="min-w-0 truncate">{originTitle(r)}</span>{here && <span className="shrink-0 font-semibold">{formatDistance(Math.round(distanceMeters(here, r.approxOrigin) / 10) * 10)}</span>}</span>
            <span className="mt-auto flex items-center justify-between">
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${yellow ? 'text-ink' : 'text-mute-dark'}`}><PersonIcon size={16} /> 빈 자리 {r.seatsLeft}</span>
              <span className={`grid h-8 w-8 place-items-center rounded-full ${yellow ? 'bg-ink text-sun' : 'bg-fog text-ink'}`}><ChevronRightIcon size={16} /></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MyRoomBar({ room, onOpen }: { room: RoomSummary | null | undefined; onOpen(): void }) {
  const has = !!room;
  return (
    <div className="bg-white px-6 pb-0 pt-5">
      <button type="button" disabled={!has} onClick={onOpen}
        className="flex w-full items-center gap-4 rounded-t-card bg-ink px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-left transition active:opacity-90 disabled:cursor-default">
        <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${has ? 'bg-sun' : 'bg-white/10'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${has ? 'bg-ink' : 'bg-white/30'}`} />
          {has && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-ink bg-sun" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[1.375rem] font-semibold tracking-tight ${has ? 'text-white' : 'text-white/40'}`}>현재 내 방</span>
          <span className="block truncate text-[0.8125rem] text-white/50">
            {room === undefined ? '확인 중…' : room ? `${destinationTitle(room)} · ${formatDepartureRelative(room.departureAt)}` : '참여 중인 방이 없어요'}
          </span>
        </span>
        {has && <ChevronRightIcon className="text-sun" />}
      </button>
    </div>
  );
}

function DeparturePicker({ value, onChange, onClose }: { value: DepartureChoice; onChange(v: DepartureChoice): void; onClose(): void }) {
  const [custom, setCustom] = useState(() => value.kind === 'custom' ? value.local : toLocalInput(roundUp5(new Date(Date.now() + 60 * 60000))));
  const [picking, setPicking] = useState(false);
  const customAt = new Date(custom).getTime();
  const tooEarly = !Number.isNaN(customAt) && customAt < Date.now() - 60000;
  const tooLate = !Number.isNaN(customAt) && customAt > Date.now() + 7 * 86400000;
  const options: { label: string; sub: string; value: DepartureChoice }[] = [
    { label: '지금', sub: '바로 출발할 동행 찾기', value: { kind: 'now' } },
    { label: '15분 후', sub: formatClock(new Date(Date.now() + 15 * 60000).toISOString()), value: { kind: 'plus', minutes: 15 } },
    { label: '30분 후', sub: formatClock(new Date(Date.now() + 30 * 60000).toISOString()), value: { kind: 'plus', minutes: 30 } },
  ];
  const same = (a: DepartureChoice, b: DepartureChoice) => a.kind === b.kind && (a.kind !== 'plus' || (b.kind === 'plus' && a.minutes === b.minutes));
  return (
    <Sheet title="언제 출발하세요?" onClose={onClose}>
      {picking ? (
        <div>
          <button type="button" className="btn-text mb-3" onClick={() => setPicking(false)}>
            <ChevronRightIcon size={16} className="rotate-180" /> 빠른 선택
          </button>
          <div className="rounded-2xl bg-fog-soft px-3 pb-3 pt-2">
            <DateTimePicker value={custom} onChange={setCustom} min={new Date()} max={new Date(Date.now() + 7 * 86400000)} />
          </div>
          <p className={`mt-3 text-center text-sm ${tooEarly || tooLate ? 'font-semibold text-[#D93636]' : 'text-mute'}`}>
            {tooEarly ? '이미 지난 시간이에요' : tooLate ? '7일 이내로 골라 주세요' : '7일 이내, 5분 단위로 고를 수 있어요'}
          </p>
          <button type="button" className="btn-ink mt-3 w-full" disabled={Number.isNaN(customAt) || tooEarly || tooLate}
            onClick={() => { onChange({ kind: 'custom', local: custom }); onClose(); }}>
            {formatLocalChoice(custom)} 출발
          </button>
        </div>
      ) : (
      <div className="space-y-2">
        {options.map(o => (
          <button key={o.label} type="button" onClick={() => { onChange(o.value); onClose(); }}
            className={`flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition ${same(o.value, value) ? 'bg-ink text-white' : 'bg-fog-soft'}`}>
            <span className="text-[1.0625rem] font-semibold">{o.label}</span>
            <span className={`text-sm ${same(o.value, value) ? 'text-sun' : 'text-mute'}`}>{o.sub}</span>
          </button>
        ))}
        <button type="button" onClick={() => setPicking(true)}
          className={`flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition ${value.kind === 'custom' ? 'bg-ink text-white' : 'bg-fog-soft'}`}>
          <span className="text-[1.0625rem] font-semibold">직접 선택</span>
          <span className={`flex items-center gap-1 text-sm ${value.kind === 'custom' ? 'text-sun' : 'text-mute'}`}>
            {value.kind === 'custom' ? formatLocalChoice(value.local) : '날짜·시간 고르기'}
            <ChevronRightIcon size={16} />
          </span>
        </button>
      </div>
      )}
    </Sheet>
  );
}

function Menu({ onClose }: { onClose(): void }) {
  const { member, logout } = useApp();
  const navigate = useNavigate();
  const { shown, close } = useSlideIn(onClose);
  const go = (path: string) => { close(); setTimeout(() => navigate(path), 200); };
  const items: [string, string][] = [['내 정보', '/me'], ['내 방', '/me/rooms'], ['위치 정보 동의', '/consent'], ['외부 서비스 이용', '/services']];
  if (member?.role === 'ADMIN') items.push(['운영자', '/admin']);
  return (
    <FramePortal>
      <div className={`absolute inset-0 z-50 bg-black/40 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={close}>
        <nav aria-label="메뉴" onClick={e => e.stopPropagation()}
          className={`ease-sheet absolute inset-y-0 left-0 flex w-[82%] max-w-[22.5rem] flex-col rounded-r-sheet bg-white px-7 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))] shadow-sheet transition-transform duration-300 ${shown ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-sun text-lg font-bold">{member?.nickname.slice(0, 1)}</span>
            <div className="min-w-0">
              <div className="truncate text-[1.0625rem] font-semibold">{member?.nickname}</div>
              <div className="text-xs text-mute">{member?.status === 'RESTRICTED' ? '이용이 제한된 계정 · 조회만 가능' : member?.role === 'ADMIN' ? '운영자' : '택시메이트 이웃'}{isMock && ' · MOCK'}</div>
            </div>
          </div>
          <ul className="mt-12 space-y-1">
            {items.map(([label, path]) => (
              <li key={path}>
                <button type="button" onClick={() => go(path)} className="flex w-full items-center justify-between py-3 text-left text-[1.75rem] font-bold tracking-tight transition active:opacity-50">
                  {label}<ChevronRightIcon className="text-line" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-auto text-xs leading-relaxed text-mute">택시메이트는 동선 매칭·조율만 제공하는 MVP예요. 택시 호출·결제는 하지 않아요.</p>
          <button type="button" onClick={() => { logout(); navigate('/start', { replace: true }); }} className="btn-fog mt-5 w-full">로그아웃</button>
        </nav>
      </div>
    </FramePortal>
  );
}
