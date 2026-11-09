import GenderChip from '../components/GenderChip';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { api } from '../../api';
import type { LatLng, WalkRoute, MatchCandidate, MatchCandidatesResponse, PlaceRef, RoomDetail, RoomSummary, TripIntent } from '../../api/contract';
import { ROOM_JOINABLE } from '../../api/contract';
import { useAction, useApp, useErrorHandler } from '../../lib/app';
import { isApiError } from '../../lib/errors';
import { destinationTitle, originTitle, riders, formatClock, formatDiff, formatDistance, formatTime, formatWon, meetingKindLabel, minutesOf, perPersonFare } from '../../lib/format';
import { useMap } from '../components/map/MapLayout';
import { distanceMeters, locateOnce } from '../../lib/geolocate';
import type { MapLayers, MapMarker } from '../components/map/markers';
import { ArrowIcon, BulbIcon, ChevronLeftIcon, ClockIcon, CloseIcon, PersonIcon, PlusIcon, RefreshIcon, SearchIcon, SwapIcon } from '../components/icons';
import { Avatar, FARE_DISCLAIMER, Notice, Spinner, Toggle, useSlideIn } from '../components/ui';
import { otwInsets, selectSheetHeight, sheetInsets } from './layout';
import { SheetHandle, useSheetDrag } from './useSheetDrag';

type Field = 'origin' | 'destination';
type Mode = 'list' | 'create' | 'detail' | 'preview';
type Phase = 'idle' | 'routing' | 'noroute' | 'searching' | 'ready' | 'unsearchable';
const CAPACITY = 3; // fixed: front 1 + back 2, host included

interface Props {
  initialDestination?: PlaceRef;
  /** Opened from a Home room card: show that room's introduction first. */
  initialRoom?: RoomSummary;
  bias?: LatLng;
  departureAt(): string;
  departureText: string;
  /** Opens the departure-time picker (owned by Home). */
  onEditDeparture(): void;
  onClose(): void;
  onRoomReady(room: RoomDetail): void;
}

/** Point halfway along a polyline (by length), where the time bubble sits. */
export function pathMidpoint(path: LatLng[]): LatLng {
  const d = (a: LatLng, b: LatLng) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.79);
  const total = path.reduce((n, p, i) => (i ? n + d(path[i - 1], p) : 0), 0);
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = d(path[i - 1], path[i]);
    if (walked + seg >= total / 2 && seg > 0) { const t = (total / 2 - walked) / seg; return { lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t, lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t }; }
    walked += seg;
  }
  return path[0];
}

/** Shared map layers for a room's preview route (used here after join and by On-the-way). */
/** Room map: pickup/destination markers, the room's route and a "N분 예상" bubble from the host route, for
 *  every viewer (`durationMin` is only a fallback for rooms without route info). */
export function roomLayers(room: { approxOrigin: LatLng; approxDestination: LatLng; meetingPoint: { location: LatLng; name: string } | null; originName?: string | null; destinationName?: string | null; routeDistanceMeters?: number | null; routeDurationSeconds?: number | null }, path: LatLng[], extra: MapMarker[] = [], durationMin?: number): MapLayers {
  const markers: MapMarker[] = [
    room.meetingPoint
      ? { position: room.meetingPoint.location, kind: 'pickup', label: room.meetingPoint.name }
      : { position: room.approxOrigin, kind: 'pickup', label: room.originName || '출발지' },
    { position: room.approxDestination, kind: 'destination', label: room.destinationName || undefined },
    ...extra,
  ];
  return {
    markers,
    polylines: path.length > 1 ? [{ path }] : [],
    bubble: room.routeDurationSeconds != null
      ? { position: path.length ? pathMidpoint(path) : room.approxOrigin, title: `${minutesOf(room.routeDurationSeconds)}분`, sub: '예상' }
      : durationMin ? { position: path.length ? pathMidpoint(path) : room.approxOrigin, title: `${durationMin}분`, sub: '예상' } : null,
  };
}
export const roomPoints = (room: { approxOrigin: LatLng; approxDestination: LatLng; meetingPoint: { location: LatLng } | null }, path: LatLng[]) =>
  [...(path.length > 1 ? path : []), room.approxOrigin, room.approxDestination, ...(room.meetingPoint ? [room.meetingPoint.location] : [])];

