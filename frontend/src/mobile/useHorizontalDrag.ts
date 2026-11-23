import { useEffect, useRef, useState, type RefObject, type PointerEvent, type MouseEvent, type DragEvent } from 'react';

type ScrollStyle = { snap: string; behavior: string; element: HTMLDivElement };
type Gesture = ScrollStyle & { id: number; x: number; y: number; left: number; moved: boolean; lastX: number; time: number; velocity: number };
type Motion = ScrollStyle & { frame: number };
const restore = ({ element, snap, behavior }: ScrollStyle) => {
  element.style.scrollSnapType = snap;
  element.style.scrollBehavior = behavior;
};

/** Mouse/pen dragging for a card strip. Touch keeps the browser's native scrolling. */
export function useHorizontalDrag(ref: RefObject<HTMLDivElement>) {
  const gesture = useRef<Gesture | null>(null);
  const motion = useRef<Motion | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const cancelMotion = (restoreStyle = true) => {
    const active = motion.current;
    if (active) {
      cancelAnimationFrame(active.frame);
      motion.current = null;
      if (restoreStyle) restore(active);
    }
    return active;
  };
  useEffect(() => () => {
    cancelMotion();
    const active = gesture.current;
    if (active) restore(active);
    gesture.current = null;
  }, []);

  const glideTo = (active: Gesture, target: number) => {
    const element = active.element;
    const from = element.scrollLeft;
    const distance = target - from;
    if (Math.abs(distance) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.scrollLeft = target;
      restore(active);
      return;
    }
    // Keep snap off until the glide reaches the card, avoiding an abrupt second jump.
    const duration = Math.min(440, 260 + Math.abs(distance) * .3);
    const started = performance.now();
    const current: Motion = { element, snap: active.snap, behavior: active.behavior, frame: 0 };
    motion.current = current;
    const step = (time: number) => {
      if (motion.current !== current) return;
      const progress = Math.min(1, (time - started) / duration);
      element.scrollLeft = from + distance * (1 - Math.pow(1 - progress, 3));
      if (progress < 1) current.frame = requestAnimationFrame(step);
      else { motion.current = null; restore(current); }
    };
    current.frame = requestAnimationFrame(step);
  };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    const element = active.element;
    if (active.moved) {
      suppressClick.current = true;
      // A short flick carries on in the same direction; a slow drag settles nearby.
      if (!cancelled) {
        const rect = element.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(element).scrollPaddingLeft) || 0;
        const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
        const targets = Array.from(element.children).map(child =>
          Math.max(0, Math.min(maximum, child.getBoundingClientRect().left - rect.left + element.scrollLeft - padding)));
        const velocity = event.timeStamp - active.time < 100 ? active.velocity : 0;
        const projected = element.scrollLeft + Math.max(-element.clientWidth * .8, Math.min(element.clientWidth * .8, velocity * 150));
        const target = targets.length ? targets.reduce((a, b) => Math.abs(b - projected) < Math.abs(a - projected) ? b : a) : element.scrollLeft;
        glideTo(active, target);
      } else restore(active);
      setDragging(false);
    } else restore(active);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };

  return {
    dragging,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        suppressClick.current = false;
        if (!event.isPrimary || event.button !== 0) return;
        const previous = cancelMotion(false);
        if (event.pointerType === 'touch' || !ref.current) { if (previous) restore(previous); return; }
        const element = ref.current;
        if (element.scrollWidth <= element.clientWidth + 1) { if (previous) restore(previous); return; }
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft,
          moved: false, snap: previous?.snap ?? element.style.scrollSnapType, behavior: previous?.behavior ?? element.style.scrollBehavior,
          lastX: event.clientX, time: event.timeStamp, velocity: 0, element };
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        const dx = event.clientX - active.x;
        const dy = event.clientY - active.y;
        if (!active.moved) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) { restore(active); gesture.current = null; return; }
          active.moved = true;
          active.element.style.scrollSnapType = 'none';
          active.element.style.scrollBehavior = 'auto';
          active.element.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        event.preventDefault();
        const elapsed = event.timeStamp - active.time;
        if (elapsed > 0 && event.clientX !== active.lastX) {
          const speed = Math.max(-3, Math.min(3, (active.lastX - event.clientX) / elapsed));
          active.velocity = active.velocity * .25 + speed * .75;
          active.lastX = event.clientX;
          active.time = event.timeStamp;
        }
        active.element.scrollLeft = active.left - dx;
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
      onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (active && !active.moved && active.id === event.pointerId) {
          restore(active);
          gesture.current = null;
        }
      },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onWheel: () => cancelMotion(),
      onKeyDown: () => cancelMotion(),
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
      onDragStart: (event: DragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}
