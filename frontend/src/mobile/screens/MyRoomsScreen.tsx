import GenderChip from '../components/GenderChip';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { RoomSummary } from '../../api/contract';
import { useApp, useErrorHandler } from '../../lib/app';
import { endedReason, isEnded } from '../endedRooms';
import { formatTime, destinationTitle, originTitle, riders } from '../../lib/format';
import { ArrowIcon, ChevronRightIcon, PersonIcon } from '../components/icons';
import { RoomStatusChip, Spinner } from '../components/ui';
import PageShell from './PageShell';

export default function MyRoomsScreen() {
  const onError = useErrorHandler();
  const navigate = useNavigate();
  const { toast } = useApp();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  useEffect(() => { api.rooms.mine().then(setRooms).catch(error => { setRooms([]); onError(error); }); }, [onError]);

  return (
    <PageShell title="내 방" sub="참여 중인 방과 최근 24시간 안에 끝난 방이에요.">
      {!rooms && <Spinner />}
      {rooms?.length === 0 && (
        <div className="rounded-card bg-fog-soft px-6 py-8">
          <p className="text-[1.0625rem] font-semibold">참여 중인 방이 없어요</p>
          <p className="mt-1 text-sm text-mute">홈에서 어디로 갈지 검색해 보세요.</p>
          <button type="button" className="btn-ink mt-5 w-full" onClick={() => navigate('/')}>어디로 갈까요?</button>
        </div>
      )}
      <ul className="space-y-3">
        {rooms?.map((r, i) => (
          <li key={r.id}>
            <button type="button" aria-disabled={isEnded(r.status)}
              // Ended rooms stay listed for 24h but never reopen; say why instead.
              onClick={() => isEnded(r.status) ? toast(endedReason[r.status] ?? '끝난 방이에요.', 'info') : navigate(`/rooms/${r.id}`)}
              className={`flex w-full items-center gap-4 rounded-card p-5 text-left transition ${isEnded(r.status) ? 'opacity-60' : 'active:scale-[.99]'} ${i === 0 && ['OPEN', 'COORDINATING', 'CONFIRMED'].includes(r.status) ? 'bg-sun' : 'border border-line bg-white'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><RoomStatusChip status={r.status} /><GenderChip enabled={r.sameGenderOnly} /><span className="text-xs text-ink/60">{formatTime(r.departureAt)}</span></div>
                <div className="mt-2 flex items-center gap-2">
                  <ArrowIcon size={18} className="-scale-x-100 shrink-0" />
                  <span className="truncate text-[1.125rem] font-bold tracking-tight">{destinationTitle(r)}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[0.8125rem] text-ink/60">
                  <span>{originTitle(r)}에서</span>
                  <span className="flex items-center gap-1"><PersonIcon size={14} />{riders(r)}/{r.capacity}</span>
                  <span>방장 {r.hostNickname}</span>
                </div>
              </div>
              {isEnded(r.status) ? <span className="shrink-0 text-xs font-semibold text-mute">종료</span> : <ChevronRightIcon className="shrink-0 text-ink/40" />}
            </button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
