import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { FarePolicy, TripIntent } from '../api/contract';
import { useAction, useApp } from '../lib/app';
import { farePolicyLabel, formatTime } from '../lib/format';
import { FARE_DISCLAIMER, Notice, Segmented, Sheet } from './ui';

/** Creates a room from the current trip; every trip input (route, departure, passengers) carries over. */
export default function CreateRoomSheet({ trip, onClose }: { trip: TripIntent; onClose(): void }) {
  const navigate = useNavigate();
  const { toast } = useApp();
  const { busy, run } = useAction();
  const minCapacity = Math.max(2, trip.passengerCount + 1);
  const [capacity, setCapacity] = useState(Math.max(minCapacity, 4 > minCapacity ? 4 : minCapacity));
  const [farePolicy, setFarePolicy] = useState<FarePolicy>('EQUAL_SPLIT');
  const [luggageAllowed, setLuggageAllowed] = useState(true);
  const [note, setNote] = useState('');

  const submit = async () => {
    const room = await run(() => api.rooms.create({
      sourceTripId: trip.id, capacity,
      terms: { farePolicy, luggageAllowed, note: note.trim() || null },
    }));
    if (room) { toast('동행방을 만들었어요. 만날 장소를 정해 주세요.', 'info'); navigate(`/rooms/${room.id}`); }
  };

  return (
    <Sheet title="이 동선으로 모집하기" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="font-semibold">{trip.origin.name ?? '출발지'} → {trip.destination.name ?? '도착지'}</div>
          <div className="text-xs text-slate-500">출발 {formatTime(trip.desiredDepartureAt)} · 우리 일행 {trip.passengerCount}명 · 대기 최대 {trip.maxWaitMinutes}분</div>
        </div>
        <div>
          <span className="label">총 인원 (나와 일행 포함)</span>
          <Segmented value={capacity} onChange={setCapacity} options={[2, 3, 4].filter(n => n >= minCapacity).map(n => ({ value: n, label: `${n}명` }))} />
          <p className="mt-1 text-xs text-slate-500">빈 좌석 {capacity - trip.passengerCount}자리를 모집해요.</p>
        </div>
        <div>
          <span className="label">요금 나누는 방식</span>
          <Segmented value={farePolicy} onChange={setFarePolicy} options={(Object.keys(farePolicyLabel) as FarePolicy[]).map(f => ({ value: f, label: farePolicyLabel[f] }))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={luggageAllowed} onChange={e => setLuggageAllowed(e.target.checked)} />
          큰 짐(캐리어 등) 허용
        </label>
        <div>
          <label className="label" htmlFor="room-note">한마디 (선택, 200자)</label>
          <textarea id="room-note" className="input h-20" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 정왕역 2번 출구 앞에서 만나요" />
        </div>
        <Notice>{FARE_DISCLAIMER}</Notice>
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={submit}>동행방 만들기</button>
      </div>
    </Sheet>
  );
}
