import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, isMock } from '../api';
import type { MeetingPoint, MeetingPointSuggestion, Message, RoomDetail, RoomEvent, TripIntent } from '../api/contract';
import { useAction, useApp, useErrorHandler } from '../lib/app';
import { isApiError } from '../lib/errors';
import { farePolicyLabel, formatClock, formatCountdown, formatTime, formatWon, meetingKindLabel, minutesOf, perPersonFare, roomStatusInfo, toLocalInput, toOffsetIso , destinationTitle, originTitle } from '../lib/format';
import { useMap } from '../components/map/MapLayout';
import ReportDialog, { type ReportTarget } from '../components/ReportDialog';
import { ArrowIcon, ChatIcon, CheckIcon, ChevronLeftIcon, ClockIcon, PersonIcon, PinIcon, SendIcon } from '../components/icons';
import { Avatar, FARE_DISCLAIMER, Notice, PageBars, RoomStatusChip, Sheet, Spinner, Toggle, useSlideIn } from '../components/ui';
import { otwInsets, otwSheetHeight } from './layout';
import { SheetHandle, useSheetDrag } from './useSheetDrag';
import { roomLayers, roomPoints } from './SelectSheet';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export default function OnTheWayScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const map = useMap();
  const { member, toast } = useApp();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const { shown, close } = useSlideIn(() => navigate('/'), 420);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myTrip, setMyTrip] = useState<TripIntent | null>(null);
  const [joinTrip, setJoinTrip] = useState<TripIntent | null>(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [page, setPage] = useState(0);
  const [unread, setUnread] = useState(0);
  const pageRef = useRef(0);
  pageRef.current = page;
  const pager = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | undefined>(undefined);
  const now = useNow();

  const isMember = !!room && room.myRole !== 'NONE';
  const sheet = useSheetDrag(map.size, otwSheetHeight(map.size), 'otw');
  const sheetH = sheet.settledHeight;
  useEffect(() => { map.setCover(sheet.progress, sheet.dragging); }, [map, sheet.progress, sheet.dragging]);
  useEffect(() => { map.setAttributionInset(sheet.style.height, sheet.dragging); }, [map, sheet.style.height, sheet.dragging]);
  useEffect(() => () => map.setCover(0), [map]);

  const loadRoom = useCallback(async () => {
    try { setRoom(await api.rooms.get(id)); } catch (error) { onError(error); }
  }, [id, onError]);

  const appendMessages = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages(list => {
      const seen = new Set(list.map(m => m.id));
      const next = [...list, ...incoming.filter(m => !seen.has(m.id))];
      lastId.current = next[next.length - 1]?.id;
      return next;
    });
  }, []);
  const fetchNewMessages = useCallback(async () => {
    try { appendMessages(await api.messages.list(id, lastId.current)); } catch { /* chat refresh is best-effort */ }
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

  // My own trip gives the route duration for the map bubble; non-members need their active trip to join.
  useEffect(() => {
    if (!room) return;
    if (room.myTripId) { api.trips.get(room.myTripId).then(setMyTrip).catch(() => setMyTrip(null)); return; }
    if (!isMember) api.trips.active().then(setJoinTrip).catch(() => setJoinTrip(null));
  }, [room?.myTripId, isMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map: the room's route, fitted above the sheet.
  const mapKey = room ? JSON.stringify([room.routePreview.length, room.meetingPoint?.location, room.approxOrigin, myTrip?.route?.durationSeconds, sheetH]) : '';
  useEffect(() => {
    if (!room || sheet.dragging || sheet.expanded) return;
    const duration = myTrip?.route ? minutesOf(myTrip.route.durationSeconds) : undefined;
    map.setLayers(roomLayers(room, room.routePreview, [], duration));
    map.fit(roomPoints(room, room.routePreview), otwInsets(map.size, sheetH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, sheet.dragging, sheet.expanded]);

  const goTo = (i: number) => {
    const el = pager.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setPage(i);
    if (i === 1) setUnread(0);
  };
  const onPagerScroll = () => {
    const el = pager.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== pageRef.current) { setPage(i); if (i === 1) setUnread(0); }
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
    if (await act(() => api.rooms.leave(room.id), '방에서 나왔어요.')) close();
  };
  const cancelRoom = async () => {
    if (!window.confirm('방을 취소할까요? 참여자 모두에게 취소가 알려져요.')) return;
    if (await act(() => api.rooms.cancel(room.id), '방을 취소했어요.')) close();
  };
  const join = async () => {
    if (!joinTrip) return;
    if (await act(() => api.rooms.join(room.id, { tripId: joinTrip.id }), '방에 참여했어요!')) void fetchNewMessages();
  };

  const departed = Date.parse(room.departureAt) - now;
  const timerText = ['CLOSED', 'CANCELLED', 'EXPIRED'].includes(room.status) ? roomStatusInfo[room.status].label : formatCountdown(departed);

  return (
    <div className="pointer-events-none absolute inset-0">
      <button type="button" onClick={close} aria-label="홈으로"
        className={`ease-sheet pointer-events-auto absolute left-0 z-[60] top-[max(48px,env(safe-area-inset-top))] grid h-14 w-12 place-items-center rounded-r-full bg-ink pr-1 text-white shadow-float transition duration-500 ${shown ? 'translate-x-0' : '-translate-x-full'}`}>
        <ChevronLeftIcon size={22} />
      </button>

      <section aria-label="이동 중" style={sheet.style}
        className={`ease-sheet pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-white shadow-sheet transition-[height,transform] duration-500 ${shown ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* timer pill: time left until departure */}
        <div className="absolute left-1/2 top-0 flex h-12 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-ink px-6 text-white shadow-float [--clock-hand:#151515]" role="timer" aria-label="출발까지 남은 시간">
          <ClockIcon size={20} className="text-white" />
          <span className="text-[20px] font-semibold tabular-nums tracking-tight">{timerText}</span>
        </div>

        <div className="shrink-0 pt-6"><SheetHandle controls={sheet} /></div>
        <div className="shrink-0 px-6 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-mute">목적지</span>
            <RoomStatusChip status={room.status} />
          </div>
          <div className="mt-2 flex h-12 items-center gap-4">
            <ArrowIcon size={22} className="-scale-x-100 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[18px] font-medium">{destinationTitle(room)}</span>
            {page === 0 && unread > 0 && (
              <button type="button" onClick={() => goTo(1)} aria-label={`새 메시지 ${unread}개`}
                className="animate-pop relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-sun shadow-float">
                <ChatIcon size={22} />
                <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-sun px-1 text-[11px] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>
              </button>
            )}
          </div>
          <div className="mt-3 border-t border-line" />
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={pager} onScroll={onPagerScroll} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
            <div className="no-scrollbar h-full w-full shrink-0 snap-start overflow-y-auto px-6 pb-12 pt-5">
              <RideInfo room={room} myId={member?.id} busy={busy} onAct={act} onReload={loadRoom} onEdit={() => setEditing(true)} onReport={setReport}
                joinTrip={joinTrip} onJoin={join} />
            </div>
            <div className="flex h-full w-full shrink-0 snap-start flex-col px-6 pb-2 pt-3">
              {isMember
                ? <Chat roomId={room.id} readOnly={room.readOnly} messages={messages} myId={member?.id} onSent={m => appendMessages([m])} onReport={setReport} active={page === 1} />
                : <div className="grid flex-1 place-items-center text-center text-sm text-mute">참여한 사람만 채팅을 볼 수 있어요.</div>}
            </div>
          </div>
        </div>

        <div className="shrink-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          <PageBars count={2} active={page} onSelect={goTo} />
          {isMember && !room.readOnly && (
            <button type="button" className="btn-fog mt-4 w-full" disabled={busy} onClick={isHost ? cancelRoom : leave}>{isHost ? '방 취소' : '방 나가기'}</button>
          )}
          {isHost && room.status === 'CONFIRMED' && (
            <button type="button" className="btn-ink mt-4 w-full" disabled={busy}
              onClick={() => { if (window.confirm('이동을 마치고 방을 닫을까요?')) void act(() => api.rooms.close(room.id), '방을 닫았어요. 함께해 주셔서 고마워요!'); }}>
              이동 완료 · 방 닫기
            </button>
          )}
        </div>
      </section>

      {editing && <PlanEditor room={room} onClose={() => setEditing(false)} onSaved={r => { setRoom(r); setEditing(false); toast('약속을 바꿨어요. 모두 다시 확정해야 해요.', 'info'); }} />}
      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- page 1: fare, people, meeting point, 전원 확정

function RideInfo({ room, myId, busy, onAct, onReload, onEdit, onReport, joinTrip, onJoin }: {
  room: RoomDetail; myId?: string; busy: boolean; joinTrip: TripIntent | null;
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
  const perPerson = perPersonFare(room.estimatedTaxiFareWon, room.participantCount);
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
    await run(async () => { const mock = await import('../api/mockClient'); await mock.addDemoParticipant(room.id); });
    onReload();
  };

  return (
    <div className="space-y-6">
      {/* fare + seats (replaces the mockup's car block) */}
      <div className="flex items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-mute">예상 1인 요금</div>
          <div className="mt-1 text-[30px] font-bold leading-none tracking-[-0.03em]">{perPerson != null ? formatWon(perPerson) : '요금 정보 없음'}</div>
          {room.estimatedTaxiFareWon != null && <div className="mt-1.5 text-[13px] text-mute">총 {formatWon(room.estimatedTaxiFareWon)} · {farePolicyLabel[room.terms.farePolicy]}</div>}
          <div className="mt-3 flex items-center gap-1.5 text-[17px] text-mute-dark"><PersonIcon size={18} className="text-mute" /> {room.participantCount}/{room.capacity}</div>
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={room.hostNickname} size={36} />
            <span className="truncate text-[17px] font-semibold">{room.hostNickname}</span>
            <span className="shrink-0 whitespace-nowrap text-xs text-mute">방장</span>
          </div>
        </div>
        <SeatMap filled={room.capacity - room.seatsLeft} capacity={room.capacity} />
      </div>

      {/* meeting point */}
      <div className="rounded-card border border-line p-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-mute">만나는 곳</span>
          <span className="text-[13px] text-mute">{formatTime(room.departureAt)} 출발</span>
        </div>
        <div className="mt-2 flex items-start gap-3">
          <PinIcon size={22} className={room.meetingPoint ? 'text-ink' : 'text-line'} />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold">{room.meetingPoint ? room.meetingPoint.name : '아직 정하지 않았어요'}</div>
            <div className="text-[13px] text-mute">
              {room.meetingPoint ? meetingKindLabel[room.meetingPoint.kind] : isHost ? '참여자들이 걷기 좋은 곳을 추천해 드려요.' : '방장이 정하면 알려드릴게요.'}
              {room.terms.luggageAllowed ? ' · 큰 짐 가능' : ' · 큰 짐 어려움'}
            </div>
          </div>
        </div>
        {room.terms.note && <p className="mt-3 rounded-2xl bg-fog-soft px-4 py-3 text-[14px] leading-relaxed">“{room.terms.note}”</p>}
        {isHost && joinable && (
          <button type="button" className="btn-fog mt-4 h-12 w-full text-[15px] text-ink" onClick={onEdit}>{room.meetingPoint ? '약속 바꾸기' : '만날 장소 정하기'}</button>
        )}
      </div>

      {/* 전원 확정 */}
      {isMember && (
        <div>
          <div className="flex items-end justify-between">
            <h3 className="text-[19px] font-bold tracking-tight">전원 확정</h3>
            <span className="text-[13px] text-mute">약속 v{room.termsVersion} · {confirmedCount}/{people.length} 확정</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fog">
            <div className="h-full rounded-full bg-sun-deep transition-all duration-500" style={{ width: `${people.length ? (confirmedCount / people.length) * 100 : 0}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-line">
            {people.map((p, i) => (
              <li key={p.memberId || i} className="flex items-center gap-3 py-3">
                <Avatar name={p.nickname} size={34} tone={p.confirmed ? 'ink' : 'fog'} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                  {p.nickname}{p.memberId === myId && <span className="text-mute"> (나)</span>}{p.role === 'HOST' && <span className="text-xs text-mute"> · 방장</span>}
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
          {room.status === 'CONFIRMED' && <Notice>모두 확정했어요. 약속 장소에서 만나 함께 택시를 잡으세요. 이제 약속과 채팅은 바꿀 수 없어요.</Notice>}
        </div>
      )}

      {!isMember && (
        room.canJoin
          ? joinTrip
            ? <button type="button" className="btn-ink w-full" disabled={busy} onClick={onJoin}>내 이동으로 참여하기</button>
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
    <div className="flex w-[132px] shrink-0 flex-col items-center justify-center gap-3 rounded-card bg-gradient-to-b from-sun to-sun-pale px-3 py-4" aria-label={`좌석 ${filled}/${capacity}`}>
      <div className="flex w-full justify-end pr-2">{front.map(seat)}</div>
      <div className="flex gap-2">{back.map((t, i) => seat(t, i + 1))}</div>
      <span className="text-[11px] font-semibold text-ink/60">앞 1 · 뒤 {Math.max(0, capacity - 1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- page 2: chat

function Chat({ roomId, readOnly, messages, myId, onSent, onReport, active }: {
  roomId: string; readOnly: boolean; messages: Message[]; myId?: string; active: boolean;
  onSent(m: Message): void; onReport(t: ReportTarget): void;
}) {
  const { busy, run } = useAction();
  const [text, setText] = useState('');
  // Reused for retries of the same text, so a resend after a failure cannot duplicate the message.
  const clientId = useRef<string>(crypto.randomUUID());
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = list.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: active ? 'smooth' : 'auto' }); }, [messages.length, active]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    const sent = await run(() => api.messages.send(roomId, { body, clientMessageId: clientId.current }));
    if (sent) { onSent(sent); setText(''); clientId.current = crypto.randomUUID(); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto py-2">
        {messages.length === 0 && <p className="pt-10 text-center text-sm text-mute">아직 메시지가 없어요. 먼저 인사해 보세요.</p>}
        {messages.map(m => {
          if (m.type === 'SYSTEM') return <div key={m.id} className="px-6 text-center text-xs leading-relaxed text-mute">{m.body}</div>;
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="mb-1 ml-1 text-xs font-medium text-mute">{m.senderNickname}</span>}
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[15px] leading-snug ${m.hidden ? 'bg-fog-soft italic text-mute' : mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-fog'}`}>
                {m.hidden ? '운영 정책에 따라 가려진 메시지예요.' : m.body}
              </div>
              <div className="mt-0.5 flex gap-2 px-1 text-[10px] text-mute">
                <span>{formatClock(m.createdAt)}</span>
                {!mine && !m.hidden && <button type="button" className="underline" onClick={() => onReport({ type: 'MESSAGE', id: m.id, preview: m.body ?? '' })}>신고</button>}
              </div>
            </div>
          );
        })}
      </div>
      {readOnly ? (
        <p className="shrink-0 rounded-2xl bg-fog-soft px-4 py-3 text-center text-[13px] text-mute">확정·종료된 방은 채팅이 잠겨요.</p>
      ) : (
        <form onSubmit={send} className="flex shrink-0 items-center gap-2 pt-2">
          <input value={text} maxLength={500} onChange={e => { setText(e.target.value); }} placeholder="메시지 (전화번호 등 개인정보는 공유하지 마세요)"
            className="h-12 min-w-0 flex-1 rounded-full bg-fog px-5 text-[15px] outline-none placeholder:text-mute focus:ring-2 focus:ring-ink" />
          <button type="submit" aria-label="보내기" disabled={busy || !text.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-sun transition active:scale-95 disabled:bg-line disabled:text-white">
            <SendIcon size={20} />
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- host: meeting point / plan

function PlanEditor({ room, onClose, onSaved }: { room: RoomDetail; onClose(): void; onSaved(r: RoomDetail): void }) {
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const [suggestions, setSuggestions] = useState<MeetingPointSuggestion[] | null>(null);
  const [point, setPoint] = useState<MeetingPoint | null>(room.meetingPoint);
  const [departure, setDeparture] = useState(() => toLocalInput(new Date(room.departureAt)));
  const [luggageAllowed, setLuggageAllowed] = useState(room.terms.luggageAllowed);
  const [note, setNote] = useState(room.terms.note ?? '');
  useEffect(() => { api.rooms.suggestions(room.id).then(setSuggestions).catch(error => { setSuggestions([]); onError(error); }); }, [room.id, onError]);

  const save = async () => {
    if (!point) return;
    const updated = await run(() => api.rooms.plan(room.id, {
      meetingPoint: point, departureAt: toOffsetIso(new Date(departure)),
      terms: { farePolicy: room.terms.farePolicy, luggageAllowed, note: note.trim() || null },
    }));
    if (updated) onSaved(updated);
  };
  const same = (a: MeetingPoint | null, b: MeetingPoint) => !!a && a.name === b.name && a.location.lat === b.location.lat && a.location.lng === b.location.lng;

  return (
    <Sheet title="약속 정하기" onClose={onClose} tall>
      <div className="space-y-6">
        <Group title="만날 장소">
          {suggestions === null && <Spinner text="모두가 걷기 좋은 곳을 찾는 중…" />}
          {suggestions?.length === 0 && <Notice>추천할 공공장소가 없어요.</Notice>}
          <div className="space-y-2">
            {room.meetingPoint && !suggestions?.some(s => same(room.meetingPoint, s.point)) && (
              <PointOption selected={same(point, room.meetingPoint)} title={room.meetingPoint.name} sub="현재 약속 장소" onClick={() => setPoint(room.meetingPoint)} />
            )}
            {suggestions?.map((s, i) => (
              <PointOption key={s.point.id ?? i} selected={same(point, s.point)} title={s.point.name}
                sub={`${meetingKindLabel[s.point.kind]} · 가장 먼 사람 도보 ${s.maxWalkMeters}m${s.walkMinutesMax !== null ? ` · 약 ${s.walkMinutesMax}분${s.walkSource === 'ESTIMATE' ? '(추정)' : ''}` : ''}`}
                badge={s.tier === 'NEAR' ? '200m 이내' : undefined} onClick={() => setPoint(s.point)} />
            ))}
          </div>
        </Group>
        <Group title="출발 시간">
          <input type="datetime-local" className="field" value={departure} onChange={e => setDeparture(e.target.value)} />
        </Group>
        <Group title="방 소개">
          <textarea className="field min-h-[88px] resize-none" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="함께 탈 이웃에게 한마디 (200자)" />
          <Toggle checked={luggageAllowed} onChange={setLuggageAllowed} label="큰 짐(캐리어 등) 괜찮아요" />
        </Group>
        <Notice tone="warn">저장하면 약속이 v{room.termsVersion + 1}로 바뀌고, 모두의 확정이 초기화돼요.</Notice>
        <button type="button" className="btn-ink w-full" disabled={!point || busy} onClick={save}>약속 저장</button>
      </div>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div><h3 className="mb-2 text-[13px] font-semibold text-mute">{title}</h3>{children}</div>;
}

function PointOption({ selected, title, sub, badge, onClick }: { selected: boolean; title: string; sub: string; badge?: string; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${selected ? 'bg-ink text-white' : 'bg-fog-soft'}`}>
      <PinIcon size={20} className={selected ? 'text-sun' : 'text-mute'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{title}</span>
        <span className={`block truncate text-xs ${selected ? 'text-white/60' : 'text-mute'}`}>{sub}</span>
      </span>
      {badge && <span className={`chip ${selected ? 'bg-sun text-ink' : 'bg-white'}`}>{badge}</span>}
    </button>
  );
}