export default function SelectSheet({ initialDestination, initialRoom, bias, departureAt, departureText, onEditDeparture, onClose, onRoomReady }: Props) {
  const map = useMap();
  const { toast } = useApp();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const { shown, close } = useSlideIn(onClose, 420);

  const [origin, setOrigin] = useState<PlaceRef | null>(null);
  const [destination, setDestination] = useState<PlaceRef | null>(initialRoom ? roomDestination(initialRoom) : initialDestination ?? null);
  const [searching, setSearching] = useState<Field | null>(null);
  const [mode, setMode] = useState<Mode>(initialRoom ? 'preview' : 'list');
  const [preview, setPreview] = useState<RoomSummary | null>(initialRoom ?? null);
  const [previewDetail, setPreviewDetail] = useState<RoomDetail | null>(null);
  /** Join check from a Home room: my one-shot GPS vs. the room's boarding spot. */
  const [walk, setWalk] = useState<{ me: LatLng | null; state: 'locating' | 'ok' | 'nogps'; route?: WalkRoute | null } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [trip, setTrip] = useState<TripIntent | null>(null);
  const [result, setResult] = useState<MatchCandidatesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchCandidate | null>(null);
  const [exiting, setExiting] = useState(false);
  const tripRef = useRef<TripIntent | null>(null);
  const kept = useRef(false);
  const seq = useRef(0);
  const strip = useRef<HTMLDivElement>(null);

  const sheetMode = searching ? 'search' : mode === 'detail' ? 'detail' : 'list';
  const collapseSearch = () => {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    setSearching(null);
  };
  const sheet = useSheetDrag(map.size, selectSheetHeight(map.size, 'list'), sheetMode, sheetMode !== 'list', collapseSearch);
  const sheetH = sheet.settledHeight;
  useEffect(() => { map.setCover(sheet.progress, sheet.dragging); }, [map, sheet.progress, sheet.dragging]);
  useEffect(() => { map.setAttributionInset(sheet.style.height, sheet.dragging); }, [map, sheet.style.height, sheet.dragging]);
  useEffect(() => () => map.setCover(0), [map]);

  // Leaving without joining/creating: drop the trip this sheet registered.
  const dropTrip = useCallback(() => {
    const t = tripRef.current;
    tripRef.current = null;
    if (t && !kept.current) void api.trips.cancel(t.id).catch(() => {});
  }, []);
  useEffect(() => () => dropTrip(), [dropTrip]);

  // ---- map: my route / chosen points
  const showMine = useCallback((t: TripIntent | null, o: PlaceRef | null, d: PlaceRef | null, h = sheetH) => {
    const markers: MapMarker[] = [];
    if (o) markers.push({ position: o.location, kind: 'origin', label: o.name ?? '출발' });
    if (d) markers.push({ position: d.location, kind: 'destination', label: d.name ?? '도착' });
    const route = t?.route;
    map.setLayers({
      markers,
      polylines: route ? [{ path: route.path }] : [],
      bubble: route ? { position: route.path.length ? pathMidpoint(route.path) : o!.location, title: `${minutesOf(route.durationSeconds)}분`, sub: formatDistance(route.distanceMeters) } : null,
    });
    if (sheet.expanded) return;
    if (route) map.fit([...route.path, ...(o ? [o.location] : []), ...(d ? [d.location] : [])], sheetInsets(h));
    else if (o && d) map.fit([o.location, d.location], sheetInsets(h));
    else if (o) map.focus(o.location, sheetInsets(h), 'street');
    else if (d) map.focus(d.location, sheetInsets(h), 'street');
  }, [map, sheetH, sheet.expanded]);

  useEffect(() => {
    if (exiting || sheet.dragging || sheet.expanded) return;
    if (mode === 'preview') { if (walk) return; if (preview) map.fit(roomPoints(previewDetail ?? preview, previewDetail?.routePreview ?? []), sheetInsets(sheetH)); }
    else if (mode === 'detail' && detail) map.fit([...roomPoints(detail.room, detail.routePreview), ...(trip?.route?.path ?? [])], sheetInsets(sheetH));
    else showMine(trip, origin, destination, sheetH);
  }, [sheetH, sheet.dragging, sheet.expanded, mode, detail, preview, previewDetail, walk, exiting, trip, origin, destination, map, showMine]);

  // ---- candidates
  const loadCandidates = useCallback(async (t: TripIntent, retried = false) => {
    const my = seq.current;
    setPhase('searching');
    setResult(null);
    const minWait = new Promise(r => setTimeout(r, 900)); // let the spinner read as a search, not a flash
    try {
      const res = await api.trips.candidates(t.id);
      await minWait;
      if (my !== seq.current) return;
      setResult(res);
      setSelectedId(res.candidates[0]?.roomId ?? null);
      setPhase('ready');
    } catch (error) {
      if (my !== seq.current) return;
      if (isApiError(error, 'ROUTE_EXPIRED') && !retried) {
        try { const fresh = await api.trips.route(t.id); tripRef.current = fresh; setTrip(fresh); return loadCandidates(fresh, true); } catch (e) { onError(e); setPhase('noroute'); return; }
      }
      if (isApiError(error, 'TRIP_NOT_SEARCHABLE')) { setPhase('unsearchable'); return; }
      onError(error);
      setPhase('ready');
      setResult({ tripId: t.id, generatedAt: new Date().toISOString(), policy: { priorityRadiusMeters: 200, maxRadiusMeters: 500 }, candidates: [], similarSearchingCount: 0 });
    }
  }, [onError]);

  // ---- trip: (re)created whenever both ends are set
  const createTrip = useCallback(async (o: PlaceRef, d: PlaceRef) => {
    const my = ++seq.current;
    setPhase('routing');
    setResult(null);
    setMode('list');
    const previous = tripRef.current;
    tripRef.current = null;
    setTrip(null);
    if (previous) await api.trips.cancel(previous.id).catch(() => {});
    const body = { origin: o, destination: d, desiredDepartureAt: departureAt(), maxWaitMinutes: 15, maxDetourMinutes: 10, passengerCount: 1 };
    let t: TripIntent;
    try {
      try { t = await api.trips.create(body); }
      catch (error) {
        if (!isApiError(error, 'ACTIVE_TRIP_EXISTS')) throw error;
        const mine = await api.rooms.mine();
        if (mine.some(r => ROOM_JOINABLE.includes(r.status))) { toast('이미 참여 중인 방이 있어요. 홈의 ‘현재 내 방’에서 확인해 주세요.'); setPhase('idle'); return; }
        // A leftover trip from an earlier, abandoned search: replace it.
        const old = await api.trips.active();
        if (old) await api.trips.cancel(old.id);
        t = await api.trips.create(body);
      }
    } catch (error) { if (my === seq.current) { onError(error); setPhase('idle'); } return; }
    if (my !== seq.current) { void api.trips.cancel(t.id).catch(() => {}); return; }
    tripRef.current = t;
    setTrip(t);
    showMine(t, o, d, selectSheetHeight(map.size, 'list'));
    if (!t.route) { setPhase('noroute'); return; }
    void loadCandidates(t);
  }, [departureAt, loadCandidates, map.size, onError, showMine, toast]);

  const choose = (field: Field, place: PlaceRef) => {
    const o = field === 'origin' ? place : origin, d = field === 'destination' ? place : destination;
    setOrigin(o); setDestination(d); setSearching(null);
    if (o && d) { showMine(null, o, d, selectSheetHeight(map.size, 'list')); void createTrip(o, d); }
    else showMine(null, o, d, selectSheetHeight(map.size, 'list'));
  };
  const swap = () => {
    const o = destination, d = origin;
    setOrigin(o); setDestination(d);
    if (o && d) void createTrip(o, d); else showMine(null, o, d, selectSheetHeight(map.size, 'list'));
  };

  useEffect(() => {
    if (initialRoom) {
      map.setLayers(roomLayers(initialRoom, []));
      map.fit(roomPoints(initialRoom, []), sheetInsets(selectSheetHeight(map.size, 'list')));
      api.rooms.get(initialRoom.id).then(d => {
        setPreviewDetail(d);
        map.setLayers(roomLayers(d, d.routePreview));
        map.fit(roomPoints(d, d.routePreview), sheetInsets(selectSheetHeight(map.size, 'list')));
      }).catch(onError);
      return;
    }
    showMine(null, null, initialDestination ?? null);
    // Start with the origin search: there is no default origin.
    const t = setTimeout(() => setSearching('origin'), initialDestination ? 380 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Departure changed from the condition row: register the trip again with the new time and search again.
  const lastDeparture = useRef(departureText);
  useEffect(() => {
    if (lastDeparture.current === departureText) return;
    lastDeparture.current = departureText;
    if (origin && destination && mode !== 'detail') void createTrip(origin, destination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureText]);

  const retryRoute = async () => {
    if (!trip) return;
    setPhase('routing');
    const t = await run(() => api.trips.route(trip.id));
    if (!t) { setPhase('noroute'); return; }
    tripRef.current = t; setTrip(t); showMine(t, origin, destination, selectSheetHeight(map.size, 'list'));
    if (t.route) void loadCandidates(t); else setPhase('noroute');
  };

  // ---- detail (room introduction) and joining
  const openDetail = (c: MatchCandidate) => {
    setSelectedId(c.roomId);
    setDetail(c);
    setMode('detail');
    const mineRoute = trip?.route?.path ?? [];
    const layers = roomLayers(c.room, c.routePreview, [], trip?.route ? Math.round(minutesOf(trip.route.durationSeconds) + c.estimatedDetourMinutes) : undefined);
    map.setLayers({ ...layers, polylines: [...(mineRoute.length > 1 ? [{ path: mineRoute, tone: 'muted' as const }] : []), ...(layers.polylines ?? [])] });
    // Detail opens expanded: retain the last normal camera until it is shrunk.
  };
  // ---- join straight from a Home room: check the walk to its boarding spot, then join
  const previewRoom = previewDetail ?? preview;
  const pickupOf = (r: RoomSummary) => r.meetingPoint?.location ?? r.approxOrigin;
  const showWalk = (me: LatLng | null, route: WalkRoute | null = null) => {
    if (!previewRoom) return;
    const base = roomLayers(previewRoom, previewDetail?.routePreview ?? []);
    map.setLayers({
      ...base,
      markers: [...(base.markers ?? []), ...(me ? [{ position: me, kind: 'me' as const }] : [])],
      polylines: [...(me ? [{ path: route?.path?.length ? route.path : [me, pickupOf(previewRoom)], tone: 'muted' as const }] : []), ...(base.polylines ?? [])],
    });
    map.fit(me ? [me, pickupOf(previewRoom), ...(route?.path ?? [])] : [pickupOf(previewRoom)], sheetInsets(sheetH));
  };
  const askJoin = async () => {
    if (!previewRoom) return;
    setWalk({ me: bias ?? null, state: 'locating' });
    let me = bias ?? null;
    if (!me) { try { me = await locateOnce(); } catch { setWalk({ me: null, state: 'nogps' }); showWalk(null); return; } }
    showWalk(me);
    // Walk along real streets (TMAP pedestrian route via the backend); falls back to a straight-line estimate.
    const route = await api.routes.walk(me, pickupOf(previewRoom)).catch(() => null);
    setWalk({ me, state: 'ok', route });
    showWalk(me, route);
  };
  const cancelWalk = () => {
    setWalk(null);
    if (!previewRoom) return;
    const path = previewDetail?.routePreview ?? [];
    map.setLayers(roomLayers(previewRoom, path));
    map.fit(roomPoints(previewRoom, path), sheetInsets(sheetH));
  };
  /** My trip = this room's boarding spot -> its destination (public place names), then join. */
  const confirmJoin = async () => {
    const r = previewRoom;
    if (!r) return;
    const o = { name: r.meetingPoint?.name ?? originTitle(r), address: null, location: pickupOf(r), kind: 'SEARCH', providerPlaceId: null } as unknown as PlaceRef;
    const d = { name: destinationTitle(r), address: null, location: r.approxDestination, kind: 'SEARCH', providerPlaceId: null } as unknown as PlaceRef;
    const body = { origin: o, destination: d, desiredDepartureAt: r.departureAt, maxWaitMinutes: 15, maxDetourMinutes: 10, passengerCount: 1 };
    const joined = await run(async () => {
      let t: TripIntent;
      try { t = await api.trips.create(body); }
      catch (error) {
        if (!isApiError(error, 'ACTIVE_TRIP_EXISTS')) throw error;
        const old = await api.trips.active();
        if (old) await api.trips.cancel(old.id);
        t = await api.trips.create(body);
      }
      tripRef.current = t;
      try { return await api.rooms.join(r.id, { tripId: t.id }); }
      catch (error) { tripRef.current = null; await api.trips.cancel(t.id).catch(() => {}); throw error; }
    });
    if (joined) { toast('방에 참여했어요!', 'info'); finish(joined, joined.routePreview); }
  };

  const closeDetail = () => {
    setMode('list');
    setDetail(null);
    showMine(trip, origin, destination, selectSheetHeight(map.size, 'list'));
  };

  /** Room joined or created: slide the sheet down, hand the map to the room's route, then go. */
  const finish = (room: RoomDetail, path: LatLng[]) => {
    kept.current = true;
    setExiting(true);
    map.setLayers(roomLayers(room, path, [], trip?.route ? minutesOf(trip.route.durationSeconds) : undefined));
    map.fit(roomPoints(room, path), otwInsets(map.size));
    setTimeout(() => onRoomReady(room), 650);
  };
  const join = async (c: MatchCandidate) => {
    if (!trip) return;
    const joined = await run(() => api.rooms.join(c.roomId, { tripId: trip.id }));
    if (joined) { toast('방에 참여했어요!', 'info'); finish(joined, joined.routePreview.length > 1 ? joined.routePreview : c.routePreview); }
  };
  const create = async (note: string, luggageAllowed: boolean, party: number, sameGenderOnly: boolean) => {
    if (!trip) return;
    const room = await run(async () => {
      let source = trip;
      if (party !== trip.passengerCount) {
        // The host's party size lives on the trip (seats left = capacity − parties), so register it again.
        await api.trips.cancel(trip.id).catch(() => {});
        tripRef.current = null;
        source = await api.trips.create({ origin: trip.origin, destination: trip.destination, desiredDepartureAt: trip.desiredDepartureAt, maxWaitMinutes: trip.maxWaitMinutes, maxDetourMinutes: trip.maxDetourMinutes, passengerCount: party });
        tripRef.current = source;
        setTrip(source);
      }
      return api.rooms.create({ sourceTripId: source.id, sameGenderOnly, capacity: CAPACITY, terms: { farePolicy: 'EQUAL_SPLIT', luggageAllowed, note: note.trim() || null } });
    });
    if (room) { toast('방을 열었어요. 만날 장소를 정해 주세요.', 'info'); finish(room, trip.route?.path ?? room.routePreview); }
  };

  const back = () => {
    if (searching && (origin || destination)) { setSearching(null); return; }
    if (mode === 'preview') { if (walk) { cancelWalk(); return; } close(); return; }
    if (mode === 'detail') { closeDetail(); return; }
    if (mode === 'create') { setMode('list'); return; }
    close();
  };

  const candidates = result?.candidates ?? [];
  const visible = shown && !exiting;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* back: black half-pill, top-left (mockup) */}
      <button type="button" onClick={back} aria-label="뒤로"
        className={`ease-sheet pointer-events-auto absolute left-0 z-[60] top-[max(48px,env(safe-area-inset-top))] grid h-14 w-12 place-items-center rounded-r-full bg-ink pr-1 text-white shadow-float transition duration-500 ${visible ? 'translate-x-0' : '-translate-x-full'}`}>
        <ChevronLeftIcon size={22} />
      </button>

      <section
        aria-label="출발지·도착지 선택"
        className={`ease-sheet pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-white shadow-sheet transition-[height,transform] duration-500 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={sheet.style}
      >
        <SheetHandle controls={sheet} />
        {mode === 'preview' && preview && !searching ? (
          <RoomPreview room={preview} detail={previewDetail} walk={walk} busy={busy} onClose={close} onGo={askJoin} onCancelWalk={cancelWalk} onConfirm={confirmJoin} />
        ) : mode === 'detail' && detail && !searching ? (
          <RoomIntro candidate={detail} trip={trip} busy={busy} onBack={closeDetail} onJoin={() => join(detail)} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
            <Fields origin={origin} destination={destination} active={searching} onActivate={setSearching} onSwap={swap} disabled={busy} />
            {searching ? (
              <PlaceResults onBlur={collapseSearch} field={searching} bias={origin?.location ?? bias} onChoose={p => choose(searching, p)} />
            ) : mode === 'create' && trip ? (
              <CreateArea trip={trip} departureText={departureText} busy={busy} onCancel={() => setMode('list')} onCreate={create} />
            ) : (
              <>
                {/* Cards + conditions scroll on short phones; the main button below always stays visible. */}
                <div className="no-scrollbar -mx-6 flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
                <CardArea phase={phase} result={result} selectedId={selectedId} strip={strip} departureText={departureText}
                  onOpen={openDetail} onRefresh={() => trip && loadCandidates(trip)} onRetryRoute={retryRoute} onCreate={() => setMode('create')} />
                {phase === 'ready' && (
                  <ConditionRow departureText={departureText} passengers={trip?.passengerCount ?? 1} onChange={onEditDeparture} />
                )}
                </div>
                {phase !== 'idle' && <div className="mt-4 shrink-0">
                  {phase === 'ready' ? (
                    <button type="button" className="btn-ink w-full" onClick={() => setMode('create')}><PlusIcon size={20} /> 새 방 만들기</button>
                  ) : (
                    <button type="button" className="btn-ink w-full" disabled>
                      {phase === 'routing' ? '경로를 계산하고 있어요…' : phase === 'searching' ? '방을 찾고 있어요…' : '다시 시도해 주세요'}
                    </button>
                  )}
                </div>}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- origin / destination

function Fields({ origin, destination, active, onActivate, onSwap, disabled }: {
  origin: PlaceRef | null; destination: PlaceRef | null; active: Field | null; disabled: boolean;
  onActivate(f: Field): void; onSwap(): void;
}) {
  const row = (field: Field, place: PlaceRef | null) => {
    const isOrigin = field === 'origin';
    return (
      <button type="button" data-search-field onClick={() => onActivate(field)} disabled={disabled}
        // While a search input is open, keep its focus: switching origin <-> destination must not blur (= collapse) the sheet first.
        onPointerDown={e => { if (active) e.preventDefault(); }}
        className={`flex h-[52px] w-full items-center gap-4 text-left ${active === field ? 'opacity-100' : ''}`}>
        <ArrowIcon size={22} className={`-scale-x-100 shrink-0 ${isOrigin ? 'text-[#BDBDBD]' : 'text-ink'}`} />
        <span className={`truncate text-[1.0625rem] ${place ? (isOrigin ? 'text-mute-dark' : 'font-medium text-ink') : 'text-mute'} ${active === field ? 'font-semibold text-ink' : ''}`}>
          {place?.name ?? (isOrigin ? '출발지 검색' : '도착지 검색')}
        </span>
      </button>
    );
  };
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="relative min-w-0 flex-1">
        {row('origin', origin)}
        <div className="absolute left-[10px] top-[44px] h-3 border-l-2 border-dotted border-[#C8C8C8]" />
        <div className="ml-[38px] border-t border-line" />
        {row('destination', destination)}
      </div>
      <button type="button" onClick={onSwap} disabled={disabled || (!origin && !destination)} aria-label="출발지와 도착지 바꾸기"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-fog text-mute transition active:scale-95 disabled:opacity-50">
        <SwapIcon size={22} />
      </button>
    </div>
  );
}

function PlaceResults({ field, bias, onChoose, onBlur }: { field: Field; bias?: LatLng; onChoose(p: PlaceRef): void; onBlur(): void }) {
  const onError = useErrorHandler();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceRef[] | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // iOS Safari blurs the input on a tap even when pointerdown is prevented, and the blur closes this list before the
  // tap's click arrives — so a result is picked on pointerup (a tap, not a scroll) and a blur during a press is ignored.
  const press = useRef<{ x: number; y: number } | null>(null);
  const chosen = useRef(false);
  const pick = (p: PlaceRef) => { if (chosen.current) return; chosen.current = true; onChoose(p); };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest('input, label, ul, [data-sheet-handle], [data-search-field]')) return;
      input.current?.blur();
    };
    // A press that ends off the results (finger slid away) must not keep suppressing blur.
    const release = () => { press.current = null; };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('pointerup', release);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('pointerup', release); };
  }, []);
  useEffect(() => { chosen.current = false; press.current = null; setQuery(''); setResults(null); const t = setTimeout(() => input.current?.focus(), 60); return () => clearTimeout(t); }, [field]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api.places.search(q, bias)
        .then(list => { if (!cancelled) setResults(list); })
        .catch(error => { if (!cancelled) { setResults([]); onError(error); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 280);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, bias, onError]);

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <label className="flex h-14 shrink-0 items-center gap-3 rounded-2xl bg-fog px-4">
        <SearchIcon size={20} className="text-mute" />
        <input ref={input} value={query} onBlur={() => { if (!press.current) onBlur(); }} onChange={e => setQuery(e.target.value)} enterKeyHint="search"
          placeholder={field === 'origin' ? '어디서 출발하세요? (예: 정왕역)' : '어디로 가세요? (예: 시흥시청)'}
          className="min-w-0 flex-1 bg-transparent text-[1.0625rem] outline-none placeholder:text-mute" />
        {query && <button type="button" onPointerDown={e => e.preventDefault()} onClick={() => setQuery('')} aria-label="지우기" className="text-mute"><CloseIcon size={18} /></button>}
      </label>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {loading && !results && <Spinner />}
        {!query.trim() && <PlaceNameHint className="mt-4">역·건물·가게처럼 누구나 아는 장소 이름으로 검색해 주세요. 방을 열면 고른 장소 이름이 다른 이웃에게 그대로 보여요.</PlaceNameHint>}
        {results?.length === 0 && <p className="px-1 py-6 text-sm text-mute">검색 결과가 없어요. 다른 이름으로 찾아 주세요.</p>}
        <ul onPointerDown={e => { if ((e.target as Element).closest('button')) { e.preventDefault(); press.current = { x: e.clientX, y: e.clientY }; } }}
          onPointerCancel={() => { press.current = null; }}>
          {results?.map((p, i) => (
            <li key={p.providerPlaceId ?? i} className="border-b border-line last:border-0">
              <button type="button" onClick={() => pick(p)}
                onPointerUp={e => { const s = press.current; press.current = null; if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 12) pick(p); }}
                className="flex w-full items-center gap-4 py-4 text-left transition active:bg-fog-soft">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fog"><ArrowIcon size={16} className="-scale-x-100" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[1rem] font-semibold">{p.name ?? '이름 없는 장소'}</span>
                  {p.address && <span className="block truncate text-[0.8125rem] text-mute">{p.address}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- card area (candidates)

function CardArea({ phase, result, selectedId, strip, departureText, onOpen, onRefresh, onRetryRoute, onCreate }: {
  phase: Phase; result: MatchCandidatesResponse | null; selectedId: string | null; strip: RefObject<HTMLDivElement>; departureText: string;
  onOpen(c: MatchCandidate): void; onRefresh(): void; onRetryRoute(): void; onCreate(): void;
}) {
  const body = 'mt-5 flex min-h-[11.875rem] flex-1 shrink-0 flex-col';
  if (phase === 'idle') {
    return (
      <p className="mt-5 flex shrink-0 items-start gap-2.5 rounded-2xl bg-fog-soft px-4 py-3 text-[0.8438rem] leading-snug text-mute-dark">
        <BulbIcon size={18} className="mt-px shrink-0 text-sun-deep" />
        <span>출발지와 도착지를 검색하면 비슷한 동선의 방을 찾아드려요</span>
      </p>
    );
  }
  if (phase === 'routing') return <div className={`${body} justify-center`}><Spinner text="자동차 경로를 계산하고 있어요" /></div>;
  if (phase === 'searching') return <div className={`${body} justify-center`}><Spinner text="비슷한 동선으로 가는 방이 있는지 확인 중이에요" /></div>;
  if (phase === 'noroute') {
    return (
      <div className={`${body} justify-center gap-3`}>
        <Notice tone="error">경로를 계산하지 못했어요. 경로가 있어야 동행을 찾을 수 있어요.</Notice>
        <button type="button" className="btn-fog w-full" onClick={onRetryRoute}><RefreshIcon size={18} /> 경로 다시 검색</button>
      </div>
    );
  }
  if (phase === 'unsearchable') return <div className={`${body} justify-center`}><Notice tone="warn">이 이동은 지금 동행을 찾을 수 없는 상태예요. 출발지나 도착지를 다시 검색해 주세요.</Notice></div>;

  const candidates = result?.candidates ?? [];
  return (
    <div className={body}>
      <div className="flex items-center justify-between">
        <h3 className="text-[1.1875rem] font-bold tracking-tight">{candidates.length ? '비슷한 동선이 있어요' : '아직 비슷한 동선의 방이 없어요'}</h3>
        <div className="flex items-center gap-1">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-fog text-ink transition active:rotate-180" onClick={onRefresh} aria-label="다시 찾기"><RefreshIcon size={18} /></button>
        </div>
      </div>
      {candidates.length ? (
        <div ref={strip} className="no-scrollbar -mx-6 mt-3 flex shrink-0 snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-1">
          {candidates.map(c => <CandidateCard key={c.roomId} c={c} selected={c.roomId === selectedId} onOpen={() => onOpen(c)} />)}
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col justify-center rounded-card bg-fog-soft px-6 py-5">
          <p className="text-[0.9375rem] leading-relaxed text-mute-dark">
            {result && result.similarSearchingCount > 0
              ? <>지금 비슷한 동선으로 <b className="text-ink">{result.similarSearchingCount}명</b>이 함께 갈 사람을 찾고 있어요. 방을 열면 그분들이 바로 찾을 수 있어요.</>
              : '먼저 방을 열어 두면 같은 방향의 이웃이 찾아올 수 있어요.'}
          </p>
        </div>
      )}
    </div>
  );
}

function CandidateCard({ c, selected, onOpen }: { c: MatchCandidate; selected: boolean; onOpen(): void }) {
  const near = c.tier === 'NEAR';
  const fare = perPersonFare(c.room.estimatedTaxiFareWon, riders(c.room) + 1);
  return (
    <button type="button" onClick={onOpen}
      className={`relative w-[72%] shrink-0 snap-start overflow-hidden rounded-card border bg-white text-left transition active:scale-[.98] ${selected ? 'border-ink' : 'border-line'}`}>
      <div className={`mr-[10%] rounded-br-card pb-3 pl-5 pr-4 pt-3.5 ${near ? 'bg-sun' : 'bg-fog'}`}>
        <div className="text-[0.75rem] font-semibold text-ink/60">{near ? '가까운 방 · 200m 이내' : '조금 더 넓게 · 500m 이내'}</div>
        <GenderChip enabled={c.room.sameGenderOnly} />
        <CardTags tags={shortTags(c)} />
      </div>
      <div className="px-5 pb-4 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[1.125rem] font-bold tracking-tight">{destinationTitle(c.room)}</span>
          <span className="shrink-0 text-[1.0625rem] font-bold">{fare != null ? formatWon(fare) : '-'}</span>
        </div>
        <div className="mt-1 flex items-center gap-2.5 whitespace-nowrap text-[0.9375rem] text-mute">
          <span className="min-w-0 truncate">{formatDiff(c.departureDiffMinutes).replace(/\s*출발$/, '')}</span>
          <span className="flex shrink-0 items-center gap-1"><PersonIcon size={15} /> {riders(c.room)}/{c.room.capacity}</span>
          <span className="shrink-0 font-semibold text-ink">빈 자리 {c.seatsLeft}</span>
        </div>
      </div>
    </button>
  );
}

/** Short card tags; the full sentences stay in the room intro. */
function shortTags(c: MatchCandidate): string[] {
  return [
    `출발 ${c.originDistanceMeters}m`,
    `경로 ${Math.round(c.overlapRatio * 100)}%`,
    `도착 ${c.destinationDistanceMeters}m`,
    `우회 ${Math.round(c.estimatedDetourMinutes)}분`,
  ];
}

/**
 * One row of tags that never scrolls or clips: shows as many as fit, the rest collapse into a "+N" tag.
 * Measures after layout and on resize.
 */
function CardTags({ tags }: { tags: string[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(tags.length);
  const key = tags.join('|');

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const chips = [...row.querySelectorAll<HTMLElement>('[data-measure]')];
      const width = row.clientWidth;
      const gap = 4;
      const moreWidth = 34; // room for the "+N" tag
      let used = 0;
      let fit = 0;
      for (let i = 0; i < chips.length; i++) {
        const w = chips[i].offsetWidth + (i > 0 ? gap : 0);
        const needMore = i < chips.length - 1 ? moreWidth + gap : 0;
        if (used + w + needMore > width) break;
        used += w;
        fit++;
      }
      setVisible(Math.max(1, fit));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [key]);

  const hidden = tags.length - visible;
  return (
    <div ref={rowRef} className="relative mt-2 flex gap-1 overflow-hidden">
      {/* invisible copies used only for measuring natural widths */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
        {tags.map(t => <span key={t} data-measure className="chip px-2 text-[0.7188rem]">{t}</span>)}
      </div>
      {tags.slice(0, visible).map(t => <span key={t} className="chip bg-white/80 px-2 text-[0.7188rem] text-ink">{t}</span>)}
      {hidden > 0 && <span className="chip bg-ink px-2 text-[0.7188rem] text-white" aria-label={`태그 ${hidden}개 더`}>+{hidden}</span>}
    </div>
  );
}

/** Trip conditions under the room cards (the mockup's payment row): change departure without leaving the sheet. */
function ConditionRow({ departureText, passengers, onChange }: { departureText: string; passengers: number; onChange(): void }) {
  return (
    <div className="mt-4 flex h-[60px] shrink-0 items-center gap-3 rounded-card border border-line px-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sun text-ink"><ClockIcon size={16} /></span>
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
        {departureText === '지금' ? '지금 출발' : `${departureText} 출발`} · {passengers}명
      </span>
      <button type="button" onClick={onChange} className="shrink-0 text-[0.9375rem] font-semibold text-mute">변경</button>
    </div>
  );
}

// ---------------------------------------------------------------- new room

function CreateArea({ trip, departureText, busy, onCancel, onCreate }: { trip: TripIntent; departureText: string; busy: boolean; onCancel(): void; onCreate(note: string, luggage: boolean, party: number, sameGenderOnly: boolean): void }) {
  const [note, setNote] = useState('');
  /** People riding with the host, host included. At least one seat must stay open for others. */
  const [party, setParty] = useState(Math.min(trip.passengerCount, CAPACITY - 1));
  const [luggage, setLuggage] = useState(true);
  const { member } = useApp();
  const eligible = member?.gender === 'MALE' || member?.gender === 'FEMALE';
  const [sameGenderOnly, setSameGenderOnly] = useState(false);
  const fare = trip.route?.taxiFareWon ?? null;
  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-[1.1875rem] font-bold tracking-tight">방 소개를 적어 주세요</h3>
          <button type="button" className="btn-text" onClick={onCancel}>목록</button>
        </div>
        <PlaceNameHint className="mt-3">출발지·목적지는 역, 공공기관, 건물처럼 누구나 아는 장소로 정해 주세요. 이 이름과 예상 경로가 방 목록에 그대로 보여요. 집 주소 대신 가까운 공공장소를 고르면 더 안전해요.</PlaceNameHint>
        <div className="relative mt-3">
          <textarea value={note} maxLength={200} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="예: 정왕역 2번 출구 앞에서 만나요. 짐은 작은 가방 하나예요."
            className="field min-h-[6rem] resize-none pb-7 leading-relaxed" />
          <span className="pointer-events-none absolute bottom-2.5 right-4 text-xs text-mute">{note.length}/200</span>
        </div>
        <div className="mt-2"><Toggle checked={luggage} onChange={setLuggage} label="큰 짐(캐리어 등) 괜찮아요" /></div>
        <div className="mt-2 rounded-card border border-line px-4 py-3">
          <Toggle checked={eligible && sameGenderOnly} disabled={!eligible} onChange={setSameGenderOnly} label="같은 성별만" />
          {!eligible && <p className="mt-2 text-[0.8125rem] leading-relaxed text-mute">성별을 선택하지 않으면 이 방을 만들거나 찾고 참여할 수 없어요. 메뉴의 내 정보에서 변경할 수 있어요.</p>}
        </div>
        <div className="mt-2 rounded-card border border-line px-4 py-3">
          <div className="flex items-center gap-3 text-[0.9375rem]">
            <PersonIcon size={20} className="shrink-0 text-mute" />
            <span className="flex-1 font-medium">나 포함 같이 타는 인원</span>
            <div className="flex rounded-full bg-fog p-1" role="radiogroup" aria-label="나 포함 같이 타는 인원">
              {Array.from({ length: CAPACITY - 1 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" role="radio" aria-checked={party === n} onClick={() => setParty(n)}
                  className={`h-9 min-w-[3.25rem] rounded-full px-3 text-[0.9375rem] font-semibold transition ${party === n ? 'bg-ink text-white' : 'text-mute-dark'}`}>{n}명</button>
              ))}
            </div>
          </div>
          <p className="mt-2 pl-8 text-[0.8125rem] text-mute">정원 {CAPACITY}명(앞 1 · 뒤 2) 중 {CAPACITY - party}자리를 함께 탈 이웃에게 열어요 · {departureText} 출발</p>
        </div>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-mute">
          요금은 똑같이 나눠요{fare != null && <> · 예상 총 {formatWon(fare)} (다 차면 1인 {formatWon(perPersonFare(fare, CAPACITY)!)})</>}. 출발 {formatTime(trip.desiredDepartureAt)}.
        </p>
      </div>
      <button type="button" className="btn-ink mt-4 w-full shrink-0" disabled={busy} onClick={() => onCreate(note, luggage, party, eligible && sameGenderOnly)}>{busy ? '방을 여는 중…' : '방 만들기'}</button>
    </div>
  );
}

// ---------------------------------------------------------------- room introduction (expanded sheet)

function RoomIntro({ candidate, trip, busy, onBack, onJoin }: { candidate: MatchCandidate; trip: TripIntent | null; busy: boolean; onBack(): void; onJoin(): void }) {
  const onError = useErrorHandler();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  useEffect(() => { api.rooms.get(candidate.roomId).then(setRoom).catch(onError); }, [candidate.roomId, onError]);
  const r = room ?? candidate.room;
  const after = riders(r) + 1;
  const perPerson = perPersonFare(r.estimatedTaxiFareWon, after);
  const minutes = trip?.route ? Math.round(minutesOf(trip.route.durationSeconds) + candidate.estimatedDetourMinutes) : null;
  const cannotJoin = room ? !room.canJoin : false;
  return (
    <div className="flex min-h-0 flex-1 flex-col pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex shrink-0 items-center justify-between px-6 pt-3">
        <button type="button" onClick={onBack} className="btn-text -ml-1"><ChevronLeftIcon size={18} /> 목록으로</button>
        <span className={`chip ${candidate.tier === 'NEAR' ? 'bg-sun text-ink' : ''}`}>{candidate.tier === 'NEAR' ? '200m 이내' : '200–500m'}</span>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-4">
        <p className="text-[0.9375rem] text-mute">{originTitle(r)}에서</p>
        <h2 className="mt-1 text-[1.875rem] font-bold leading-tight tracking-[-0.03em]">{destinationTitle(r)}</h2>
        <GenderChip enabled={r.sameGenderOnly} />
        <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto">
          {candidate.reasons.map(x => <span key={x} className="chip">{x}</span>)}
          <span className="chip">{formatDiff(candidate.departureDiffMinutes)}</span>
        </div>

        <blockquote className="mt-6 rounded-card bg-fog-soft px-5 py-4 text-[1rem] leading-relaxed">
          {r.terms.note ? `“${r.terms.note}”` : <span className="text-mute">방장이 소개를 남기지 않았어요.</span>}
        </blockquote>

        <dl className="mt-5 divide-y divide-line">
          <Info label="방장"><span className="flex items-center gap-2"><Avatar name={r.hostNickname} size={26} />{r.hostNickname}</span></Info>
          <Info label="출발">{formatTime(r.departureAt)}</Info>
          <Info label="만나는 곳">{r.meetingPoint ? `${r.meetingPoint.name} · ${meetingKindLabel[r.meetingPoint.kind]}` : '참여 후 함께 정해요'}</Info>
          <Info label="탑승 인원">{riders(r)}/{r.capacity}명 · 빈 자리 {r.seatsLeft}</Info>
          <Info label="예상 요금">{perPerson != null ? <>1인 <b>{formatWon(perPerson)}</b> <span className="text-mute">/ 총 {formatWon(r.estimatedTaxiFareWon!)}</span></> : '요금 정보 없음'}</Info>
          <Info label="예상 경로">{minutes != null ? `약 ${minutes}분 (추가 이동 약 ${Math.round(candidate.estimatedDetourMinutes)}분)` : '-'}</Info>
          <Info label="큰 짐">{r.terms.luggageAllowed ? '괜찮아요' : '어려워요'}</Info>
        </dl>
        <p className="mt-4 pb-4 text-xs leading-relaxed text-mute">{FARE_DISCLAIMER}</p>
      </div>
      <div className="relative shrink-0 px-6 pt-3">
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-gradient-to-b from-white/0 to-white" />
        <button type="button" className="btn-ink w-full" disabled={busy || cannotJoin} onClick={onJoin}>
          {cannotJoin ? '지금은 참여할 수 없는 방이에요' : busy ? '참여하는 중…' : '이 방 선택하기'}
        </button>
      </div>
    </div>
  );
}

/** A room card's destination as a search-free PlaceRef (approximate, area label). */
function roomDestination(r: RoomSummary): PlaceRef {
  return { name: destinationTitle(r), location: r.approxDestination, kind: 'SEARCH' } as PlaceRef;
}

/** Bulb + short guidance (same look as the idle hint). */
function PlaceNameHint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex shrink-0 items-start gap-2.5 rounded-2xl bg-fog-soft px-4 py-3 text-[0.8438rem] leading-snug text-mute-dark ${className}`}>
      <BulbIcon size={18} className="mt-px shrink-0 text-sun-deep" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Room opened from a Home card, before I have a trip of my own. Route-first: the sheet opens at normal
 * height so the room's expected route is on the map above. "이 방으로 함께 가기" then shows how far its
 * boarding spot is from me (one GPS fix) and lets me join or cancel.
 */
function RoomPreview({ room: summary, detail, walk, busy, onClose, onGo, onCancelWalk, onConfirm }: {
  room: RoomSummary; detail: RoomDetail | null; walk: { me: LatLng | null; state: 'locating' | 'ok' | 'nogps'; route?: WalkRoute | null } | null; busy: boolean;
  onClose(): void; onGo(): void; onCancelWalk(): void; onConfirm(): void;
}) {
  const r = detail ?? summary;
  const cannotJoin = detail ? !detail.canJoin : false;
  // Per-person fare depends on how many end up riding: full room (cheapest) … me joining now (dearest).
  const low = perPersonFare(r.estimatedTaxiFareWon, r.capacity);
  const high = perPersonFare(r.estimatedTaxiFareWon, riders(r) + 1);
  const fareRange = low == null || high == null ? '-' : low === high ? formatWon(low) : `${formatWon(low).replace('원', '')}~${formatWon(high)}`;
  const pickupName = r.meetingPoint?.name ?? originTitle(r);
  const pickup = r.meetingPoint?.location ?? r.approxOrigin;
  const meters = walk?.route ? Math.round(walk.route.distanceMeters / 10) * 10 : walk?.me ? Math.round((distanceMeters(walk.me, pickup) * 1.3) / 10) * 10 : null;
  const walkMin = walk?.route ? Math.max(1, Math.round(walk.route.durationSeconds / 60)) : meters != null ? Math.max(1, Math.round(meters / 1.2 / 60)) : null;
  const estimated = !walk?.route || walk.route.source === 'ESTIMATE';

  if (walk) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={onCancelWalk} className="btn-text -ml-1 self-start"><ChevronLeftIcon size={18} /> 방 정보</button>
        <h3 className="mt-4 text-[1.375rem] font-bold tracking-tight">출발지까지 갈 만한 거리인가요?</h3>
        <div className="mt-4 flex flex-col gap-3 rounded-card border border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white shadow"><span className="h-3 w-3 rounded-full bg-sun-deep" /></span>
            <p className="text-[0.9375rem] text-mute-dark">내 위치</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#4F46E5]"><span className="h-1.5 w-1.5 rounded-sm bg-white" /></span>
            <p className="min-w-0 truncate text-[1rem] font-semibold">{pickupName}</p>
          </div>
        </div>
        <div className="mt-4 rounded-card bg-fog-soft px-5 py-4">
          {walk.state === 'locating' ? <Spinner text="걷는 길을 찾는 중…" />
            : walk.state === 'nogps' ? <p className="text-[0.9375rem] text-mute-dark">현재 위치를 확인할 수 없어요. 지도에서 출발지를 확인한 뒤 참여해 주세요.</p>
              : (
                <>
                  <p className="text-[1.75rem] font-bold tracking-tight">{formatDistance(meters!)} <span className="text-[1.0625rem] font-semibold text-mute-dark">· 걸어서 약 {walkMin}분</span></p>
                  <p className="mt-1 text-[0.8125rem] text-mute">출발 {formatClock(r.departureAt)}까지 이곳으로 와 주세요.{meters! > 1500 && ' 걸어가기엔 조금 멀어요.'}{estimated && ' (직선거리로 어림한 값이에요)'}</p>
                </>
              )}
        </div>
        <div className="mt-auto flex gap-3 pt-4">
          <button type="button" className="btn-fog flex-1" onClick={onCancelWalk} disabled={busy}>취소</button>
          <button type="button" className="btn-ink flex-[2]" onClick={onConfirm} disabled={busy || walk.state === 'locating' || cannotJoin}>
            {busy ? '참여하는 중…' : '참여하기'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex shrink-0 items-center justify-between px-6 pt-3">
        <button type="button" onClick={onClose} className="btn-text -ml-1"><ChevronLeftIcon size={18} /> 홈으로</button>
        <span className="chip bg-sun text-ink">빈 자리 {r.seatsLeft}</span>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
        <GenderChip enabled={r.sameGenderOnly} />
        <div className="relative flex flex-col gap-3 rounded-card border border-line px-4 py-4">
          <div className="absolute bottom-[34px] left-[26px] top-[34px] border-l-2 border-dotted border-[#C8C8C8]" />
          <div className="flex items-center gap-3">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-[#4F46E5]"><span className="h-1.5 w-1.5 rounded-sm bg-white" /></span>
            <div className="min-w-0"><p className="text-[0.75rem] text-mute">출발</p><p className="truncate text-[1.0625rem] font-semibold">{originTitle(r)}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink"><span className="h-2 w-2 rounded-full bg-sun" /></span>
            <div className="min-w-0"><p className="text-[0.75rem] text-mute">도착</p><p className="truncate text-[1.0625rem] font-semibold">{destinationTitle(r)}</p></div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-fog-soft px-2 py-3"><p className="text-[0.75rem] text-mute">출발</p><p className="mt-0.5 text-[0.9375rem] font-semibold">{formatClock(r.departureAt)}</p></div>
          <div className="rounded-2xl bg-fog-soft px-2 py-3"><p className="text-[0.75rem] text-mute">인원</p><p className="mt-0.5 text-[0.9375rem] font-semibold">{riders(r)}/{r.capacity}명</p></div>
          <div className="rounded-2xl bg-fog-soft px-2 py-3"><p className="text-[0.75rem] text-mute">1인 예상</p><p className="mt-0.5 whitespace-nowrap text-[0.875rem] font-semibold tracking-tight">{fareRange}</p></div>
        </div>
        <p className="mt-2 text-center text-[0.75rem] text-mute">1인 요금은 함께 타는 인원에 따라 달라져요</p>

        <blockquote className="mt-5 rounded-card bg-fog-soft px-5 py-4 text-[0.9375rem] leading-relaxed">
          {r.terms.note ? `“${r.terms.note}”` : <span className="text-mute">방장이 소개를 남기지 않았어요.</span>}
        </blockquote>
        <dl className="mt-3 divide-y divide-line">
          <Info label="방장"><span className="flex items-center gap-2"><Avatar name={r.hostNickname} size={26} />{r.hostNickname}</span></Info>
          <Info label="만나는 곳">{r.meetingPoint ? `${r.meetingPoint.name} · ${meetingKindLabel[r.meetingPoint.kind]}` : '참여 후 함께 정해요'}</Info>
          <Info label="총 예상 요금">{r.estimatedTaxiFareWon != null ? formatWon(r.estimatedTaxiFareWon) : '요금 정보 없음'}</Info>
          <Info label="큰 짐">{r.terms.luggageAllowed ? '괜찮아요' : '어려워요'}</Info>
        </dl>
      </div>
      <div className="relative shrink-0 px-6 pt-3">
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-gradient-to-b from-white/0 to-white" />
        <button type="button" className="btn-ink w-full" disabled={cannotJoin} onClick={onGo}>
          {cannotJoin ? '지금은 참여할 수 없는 방이에요' : '이 방으로 함께 가기'}
        </button>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-[0.9375rem]">
      <dt className="shrink-0 text-mute">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}
