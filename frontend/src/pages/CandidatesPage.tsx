import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { MatchCandidate, MatchCandidatesResponse, RoomDetail, TripIntent } from '../api/contract';
import { useAction, useApp, useErrorHandler } from '../lib/app';
import { isApiError } from '../lib/errors';
import { farePolicyLabel, formatDiff, formatTime, meetingKindLabel } from '../lib/format';
import MapView, { type MapCircle, type MapMarker, type MapPolyline } from '../components/MapView';
import CreateRoomSheet from '../components/CreateRoomSheet';
import { FARE_DISCLAIMER, Notice, Sheet, Spinner, TierBadge } from '../components/ui';

export default function CandidatesPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const [trip, setTrip] = useState<TripIntent | null>(null);
  const [result, setResult] = useState<MatchCandidatesResponse | null>(null);
  const [problem, setProblem] = useState<'ROUTE_EXPIRED' | 'TRIP_NOT_SEARCHABLE' | null>(null);
  const [selected, setSelected] = useState<MatchCandidate | null>(null);
  const [preview, setPreview] = useState<MatchCandidate | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const t = await api.trips.get(id);
      setTrip(t);
      setResult(await api.trips.candidates(id));
    } catch (error) {
      if (isApiError(error, 'ROUTE_EXPIRED') || isApiError(error, 'TRIP_NOT_SEARCHABLE')) { setProblem(error.code as 'ROUTE_EXPIRED' | 'TRIP_NOT_SEARCHABLE'); return; }
      onError(error);
    }
  }, [id, onError]);
  useEffect(() => { void load(); }, [load]);

  const refreshRoute = async () => {
    const t = await run(() => api.trips.route(id));
    if (t) { toast('경로를 다시 계산했어요.', 'info'); void load(); }
  };

  if (problem) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">{problem === 'ROUTE_EXPIRED' ? '경로 정보가 만료되었어요. 경로를 다시 검색하면 동행을 찾을 수 있어요.' : '이 이동은 지금 동행을 찾을 수 없는 상태예요 (확정·취소·만료).'}</Notice>
        {problem === 'ROUTE_EXPIRED'
          ? <button type="button" className="btn-primary w-full" disabled={busy} onClick={refreshRoute}>경로 다시 검색</button>
          : <Link to={`/trips/${id}`} className="btn-secondary w-full">이동 정보로 돌아가기</Link>}
      </div>
    );
  }
  if (!trip || !result) return <Spinner text="비슷한 동선을 찾는 중…" />;

  const near = result.candidates.filter(c => c.tier === 'NEAR');
  const extended = result.candidates.filter(c => c.tier === 'EXTENDED');
  const { priorityRadiusMeters: pr, maxRadiusMeters: mr } = result.policy;
  const circles: MapCircle[] = [
    { center: trip.origin.location, radius: mr, color: '#d97706', dashed: true },
    { center: trip.origin.location, radius: pr, color: '#245b47' },
    { center: trip.destination.location, radius: mr, color: '#d97706', dashed: true },
    { center: trip.destination.location, radius: pr, color: '#245b47' },
  ];
  const markers: MapMarker[] = [
    { position: trip.origin.location, label: '내 출발', color: '#245b47' },
    { position: trip.destination.location, label: '내 도착', color: '#dc2626' },
    // approxOrigin is already masked (~110m grid) by the API; shown as-is, never refined.
    ...result.candidates.map(c => ({ position: c.room.approxOrigin, color: c === selected ? '#7c3aed' : '#64748b', size: 'sm' as const })),
  ];
  const polylines: MapPolyline[] = [];
  if (trip.route) polylines.push({ path: trip.route.path, color: '#2563eb', width: 4 });
  if (selected?.routePreview.length) polylines.push({ path: selected.routePreview, color: '#7c3aed', dashed: true, width: 4 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">동행 찾기</h1>
        <button type="button" className="btn-ghost text-xs" onClick={() => void load()}>새로고침</button>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">출발·도착 모두 {mr}m 이내, {pr}m 이내 우선</div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full border-2 border-brand-600" /> {pr}m 우선 반경</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-amber-600" /> {mr}m 최대 반경</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1 w-4 bg-blue-600" /> 내 경로</span>
        </div>
        <p className="text-xs text-slate-500">반경만으로 매칭하지 않아요. 진행 방향, 경로 겹침(50% 이상), 출발 시간, 우회 시간까지 함께 확인해요.</p>
      </div>

      <MapView center={trip.origin.location} markers={markers} circles={circles} polylines={polylines} height={260} />

      {result.candidates.length === 0 ? (
        <div className="card space-y-3 text-center">
          <div className="text-3xl">🔍</div>
          <div className="font-semibold">아직 조건에 맞는 동행방이 없어요</div>
          <p className="text-sm text-slate-600">
            {result.similarSearchingCount > 0
              ? <>지금 비슷한 동선으로 <b className="text-brand-700">{result.similarSearchingCount}명</b>이 동행을 찾고 있어요. 방을 열면 그분들이 찾을 수 있어요.</>
              : '먼저 방을 열어 두면 같은 방향의 이웃이 찾아올 수 있어요.'}
          </p>
          <button type="button" className="btn-primary w-full" onClick={() => setCreating(true)}>이 동선으로 모집하기</button>
          <p className="text-xs text-slate-400">입력한 출발·도착·시간·인원이 그대로 사용돼요.</p>
        </div>
      ) : (
        <>
          <Section title={`가까운 동행 (${pr}m 이내)`} items={near} selected={selected} onSelect={setSelected} onOpen={setPreview} empty="200m 이내 동행방은 아직 없어요." />
          <Section title={`조금 더 넓게 (${pr}–${mr}m)`} items={extended} selected={selected} onSelect={setSelected} onOpen={setPreview} empty="200–500m 범위의 동행방도 없어요." />
          <div className="card space-y-2 text-center">
            <p className="text-sm text-slate-600">
              마음에 드는 방이 없나요?{result.similarSearchingCount > 0 && <> 비슷한 동선으로 혼자 찾는 사람이 <b>{result.similarSearchingCount}명</b> 있어요.</>}
            </p>
            <button type="button" className="btn-secondary w-full" onClick={() => setCreating(true)}>이 동선으로 모집하기</button>
          </div>
        </>
      )}

      {preview && <RoomPreview candidate={preview} trip={trip} onClose={() => setPreview(null)} onJoined={roomId => navigate(`/rooms/${roomId}`)} />}
      {creating && <CreateRoomSheet trip={trip} onClose={() => setCreating(false)} />}
    </div>
  );
}

