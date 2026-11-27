import GenderChip from '../components/GenderChip';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isMock } from '../../api';
import type { LatLng, NearbyRoom, NearbyRooms, PlaceRef, RoomDetail, RoomSummary } from '../../api/contract';
import { formatRadius, NEARBY_ROOMS } from '../../config/nearbyRooms';
import { useApp, useErrorHandler } from '../../lib/app';
import { destinationTitle, originTitle, formatClock, formatDepartureRelative, formatDistance, toLocalInput, toOffsetIso } from '../../lib/format';
import { locateOnce, SIHEUNG_CITY_HALL } from '../../lib/geolocate';
import { useMap } from '../components/map/MapLayout';
import type { MapMarker } from '../components/map/markers';
import { ArrowIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, LocateIcon, MenuIcon, PersonIcon } from '../components/icons';
import { FramePortal, Sheet, useSlideIn } from '../components/ui';
import { DateTimePicker, formatLocalChoice, roundUp5 } from '../components/DateTimePicker';
import SelectSheet, { PlaceResults } from './SelectSheet';
import { sheetTopLimit } from './layout';

export type DepartureChoice = { kind: 'now' } | { kind: 'plus'; minutes: 15 | 30 } | { kind: 'custom'; local: string };
export const departureDate = (d: DepartureChoice): Date =>
  d.kind === 'now' ? new Date() : d.kind === 'plus' ? new Date(Date.now() + d.minutes * 60000) : new Date(d.local);
const departureLabel = (d: DepartureChoice) =>
  d.kind === 'now' ? '지금' : d.kind === 'plus' ? `${d.minutes}분 후` : formatClock(new Date(d.local).toISOString());

const ACTIVE_ROOM = ['OPEN', 'COORDINATING', 'CONFIRMED'];
type GpsFailure = 'denied' | 'unavailable' | 'unsupported';
type Gps = { state: 'pending' } | { state: 'ok'; point: LatLng } | { state: 'failed'; reason: GpsFailure };
/** What "근처 열린 방" is measured from. Only an explicit choice changes it — never panning the map. */
type Basis = { kind: 'gps' } | { kind: 'place'; place: PlaceRef };
type Nearby = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: NearbyRooms } | { state: 'error' };

const gpsFailure = (error: unknown): GpsFailure => {
  if (error instanceof Error && error.message === 'unsupported') return 'unsupported';
  return (error as { code?: unknown } | null)?.code === 1 ? 'denied' : 'unavailable'; // 1 = GeolocationPositionError.PERMISSION_DENIED
};
const boardingName = (r: NearbyRoom) => (r.distanceBasis === 'MEETING_POINT' && r.meetingPoint ? r.meetingPoint.name : originTitle(r));
/** Straight-line distance from the server; never called a walking distance. */
const distanceText = (r: NearbyRoom) => {
  const to = r.distanceBasis === 'MEETING_POINT' ? '만날 장소' : '출발지';
  return r.distanceMeters < 10 ? `${to}까지 10m 이내` : `${to}까지 약 ${formatDistance(r.distanceMeters)}`;
};

