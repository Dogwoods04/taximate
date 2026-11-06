import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RoomStatus } from '../../api/contract';
import { roomStatusInfo } from '../../lib/format';
import { CloseIcon } from './icons';
import { SHEET_MAX_HEIGHT } from '../screens/layout';

/** Portal target: the phone-width app column, so overlays never escape it on desktop. */
export function FramePortal({ children }: { children: ReactNode }) {
  const host = document.getElementById('app-frame');
  return host ? createPortal(children, host) : <>{children}</>;
}

/** Mount → animate in; `close()` animates out, then calls `onClosed`. */
export function useSlideIn(onClosed: () => void, ms = 320) {
  const [shown, setShown] = useState(false);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, []);
  const close = useCallback(() => { setShown(false); setTimeout(() => closedRef.current(), ms); }, [ms]);
  return { shown, close };
}

/** Modal bottom sheet (report, plan editor, menu panels). */
export function Sheet({ title, onClose, children, tall = false }: { title: string; onClose(): void; children: ReactNode; tall?: boolean }) {
  const { shown, close } = useSlideIn(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <FramePortal>
      <div className={`absolute inset-0 z-50 flex items-end bg-black/40 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={close}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          style={{ maxHeight: SHEET_MAX_HEIGHT }}
          className={`ease-sheet flex w-full flex-col rounded-t-sheet bg-white shadow-sheet transition-transform duration-300 ${tall ? 'h-[88%]' : 'max-h-[88%]'} ${shown ? 'translate-y-0' : 'translate-y-full'}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line" />
          <div className="flex shrink-0 items-center justify-between px-6 pb-2 pt-4">
            <h2 className="text-[1.375rem] font-bold tracking-tight">{title}</h2>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-fog text-ink" onClick={close} aria-label="닫기"><CloseIcon size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">{children}</div>
        </div>
      </div>
    </FramePortal>
  );
}

export function Spinner({ text, dark = false }: { text?: string; dark?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="spinner" style={dark ? { borderColor: 'rgba(255,255,255,.15)', borderTopColor: '#FFD966' } : undefined} />
      {text && <p className={`text-sm ${dark ? 'text-white/60' : 'text-mute'}`}>{text}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const cls = tone === 'error' ? 'bg-[#FFF0EE] text-[#B3261E]' : tone === 'warn' ? 'bg-sun-pale text-[#6B5200]' : 'bg-fog-soft text-mute-dark';
  return <div className={`rounded-2xl px-4 py-3 text-[0.8125rem] leading-relaxed ${cls}`}>{children}</div>;
}

export function RoomStatusChip({ status }: { status: RoomStatus }) {
  const tone = status === 'CONFIRMED' ? 'bg-ink text-sun' : status === 'OPEN' || status === 'COORDINATING' ? 'bg-sun text-ink' : 'bg-fog text-mute-dark';
  return <span className={`chip ${tone}`}>{roomStatusInfo[status].label}</span>;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-2 text-[0.9375rem] font-medium disabled:opacity-50">
      <span>{label}</span>
      <span className={`relative block h-8 w-[3.25rem] shrink-0 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-line'}`}>
        <span className={`absolute left-0 top-1 h-6 w-6 rounded-full shadow transition-transform ${checked ? 'translate-x-[24px] bg-sun' : 'translate-x-1 bg-white'}`} />
      </span>
    </button>
  );
}

export function Avatar({ name, size = 44, tone = 'sun' }: { name: string; size?: number; tone?: 'sun' | 'ink' | 'fog' }) {
  const cls = tone === 'sun' ? 'bg-sun text-ink' : tone === 'ink' ? 'bg-ink text-sun' : 'bg-fog text-mute-dark';
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold ${cls}`} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>{name.trim().slice(0, 1) || '?'}</span>;
}

/** Thin page indicator bars (On-the-way mockup); the active one is yellow. */
export function PageBars({ count, active, onSelect }: { count: number; active: number; onSelect(i: number): void }) {
  return (
    <div className="flex items-center justify-center gap-2" role="tablist">
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`${i + 1}페이지`} onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-6 bg-sun-deep' : 'w-4 bg-line'}`} />
      ))}
    </div>
  );
}

export const FARE_DISCLAIMER = '예상 요금은 길찾기 기준 참고값이에요. 결제·택시 호출은 앱에서 하지 않고, 만나서 함께 택시를 잡은 뒤 당사자끼리 나눠요.';