function Section({ title, items, selected, onSelect, onOpen, empty }: {
  title: string; items: MatchCandidate[]; selected: MatchCandidate | null; empty: string;
  onSelect(c: MatchCandidate): void; onOpen(c: MatchCandidate): void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-slate-700">{title} · {items.length}</h2>
      {items.length === 0 && <p className="text-xs text-slate-400">{empty}</p>}
      {items.map(c => (
        <div
          key={c.roomId}
          className={`card cursor-pointer space-y-2 transition ${selected?.roomId === c.roomId ? 'ring-2 ring-violet-500' : ''}`}
          onClick={() => onSelect(c)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{c.room.originLabel} → {c.room.destinationLabel}</div>
              <div className="text-xs text-slate-500">{c.room.hostNickname} · {formatTime(c.room.departureAt)} ({formatDiff(c.departureDiffMinutes)})</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-bold text-brand-700">{c.score}<span className="text-xs font-normal text-slate-400">점</span></div>
              <TierBadge tier={c.tier} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="chip bg-sky-100 text-sky-800">빈 좌석 {c.seatsLeft}</span>
            <span className="chip bg-violet-100 text-violet-800">경로 겹침 {Math.round(c.overlapRatio * 100)}%</span>
            {c.reasons.map(r => <span key={r} className="chip bg-slate-100 text-slate-700">{r}</span>)}
          </div>
          <button type="button" className="btn-secondary w-full py-2" onClick={e => { e.stopPropagation(); onOpen(c); }}>방 자세히 보기</button>
        </div>
      ))}
    </section>
  );
}

function RoomPreview({ candidate, trip, onClose, onJoined }: { candidate: MatchCandidate; trip: TripIntent; onClose(): void; onJoined(roomId: string): void }) {
  const onError = useErrorHandler();
  const { toast } = useApp();
  const { busy, run } = useAction();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  useEffect(() => { api.rooms.get(candidate.roomId).then(setRoom).catch(onError); }, [candidate.roomId, onError]);
  const r = room ?? candidate.room;

  const join = async () => {
    const joined = await run(() => api.rooms.join(candidate.roomId, { tripId: trip.id }));
    if (joined) { toast('동행방에 참여했어요!', 'info'); onJoined(joined.id); }
  };
  const alreadyMember = room && room.myRole !== 'NONE';

  return (
    <Sheet title="동행방 미리보기" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-base font-bold">{r.originLabel} → {r.destinationLabel}</div>
          <div className="text-xs text-slate-500">방장 {r.hostNickname} · 출발 {formatTime(r.departureAt)} (최대 {formatTime(r.departureWindowEnd)}까지)</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="출발지 거리" value={`${candidate.originDistanceMeters}m`} />
          <Stat label="도착지 거리" value={`${candidate.destinationDistanceMeters}m`} />
          <Stat label="추가 이동" value={`약 ${candidate.estimatedDetourMinutes}분`} />
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div>좌석 {r.capacity - r.seatsLeft}/{r.capacity} 사용 · 빈 좌석 <b>{r.seatsLeft}</b></div>
          <div>요금: {farePolicyLabel[r.terms.farePolicy]} · 큰 짐 {r.terms.luggageAllowed ? '가능' : '불가'}</div>
          <div>만날 장소: {r.meetingPoint ? `${r.meetingPoint.name} (${meetingKindLabel[r.meetingPoint.kind]})` : '아직 정하지 않음'}</div>
          {r.terms.note && <div className="mt-1 text-slate-600">“{r.terms.note}”</div>}
        </div>
        {room && (
          <div>
            <div className="label">참여자</div>
            <div className="flex flex-wrap gap-1">{room.participants.filter(p => p.status === 'ACTIVE').map((p, i) => <span key={i} className="chip bg-slate-100">{p.role === 'HOST' ? '👑 ' : ''}{p.nickname}</span>)}</div>
          </div>
        )}
        <Notice>{FARE_DISCLAIMER}</Notice>
        {alreadyMember
          ? <button type="button" className="btn-primary w-full" onClick={() => onJoined(candidate.roomId)}>방으로 이동</button>
          : <button type="button" className="btn-primary w-full" disabled={busy || (room ? !room.canJoin : false)} onClick={join}>{room && !room.canJoin ? '참여할 수 없는 방이에요' : '이 방에 참여하기'}</button>}
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
