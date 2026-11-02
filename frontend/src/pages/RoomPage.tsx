import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, isMock } from '../api';
import type { FarePolicy, LatLng, MeetingPoint, MeetingPointSuggestion, Message, RoomDetail, RoomEvent, TripIntent } from '../api/contract';
import { useAction, useApp, useErrorHandler } from '../lib/app';
import { isApiError } from '../lib/errors';
import { farePolicyLabel, formatClock, formatTime, meetingKindLabel, roomStatusInfo, toLocalInput, toOffsetIso } from '../lib/format';
import MapView, { type MapMarker } from '../components/MapView';
import ReportDialog, { type ReportTarget } from '../components/ReportDialog';
import { FARE_DISCLAIMER, Notice, RoomStatusBadge, Segmented, Sheet, Spinner, TierBadge } from '../components/ui';

export default function RoomPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { member, toast } = useApp();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myTrip, setMyTrip] = useState<TripIntent | null>(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const lastId = useRef<string | undefined>(undefined);

  const isMember = !!room && room.myRole !== 'NONE';

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

  useEffect(() => { setMessages([]); lastId.current = undefined; void loadRoom(); }, [loadRoom]);

  // Members: load chat and subscribe to push events (WS in http mode, in-memory emitter in mock mode).
  useEffect(() => {
    if (!isMember) return;
    void fetchNewMessages();
    const onEvent = (event: RoomEvent) => {
      if (event.type === 'MESSAGE_CREATED') appendMessages([event.payload]);
      else if (event.type === 'MESSAGE_HIDDEN') setMessages(list => list.map(m => (m.id === event.payload.messageId ? { ...m, hidden: true, body: null } : m)));
      else { void loadRoom(); void fetchNewMessages(); }
    };
    let unsubscribe = () => {};
    try { unsubscribe = api.subscribe(id, onEvent); } catch (error) { onError(error); }
    return () => unsubscribe();
  }, [id, isMember, fetchNewMessages, appendMessages, loadRoom, onError]);

  // Non-members need their active trip to join.
  useEffect(() => {
    if (!room || isMember) return;
    api.trips.active().then(setMyTrip).catch(() => setMyTrip(null));
  }, [room, isMember]);

  if (!room) return <Spinner />;
  const info = roomStatusInfo[room.status];
  const isHost = room.myRole === 'HOST';
  const me = room.participants.find(p => p.memberId === member?.id && p.status === 'ACTIVE');
  const activeParticipants = room.participants.filter(p => p.status === 'ACTIVE');
  const joinable = room.status === 'OPEN' || room.status === 'COORDINATING';

  const act = async (fn: () => Promise<RoomDetail>, done?: string) => {
    const updated = await run(fn);
    if (updated) { setRoom(updated); if (done) toast(done, 'info'); }
    return updated;
  };
  const confirm = async () => {
    try {
      const updated = await api.rooms.confirm(room.id, { termsVersion: room.termsVersion });
      setRoom(updated);
      toast(updated.status === 'CONFIRMED' ? '모두 확정했어요! 약속 장소에서 만나요.' : '동승을 확정했어요. 다른 참여자를 기다리는 중이에요.', 'info');
    } catch (error) {
      if (isApiError(error, 'TERMS_VERSION_MISMATCH')) void loadRoom();
      onError(error);
    }
  };
  const leave = async () => {
    if (!window.confirm('이 동행방에서 나갈까요?')) return;
    if (await act(() => api.rooms.leave(room.id), '방에서 나왔어요.')) navigate('/me/rooms');
  };
  const cancelRoom = () => { if (window.confirm('모집을 취소할까요? 참여자 모두에게 취소가 알려져요.')) void act(() => api.rooms.cancel(room.id), '모집을 취소했어요.'); };
  const closeRoom = () => { if (window.confirm('이동을 마치고 방을 닫을까요?')) void act(() => api.rooms.close(room.id), '방을 닫았어요. 함께해 주셔서 고마워요!'); };
  const removeMember = (memberId: string, nickname: string) => { if (window.confirm(`${nickname}님을 방에서 제외할까요?`)) void act(() => api.rooms.remove(room.id, memberId)); };
  const join = async () => {
    if (!myTrip) return;
    const joined = await act(() => api.rooms.join(room.id, { tripId: myTrip.id }), '동행방에 참여했어요!');
    if (joined) void fetchNewMessages();
  };
  const addDemo = async () => {
    await run(async () => { const mock = await import('../api/mockClient'); await mock.addDemoParticipant(room.id); });
    void loadRoom();
  };

  const markers: MapMarker[] = [
    { position: room.approxOrigin, label: room.originLabel, color: '#245b47', size: 'sm' },
    { position: room.approxDestination, label: room.destinationLabel, color: '#dc2626', size: 'sm' },
  ];
  if (room.meetingPoint) markers.push({ position: room.meetingPoint.location, label: `🚩 ${room.meetingPoint.name}`, color: '#7c3aed' });

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-4 ring-1 ${info.tone}`}>
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">{info.label}</div>
          <button type="button" className="text-xs underline opacity-70" onClick={() => setReport({ type: 'ROOM', id: room.id, preview: `${room.originLabel} → ${room.destinationLabel}` })}>방 신고</button>
        </div>
        <p className="mt-1 text-sm">{info.desc}</p>
      </div>

      <div>
        <h1 className="text-lg font-bold">{room.originLabel} → {room.destinationLabel}</h1>
        <p className="text-xs text-slate-500">방장 {room.hostNickname} · 좌석 {room.capacity - room.seatsLeft}/{room.capacity} · 빈 좌석 {room.seatsLeft}</p>
      </div>

      <MapView
        center={room.meetingPoint?.location ?? room.approxOrigin}
        markers={markers}
        polylines={room.routePreview.length > 1 ? [{ path: room.routePreview, color: '#2563eb' }] : []}
        height={220}
      />

      {/* plan card */}
      <div className="card space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">약속</h2>
          <span className="chip bg-slate-100 text-slate-600">약속 버전 v{room.termsVersion}</span>
        </div>
        <Row label="만날 장소" value={room.meetingPoint ? `${room.meetingPoint.name} · ${meetingKindLabel[room.meetingPoint.kind]}` : '아직 정하지 않았어요'} />
        <Row label="출발 시간" value={`${formatTime(room.departureAt)} (늦어도 ${formatClock(room.departureWindowEnd)})`} />
        <Row label="요금 나누기" value={farePolicyLabel[room.terms.farePolicy]} />
        <Row label="큰 짐" value={room.terms.luggageAllowed ? '가능' : '불가'} />
        {room.terms.note && <Row label="메모" value={room.terms.note} />}
        {isHost && joinable && (
          <button type="button" className="btn-secondary mt-1 w-full" onClick={() => setEditing(true)}>
            {room.meetingPoint ? '약속 변경하기' : '만날 장소 정하기'}
          </button>
        )}
        {isHost && joinable && <p className="text-xs text-slate-500">약속을 바꾸면 버전이 올라가고 모든 확정이 초기화돼요.</p>}
      </div>

      {/* participants */}
      <div className="card space-y-2">
        <h2 className="text-sm font-bold">참여자 {activeParticipants.length}명</h2>
        <ul className="divide-y divide-slate-100">
          {activeParticipants.map((p, i) => (
            <li key={p.memberId || i} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-semibold">{p.role === 'HOST' ? '👑 ' : ''}{p.nickname}</span>
                {p.memberId === member?.id && <span className="ml-1 text-xs text-slate-400">(나)</span>}
                {isMember && <span className="ml-2 text-xs text-slate-500">{p.passengerCount}명</span>}
              </div>
              <div className="flex items-center gap-2">
                {isMember && (p.confirmed ? <span className="chip bg-emerald-100 text-emerald-800">✔ 확정</span> : <span className="chip bg-slate-100 text-slate-500">대기</span>)}
                {isHost && joinable && p.role !== 'HOST' && p.memberId && (
                  <button type="button" className="text-xs text-red-500" onClick={() => removeMember(p.memberId, p.nickname)}>제외</button>
                )}
                {p.memberId && p.memberId !== member?.id && (
                  <button type="button" className="text-xs text-slate-400" onClick={() => setReport({ type: 'MEMBER', id: p.memberId, preview: p.nickname })}>신고</button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {isMock && isHost && joinable && room.seatsLeft > 0 && (
          <button type="button" className="btn-ghost w-full text-xs" disabled={busy} onClick={addDemo}>＋ 데모 참여자 추가 (MOCK 전용)</button>
        )}
      </div>

      {/* actions */}
      {isMember && joinable && (
        <div className="space-y-2">
          {me?.confirmed ? (
            <Notice>✔ v{room.termsVersion} 약속에 확정했어요. {room.allConfirmed ? '' : '다른 참여자의 확정을 기다리는 중이에요.'}</Notice>
          ) : (
            <>
              {!room.meetingPoint && <Notice tone="warn">방장이 만날 장소를 정해야 확정할 수 있어요.</Notice>}
              {activeParticipants.length < 2 && <Notice>2명 이상 모여야 동승이 확정돼요.</Notice>}
              <button type="button" className="btn-primary w-full py-3 text-base" disabled={!room.canConfirm || busy} onClick={confirm}>
                v{room.termsVersion} 약속으로 동승 확정
              </button>
            </>
          )}
          {isHost
            ? <button type="button" className="btn-danger w-full" disabled={busy} onClick={cancelRoom}>모집 취소</button>
            : <button type="button" className="btn-danger w-full" disabled={busy} onClick={leave}>방 나가기</button>}
        </div>
      )}
      {isHost && room.status === 'CONFIRMED' && (
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={closeRoom}>이동 완료 · 방 닫기</button>
      )}
      {!isMember && (
        <div className="space-y-2">
          {room.canJoin ? (
            myTrip ? (
              <button type="button" className="btn-primary w-full" disabled={busy} onClick={join}>내 이동({myTrip.origin.name ?? '출발지'} → {myTrip.destination.name ?? '도착지'})으로 참여하기</button>
            ) : (
              <Notice>참여하려면 먼저 <Link to="/" className="font-semibold underline">이동을 등록</Link>해 주세요.</Notice>
            )
          ) : (
            <Notice>지금은 이 방에 참여할 수 없어요.</Notice>
          )}
        </div>
      )}

      <Notice>{FARE_DISCLAIMER}</Notice>

      {isMember && <Chat roomId={room.id} readOnly={room.readOnly} messages={messages} myId={member?.id} onSent={m => appendMessages([m])} onReport={setReport} />}

      {editing && <PlanEditor room={room} onClose={() => setEditing(false)} onSaved={r => { setRoom(r); setEditing(false); toast('약속을 변경했어요. 모두 다시 확정해야 해요.', 'info'); }} />}
      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- chat

function Chat({ roomId, readOnly, messages, myId, onSent, onReport }: {
  roomId: string; readOnly: boolean; messages: Message[]; myId?: string;
  onSent(m: Message): void; onReport(t: ReportTarget): void;
}) {
  const { busy, run } = useAction();
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const sent = await run(() => api.messages.send(roomId, { body, clientMessageId: crypto.randomUUID() }));
    if (sent) { onSent(sent); setText(''); }
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-bold">채팅</h2>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="text-center text-xs text-slate-400">아직 메시지가 없어요.</p>}
        {messages.map(m => {
          if (m.type === 'SYSTEM') return <div key={m.id} className="text-center text-xs text-slate-500">— {m.body} —</div>;
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="mb-0.5 text-[11px] text-slate-500">{m.senderNickname}</span>}
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.hidden ? 'bg-slate-100 italic text-slate-400' : mine ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>
                {m.hidden ? '운영 정책에 따라 가려진 메시지예요.' : m.body}
              </div>
              <div className="mt-0.5 flex gap-2 text-[10px] text-slate-400">
                <span>{formatClock(m.createdAt)}</span>
                {!mine && !m.hidden && <button type="button" className="underline" onClick={() => onReport({ type: 'MESSAGE', id: m.id, preview: m.body ?? '' })}>신고</button>}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {readOnly ? (
        <Notice>확정·종료된 방은 채팅이 잠겨요. 약속이 확정된 뒤에는 대화와 약속을 바꿀 수 없어요.</Notice>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <input className="input" value={text} maxLength={500} onChange={e => setText(e.target.value)} placeholder="메시지 입력 (전화번호 등 개인정보는 공유하지 마세요)" />
          <button type="submit" className="btn-primary shrink-0" disabled={busy || !text.trim()}>전송</button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- plan editor (host)

function PlanEditor({ room, onClose, onSaved }: { room: RoomDetail; onClose(): void; onSaved(r: RoomDetail): void }) {
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const [suggestions, setSuggestions] = useState<MeetingPointSuggestion[] | null>(null);
  const [mode, setMode] = useState<'suggest' | 'custom'>('suggest');
  const [point, setPoint] = useState<MeetingPoint | null>(room.meetingPoint);
  const [customName, setCustomName] = useState('');
  const [departure, setDeparture] = useState(() => toLocalInput(new Date(room.departureAt)));
  const [farePolicy, setFarePolicy] = useState<FarePolicy>(room.terms.farePolicy);
  const [luggageAllowed, setLuggageAllowed] = useState(room.terms.luggageAllowed);
  const [note, setNote] = useState(room.terms.note ?? '');

  useEffect(() => { api.rooms.suggestions(room.id).then(setSuggestions).catch(error => { setSuggestions([]); onError(error); }); }, [room.id, onError]);

  const pickCustom = async (location: LatLng) => {
    let name = '직접 지정한 장소';
    let address: string | null = null;
    try { const ref = await api.places.reverse(location); name = ref.name ?? name; address = ref.address ?? null; } catch { /* keep default label */ }
    setCustomName(name);
    setPoint({ name, kind: 'CUSTOM', location, address });
  };

  const save = async () => {
    if (!point) return;
    const date = new Date(departure);
    const meetingPoint = point.kind === 'CUSTOM' ? { ...point, name: customName.trim() || point.name } : point;
    const updated = await run(() => api.rooms.plan(room.id, {
      meetingPoint, departureAt: toOffsetIso(date),
      terms: { farePolicy, luggageAllowed, note: note.trim() || null },
    }));
    if (updated) onSaved(updated);
  };

  const markers: MapMarker[] = [{ position: room.approxOrigin, label: '출발 지역', color: '#245b47', size: 'sm' }];
  if (mode === 'suggest') suggestions?.forEach(s => markers.push({ position: s.point.location, color: point?.name === s.point.name ? '#7c3aed' : '#94a3b8', size: 'sm' }));
  if (point) markers.push({ position: point.location, label: `🚩 ${point.kind === 'CUSTOM' ? customName || point.name : point.name}`, color: '#7c3aed' });

  return (
    <Sheet title="약속 정하기" onClose={onClose}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'suggest', label: '추천 장소' }, { value: 'custom', label: '지도에서 직접' }]} />
        <MapView
          center={point?.location ?? room.approxOrigin}
          markers={markers}
          circles={[{ center: room.approxOrigin, radius: 200, color: '#245b47' }, { center: room.approxOrigin, radius: 500, color: '#d97706', dashed: true }]}
          onPick={mode === 'custom' ? pickCustom : undefined}
          height={220}
        />
        {mode === 'suggest' ? (
          <div className="space-y-2">
            {suggestions === null && <Spinner text="만나기 좋은 장소를 찾는 중…" />}
            {suggestions?.length === 0 && <Notice>추천할 공공장소가 없어요. 지도에서 직접 골라 주세요.</Notice>}
            {suggestions?.map((s, i) => (
              <button
                key={s.point.id ?? i}
                type="button"
                onClick={() => setPoint(s.point)}
                className={`w-full rounded-xl border p-3 text-left text-sm ${point?.name === s.point.name && point.kind === s.point.kind ? 'border-violet-500 bg-violet-50' : 'border-slate-200'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.point.name}</span>
                  <TierBadge tier={s.tier} />
                </div>
                <div className="text-xs text-slate-500">
                  {meetingKindLabel[s.point.kind]} · 가장 먼 사람 기준 도보 {s.maxWalkMeters}m
                  {s.walkMinutesMax !== null && ` · 약 ${s.walkMinutesMax}분${s.walkSource === 'ESTIMATE' ? ' (추정)' : ''}`}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">지도를 눌러 만날 장소를 고르세요. 찾기 쉬운 공공장소(역 출구, 정류장, 큰 건물 앞)를 추천해요.</p>
            {point?.kind === 'CUSTOM' && (
              <div>
                <label className="label" htmlFor="custom-name">장소 이름</label>
                <input id="custom-name" className="input" maxLength={60} value={customName} onChange={e => setCustomName(e.target.value)} />
              </div>
            )}
          </div>
        )}
        <div>
          <label className="label" htmlFor="plan-departure">출발 시간</label>
          <input id="plan-departure" type="datetime-local" className="input" value={departure} onChange={e => setDeparture(e.target.value)} />
        </div>
        <div>
          <span className="label">요금 나누는 방식</span>
          <Segmented value={farePolicy} onChange={setFarePolicy} options={(Object.keys(farePolicyLabel) as FarePolicy[]).map(f => ({ value: f, label: farePolicyLabel[f] }))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={luggageAllowed} onChange={e => setLuggageAllowed(e.target.checked)} />
          큰 짐(캐리어 등) 허용
        </label>
        <textarea className="input h-16" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (200자)" />
        <Notice tone="warn">저장하면 약속 버전이 v{room.termsVersion + 1}로 올라가고 모든 참여자의 확정이 초기화돼요.</Notice>
        <button type="button" className="btn-primary w-full" disabled={!point || busy} onClick={save}>약속 저장</button>
      </div>
    </Sheet>
  );
}
