import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { LatLng } from '../../../api/contract';
import { prefersReducedMotion } from '../../../lib/geolocate';
import { bubbleHtml, fitPadding, markerHtml, ROUTE_COLOR, visibleCenter, type Insets, type MapHandle, type MapLayers } from './markers';

type Command = { type: 'focus'; point: LatLng; insets: Insets; zoom: 'street' | 'keep' } | { type: 'fit'; points: LatLng[]; insets: Insets };
interface CanvasProps { layers: MapLayers; initialCenter: LatLng }

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY?.trim();

/**
 * Full-bleed map controlled imperatively: `focus` / `fit` animate so the target lands in the
 * part of the map not covered by UI (`insets`). Kakao Maps JS SDK when VITE_KAKAO_JS_KEY is set,
 * otherwise (or if the SDK fails) a schematic SVG of Siheung.
 */
const MapCanvas = forwardRef<MapHandle, CanvasProps>(function MapCanvas(props, ref) {
  const [kakaoFailed, setKakaoFailed] = useState(false);
  const inner = useRef<MapHandle & { ready(): boolean }>(null);
  const pending = useRef<Command | null>(null);
  const replay = () => {
    const cmd = pending.current, map = inner.current;
    if (!cmd || !map?.ready()) return;
    pending.current = null;
    if (cmd.type === 'focus') map.focus(cmd.point, cmd.insets, cmd.zoom); else map.fit(cmd.points, cmd.insets);
  };
  useImperativeHandle(ref, () => ({
    focus(point, insets, zoom = 'street') { pending.current = { type: 'focus', point, insets, zoom }; replay(); },
    fit(points, insets) { pending.current = { type: 'fit', points, insets }; replay(); },
  }), []);
  if (KAKAO_KEY && !kakaoFailed) return <KakaoCanvas ref={inner} {...props} onReady={replay} onFail={() => setKakaoFailed(true)} />;
  return <SchematicCanvas ref={inner} {...props} onReady={replay} />;
});
export default MapCanvas;

type InnerHandle = MapHandle & { ready(): boolean };
type InnerProps = CanvasProps & { onReady(): void };

// ---------------------------------------------------------------- Kakao Maps JS SDK

