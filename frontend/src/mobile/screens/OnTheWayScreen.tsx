import GenderChip from '../components/GenderChip';
import PassengerCount from '../components/PassengerCount';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, isMock } from '../../api';
import type { LatLng, MeetingPoint, Message, PlaceRef, RoomDetail, RoomEvent, TripIntent } from '../../api/contract';
import { useAction, useApp, useErrorHandler } from '../../lib/app';
import { isApiError } from '../../lib/errors';
import { farePolicyLabel, formatClock, formatCountdown, formatTime, formatWon, meetingKindLabel, minutesOf, perPersonFare, roomStatusInfo, toLocalInput, toOffsetIso, destinationTitle, originTitle, riders } from '../../lib/format';
import { useMap } from '../components/map/MapLayout';
import ReportDialog, { type ReportTarget } from '../components/ReportDialog';
import { ArrowIcon, ChatIcon, CheckIcon, ChevronLeftIcon, ClockIcon, CloseIcon, PersonIcon, PinIcon, SearchIcon, SendIcon } from '../components/icons';
import { Avatar, FARE_DISCLAIMER, Notice, PageBars, RoomStatusChip, Sheet, Spinner, Toggle, useSlideIn } from '../components/ui';
import { maxSheetHeight, otwInsets, otwSheetHeight } from './layout';
import { remScale } from '../../lib/platform';
import { useKeyboardOpen } from '../useKeyboard';
import { endedReason, isEnded, knownEnded, rememberEnded } from '../endedRooms';
import { SheetHandle, useSheetDrag } from './useSheetDrag';
import { roomLayers, roomPoints } from './SelectSheet';
import ChatPlaceCard from '../components/ChatPlaceCard';
import { DateTimePicker, formatLocalChoice } from '../components/DateTimePicker';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export default function OnTheWayScreen() {
  const { id = '' } = useParams();
  const location = useLocation();
  // Moderators (운영자 → 방 보기) may still inspect an ended room; everyone else never re-enters one.
  const moderation = !!(location.state as { moderation?: boolean } | null)?.moderation;
  // Back/Forward onto a room already known to be over: straight home, replacing this history entry.
  if (!moderation && knownEnded(id)) return <Navigate to="/" replace />;
  return <OnTheWay id={id} moderation={moderation} />;
}

