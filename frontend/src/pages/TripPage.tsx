import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { RoomSummary, TripIntent } from '../api/contract';
import { useAction, useErrorHandler } from '../lib/app';
import { formatDistance, formatDuration, formatTime, tripStatusLabel } from '../lib/format';
import MapView from '../components/MapView';
import CreateRoomSheet from '../components/CreateRoomSheet';
import { Notice, RoomStatusBadge, Spinner } from '../components/ui';

const ACTIVE = ['DRAFT', 'SEARCHING', 'NO_MATCH'];

export default function TripPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const [trip, setTrip] = useState<TripIntent | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, mine] = await Promise.all([api.trips.get(id), api.rooms.mine()]);
      setTrip(t);
      setRooms(mine.filter(r => r.status === 'OPEN' || r.status === 'COORDINATING'));
    } catch (error) { onError(error); }
  }, [id, onError]);
  useEffect(() => { void load(); }, [load]);

  if (!trip) return <Spinner />;
  const route = trip.route;
  const active = ACTIVE.includes(trip.status);
  const searchable = trip.status === 'SEARCHING' || trip.status === 'NO_MATCH';

  const retry = async () => { const t = await run(() => api.trips.route(trip.id)); if (t) setTrip(t); };
  const cancel = async () => {
    if (!window.confirm('이 이동을 취소할까요? 모집 중인 방이 있다면 함께 취소돼요.')) return;
    const t = await run(() => api.trips.cancel(trip.id));
    if (t) navigate('/');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">경로 확인</h1>
        <span className="chip bg-slate-200 text-slate-700">{tripStatusLabel[trip.status]}</span>
      </div>

      <div className="card space-y-1 text-sm">
        <div><span className="text-slate-500">출발</span> <b>{trip.origin.name ?? '선택한 위치'}</b></div>
        <div><span className="text-slate-500">도착</span> <b>{trip.destination.name ?? '선택한 위치'}</b></div>
        <div className="text-xs text-slate-500">
          희망 출발 {formatTime(trip.desiredDepartureAt)} · {trip.passengerCount}명 · 대기 {trip.maxWaitMinutes}분 · 우회 {trip.maxDetourMinutes}분 · 만료 {formatTime(trip.expiresAt)}
        </div>
      </div>

      <MapView
        center={trip.origin.location}
        markers={[{ position: trip.origin.location, label: '출발', color: '#245b47' }, { position: trip.destination.location, label: '도착', color: '#dc2626' }]}
        polylines={route ? [{ path: route.path, color: '#2563eb' }] : []}
        height={260}
      />

      {route ? (
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">자동차 경로</div>
            <div className="text-lg font-bold">{formatDistance(route.distanceMeters)} · 약 {formatDuration(route.durationSeconds)}</div>
          </div>
          <span className={`chip ${route.provider === 'KAKAO' ? 'bg-yellow-200 text-yellow-900' : 'bg-slate-200 text-slate-700'}`}>
            {route.provider === 'KAKAO' ? '카카오 길찾기' : '모의 경로'}
          </span>
        </div>
      ) : active && (
        <Notice tone="error">
          <div className="mb-2">경로를 계산하지 못했어요{trip.routeError ? ' (경로 서비스 일시 장애)' : ''}. 경로가 있어야 동행을 찾을 수 있어요.</div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={retry}>경로 다시 검색</button>
        </Notice>
      )}

      {rooms.length > 0 && (
        <Notice>
          참여 중인 동행방이 있어요:{' '}
          {rooms.map(r => (
            <Link key={r.id} to={`/rooms/${r.id}`} className="mr-2 inline-flex items-center gap-1 font-semibold underline">
              {r.originLabel} → {r.destinationLabel} <RoomStatusBadge status={r.status} />
            </Link>
          ))}
        </Notice>
      )}

      {active ? (
        <div className="space-y-2">
          <button type="button" className="btn-primary w-full py-3 text-base" disabled={!searchable || !route} onClick={() => navigate(`/trips/${trip.id}/candidates`)}>
            동행 찾기
          </button>
          <button type="button" className="btn-secondary w-full" disabled={!searchable || !route} onClick={() => setCreating(true)}>
            이 동선으로 모집하기
          </button>
          <button type="button" className="btn-danger w-full" disabled={busy} onClick={cancel}>이동 취소</button>
        </div>
      ) : (
        <div className="space-y-2">
          <Notice>이 이동은 “{tripStatusLabel[trip.status]}” 상태예요.</Notice>
          <Link to="/" className="btn-primary w-full">새 이동 등록하기</Link>
        </div>
      )}

      {creating && <CreateRoomSheet trip={trip} onClose={() => setCreating(false)} />}
    </div>
  );
}
