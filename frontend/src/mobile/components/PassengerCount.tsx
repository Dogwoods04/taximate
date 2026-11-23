export default function PassengerCount({ value, max, onChange, disabled = false }: {
  value: number; max: number; onChange(value: number): void; disabled?: boolean;
}) {
  const limit = Math.max(0, Math.min(3, max));
  return <div className="rounded-2xl border border-line px-3 py-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">나 포함 합류 인원</span>
      <div role="radiogroup" aria-label="나 포함 합류 인원" className="flex rounded-full bg-fog p-1">
        {Array.from({ length: limit }, (_, i) => i + 1).map(n => <button key={n} type="button" role="radio" aria-checked={value === n} disabled={disabled} onClick={() => onChange(n)} className={`h-10 min-w-11 rounded-full px-3 text-sm font-semibold ${value === n ? 'bg-ink text-white' : 'text-mute-dark'} disabled:opacity-40`}>{n}명</button>)}
      </div>
    </div>
    <p className="mt-1 text-xs text-mute">{limit ? '함께 타는 일행을 모두 포함해 주세요. 합류 시 남은 좌석을 다시 확인해요.' : '현재 남은 좌석이 없어요.'}</p>
  </div>;
}
