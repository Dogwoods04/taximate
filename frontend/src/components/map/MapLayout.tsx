import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { LatLng } from '../../api/contract';
import { SIHEUNG_CITY_HALL } from '../../lib/geolocate';
import MapCanvas from './MapCanvas';
import type { Insets, MapHandle, MapLayers } from './markers';

export interface MapApi {
  setCover(progress: number, dragging?: boolean): void;
  /** Height (px from the bottom) of the UI currently covering the map; Kakao's logo/copyright is kept just above it. */
  setAttributionInset(px: number, dragging?: boolean): void;
  setLayers(layers: MapLayers): void;
  focus(point: LatLng, insets: Insets, zoom?: 'street' | 'keep'): void;
  fit(points: LatLng[], insets: Insets): void;
  /** Current app-frame size in px (the map is full-bleed behind every screen). */
  size: { w: number; h: number };
}
const MapContext = createContext<MapApi | null>(null);

export function useMap(): MapApi {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('MapLayout missing');
  return ctx;
}

/** Insets helper: everything below `visibleHeight` px is covered by UI. */
export const coverBottom = (size: { h: number }, visibleHeight: number, top = 0): Insets =>
  ({ top, left: 0, right: 0, bottom: Math.max(0, size.h - visibleHeight) });

/**
 * One persistent map behind Home, the Select sheet and On-the-way, so moving between them
 * animates the same map instead of remounting it.
 */
export default function MapLayout() {
  const handle = useRef<MapHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<MapLayers>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cover, setCoverState] = useState({ progress: 0, dragging: false });
  const setCover = useCallback((progress: number, dragging = false) => {
    setCoverState(previous => previous.progress === progress && previous.dragging === dragging ? previous : { progress, dragging });
  }, []);

  // Kakao terms: the Kakao logo/copyright must stay visible. The SDK only pins it to a bottom corner
  // (bottom: 0), which every sheet covers, so we lift that block above whatever covers the map.
  const layer = useRef<HTMLDivElement>(null);
  const [attribution, setAttribution] = useState({ px: 0, dragging: false });
  const setAttributionInset = useCallback((px: number, dragging = false) => {
    const v = Math.max(0, Math.round(px));
    setAttribution(prev => prev.px === v && prev.dragging === dragging ? prev : { px: v, dragging });
  }, []);
  useLayoutEffect(() => {
    const root = layer.current;
    if (!root) return;
    const apply = (): HTMLElement | null => {
      const logo = root.querySelector<HTMLImageElement>('img[src*="kakaocdn.net/mapjsapi/images/"][src*="/m_bi"]');
      let block: HTMLElement | null = logo?.parentElement ?? null;
      while (block && block !== root && block.style.position !== 'absolute') block = block.parentElement;
      if (!block || block === root) return null;
      const bottom = `${attribution.px + 6}px`;
      if (block.style.bottom !== bottom) block.style.bottom = bottom;
      if (block.style.zIndex !== '101') block.style.zIndex = '101'; // above the blur cover: never blur the logo
      const transition = attribution.dragging ? 'none' : 'bottom 500ms cubic-bezier(.32,.72,0,1)';
      if (block.style.transition !== transition) block.style.transition = transition;
      // The scale bar shares this block. It adds clutter right above the fade/sheet and we show
      // distances in the route bubble, so hide it. The Kakao logo and copyright stay untouched.
      for (const child of Array.from(block.children) as HTMLElement[]) {
        if (!child.contains(logo) && child.style.display !== 'none') child.style.display = 'none';
      }
      return block;
    };
    // The SDK (re)creates the block after load and rewrites its inline style (e.g. on copyright
    // position / relayout), so watch new nodes under the map and style changes on the block itself.
    let watched: HTMLElement | null = null;
    const styleWatch = new MutationObserver(() => apply());
    const run = () => {
      const block = apply();
      if (block && block !== watched) {
        styleWatch.disconnect();
        styleWatch.observe(block, { attributes: true, attributeFilter: ['style'] });
        watched = block;
      }
    };
    run();
    const mo = new MutationObserver(run);
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); styleWatch.disconnect(); };
  }, [attribution]);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const api = useMemo<MapApi>(() => ({
    setCover,
    setAttributionInset,
    setLayers,
    focus: (point, insets, zoom) => handle.current?.focus(point, insets, zoom),
    fit: (points, insets) => handle.current?.fit(points, insets),
    size,
  }), [size, setCover, setAttributionInset]);

  return (
    <MapContext.Provider value={api}>
      <div ref={box} className="clip-layer absolute inset-0">
        {/* isolate: Kakao's internal panes carry their own z-index; keep them inside this layer so screens stay on top */}
        <div ref={layer} className="absolute inset-0 isolate z-0">
          <MapCanvas ref={handle} layers={layers} initialCenter={SIHEUNG_CITY_HALL} />
          <div data-map-cover aria-hidden className="ease-sheet pointer-events-none absolute inset-0 z-[100] transition-[backdrop-filter,background-color] duration-500"
            style={{ backdropFilter: `blur(${cover.progress * 8}px)`, WebkitBackdropFilter: `blur(${cover.progress * 8}px)`, backgroundColor: `rgba(240,240,240,${cover.progress * 0.25})`, ...(cover.dragging ? { transition: 'none' } : {}) }} />
        </div>
        {size.h > 0 && <Outlet />}
      </div>
    </MapContext.Provider>
  );
}