/* eslint-disable @typescript-eslint/no-explicit-any */
let kakaoPromise: Promise<any> | null = null;
function loadKakao(): Promise<any> {
  const w = window as any;
  if (w.kakao?.maps?.LatLng) return Promise.resolve(w.kakao);
  kakaoPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY ?? '')}&autoload=false`;
    script.async = true;
    script.onload = () => { try { w.kakao.maps.load(() => resolve(w.kakao)); } catch (e) { reject(e); } };
    script.onerror = () => reject(new Error('Kakao SDK load failed'));
    document.head.appendChild(script);
  }).catch(error => { kakaoPromise = null; throw error; });
  return kakaoPromise;
}

const KakaoCanvas = forwardRef<InnerHandle, InnerProps & { onFail(): void }>(function KakaoCanvas({ layers, initialCenter, onReady, onFail }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const kakao = useRef<any>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  useEffect(() => {
    let cancelled = false;
    loadKakao().then(k => {
      if (cancelled || !el.current) return;
      kakao.current = k;
      map.current = new k.maps.Map(el.current, { center: new k.maps.LatLng(initialCenter.lat, initialCenter.lng), level: 5 });
      // Bottom-right: the left side holds the recenter / back controls. MapLayout lifts it above the sheets.
      map.current.setCopyrightPosition?.(k.maps.CopyrightPosition.BOTTOMRIGHT, true);
      setReady(true);
    }).catch(() => { if (!cancelled) onFail(); });
    const ro = new ResizeObserver(() => map.current?.relayout());
    if (el.current) ro.observe(el.current);
    return () => { cancelled = true; ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (ready) readyCb.current(); }, [ready]);

  const signature = JSON.stringify(layers);
  useEffect(() => {
    const k = kakao.current, m = map.current;
    if (!ready || !k || !m) return;
    overlays.current.forEach(o => o.setMap(null));
    overlays.current = [];
    const ll = (p: LatLng) => new k.maps.LatLng(p.lat, p.lng);
    for (const line of layers.polylines ?? []) {
      if (line.path.length < 2) continue;
      const path = line.path.map(ll);
      if (line.tone === 'muted') {
        overlays.current.push(new k.maps.Polyline({ map: m, path, strokeWeight: 4, strokeColor: '#9A9A9A', strokeOpacity: 0.9, strokeStyle: 'shortdash' }));
      } else {
        overlays.current.push(new k.maps.Polyline({ map: m, path, strokeWeight: 11, strokeColor: '#FFFFFF', strokeOpacity: 1 }));
        overlays.current.push(new k.maps.Polyline({ map: m, path, strokeWeight: 6, strokeColor: ROUTE_COLOR, strokeOpacity: 0.95 }));
      }
    }
    for (const marker of layers.markers ?? []) {
      overlays.current.push(new k.maps.CustomOverlay({ map: m, position: ll(marker.position), content: markerHtml(marker), xAnchor: 0.5, yAnchor: 0.5, zIndex: marker.kind === 'me' ? 1 : 3 }));
    }
    if (layers.bubble) overlays.current.push(new k.maps.CustomOverlay({ map: m, position: ll(layers.bubble.position), content: bubbleHtml(layers.bubble), xAnchor: 0.5, yAnchor: 0.5, zIndex: 5 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  useImperativeHandle(ref, () => {
    /** Map centre that puts `point` at the visible-area centre (at the current level). */
    const centerFor = (point: LatLng, insets: Insets) => {
      const k = kakao.current, m = map.current, box = el.current!.getBoundingClientRect();
      const proj = m.getProjection();
      const p = proj.containerPointFromCoords(new k.maps.LatLng(point.lat, point.lng));
      const v = visibleCenter(box.width, box.height, insets);
      return proj.coordsFromContainerPoint(new k.maps.Point(p.x + box.width / 2 - v.x, p.y + box.height / 2 - v.y));
    };
    return {
      ready: () => ready,
      focus(point, insets, zoom = 'street') {
        const m = map.current;
        if (!m) return;
        m.relayout();
        const level = zoom === 'street' ? Math.min(m.getLevel(), 4) : m.getLevel();
        m.setLevel(level);
        m.setCenter(centerFor(point, insets));
      },
      fit(points, insets) {
        const k = kakao.current, m = map.current;
        if (!m || !points.length) return;
        if (points.length === 1) { this.focus(points[0], insets, 'street'); return; }
        m.relayout();
        const bounds = new k.maps.LatLngBounds();
        points.forEach(p => bounds.extend(new k.maps.LatLng(p.lat, p.lng)));
        // Apply one coherent camera update. Restoring the old camera and staging
        // animated setLevel/panTo calls can leave Kakao's projection offset after
        // another sheet/route update interrupts the SDK's internal animation.
        const pad = fitPadding(insets);
        m.setBounds(bounds, pad.top, pad.right, pad.bottom, pad.left);
      },
    };
  }, [ready]);

  return <div ref={el} className="h-full w-full bg-[#ECECEC]" />;
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------- Schematic SVG fallback

const BBOX = { minLat: 37.30, maxLat: 37.47, minLng: 126.68, maxLng: 126.90 };
const X_SCALE = 111320 * Math.cos((37.38 * Math.PI) / 180);
const Y_SCALE = 111320;
const project = (p: LatLng) => ({ x: (p.lng - BBOX.minLng) * X_SCALE, y: (BBOX.maxLat - p.lat) * Y_SCALE });
const pts = (list: [number, number][]) => list.map(([lat, lng]) => project({ lat, lng }));
const SEA = [
  pts([[37.47, 126.68], [37.47, 126.705], [37.43, 126.715], [37.40, 126.735], [37.392, 126.728], [37.383, 126.712], [37.372, 126.703], [37.36, 126.70], [37.345, 126.712], [37.338, 126.735], [37.333, 126.76], [37.318, 126.79], [37.30, 126.80], [37.30, 126.68]]),
];
const PARKS = pts([[37.3705, 126.7262], [37.4392, 126.8023], [37.3895, 126.7795], [37.3600, 126.7650], [37.4150, 126.8350], [37.3950, 126.8450]]);
const MAJOR_ROADS = [
  pts([[37.3517, 126.7428], [37.3624, 126.7387], [37.3917, 126.7426], [37.4366, 126.7910]]),
  pts([[37.3517, 126.7428], [37.3786, 126.7856], [37.3801, 126.8029], [37.3817, 126.8607]]),
  pts([[37.3705, 126.7262], [37.3786, 126.7856], [37.4392, 126.8023]]),
  pts([[37.33, 126.79], [37.3801, 126.8029], [37.4366, 126.7910], [37.46, 126.80]]),
];
const LANDMARKS: [string, number, number][] = [
  ['정왕역', 37.3517, 126.7428], ['오이도역', 37.3624, 126.7387], ['월곶역', 37.3917, 126.7426], ['배곧', 37.3705, 126.7262],
  ['시흥시청', 37.3801, 126.8029], ['장곡', 37.3786, 126.7856], ['은계', 37.4392, 126.8023], ['목감', 37.3817, 126.8607], ['신천역', 37.4366, 126.7910],
];
type View = { cx: number; cy: number; mpp: number };
const MIN_MPP = 0.8, MAX_MPP = 60;
const clampMpp = (v: number) => Math.min(MAX_MPP, Math.max(MIN_MPP, v));

const SchematicCanvas = forwardRef<InnerHandle, InnerProps>(function SchematicCanvas({ layers, initialCenter, onReady }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(() => { const p = project(initialCenter); return { cx: p.x, cy: p.y, mpp: 4 }; });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const anim = useRef(0);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => { ro.disconnect(); cancelAnimationFrame(anim.current); };
  }, []);
  useEffect(() => { if (size.w) readyCb.current(); }, [size.w]);

  const animateTo = (target: View) => {
    cancelAnimationFrame(anim.current);
    if (prefersReducedMotion()) { setView(target); return; }
    const from = viewRef.current, start = performance.now(), duration = 650;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      setView({ cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, mpp: from.mpp * Math.pow(target.mpp / from.mpp, e) });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const centred = (world: { x: number; y: number }, mpp: number, insets: Insets): View => {
    const { w, h } = sizeRef.current, v = visibleCenter(w, h, insets);
    return { cx: world.x + (w / 2 - v.x) * mpp, cy: world.y + (h / 2 - v.y) * mpp, mpp };
  };

  useImperativeHandle(ref, () => ({
    ready: () => sizeRef.current.w > 0,
    focus(point, insets, zoom = 'street') {
      const mpp = zoom === 'street' ? Math.min(viewRef.current.mpp, 2.4) : viewRef.current.mpp;
      animateTo(centred(project(point), mpp, insets));
    },
    fit(points, insets) {
      if (!points.length) return;
      const ps = points.map(project), xs = ps.map(p => p.x), ys = ps.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const { w, h } = sizeRef.current;
      const pad = fitPadding(insets);
      const vw = Math.max(60, w - pad.left - pad.right), vh = Math.max(60, h - pad.top - pad.bottom);
      const mpp = clampMpp(Math.max((maxX - minX) / vw, (maxY - minY) / vh, 1.6));
      animateTo(centred({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, mpp, pad));
    },
  }), []);

  // Drag to pan, wheel to zoom.
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => { cancelAnimationFrame(anim.current); drag.current = { x: e.clientX, y: e.clientY, view }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView({ ...d.view, cx: d.view.cx - (e.clientX - d.x) * d.view.mpp, cy: d.view.cy - (e.clientY - d.y) * d.view.mpp });
  };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    cancelAnimationFrame(anim.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - size.w / 2, py = e.clientY - rect.top - size.h / 2;
    setView(v => {
      const mpp = clampMpp(v.mpp * (e.deltaY > 0 ? 1.15 : 1 / 1.15));
      return { cx: v.cx + px * (v.mpp - mpp), cy: v.cy + py * (v.mpp - mpp), mpp };
    });
  };

  const { w, h } = size;
  const vbW = w * view.mpp, vbH = h * view.mpp;
  const left = view.cx - vbW / 2, top = view.cy - vbH / 2;
  const toScreen = (p: LatLng) => { const q = project(p); return { x: (q.x - left) / view.mpp, y: (q.y - top) / view.mpp }; };
  const d = (list: { x: number; y: number }[], close = false) => list.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + (close ? ' Z' : '');
  const grid = useMemo(() => {
    const step = view.mpp > 20 ? 1600 : view.mpp > 6 ? 800 : 400;
    const xs: number[] = [], ys: number[] = [];
    for (let g = Math.floor(left / step) * step; g < left + vbW + step; g += step) xs.push(g);
    for (let g = Math.floor(top / step) * step; g < top + vbH + step; g += step) ys.push(g);
    return { step, xs, ys };
  }, [left, top, vbW, vbH, view.mpp]);

  return (
    <div ref={box} className="relative h-full w-full touch-none select-none overflow-hidden bg-[#ECECEC]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onWheel={onWheel}>
      {w > 0 && (
        <svg className="absolute inset-0 h-full w-full" viewBox={`${left} ${top} ${vbW} ${vbH}`} role="img" aria-label="시흥시 모식도 지도">
          {PARKS.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={420 + (i % 3) * 160} fill="#CFE6B8" />)}
          {grid.xs.map((g, i) => <line key={`x${g}`} x1={g + ((i * 137) % 90)} x2={g - ((i * 71) % 120)} y1={top - grid.step} y2={top + vbH + grid.step} stroke="#FFFFFF" strokeWidth={(i % 4 === 0) ? 5 : 2.5} vectorEffect="non-scaling-stroke" />)}
          {grid.ys.map((g, i) => <line key={`y${g}`} y1={g + ((i * 89) % 80)} y2={g - ((i * 53) % 110)} x1={left - grid.step} x2={left + vbW + grid.step} stroke="#FFFFFF" strokeWidth={(i % 4 === 0) ? 5 : 2.5} vectorEffect="non-scaling-stroke" />)}
          {MAJOR_ROADS.map((r, i) => <path key={i} d={d(r)} fill="none" stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {SEA.map((s, i) => <path key={i} d={d(s, true)} fill="#BFDDEE" />)}
          {(layers.polylines ?? []).filter(l => l.path.length > 1).map((l, i) => {
            const path = d(l.path.map(project));
            return l.tone === 'muted'
              ? <path key={i} d={path} fill="none" stroke="#9A9A9A" strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              : <g key={i}>
                  <path d={path} fill="none" stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <path d={path} fill="none" stroke={ROUTE_COLOR} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>;
          })}
        </svg>
      )}
      {w > 0 && LANDMARKS.map(([name, lat, lng]) => {
        const p = toScreen({ lat, lng });
        if (p.x < -60 || p.y < -20 || p.x > w + 60 || p.y > h + 20) return null;
        // Our own markers/labels win: drop a base-map label that names the same place or would collide with one.
        const markers = layers.markers ?? [];
        if (markers.some(m => m.label?.includes(name))) return null;
        // Base label text spans p.y…p.y+14; a marker label spans q.y-52…q.y-28 and its dot q.y±12.
        const near = (q: { x: number; y: number }, dx: number, dy: number) => Math.abs(q.x - p.x) < dx && p.y > q.y - dy && p.y < q.y + 18;
        if (markers.some(m => near(toScreen(m.position), m.label ? 110 : 44, m.label ? 66 : 28))) return null;
        if (layers.bubble && near(toScreen(layers.bubble.position), 70, 46)) return null;
        return <span key={name} className="pointer-events-none absolute -translate-x-1/2 text-[11px] font-semibold text-[#9C9C9C]" style={{ left: p.x, top: p.y }}>{name}</span>;
      })}
      {w > 0 && (layers.markers ?? []).map((m, i) => {
        const p = toScreen(m.position);
        return <div key={`${m.kind}${i}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y, zIndex: m.kind === 'me' ? 1 : 3 }} dangerouslySetInnerHTML={{ __html: markerHtml(m) }} />;
      })}
      {w > 0 && layers.bubble && (() => {
        const p = toScreen(layers.bubble.position);
        return <div key={JSON.stringify(layers.bubble)} className="pointer-events-none absolute z-[5] -translate-x-1/2" style={{ left: p.x, top: p.y - 30 }} dangerouslySetInnerHTML={{ __html: bubbleHtml(layers.bubble) }} />;
      })()}
    </div>
  );
});
