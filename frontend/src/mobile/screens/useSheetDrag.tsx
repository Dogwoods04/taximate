import { useRef, useState, type PointerEvent } from 'react';
import { maxSheetHeight, SHEET_MAX_HEIGHT } from './layout';

/** Two stops, with live pointer tracking and no map updates during a drag. */
export function useSheetDrag(size: { w: number; h: number }, normal: number, mode: string, initiallyExpanded = false, onShrink?: () => void) {
  const max = maxSheetHeight(size);
  const [stop, setStop] = useState({ mode, expanded: initiallyExpanded });
  // Each mode entry gets its own default, including returning from search to list.
  if (stop.mode !== mode) setStop({ mode, expanded: initiallyExpanded });
  const expanded = stop.mode === mode ? stop.expanded : initiallyExpanded;
  const settledHeight = expanded ? max : normal;
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ id: number; startY: number; startH: number; y: number; time: number; velocity: number; height: number } | null>(null);
  const settle = (next: boolean) => {
    setStop({ mode, expanded: next });
    setLive(null);
    if (!next) onShrink?.();
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dt = e.timeStamp - d.time;
    if (dt > 0 && e.clientY !== d.y) d.velocity = (e.clientY - d.y) / dt;
    d.y = e.clientY;
    d.time = e.timeStamp;
    d.height = Math.min(max, Math.max(normal, d.startH + d.startY - e.clientY));
    setLive(d.height);
  };
  const end = (e: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const velocity = e.timeStamp - d.time < 120 ? d.velocity : 0;
    // Compare sheet top to the midpoint of the map visible at NORMAL.
    const next = cancelled ? expanded : Math.abs(velocity) > 0.5 ? velocity < 0 : size.h - d.height < (size.h - normal) / 2;
    settle(next);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    expanded,
    progress: max > normal ? Math.min(1, Math.max(0, ((live ?? settledHeight) - normal) / (max - normal))) : 0,
    settledHeight,
    dragging: live !== null,
    style: { height: live ?? settledHeight, maxHeight: SHEET_MAX_HEIGHT, ...(live !== null ? { transition: 'none' } : {}) },
    handle: {
      'aria-label': '시트 크기 조절',
      'aria-expanded': expanded,
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.preventDefault(); // Keep search focused until the downwards snap.
        e.currentTarget.setPointerCapture(e.pointerId);
        const height = e.currentTarget.closest('section')?.getBoundingClientRect().height ?? settledHeight;
        drag.current = { id: e.pointerId, startY: e.clientY, startH: height, y: e.clientY, time: e.timeStamp, velocity: 0, height };
        setLive(height);
      },
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => end(e),
      onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => end(e, true),
      onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => end(e, true),
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          settle(e.key === 'ArrowUp' || (e.key !== 'ArrowDown' && !expanded));
        }
      },
    },
  };
}

export function SheetHandle({ controls }: { controls: ReturnType<typeof useSheetDrag> }) {
  return <button type="button" data-sheet-handle {...controls.handle} className="mx-auto flex h-6 w-20 shrink-0 touch-none select-none items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink" style={{ touchAction: 'none' }}>
    <span className="h-1 w-10 rounded-full bg-line" />
  </button>;
}