function OnTheWay({ id, moderation }: { id: string; moderation: boolean }) {
  const navigate = useNavigate();
  const map = useMap();
  const { member, toast } = useApp();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const { shown, close } = useSlideIn(() => navigate('/', { replace: true }), 420);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myTrip, setMyTrip] = useState<TripIntent | null>(null);
  const [joinTrip, setJoinTrip] = useState<TripIntent | null>(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [page, setPage] = useState(0);
  const [unread, setUnread] = useState(0);
  const [joinParty, setJoinParty] = useState(1);
  const [swiping, setSwiping] = useState(false);
  const swipe = useRef<{ id: number; x: number; y: number; left: number; page: number; horizontal: boolean } | null>(null);
  const pageRef = useRef(0);
  pageRef.current = page;
  const pager = useRef<HTMLDivElement>(null);
  const pagerTarget = useRef<number | null>(null);
  const lastId = useRef<string | undefined>(undefined);
  const now = useNow();

  const isMember = !!room && room.myRole !== 'NONE';
  // Leave room for a place card and the composer even on the collapsed chat page.
  const chatMinHeight = Math.min(maxSheetHeight(map.size), Math.round(600 * remScale()));
  const sheet = useSheetDrag(map.size, page === 1 && isMember ? Math.max(otwSheetHeight(map.size), chatMinHeight) : otwSheetHeight(map.size), 'otw', false, undefined, { collapsedHeight: 132 });
  const sheetH = sheet.settledHeight;
  // Typing in the chat with the on-screen keyboard open (Android & co.; iOS pans the page itself):
  // the sheet covers the whole map with its top just under the back button and drops its header/footer,
  // so the messages and the input fit above the keyboard. Restored when the keyboard closes.
  const keyboard = useKeyboardOpen();
  const chatMode = keyboard && page === 1 && isMember;
  const sheetStyle = chatMode ? { ...sheet.style, height: maxSheetHeight(map.size) } : sheet.style;
  useEffect(() => { map.setCover(chatMode ? 1 : sheet.progress, sheet.dragging); }, [map, chatMode, sheet.progress, sheet.dragging]);
  useEffect(() => { map.setAttributionInset(sheetStyle.height, sheet.dragging); }, [map, sheetStyle.height, sheet.dragging]);
  useEffect(() => () => map.setCover(0), [map]);

  const loadRoom = useCallback(async () => {
    try { setRoom(await api.rooms.get(id)); } catch (error) { onError(error); }
  }, [id, onError]);

  const appendMessages = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages(list => {
      const seen = new Set(list.map(m => m.id));
      const next = [...list, ...incoming.filter(m => !seen.has(m.id))]
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      lastId.current = next[next.length - 1]?.id;
      return next;
    });
  }, []);
  const fetchNewMessages = useCallback(async () => {
    try {
      let cursor = lastId.current;
      const incoming: Message[] = [];
      for (;;) {
        const batch = await api.messages.list(id, cursor, 100);
        incoming.push(...batch);
        const next = batch[batch.length - 1]?.id;
        if (batch.length < 100 || next === cursor) break;
        cursor = next;
      }
      appendMessages(incoming);
    } catch { /* chat refresh is best-effort */ }
  }, [id, appendMessages]);

  useEffect(() => { setMessages([]); lastId.current = undefined; setRoom(null); void loadRoom(); }, [loadRoom]);

  // Members: chat history + push events (WS in http mode, in-memory emitter in mock mode).
  useEffect(() => {
    if (!isMember) return;
    void fetchNewMessages();
    const onEvent = (event: RoomEvent) => {
      if (event.type === 'MESSAGE_CREATED') {
        appendMessages([event.payload]);
        if (pageRef.current === 0 && event.payload.senderId !== member?.id) setUnread(n => n + 1);
      } else if (event.type === 'MESSAGE_HIDDEN') {
        setMessages(list => list.map(m => (m.id === event.payload.messageId ? { ...m, hidden: true, body: null } : m)));
      } else { void loadRoom(); void fetchNewMessages(); }
    };
    let unsubscribe = () => {};
    try { unsubscribe = api.subscribe(id, onEvent); } catch (error) { onError(error); }
    return () => unsubscribe();
  }, [id, isMember, member?.id, fetchNewMessages, appendMessages, loadRoom, onError]);

  // Removed by the host: I was a member, a room update arrives, and now I'm not. Tell me and go home.
  const wasMember = useRef(false);
  const selfExit = useRef(false);
  const leaving = useRef(false);
  useEffect(() => {
    if (!room) return;
    // The room's session is over (closed / cancelled / expired): say why and go home. Not for CONFIRMED.
    if (isEnded(room.status) && !moderation) {
      rememberEnded(room.id, room.status);
      if (leaving.current) return;
      leaving.current = true;
      if (!selfExit.current) toast(endedReason[room.status] ?? '끝난 방이에요.', 'info');
      selfExit.current = true;
      close();
      return;
    }
    if (isMember) { wasMember.current = true; return; }
    if (wasMember.current && !selfExit.current) {
      wasMember.current = false;
      toast('방장이 이 방에서 내보냈어요.', 'info');
      close();
    }
  }, [room, isMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // My own trip gives the route duration for the map bubble; non-members need their active trip to join.
  useEffect(() => {
    if (!room) return;
    if (room.myTripId) { api.trips.get(room.myTripId).then(setMyTrip).catch(() => setMyTrip(null)); return; }
    if (!isMember) api.trips.active().then(t => { setJoinTrip(t); setJoinParty(Math.max(1, Math.min(t?.passengerCount ?? 1, room.seatsLeft, 3))); }).catch(() => setJoinTrip(null));
  }, [room?.myTripId, room?.termsVersion, isMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map: the room's route, fitted above the sheet.
  const mapKey = room ? JSON.stringify([room.routePreview, room.meetingPoint?.location, room.approxOrigin, room.approxDestination, room.termsVersion, myTrip?.route?.durationSeconds, sheetH]) : '';
  useEffect(() => {
    if (!room || sheet.dragging || sheet.expanded || chatMode) return;
    // A member's own trip is unchanged when the host changes the shared destination.
    const duration = room.myRole === 'HOST' && myTrip?.route ? minutesOf(myTrip.route.durationSeconds) : undefined;
    map.setLayers(roomLayers(room, room.routePreview, [], duration));
    map.fit(roomPoints(room, room.routePreview), otwInsets(map.size, sheetH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, sheet.dragging, sheet.expanded, chatMode]);

  const goTo = (i: number) => {
    if (sheet.collapsed) sheet.restore();
    const el = pager.current;
    pagerTarget.current = i;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setPage(i);
    if (i === 1) setUnread(0);
  };
  const onPagerScroll = () => {
    const el = pager.current;
    if (!el || el.clientWidth === 0 || swipe.current?.horizontal) return;
    // A smooth tab change crosses the old page first. Keep the chosen page height stable until arrival.
    if (pagerTarget.current !== null) {
      if (Math.abs(el.scrollLeft - pagerTarget.current * el.clientWidth) > 2) return;
      pagerTarget.current = null;
    }
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== pageRef.current) { setPage(i); if (i === 1) setUnread(0); }
  };

  // Own only horizontal gestures; the browser keeps vertical message scrolling and text selection.
  const swipeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('input, textarea, button, a, select, [data-no-swipe]')) return;
    pagerTarget.current = null;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, page: pageRef.current, horizontal: false };
  };
  const swipeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.horizontal) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return; }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      start.horizontal = true; setSwiping(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = start.left - dx;
  };
  const swipeEnd = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    swipe.current = null; setSwiping(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (start.horizontal) {
      const dx = event.clientX - start.x;
      const next = cancelled ? start.page : Math.abs(dx) >= 40 ? Math.min(1, Math.max(0, start.page + (dx < 0 ? 1 : -1))) : start.page;
      goTo(next);
    }
  };

  if (!room) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <section className="pointer-events-auto absolute inset-x-0 bottom-0 grid place-items-center rounded-t-sheet bg-white shadow-sheet" style={{ height: sheetH }}><Spinner text="방 정보를 불러오는 중…" /></section>
      </div>
    );
  }

  const isHost = room.myRole === 'HOST';
  const act = async (fn: () => Promise<RoomDetail>, done?: string) => {
    const updated = await run(fn);
    if (updated) { setRoom(updated); if (done) toast(done, 'info'); }
    return updated;
  };
  const leave = async () => {
    if (!window.confirm('이 방에서 나갈까요?')) return;
    selfExit.current = true;
    if (await act(() => api.rooms.leave(room.id), '방에서 나왔어요.')) close();
  };
  /** 이동 완료 (members): end my confirmed ride; the room leaves "현재 내 방" and a new ride can start. */
  const finishRide = async () => {
    if (!window.confirm('이동을 마쳤나요? 이 동행이 현재 내 방에서 빠지고, 새 동행을 시작할 수 있어요.')) return;
    selfExit.current = true;
    if (await act(() => api.rooms.finish(room.id), '이동을 마쳤어요. 함께해 주셔서 고마워요!')) close();
    else selfExit.current = false;
  };
  const cancelRoom = async () => {
    if (!window.confirm('방을 취소할까요? 참여자 모두에게 취소가 알려져요.')) return;
    selfExit.current = true;
    if (!(await act(() => api.rooms.cancel(room.id), '방을 취소했어요.'))) selfExit.current = false;
  };
  const join = async () => {
    if (!joinTrip) return;
    if (await act(() => api.rooms.join(room.id, { tripId: joinTrip.id, passengerCount: joinParty }), '방에 참여했어요!')) void fetchNewMessages();
  };

  const departed = Date.parse(room.departureAt) - now;
  const timerText = ['CLOSED', 'CANCELLED', 'EXPIRED'].includes(room.status) ? roomStatusInfo[room.status].label : formatCountdown(departed);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* After 동승 확정 the participant stays in the ride until 이동 완료 (which goes home itself): no way back to the main screen. */}
      {!(isMember && room.status === 'CONFIRMED' && !moderation) && (
        <button type="button" onClick={close} aria-label="홈으로"
          className={`ease-sheet pointer-events-auto absolute left-0 z-[60] top-[max(48px,env(safe-area-inset-top))] grid h-14 w-12 place-items-center rounded-r-full bg-ink pr-1 text-white shadow-float transition duration-500 ${shown ? 'translate-x-0' : '-translate-x-full'}`}>
          <ChevronLeftIcon size={22} />
        </button>
      )}

      <section data-draggable-sheet aria-label="이동 중" style={sheetStyle}
        className={`ease-sheet pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-white shadow-sheet transition-[height,transform] duration-500 ${shown ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* timer pill: time left until departure */}
        <div className="absolute left-1/2 top-0 flex h-12 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-ink px-6 text-white shadow-float [--clock-hand:#151515]" role="timer" aria-label="출발까지 남은 시간">
          <ClockIcon size={20} className="text-white" />
          <span className="text-[1.25rem] font-semibold tabular-nums tracking-tight">{timerText}</span>
        </div>

        <div className="shrink-0 pt-5"><SheetHandle controls={sheet} /></div>
        <div className={`shrink-0 px-5 pt-1 ${chatMode ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between">
            <span className="min-w-0 truncate text-sm font-semibold">{sheet.collapsed ? destinationTitle(room) : '목적지'}</span>
          </div>
          {!sheet.collapsed && <div className="mt-1 flex h-10 items-center gap-3">
            <ArrowIcon size={22} className="-scale-x-100 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[1.125rem] font-medium">{destinationTitle(room)}</span>
            <RoomStatusChip status={room.status} />
            {page === 0 && unread > 0 && (
              <button type="button" onClick={() => goTo(1)} aria-label={`새 메시지 ${unread}개`}
                className="animate-pop relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-sun shadow-float">
                <ChatIcon size={22} />
                <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-sun px-1 text-[0.6875rem] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>
              </button>
            )}
          </div>}
          {!sheet.collapsed && <div className="mt-2 flex gap-2 border-b border-line pb-2" role="tablist" aria-label="방 화면">
            <button type="button" role="tab" aria-selected={page === 0} onClick={() => goTo(0)} className={`min-h-10 flex-1 rounded-full text-sm font-semibold ${page === 0 ? 'bg-ink text-white' : 'bg-fog text-mute'}`}>방 정보</button>
            <button type="button" role="tab" aria-selected={page === 1} onClick={() => goTo(1)} className={`min-h-10 flex-1 rounded-full text-sm font-semibold ${page === 1 ? 'bg-ink text-white' : 'bg-fog text-mute'}`}>채팅{unread > 0 ? ` · ${unread}` : ''}</button>
          </div>}
        </div>

        <div aria-hidden={sheet.collapsed} className={`relative min-h-0 flex-1 overflow-hidden ${sheet.collapsed ? 'invisible pointer-events-none' : ''}`}>
          <div ref={pager} onScroll={onPagerScroll} onPointerDown={swipeStart} onPointerMove={swipeMove} onPointerUp={e => swipeEnd(e)} onPointerCancel={e => swipeEnd(e, true)} onLostPointerCapture={e => swipeEnd(e, true)} style={{ touchAction: 'pan-y', scrollSnapType: swiping ? 'none' : 'x mandatory' }} className="no-scrollbar flex h-full overflow-x-auto overscroll-x-contain">
            <div className="no-scrollbar h-full w-full shrink-0 snap-start overflow-y-auto overscroll-y-contain px-5 pb-6 pt-3">
              <RideInfo room={room} myId={member?.id} busy={busy} onAct={act} onReload={loadRoom} onEdit={() => setEditing(true)} onReport={setReport}
                onOpenOngoing={() => room.ongoingRideRoomId && navigate(`/rooms/${room.ongoingRideRoomId}`)}
                joinTrip={joinTrip} party={joinParty} onParty={setJoinParty} onJoin={join} />
            </div>
            <div className={`flex h-full w-full shrink-0 snap-start flex-col px-6 pb-2 ${chatMode ? 'pt-8' : 'pt-3'}`}>
              {isMember
                ? <Chat key={room.id} room={room} onSaved={setRoom} roomId={room.id} readOnly={room.readOnly} messages={messages} myId={member?.id} onSent={m => appendMessages([m])} onReport={setReport} active={page === 1} />
                : <div className="grid flex-1 place-items-center text-center text-sm text-mute">참여한 사람만 채팅을 볼 수 있어요.</div>}
            </div>
          </div>
        </div>

        <div className={`shrink-0 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 ${chatMode || sheet.collapsed ? 'hidden' : ''}`}>
          <PageBars count={2} active={page} onSelect={goTo} />
          {isMember && !room.readOnly && (
            <button type="button" className="mt-2 min-h-10 w-full rounded-full bg-fog text-sm font-semibold text-mute-dark" disabled={busy} onClick={isHost ? cancelRoom : leave}>{isHost ? '방 취소' : '방 나가기'}</button>
          )}
          {isMember && !isHost && room.status === 'CONFIRMED' && (
            <button type="button" className="btn-ink mt-4 w-full" disabled={busy} onClick={finishRide}>이동 완료</button>
          )}
          {isHost && room.status === 'CONFIRMED' && (
            <button type="button" className="btn-ink mt-4 w-full" disabled={busy}
              onClick={() => { if (window.confirm('이동을 마치고 방을 닫을까요?')) { selfExit.current = true; void act(() => api.rooms.close(room.id), '방을 닫았어요. 함께해 주셔서 고마워요!').then(r => { if (!r) selfExit.current = false; }); } }}>
              이동 완료 · 방 닫기
            </button>
          )}
        </div>
      </section>

      {editing && <PlanEditor room={room} start={{ name: originTitle(room), kind: 'CUSTOM', location: room.myRole === 'HOST' && myTrip ? myTrip.origin.location : room.approxOrigin, address: null }} onClose={() => setEditing(false)} onSaved={r => { setRoom(r); setEditing(false); toast('약속을 바꿨어요. 모두 다시 확정해야 해요.', 'info'); }} />}
      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- page 1: fare, people, meeting point, 전원 확정

function RideInfo({ room, myId, busy, onAct, onReload, onEdit, onReport, joinTrip, party, onParty, onJoin, onOpenOngoing }: {
  room: RoomDetail; myId?: string; busy: boolean; joinTrip: TripIntent | null; onOpenOngoing(): void;
  party: number; onParty(n: number): void;
  onAct(fn: () => Promise<RoomDetail>, done?: string): Promise<RoomDetail | undefined>; onReload(): void; onEdit(): void; onReport(t: ReportTarget): void; onJoin(): void;
}) {
  const { toast } = useApp();
  const onError = useErrorHandler();
  const { run } = useAction();
  const isMember = room.myRole !== 'NONE';
  const isHost = room.myRole === 'HOST';
  const joinable = room.status === 'OPEN' || room.status === 'COORDINATING';
  const people = room.participants.filter(p => p.status === 'ACTIVE');
  const me = people.find(p => p.memberId === myId);
  const perPerson = perPersonFare(room.estimatedTaxiFareWon, riders(room) + (!isMember && room.canJoin ? party : 0));
  const confirmedCount = people.filter(p => p.confirmed).length;

  const confirm = async () => {
    try {
      const updated = await api.rooms.confirm(room.id, { termsVersion: room.termsVersion });
      await onAct(async () => updated);
      toast(updated.status === 'CONFIRMED' ? '모두 확정했어요! 약속 장소에서 만나요.' : '확정했어요. 다른 사람을 기다리는 중이에요.', 'info');
    } catch (error) {
      if (isApiError(error, 'TERMS_VERSION_MISMATCH')) onReload();
      onError(error);
    }
  };
  const remove = (memberId: string, nickname: string) => {
    if (window.confirm(`${nickname}님을 방에서 내보낼까요?`)) void onAct(() => api.rooms.remove(room.id, memberId));
  };
  const addDemo = async () => {
    await run(async () => { const mock = await import('../../api/mockClient'); await mock.addDemoParticipant(room.id); });
    onReload();
  };

  return (
    <div className="space-y-4">
      <GenderChip enabled={room.sameGenderOnly} />
      {/* fare + seats (replaces the mockup's car block) */}
      <div className="flex items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[0.8125rem] text-mute">예상 1인 요금</div>
          <div className="mt-1 text-[1.875rem] font-bold leading-none tracking-[-0.03em]">{perPerson != null ? formatWon(perPerson) : '요금 정보 없음'}</div>
          {room.estimatedTaxiFareWon != null && <div className="mt-1.5 text-[0.8125rem] text-mute">총 {formatWon(room.estimatedTaxiFareWon)} · {farePolicyLabel[room.terms.farePolicy]}</div>}
          <div className="mt-3 flex items-center gap-1.5 text-[1.0625rem] text-mute-dark"><PersonIcon size={18} className="text-mute" /> {riders(room)}/{room.capacity}</div>
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={room.hostNickname} size={36} />
            <span className="truncate text-[1.0625rem] font-semibold">{room.hostNickname}</span>
            <span className="shrink-0 whitespace-nowrap text-xs text-mute">방장</span>
          </div>
        </div>
        <SeatMap filled={room.capacity - room.seatsLeft} capacity={room.capacity} />
      </div>

      {/* meeting point */}
      <div className="rounded-card border border-line p-5">
        <div className="flex items-center justify-between">
          <span className="text-[0.8125rem] text-mute">만나는 곳</span>
          <span className="text-[0.8125rem] text-mute">{formatTime(room.departureAt)} 출발</span>
        </div>
        <div className="mt-2 flex items-start gap-3">
          <PinIcon size={22} className="text-ink" />
          <div className="min-w-0">
            <div className="text-[1.0625rem] font-semibold">{room.meetingPoint ? room.meetingPoint.name : originTitle(room)}</div>
            <div className="text-[0.8125rem] text-mute">
              {room.meetingPoint ? meetingKindLabel[room.meetingPoint.kind] : '방 출발지'}
              {room.terms.luggageAllowed ? ' · 큰 짐 가능' : ' · 큰 짐 어려움'}
            </div>
          </div>
        </div>
        {room.terms.note && <p className="mt-3 rounded-2xl bg-fog-soft px-4 py-3 text-[0.875rem] leading-relaxed">“{room.terms.note}”</p>}
        {isHost && joinable && (
          <button type="button" className="btn-fog mt-4 h-12 w-full text-[0.9375rem] text-ink" onClick={onEdit}>약속 바꾸기</button>
        )}
      </div>

      {/* 전원 확정 */}
      {isMember && (
        <div>
          <div className="flex items-end justify-between">
            <h3 className="text-[1.1875rem] font-bold tracking-tight">전원 확정</h3>
            <span className="text-[0.8125rem] text-mute">약속 v{room.termsVersion} · {confirmedCount}/{people.length} 확정</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fog">
            <div className="h-full rounded-full bg-sun-deep transition-all duration-500" style={{ width: `${people.length ? (confirmedCount / people.length) * 100 : 0}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-line">
            {people.map((p, i) => (
              <li key={p.memberId || i} className="flex items-center gap-3 py-3">
                <Avatar name={p.nickname} size={34} tone={p.confirmed ? 'ink' : 'fog'} />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                  {p.nickname}{p.memberId === myId && <span className="text-mute"> (나)</span>}{p.role === 'HOST' && <span className="text-xs text-mute"> · 방장</span>}{p.passengerCount > 1 && <span className="text-xs text-mute"> · 일행 포함 {p.passengerCount}명</span>}
                </span>
                {p.confirmed ? <span className="chip bg-ink text-sun"><CheckIcon size={14} className="mr-0.5" />확정</span> : <span className="chip">대기</span>}
                {isHost && joinable && p.role !== 'HOST' && p.memberId && <button type="button" className="text-xs font-semibold text-mute" onClick={() => remove(p.memberId, p.nickname)}>내보내기</button>}
                {p.memberId && p.memberId !== myId && <button type="button" className="text-xs text-mute" onClick={() => onReport({ type: 'MEMBER', id: p.memberId, preview: p.nickname })}>신고</button>}
              </li>
            ))}
          </ul>
          {isMock && isHost && joinable && room.seatsLeft > 0 && (
            <button type="button" className="btn-text mt-1" disabled={busy} onClick={addDemo}>+ 데모 참여자 추가 (MOCK)</button>
          )}
          {joinable && (
            <div className="mt-3 space-y-2">
              {me?.confirmed ? (
                <Notice>v{room.termsVersion} 약속에 확정했어요.{room.allConfirmed ? '' : ' 다른 사람의 확정을 기다리는 중이에요.'}</Notice>
              ) : (
                <>
                  {!room.meetingPoint && <Notice tone="warn">방장이 만날 장소를 정해야 확정할 수 있어요.</Notice>}
                  {people.length < 2 && <Notice>2명 이상 모이면 확정할 수 있어요.</Notice>}
                  <button type="button" className="btn-sun w-full" disabled={!room.canConfirm || busy} onClick={confirm}>v{room.termsVersion} 약속으로 확정하기</button>
                </>
              )}
            </div>
          )}
          {room.status === 'CONFIRMED' && <Notice>모두 확정했어요. 약속 장소에서 만나 함께 택시를 잡으세요. 이제 약속과 채팅은 바꿀 수 없어요. 이동을 마치면 아래 ‘이동 완료’를 눌러 주세요. 그러면 메인 화면으로 돌아가고 새 동행을 시작할 수 있어요.</Notice>}
        </div>
      )}

      {!isMember && (
        room.ongoingRideRoomId
          ? <div className="space-y-2">
              <Notice>확정된 동행이 아직 끝나지 않아 이 방에 합류할 수 없어요. 이동을 마치고 ‘이동 완료’를 누른 뒤 다시 시도해 주세요.</Notice>
              <button type="button" className="btn-fog w-full" onClick={onOpenOngoing}>진행 중인 동행 보기</button>
            </div>
          : room.canJoin
          ? joinTrip
            ? <div className="space-y-3"><PassengerCount value={party} max={room.seatsLeft} onChange={onParty} disabled={busy} /><button type="button" className="btn-ink w-full" disabled={busy || party > room.seatsLeft} onClick={onJoin}>{party}명 함께 합류하기</button></div>
            : <Notice>참여하려면 홈에서 출발지와 도착지를 먼저 검색해 주세요.</Notice>
          : <Notice>{roomStatusInfo[room.status].desc}</Notice>
      )}

      <div className="space-y-2 pb-2">
        <p className="text-xs leading-relaxed text-mute">{FARE_DISCLAIMER}</p>
        <button type="button" className="text-xs font-semibold text-mute underline" onClick={() => onReport({ type: 'ROOM', id: room.id, preview: `${originTitle(room)} → ${destinationTitle(room)}` })}>이 방 신고하기</button>
      </div>
    </div>
  );
}

/** Taxi seats (front 1 + back 2) on the mockup's yellow block; filled seats are taken. */
function SeatMap({ filled, capacity }: { filled: number; capacity: number }) {
  const seats = Array.from({ length: Math.max(capacity, 1) }, (_, i) => i < filled);
  const front = seats.slice(0, 1), back = seats.slice(1);
  const seat = (taken: boolean, i: number) => (
    <span key={i} className={`grid h-11 w-11 place-items-center rounded-2xl transition ${taken ? 'bg-ink text-sun' : 'border-2 border-dashed border-ink/25 text-ink/30'}`}>
      <PersonIcon size={20} />
    </span>
  );
  return (
    <div className="flex w-[8.25rem] shrink-0 flex-col items-center justify-center gap-3 rounded-card bg-gradient-to-b from-sun to-sun-pale px-3 py-4" aria-label={`좌석 ${filled}/${capacity}`}>
      <div className="flex w-full justify-end pr-2">{front.map(seat)}</div>
      <div className="flex gap-2">{back.map((t, i) => seat(t, i + 1))}</div>
      <span className="text-[0.6875rem] font-semibold text-ink/60">앞 1 · 뒤 {Math.max(0, capacity - 1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- page 2: chat

function Chat({ room, onSaved, roomId, readOnly, messages, myId, onSent, onReport, active }: {
  room: RoomDetail; onSaved(room: RoomDetail): void;
  roomId: string; readOnly: boolean; messages: Message[]; myId?: string; active: boolean;
  onSent(m: Message): void; onReport(t: ReportTarget): void;
}) {
  const { busy, run } = useAction();
  const [text, setText] = useState('');
  // Reused for retries of the same text, so a resend after a failure cannot duplicate the message.
  const clientId = useRef<string>(crypto.randomUUID());
  const list = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => { const el = list.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: active ? 'smooth' : 'auto' }); }, [messages.length, active]);
  // The list shrinks/grows with the keyboard and the sheet; stay on the newest message if we were there.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (pinned.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    const sent = await run(() => api.messages.send(roomId, { body, clientMessageId: clientId.current }));
    if (sent) { onSent(sent); setText(''); clientId.current = crypto.randomUUID(); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-y-contain py-2">
        <p id="chat-privacy" className="px-4 text-center text-[0.7188rem] leading-relaxed text-mute">전화번호 등 개인정보는 채팅에 공유하지 마세요.</p>
        {messages.length === 0 && <p className="pt-8 text-center text-sm text-mute">아직 메시지가 없어요. 먼저 인사해 보세요.</p>}
        {messages.map(m => {
          if (m.type === 'SYSTEM') return <div key={m.id} className="px-6 text-center text-xs leading-relaxed text-mute">{m.body}</div>;
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="mb-1 ml-1 text-xs font-medium text-mute">{m.senderNickname}</span>}
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[0.9375rem] leading-snug ${m.hidden || m.body === null ? 'bg-fog-soft italic text-mute' : mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-fog'}`}>
                {m.senderNickname?.startsWith('탈퇴회원-') ? '탈퇴한 이웃의 메시지예요.' : m.hidden ? '운영 정책에 따라 가려진 메시지예요.' : m.body ?? '삭제된 메시지예요.'}
              </div>
              <div className="mt-0.5 flex gap-2 px-1 text-[0.625rem] text-mute">
                <span>{formatClock(m.createdAt)}</span>
                {!mine && !m.hidden && m.body !== null && <button type="button" className="underline" onClick={() => onReport({ type: 'MESSAGE', id: m.id, preview: m.body ?? '' })}>신고</button>}
              </div>
            </div>
          );
        })}
      </div>
      <ChatPlaceCard room={room} messages={messages} myId={myId} onSaved={onSaved} onSent={onSent} />
      {readOnly ? (
        <p className="shrink-0 rounded-2xl bg-fog-soft px-4 py-3 text-center text-[0.8125rem] text-mute">확정·종료된 방은 채팅이 잠겨요.</p>
      ) : (
        <form onSubmit={send} className="flex shrink-0 items-center gap-2 pt-2">
          <input value={text} maxLength={500} onChange={e => { setText(e.target.value); }} placeholder="메시지 보내기" aria-describedby="chat-privacy"
            className="h-12 min-w-0 flex-1 rounded-full bg-fog px-5 text-[0.9375rem] outline-none placeholder:text-mute focus:ring-2 focus:ring-ink" />
          <button type="submit" aria-label="보내기" disabled={busy || !text.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-sun transition active:scale-95 disabled:bg-line disabled:text-white">
            <SendIcon size={20} />
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- host: meeting point / plan

function PlanEditor({ room, start, onClose, onSaved }: { room: RoomDetail; start: MeetingPoint; onClose(): void; onSaved(r: RoomDetail): void }) {
  const { busy, run } = useAction();
  // Default: where everyone already is — the current meeting place, else the room's start.
  const current = room.meetingPoint ?? start;
  const [point, setPoint] = useState<MeetingPoint>(current);
  const [departure, setDeparture] = useState(() => toLocalInput(new Date(room.departureAt)));
  const [pickTime, setPickTime] = useState(false);
  const [luggageAllowed, setLuggageAllowed] = useState(room.terms.luggageAllowed);
  const [note, setNote] = useState(room.terms.note ?? '');

  const save = async () => {
    const updated = await run(() => api.rooms.plan(room.id, {
      meetingPoint: point, departureAt: toOffsetIso(new Date(departure)),
      terms: { farePolicy: room.terms.farePolicy, luggageAllowed, note: note.trim() || null },
    }));
    if (updated) onSaved(updated);
  };
  const same = (x: MeetingPoint, y: MeetingPoint) => x.name === y.name && x.location.lat === y.location.lat && x.location.lng === y.location.lng;

  return (
    <Sheet title="약속 바꾸기" onClose={onClose} tall>
      <div className="space-y-6">
      <GenderChip enabled={room.sameGenderOnly} />
        <Group title="만날 장소">
          <div className="space-y-2">
            <PointOption selected={same(point, current)} title={current.name} sub={room.meetingPoint ? '지금 약속 장소' : '방 출발지'} onClick={() => setPoint(current)} />
            {!same(point, current) && <PointOption selected title={point.name} sub={point.address || '새로 고른 장소'} onClick={() => {}} />}
          </div>
          <MeetingSearch near={current.location} onPick={p => setPoint({ name: p.name ?? '약속 장소', kind: 'CUSTOM', location: p.location, address: p.address ?? null })} />
        </Group>
        <Group title="출발 시간">
          <button type="button" onClick={() => setPickTime(v => !v)} aria-expanded={pickTime}
            className="flex w-full items-center justify-between rounded-2xl bg-fog-soft px-4 py-3.5 text-left ring-1 ring-line">
            <span className="text-[0.9375rem] font-semibold">{formatLocalChoice(departure)}</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-mute-dark"><ClockIcon size={16} />{pickTime ? '닫기' : '바꾸기'}</span>
          </button>
          {pickTime && (
            <div className="mt-2 rounded-2xl bg-fog-soft px-3 pb-3 pt-2">
              <DateTimePicker value={departure} onChange={setDeparture} min={new Date()} max={new Date(Date.now() + 7 * 86400000)} />
            </div>
          )}
        </Group>
        <Group title="방 소개">
          <textarea className="field min-h-[5.5rem] resize-none" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="함께 탈 이웃에게 한마디 (200자)" />
          <Toggle checked={luggageAllowed} onChange={setLuggageAllowed} label="큰 짐(캐리어 등) 괜찮아요" />
        </Group>
        <Notice tone="warn">저장하면 약속이 v{room.termsVersion + 1}로 바뀌고, 모두의 확정이 초기화돼요.</Notice>
        <button type="button" className="btn-ink w-full" disabled={busy} onClick={save}>약속 저장</button>
      </div>
    </Sheet>
  );
}

/** Search a different meeting place (public place / building), biased to the current one. */
function MeetingSearch({ near, onPick }: { near: LatLng; onPick(p: PlaceRef): void }) {
  const onError = useErrorHandler();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceRef[] | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.places.search(q, near).then(r => { if (!cancelled) setResults(r); }).catch(e => { if (!cancelled) { setResults([]); onError(e); } });
    }, 280);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, near, onError]);
  return (
    <div className="mt-3">
      <label className="flex h-12 items-center gap-3 rounded-2xl bg-fog px-4">
        <SearchIcon size={18} className="text-mute" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="다른 장소 검색 (역·건물 이름)" className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-mute" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="지우기" className="text-mute"><CloseIcon size={16} /></button>}
      </label>
      {results && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-line">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-mute">검색 결과가 없어요</li>}
          {results.map((p, i) => (
            <li key={p.providerPlaceId ?? i} className="border-b border-line last:border-0">
              <button type="button" className="w-full px-4 py-3 text-left" onClick={() => { onPick(p); setQuery(''); }}>
                <span className="block truncate text-[0.9375rem] font-semibold">{p.name}</span>
                {p.address && <span className="block truncate text-xs text-mute">{p.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div><h3 className="mb-2 text-[0.8125rem] font-semibold text-mute">{title}</h3>{children}</div>;
}

function PointOption({ selected, title, sub, badge, onClick }: { selected: boolean; title: string; sub: string; badge?: string; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${selected ? 'bg-ink text-white' : 'bg-fog-soft'}`}>
      <PinIcon size={20} className={selected ? 'text-sun' : 'text-mute'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold">{title}</span>
        <span className={`block truncate text-xs ${selected ? 'text-white/60' : 'text-mute'}`}>{sub}</span>
      </span>
      {badge && <span className={`chip ${selected ? 'bg-sun text-ink' : 'bg-white'}`}>{badge}</span>}
    </button>
  );
}
