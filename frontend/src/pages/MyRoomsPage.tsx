import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { RoomSummary } from '../api/contract';
import { useErrorHandler } from '../lib/app';
import { formatTime } from '../lib/format';
import { RoomStatusBadge, Spinner } from '../components/ui';

export default function MyRoomsPage() {
  const onError = useErrorHandler();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  useEffect(() => { api.rooms.mine().then(setRooms).catch(error => { setRooms([]); onError(error); }); }, [onError]);

  if (!rooms) return <Spinner />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">내 동행방</h1>
      {rooms.length === 0 && (
        <div className="card space-y-2 text-center text-sm text-slate-600">
          <p>참여 중인 동행방이 없어요.</p>
          <Link to="/" className="btn-primary w-full">이동 등록하고 동행 찾기</Link>
        </div>
      )}
      {rooms.map(r => (
        <Link key={r.id} to={`/rooms/${r.id}`} className="card block space-y-1 hover:ring-brand-500">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{r.originLabel} → {r.destinationLabel}</span>
            <RoomStatusBadge status={r.status} />
          </div>
          <div className="text-xs text-slate-500">
            방장 {r.hostNickname} · 출발 {formatTime(r.departureAt)} · {r.participantCount}명 참여 · 빈 좌석 {r.seatsLeft}
          </div>
          {r.meetingPoint && <div className="text-xs text-slate-600">🚩 {r.meetingPoint.name}</div>}
        </Link>
      ))}
      <p className="text-xs text-slate-400">종료된 방은 24시간 동안만 목록에 보여요.</p>
    </div>
  );
}
