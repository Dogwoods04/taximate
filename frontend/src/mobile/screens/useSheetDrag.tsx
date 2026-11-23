import { useRef, useState, type PointerEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { maxSheetHeight, SHEET_MAX_HEIGHT } from './layout';

type SheetStop = 'collapsed' | 'normal' | 'expanded';
type Options = { collapsedHeight?: number; initialStop?: SheetStop };

/** Shared sheet stops. Only the handle owns vertical dragging; content remains scrollable. */
export function useSheetDrag(size: { w: number; h: number }, normal: number, mode: string, initiallyExpanded = false, onShrink?: () => void, options: Options = {}) {
  const max = maxSheetHeight(size);
  const base = Math.max(0, Math.min(normal, max));
  const min = Math.max(0, Math.min(options.collapsedHeight ?? base, base));
  const threeStops = min < base - 1;
  const initial = options.initialStop ?? (initiallyExpanded ? 'expanded' : 'normal');
  const [position, setPosition] = useState({ mode, stop: initial });
  if (position.mode !== mode) setPosition({ mode, stop: initial });
  const stop = position.mode === mode ? position.stop : initial;
  const expanded = stop === 'expanded';
  const collapsed = threeStops && stop === 'collapsed';
  const settledHeight = expanded ? max : collapsed ? min : base;
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ id: number; startY: number; startH: number; y: number; time: number; velocity: number; height: number; moved: boolean } | null>(null);
  const stops: { stop: SheetStop; height: number }[] = [
    ...(threeStops ? [{ stop: 'collapsed' as const, height: min }] : []),
    { stop: 'normal', height: base },
    ...(max > base + 1 ? [{ stop: 'expanded' as const, height: max }] : []),
  ];
  const settle = (next: SheetStop) => {
    const actual = next === 'collapsed' && !threeStops ? 'normal' : next;
    setPosition({ mode, stop: actual });
    setLive(null);
    if (actual !== 'expanded') onShrink?.();
  };
  const toggle = () => settle(collapsed ? 'normal' : expanded ? (threeStops ? 'collapsed' : 'normal') : 'expanded');
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dt = e.timeStamp - d.time;
    if (dt > 0 && e.clientY !== d.y) d.velocity = (e.clientY - d.y) / dt;
    d.y = e.clientY;
    d.time = e.timeStamp;
    d.moved ||= Math.abs(e.clientY - d.startY) > 5;
    d.height = Math.min(max, Math.max(min, d.startH + d.startY - e.clientY));
    setLive(d.height);
  };
  const end = (e: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (cancelled) setLive(null);
    else if (!d.moved) setLive(null);
    else {
      const velocity = e.timeStamp - d.time < 120 ? d.velocity : 0;
      const projected = d.height - velocity * 140;
      const nearest = stops.reduce((a, b) => Math.abs(b.height - projected) < Math.abs(a.height - projected) ? b : a);
      settle(nearest.stop);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    stop, collapsed, expanded,
    collapse: () => settle('collapsed'), restore: () => settle('normal'), expand: () => settle('expanded'), toggle,
    progress: max > base ? Math.min(1, Math.max(0, ((live ?? settledHeight) - base) / (max - base))) : 0,
    settledHeight,
    height: live ?? settledHeight,
    dragging: live !== null,
    style: { height: live ?? settledHeight, maxHeight: SHEET_MAX_HEIGHT, ...(live !== null ? { transition: 'none' } : {}) },
    handle: {
      'aria-label': `시트 크기 조절, ${collapsed ? '접힘' : expanded ? '크게 보기' : '기본 크기'}. 위아래로 끌거나 방향키를 사용하세요`,
      'aria-expanded': expanded,
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // Start at the visible height even when interrupting a snapping transition.
        const currentHeight = e.currentTarget.closest('[data-draggable-sheet]')?.getBoundingClientRect().height ?? settledHeight;
        const height = Math.min(max, Math.max(min, currentHeight));
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) focused.blur();
        drag.current = { id: e.pointerId, startY: e.clientY, startH: height, y: e.clientY, time: e.timeStamp, velocity: 0, height, moved: false };
        setLive(height);
      },
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => end(e),
      onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => end(e, true),
      onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => end(e, true),
      onClick: (e: MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) toggle(); },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
        e.preventDefault();
        const index = Math.max(0, stops.findIndex(s => s.stop === stop));
        if (e.key === 'ArrowUp') settle(stops[Math.min(index + 1, stops.length - 1)].stop);
        else if (e.key === 'ArrowDown') settle(stops[Math.max(index - 1, 0)].stop);
        else if (e.key === 'Home') settle(stops[0].stop);
        else if (e.key === 'End') settle(stops[stops.length - 1].stop);
        else toggle();
      },
    },
  };
}

export function SheetHandle({ controls }: { controls: ReturnType<typeof useSheetDrag> }) {
  return <button type="button" data-sheet-handle {...controls.handle} className="flex h-11 w-full shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-t-sheet active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink" style={{ touchAction: 'none' }}>
    <span className="h-1 w-10 rounded-full bg-line" />
  </button>;
}

