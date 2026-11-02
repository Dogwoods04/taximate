import { useEffect, type ReactNode } from 'react';
import type { ProximityTier, RoomStatus } from '../api/contract';
import { roomStatusInfo } from '../lib/format';

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const info = roomStatusInfo[status];
  return <span className={`chip ring-1 ${info.tone}`}>{info.label}</span>;
}

export function TierBadge({ tier }: { tier: ProximityTier }) {
  return tier === 'NEAR'
    ? <span className="chip bg-brand-100 text-brand-700">200m 이내</span>
    : <span className="chip bg-amber-100 text-amber-800">200–500m</span>;
}

export function Spinner({ text = '불러오는 중…' }: { text?: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{text}</div>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const cls = tone === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : tone === 'warn' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-50 text-slate-700 ring-slate-200';
  return <div className={`rounded-xl px-3 py-2.5 text-sm ring-1 ${cls}`}>{children}</div>;
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          className={`seg ${o.value === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const FARE_DISCLAIMER = '운임 계산·결제·택시 호출은 앱에서 하지 않아요. 만나서 직접 택시를 잡고, 요금은 정한 방식대로 당사자끼리 나눠요.';