export default function HomeScreen() {
  const map = useMap();
  const navigate = useNavigate();
  const onError = useErrorHandler();
  // Loads below must not re-run just because the error handler's identity changed.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const { toast } = useApp();
  const [gps, setGps] = useState<Gps>({ state: 'pending' });
  const [basis, setBasis] = useState<Basis>({ kind: 'gps' });
  const [nearby, setNearby] = useState<Nearby>({ state: 'idle' });
  const [range, setRange] = useState<{ key: string; radius: number } | null>(null);
  const [reload, setReload] = useState(0);
  const [pickingBasis, setPickingBasis] = useState(false);
  const [myRoom, setMyRoom] = useState<RoomSummary | null | undefined>(undefined);
  const [departure, setDeparture] = useState<DepartureChoice>({ kind: 'now' });
  const [passengerCount, setPassengerCount] = useState(1);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [select, setSelect] = useState<{ destination?: PlaceRef; room?: RoomSummary; key: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(false);
  // Fixed bottom panel (no drag); the map fades and blurs into it.
  const panel = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(360);
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setPanelH(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const homeInsets = useCallback(() => ({ top: sheetTopLimit(), left: 24, right: 24, bottom: panelH + 40 }), [panelH]);

  /** One GPS fix (after location consent): on Home entry, "현재 위치 다시 확인" and the recenter button. Memory only. */
  const locate = useCallback(async (): Promise<LatLng | null> => {
    setGps({ state: 'pending' });
    try {
      const point = await locateOnce();
      setGps({ state: 'ok', point });
      return point;
    } catch (error) {
      setGps({ state: 'failed', reason: gpsFailure(error) });
      setGpsNotice(true);
      return null;
    }
  }, []);

  useEffect(() => { void locate(); }, [locate]);
  useEffect(() => {
    api.rooms.mine().then(mine => setMyRoom(mine.find(r => ACTIVE_ROOM.includes(r.status)) ?? null)).catch(error => { setMyRoom(null); onErrorRef.current(error); });
  }, []);
  useEffect(() => { if (!gpsNotice) return; const t = setTimeout(() => setGpsNotice(false), 4500); return () => clearTimeout(t); }, [gpsNotice]);

  // Reference point: a confirmed GPS fix or the searched origin. Without either there is none — nothing is assumed.
  const reference: LatLng | null = basis.kind === 'place' ? basis.place.location : gps.state === 'ok' ? gps.point : null;
  const refKey = reference ? `${basis.kind}:${reference.lat},${reference.lng}` : '';
  // The widened radius belongs to one reference point; a new point starts again from the default.
  const radius = range && range.key === refKey ? range.radius : NEARBY_ROOMS.defaultRadiusMeters;
  useEffect(() => {
    if (!reference) { setNearby({ state: 'idle' }); return; }
    let cancelled = false;
    setNearby({ state: 'loading' });
    // Distance filter and order are applied by the server (or the mock) before any limit.
    api.rooms.open(reference, radius)
      .then(data => { if (!cancelled) setNearby({ state: 'ok', data }); })
      .catch(error => { if (!cancelled) { setNearby({ state: 'error' }); onErrorRef.current(error); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, radius, reload]);

  const nearRooms = nearby.state === 'ok' ? nearby.data.rooms : null;
  // Home shows only my one-shot GPS fix; room locations remain on the text cards.
  useEffect(() => {
    if (select || leaving) return;
    const markers: MapMarker[] = [];
    if (gps.state === 'ok') markers.push({ position: gps.point, kind: 'me' });
    map.setLayers({ markers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [select, leaving, gps]);

  // Centre on the reference point. In place mode a new GPS fix moves only the "me" dot (and the recenter button).
  const center = basis.kind === 'place' ? basis.place.location : gps.state === 'ok' ? gps.point : SIHEUNG_CITY_HALL;
  const gpsKey = gps.state === 'ok' ? `${gps.point.lat},${gps.point.lng}` : gps.state;
  const focusKey = basis.kind === 'place' ? `place:${refKey}` : `gps:${gpsKey}`;
  useEffect(() => {
    if (select || leaving || focusKey === 'gps:pending') return;
    map.focus(center, homeInsets(), 'street');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [select, leaving, focusKey, panelH, myRoom]);

  // Keep Kakao's logo above the bottom panel and its 144px fade.
  useEffect(() => {
    if (select || leaving) return;
    map.setAttributionInset(panelH + 144);
    map.setCover(0);
  }, [map, select, leaving, panelH]);

  const recenter = async () => {
    const point = await locate();
    if (point) map.focus(point, homeInsets(), 'street');
    else map.focus(basis.kind === 'place' ? basis.place.location : SIHEUNG_CITY_HALL, homeInsets(), 'street');
  };
  /** "현재 위치 다시 확인" / "현재 위치로": measure from a fresh GPS fix again. */
  const measureFromGps = () => { setBasis({ kind: 'gps' }); void locate(); };
  const chooseBasis = (place: PlaceRef) => { setPickingBasis(false); setBasis({ kind: 'place', place }); };
  const widen = () => { if (refKey) setRange({ key: refKey, radius: NEARBY_ROOMS.expandedRadiusMeters }); };
  const resetRadius = () => setRange(null);

  /** One ride at a time: a recruiting room or a confirmed ride that is not finished blocks starting another. */
  const busyWithRoom = async () => {
    let current: RoomSummary | undefined;
    try {
      const mine = await api.rooms.mine();
      current = mine.find(r => ACTIVE_ROOM.includes(r.status));
      setMyRoom(current ?? null);
    } catch (error) { onErrorRef.current(error); return true; }
    if (!current) return false;
    toast(current.status === 'CONFIRMED'
      ? '확정된 동행이 아직 진행 중이에요. 이동을 마치고 ‘이동 완료’를 누르면 새 동행을 시작할 수 있어요.'
      : '이미 참여 중인 방이 있어요. 아래 ‘현재 내 방’에서 확인해 주세요.');
    return true;
  };
  const openSelect = async (destination?: PlaceRef) => {
    if (await busyWithRoom()) return;
    setSelect({ destination, key: Date.now() });
  };
  /** Room card: open that room's introduction directly. */
  const openRoom = async (room: RoomSummary) => {
    if (await busyWithRoom()) return;
    setSelect({ room, key: Date.now() });
  };

  const onRoomReady = (room: RoomDetail) => {
    setLeaving(true);
    setSelect(null);
    navigate(`/rooms/${room.id}`);
  };

  const basisLabel = basis.kind === 'place' ? '선택한 출발지 기준' : '현재 위치 기준';
  const hidden = !!select;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* top-left menu */}
      <button type="button" onClick={() => setMenu(true)} aria-label="메뉴"
        className={`round-btn pointer-events-auto absolute left-6 top-[max(24px,env(safe-area-inset-top))] transition duration-300 ${hidden ? 'pointer-events-none -translate-y-4 opacity-0' : ''}`}>
        <MenuIcon />
      </button>

      {gpsNotice && basis.kind === 'gps' && (
        <div className="animate-pop absolute inset-x-0 top-[max(96px,calc(env(safe-area-inset-top)+72px))] flex justify-center px-6">
          <p className="rounded-full bg-ink px-4 py-2.5 text-[0.8125rem] font-medium text-white shadow-float">현재 위치를 확인하지 못해 지도는 시흥시청 주변을 보여드려요</p>
        </div>
      )}

      {/* recenter, bottom-left of the visible map */}
      <button type="button" onClick={recenter} aria-label="내 위치로 이동"
        className={`round-btn pointer-events-auto absolute left-6 z-10 h-12 w-12 transition duration-300 ${hidden ? 'pointer-events-none opacity-0' : ''}`}
        style={{ bottom: panelH + 20 }}>
        <LocateIcon size={22} />
      </button>

      {/* fixed bottom panel; the map fades and blurs into it */}
      <section ref={panel} aria-label="근처 동행방"
        className={`ease-sheet pointer-events-auto absolute inset-x-0 bottom-0 transition duration-500 ${hidden ? 'pointer-events-none translate-y-16 opacity-0' : ''}`}>
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-36 bg-gradient-to-b from-white/0 via-white/70 to-white" />
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-36 backdrop-blur-[6px] [mask-image:linear-gradient(to_bottom,transparent,black)]" />
        <div className="relative bg-white">
          <div className="px-5 pt-1">
            <WhereTo label={departureLabel(departure)} passengerCount={passengerCount} onOpen={() => openSelect()} onTime={() => setPicking(true)} />
          </div>
          <div className="px-5 pt-3">
            <NearbyHeader basis={basis} label={basisLabel} nearby={nearby} radius={radius}
              onPickPlace={() => setPickingBasis(true)} onUseGps={measureFromGps} onResetRadius={resetRadius} />
          </div>
          <div className="px-5 pb-2">
              {!reference ? (
                basis.kind === 'gps' && gps.state === 'failed'
                  ? <LocationProblem reason={gps.reason} onRetry={measureFromGps} onPickPlace={() => setPickingBasis(true)} />
                  : <RoomCards rooms={null} onPick={openRoom} loadingText="현재 위치를 확인하고 있어요…" />
              ) : nearby.state === 'error' ? (
                <EmptyBox title="방 목록을 불러오지 못했어요" text="연결 상태를 확인한 뒤 다시 시도해 주세요.">
                  <button type="button" className="btn-fog h-10 px-3 text-[0.8125rem]" onClick={() => setReload(n => n + 1)}>다시 불러오기</button>
                </EmptyBox>
              ) : nearby.state === 'ok' && !nearby.data.rooms.length ? (
                <EmptyBox title={`반경 ${formatRadius(nearby.data.radiusMeters)} 이내에 모집 중인 방이 없어요`}
                  text={nearby.data.radiusMeters < NEARBY_ROOMS.expandedRadiusMeters ? '검색 범위를 넓히거나, 어디로 갈지 검색해 첫 방을 열어 보세요.' : '어디로 갈지 검색하고, 같은 방향 이웃이 찾을 수 있게 첫 방을 열어 보세요.'}>
                  {nearby.data.radiusMeters < NEARBY_ROOMS.expandedRadiusMeters && <button type="button" className="btn-ink h-10 px-3 text-[0.8125rem]" onClick={widen}>{formatRadius(NEARBY_ROOMS.expandedRadiusMeters)}까지 넓혀 보기</button>}
                </EmptyBox>
              ) : (
                <>
                  <RoomCards rooms={nearRooms} onPick={openRoom} />
                  {nearby.state === 'ok' && nearby.data.hasMore && <p className="mt-2 text-xs text-mute">가까운 순서로 {nearby.data.rooms.length}개까지 보여 드려요.</p>}
                </>
              )}
          </div>
        </div>
        <MyRoomBar room={myRoom} onOpen={() => myRoom && navigate(`/rooms/${myRoom.id}`)} />
      </section>

      {pickingBasis && <Sheet title="출발지 직접 선택" tall onClose={() => setPickingBasis(false)}>
        <p className="text-sm leading-relaxed text-mute">고른 장소 근처에서 모집 중인 방을 보여 드려요. 현재 위치로 취급하거나 저장하지 않아요.</p>
        <PlaceResults field="origin" bias={gps.state === 'ok' ? gps.point : undefined} onChoose={chooseBasis} onBlur={() => {}}
          hint="역·건물·가게처럼 누구나 아는 장소 이름으로 검색해 주세요." />
      </Sheet>}

      {select && (
        <SelectSheet
          key={select.key}
          initialDestination={select.destination}
          initialRoom={select.room}
          bias={gps.state === 'ok' ? gps.point : undefined}
          departureAt={() => toOffsetIso(departureDate(departure))}
          departureText={departureLabel(departure)}
          passengerCount={passengerCount}
          onPassengerCountChange={setPassengerCount}
          onEditDeparture={() => setPicking(true)}
          onClose={() => setSelect(null)}
          onRoomReady={onRoomReady}
        />
      )}
      {picking && <DeparturePicker value={departure} passengerCount={passengerCount} onChange={(choice, count) => { setDeparture(choice); setPassengerCount(count); }} onClose={() => setPicking(false)} />}
      {menu && <Menu onClose={() => setMenu(false)} />}
    </div>
  );
}

/** Basis ("현재 위치 기준" / "선택한 출발지 기준"), radius and count, and the switch between the two bases. */
function NearbyHeader({ basis, label, nearby, radius, onPickPlace, onUseGps, onResetRadius }: { basis: Basis; label: string; nearby: Nearby; radius: number; onPickPlace(): void; onUseGps(): void; onResetRadius(): void }) {
  const count = nearby.state === 'ok' ? `${nearby.data.rooms.length}${nearby.data.hasMore ? '+' : ''}개` : null;
  const shownRadius = nearby.state === 'ok' ? nearby.data.radiusMeters : radius;
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="min-w-0 leading-tight">
        <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">
          <span className={`h-2 w-2 shrink-0 rounded-full ${basis.kind === 'place' ? 'bg-ink' : 'bg-sun'}`} aria-hidden="true" />
          <span className="shrink-0">{label}</span>
          {basis.kind === 'place' && <span className="min-w-0 truncate font-normal text-mute-dark">· {basis.place.name ?? '검색한 장소'}</span>}
        </p>
        <p className="mt-0.5 text-xs text-mute">
          근처 열린 방{count ? ` ${count}` : ''} · 반경 {formatRadius(shownRadius)}
          {shownRadius !== NEARBY_ROOMS.defaultRadiusMeters && nearby.state === 'ok' && <button type="button" onClick={onResetRadius} className="ml-1.5 font-semibold text-mute-dark underline underline-offset-2">{formatRadius(NEARBY_ROOMS.defaultRadiusMeters)}로 보기</button>}
        </p>
      </div>
      <button type="button" onClick={basis.kind === 'place' ? onUseGps : onPickPlace}
        className="shrink-0 rounded-full bg-fog px-3 py-1.5 text-xs font-semibold text-mute-dark transition active:scale-95">
        {basis.kind === 'place' ? '현재 위치로' : '출발지 직접 선택'}
      </button>
    </div>
  );
}

/** GPS denied / failed: no position is assumed; retry or measure from a searched origin instead. */
function LocationProblem({ reason, onRetry, onPickPlace }: { reason: GpsFailure; onRetry(): void; onPickPlace(): void }) {
  const title = reason === 'denied' ? '위치 권한이 꺼져 있어요' : reason === 'unsupported' ? '이 브라우저에서는 현재 위치를 확인할 수 없어요' : '현재 위치를 확인하지 못했어요';
  const text = reason === 'denied'
    ? '브라우저나 기기 설정에서 위치 권한을 허용한 뒤 다시 확인해 주세요. 출발지를 직접 검색해서 근처 방을 볼 수도 있어요.'
    : reason === 'unsupported' ? '출발지를 직접 검색하면 그 장소 근처의 방을 볼 수 있어요.'
    : 'GPS 신호가 약하거나 시간이 초과됐을 수 있어요. 다시 확인하거나 출발지를 직접 검색해 주세요.';
  return (
    <EmptyBox role="alert" title={title} text={text}>
      {reason !== 'unsupported' && <button type="button" className="btn-ink h-10 px-3 text-[0.8125rem]" onClick={onRetry}>현재 위치 다시 확인</button>}
      <button type="button" className="btn-fog h-10 px-3 text-[0.8125rem]" onClick={onPickPlace}>출발지 검색해서 보기</button>
    </EmptyBox>
  );
}

/** Title, then the actions (visible at the default sheet height), then the explanation. */
function EmptyBox({ title, text, children, role }: { title: string; text: string; children?: ReactNode; role?: 'alert' }) {
  return (
    <div role={role} className="rounded-2xl border border-dashed border-line bg-fog-soft px-4 py-3">
      <p className="text-[0.9375rem] font-semibold leading-snug">{title}</p>
      {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-mute">{text}</p>
    </div>
  );
}

function WhereTo({ label, passengerCount, onOpen, onTime }: { label: string; passengerCount: number; onOpen(): void; onTime(): void }) {
  return (
    <div className="flex h-[56px] items-center rounded-full border border-line bg-white pl-5 pr-1.5">
      <button type="button" onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-4 text-left">
        <ArrowIcon size={22} className="-scale-x-100" />
        <span className="truncate text-[1.0625rem] font-medium">어디로 갈까요?</span>
      </button>
      <button type="button" onClick={onTime} aria-label={`출발 시간 및 인원: ${label}, ${passengerCount}명`} className="flex h-[44px] shrink-0 items-center gap-2 rounded-full bg-fog px-4 text-[0.9375rem] font-medium text-mute-dark transition active:scale-95 [--clock-hand:#EFEFEF]">
        <ClockIcon size={18} className="text-mute" />
        <span className="flex flex-col items-start leading-tight"><span>{label}</span>{passengerCount > 1 && <span className="text-[0.6875rem] text-mute">{passengerCount}명</span>}</span>
        <ChevronDownIcon size={16} className="text-mute" />
      </button>
    </div>
  );
}

function RoomCards({ rooms, onPick, expanded = false, loadingText }: { rooms: NearbyRoom[] | null; onPick(r: NearbyRoom): void; expanded?: boolean; loadingText?: string }) {
  const card = expanded ? 'min-h-[9rem] rounded-2xl' : 'min-h-[9rem] w-[calc((100%-12px)/2)] shrink-0 snap-start rounded-2xl';
  if (!rooms) {
    return (
      <div role="status" aria-label={loadingText ?? '불러오는 중'}>
        {loadingText && <p className="mb-2 text-sm text-mute">{loadingText}</p>}
        <div className="flex gap-3">
          <div className={`${card} animate-pulse bg-sun/50`} />
          <div className={`${card} animate-pulse border border-line bg-fog-soft`} />
        </div>
      </div>
    );
  }
  return (
    <div className={expanded ? 'grid grid-cols-2 gap-3' : 'no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1'}>
      {rooms.map((r, i) => {
        const yellow = i === 0;
        return (
          <button key={r.id} type="button" onClick={() => onPick(r)}
            className={`${card} flex flex-col p-3 text-left transition active:scale-[.98] ${yellow ? 'bg-sun' : 'border border-line bg-white'}`}>
            <GenderChip enabled={r.sameGenderOnly} />
            <span className="line-clamp-2 text-[0.9375rem] font-bold leading-snug tracking-tight">{destinationTitle(r)}</span>
            <span className={`mt-1 text-[0.8125rem] ${yellow ? 'text-ink/80' : 'text-mute'}`}>{formatDepartureRelative(r.departureAt)}</span>
            <span className={`mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[0.8125rem] ${yellow ? 'text-ink/70' : 'text-mute'}`}><span aria-label="출발" className="h-2 w-2 shrink-0 self-center rounded-[2px] bg-[#4F46E5]" /><span className="min-w-0 truncate">{boardingName(r)}</span></span>
            <span className={`mt-0.5 text-[0.8125rem] font-semibold ${yellow ? 'text-ink' : 'text-mute-dark'}`}>{distanceText(r)}</span>
            <span className="mt-auto flex items-center justify-between pt-0.5">
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
    <div className="shrink-0 bg-white px-5 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
      <button type="button" disabled={!has} onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-left transition active:opacity-90 disabled:cursor-default">
        <span className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-xl ${has ? 'bg-sun' : 'bg-white/10'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${has ? 'bg-ink' : 'bg-white/30'}`} />
          {has && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-ink bg-sun" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[0.9375rem] font-semibold tracking-tight ${has ? 'text-white' : 'text-white/40'}`}>현재 내 방</span>
          <span className="block truncate text-[0.8125rem] text-white/50">
            {room === undefined ? '확인 중…' : room ? `${destinationTitle(room)} · ${formatDepartureRelative(room.departureAt)}` : '참여 중인 방이 없어요'}
          </span>
        </span>
        {has && <ChevronRightIcon className="text-sun" />}
      </button>
    </div>
  );
}

function DeparturePicker({ value, passengerCount, onChange, onClose }: { value: DepartureChoice; passengerCount: number; onChange(v: DepartureChoice, count: number): void; onClose(): void }) {
  const [choice, setChoice] = useState<DepartureChoice>(value);
  const [party, setParty] = useState(Math.max(1, Math.min(3, passengerCount)));
  const [custom, setCustom] = useState(() => value.kind === 'custom' ? value.local : toLocalInput(roundUp5(new Date(Date.now() + 60 * 60000))));
  const [picking, setPicking] = useState(false);
  const [timeError, setTimeError] = useState('');
  const customAt = new Date(custom).getTime();
  const tooEarly = !Number.isNaN(customAt) && customAt < Date.now() - 60000;
  const tooLate = !Number.isNaN(customAt) && customAt > Date.now() + 7 * 86400000;
  const options: { label: string; sub: string; value: DepartureChoice }[] = [
    { label: '지금', sub: '바로 출발할 동행 찾기', value: { kind: 'now' } },
    { label: '15분 후', sub: formatClock(new Date(Date.now() + 15 * 60000).toISOString()), value: { kind: 'plus', minutes: 15 } },
    { label: '30분 후', sub: formatClock(new Date(Date.now() + 30 * 60000).toISOString()), value: { kind: 'plus', minutes: 30 } },
  ];
  const same = (a: DepartureChoice, b: DepartureChoice) => a.kind === b.kind && (a.kind !== 'plus' || (b.kind === 'plus' && a.minutes === b.minutes));
  const apply = () => {
    if (choice.kind === 'custom') {
      const at = new Date(custom).getTime(), now = Date.now();
      if (!Number.isFinite(at) || at < now - 60000 || at > now + 7 * 86400000) {
        setTimeError('출발 시간을 다시 확인해 주세요. 7일 이내로 선택할 수 있어요.');
        return;
      }
    }
    onChange(choice.kind === 'custom' ? { kind: 'custom', local: custom } : choice, party);
    onClose();
  };
  return (
    <Sheet title="언제 출발하세요?" onClose={onClose}>
      {picking ? (
        <div>
          <button type="button" className="btn-text mb-3" onClick={() => setPicking(false)}>
            <ChevronRightIcon size={16} className="rotate-180" /> 빠른 선택
          </button>
          <div className="rounded-2xl bg-fog-soft px-3 pb-3 pt-2">
            <DateTimePicker value={custom} onChange={next => { setCustom(next); setChoice({ kind: 'custom', local: next }); setTimeError(''); }} min={new Date()} max={new Date(Date.now() + 7 * 86400000)} />
          </div>
          <p className={`mt-3 text-center text-sm ${tooEarly || tooLate ? 'font-semibold text-[#D93636]' : 'text-mute'}`}>
            {tooEarly ? '이미 지난 시간이에요' : tooLate ? '7일 이내로 골라 주세요' : '7일 이내, 5분 단위로 고를 수 있어요'}
          </p>
        </div>
      ) : (
      <div className="space-y-2">
        {options.map(o => (
          <button key={o.label} type="button" aria-pressed={same(o.value, choice)} onClick={() => { setChoice(o.value); setTimeError(''); }}
            className={`flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition ${same(o.value, choice) ? 'bg-ink text-white' : 'bg-fog-soft'}`}>
            <span className="text-[1.0625rem] font-semibold">{o.label}</span>
            <span className={`text-sm ${same(o.value, choice) ? 'text-sun' : 'text-mute'}`}>{o.sub}</span>
          </button>
        ))}
        <button type="button" onClick={() => { setPicking(true); setChoice({ kind: 'custom', local: custom }); setTimeError(''); }}
          className={`flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition ${choice.kind === 'custom' ? 'bg-ink text-white' : 'bg-fog-soft'}`}>
          <span className="text-[1.0625rem] font-semibold">직접 선택</span>
          <span className={`flex items-center gap-1 text-sm ${choice.kind === 'custom' ? 'text-sun' : 'text-mute'}`}>
            {choice.kind === 'custom' ? formatLocalChoice(custom) : '날짜·시간 고르기'}
            <ChevronRightIcon size={16} />
          </span>
        </button>
      </div>
      )}
      <section className="mt-4 rounded-2xl border border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">함께 타는 인원</span>
          <div role="radiogroup" aria-label="함께 타는 인원, 본인 포함" className="flex rounded-full bg-fog p-1">
            {[1, 2, 3].map(count => <button key={count} type="button" role="radio" aria-checked={party === count} onClick={() => setParty(count)}
              className={`h-10 min-w-12 rounded-full px-3 text-sm font-semibold transition ${party === count ? 'bg-ink text-white' : 'text-mute-dark'}`}>{count}명</button>)}
          </div>
        </div>
        <p className="mt-1 text-xs text-mute">본인을 포함해 선택해 주세요.</p>
      </section>
      {timeError && <p role="alert" className="mt-3 text-sm text-[#D93636]">{timeError}</p>}
      <button type="button" className="btn-ink mt-4 w-full" disabled={choice.kind === 'custom' && (Number.isNaN(customAt) || tooEarly || tooLate)} onClick={apply}>확인</button>
    </Sheet>
  );
}

function Menu({ onClose }: { onClose(): void }) {
  const { member, logout } = useApp();
  const navigate = useNavigate();
  const { shown, close } = useSlideIn(onClose);
  const go = (path: string) => { close(); setTimeout(() => navigate(path), 200); };
  const items: [string, string][] = [['내 정보', '/me'], ['내 방', '/me/rooms'], ['위치 정보 동의', '/consent'], ['외부 서비스 이용', '/services'], ['약관 및 정책', '/legal']];
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
          <ul className="mt-6 min-h-0 flex-1 overflow-y-auto space-y-1">
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
