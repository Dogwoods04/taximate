import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LatLng } from '../api/contract';

export interface MapMarker { position: LatLng; label?: string; color?: string; size?: 'sm' | 'md' }
export interface MapPolyline { path: LatLng[]; color?: string; dashed?: boolean; width?: number }
export interface MapCircle { center: LatLng; radius: number; color?: string; dashed?: boolean }
export interface MapViewProps {
  center: LatLng;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  circles?: MapCircle[];
  onPick?: (point: LatLng) => void;
  height?: number;
  className?: string;
}

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY?.trim();

export default function MapView(props: MapViewProps) {
  const [kakaoFailed, setKakaoFailed] = useState(false);
  if (KAKAO_KEY && !kakaoFailed) return <KakaoMap {...props} onFail={() => setKakaoFailed(true)} />;
  return <SchematicMap {...props} />;
}

// ---------------------------------------------------------------- Kakao Maps JS SDK

/* eslint-disable @typescript-eslint/no-explicit-any */
type KakaoNs = any;
let kakaoPromise: Promise<KakaoNs> | null = null;
function loadKakao(): Promise<KakaoNs> {
  const w = window as any;
  if (w.kakao?.maps?.LatLng) return Promise.resolve(w.kakao);
  kakaoPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY ?? '')}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => { try { w.kakao.maps.load(() => resolve(w.kakao)); } catch (e) { reject(e); } };
    script.onerror = () => reject(new Error('Kakao SDK load failed'));
    document.head.appendChild(script);
  }).catch(error => { kakaoPromise = null; throw error; });
  return kakaoPromise;
}

function KakaoMap({ center, markers = [], polylines = [], circles = [], onPick, height = 260, className = '', onFail }: MapViewProps & { onFail(): void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<KakaoNs>(null);
  const overlays = useRef<any[]>([]);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadKakao().then(kakao => {
      if (cancelled || !el.current) return;
      kakaoRef.current = kakao;
      const map = new kakao.maps.Map(el.current, { center: new kakao.maps.LatLng(center.lat, center.lng), level: 6 });
      kakao.maps.event.addListener(map, 'click', (e: any) => pickRef.current?.({ lat: e.latLng.getLat(), lng: e.latLng.getLng() }));
      mapRef.current = map;
      setReady(true);
    }).catch(() => { if (!cancelled) onFail(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signature = JSON.stringify({ center, markers, polylines, circles });
  useEffect(() => {
    const kakao = kakaoRef.current, map = mapRef.current;
    if (!ready || !kakao || !map) return;
    overlays.current.forEach(o => o.setMap(null));
    overlays.current = [];
    const ll = (p: LatLng) => new kakao.maps.LatLng(p.lat, p.lng);
    const bounds = new kakao.maps.LatLngBounds();
    let any = false;
    const extend = (p: LatLng) => { bounds.extend(ll(p)); any = true; };
    for (const c of circles) {
      overlays.current.push(new kakao.maps.Circle({ map, center: ll(c.center), radius: c.radius, strokeWeight: 2, strokeColor: c.color ?? '#245b47', strokeOpacity: 0.8, strokeStyle: c.dashed ? 'dash' : 'solid', fillColor: c.color ?? '#245b47', fillOpacity: 0.08 }));
      const dLat = c.radius / 111320, dLng = c.radius / (111320 * Math.cos((c.center.lat * Math.PI) / 180));
      extend({ lat: c.center.lat + dLat, lng: c.center.lng + dLng });
      extend({ lat: c.center.lat - dLat, lng: c.center.lng - dLng });
    }
    for (const line of polylines) {
      if (line.path.length < 2) continue;
      overlays.current.push(new kakao.maps.Polyline({ map, path: line.path.map(ll), strokeWeight: line.width ?? 5, strokeColor: line.color ?? '#245b47', strokeOpacity: 0.85, strokeStyle: line.dashed ? 'shortdash' : 'solid' }));
      line.path.forEach(extend);
    }
    for (const m of markers) {
      const node = document.createElement('div');
      node.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform:translateY(-50%)';
      const dot = document.createElement('div');
      const size = m.size === 'sm' ? 10 : 14;
      dot.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${m.color ?? '#245b47'};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)`;
      node.appendChild(dot);
      if (m.label) {
        const label = document.createElement('div');
        label.textContent = m.label;
        label.style.cssText = 'margin-top:2px;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.92);font-size:11px;font-weight:600;color:#0f172a;white-space:nowrap';
        node.appendChild(label);
      }
      overlays.current.push(new kakao.maps.CustomOverlay({ map, position: ll(m.position), content: node, yAnchor: 0 }));
      extend(m.position);
    }
    if (any) map.setBounds(bounds, 30, 30, 30, 30);
    else map.setCenter(ll(center));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  return (
    <div className={`relative overflow-hidden rounded-2xl ring-1 ring-slate-200 ${className}`} style={{ height }}>
      <div ref={el} className="h-full w-full" />
      {onPick && <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow">지도를 눌러 위치 선택</div>}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------- Schematic SVG fallback

// Siheung bounding box, equirectangular projection in meters (x east, y south).
const BBOX = { minLat: 37.30, maxLat: 37.45, minLng: 126.70, maxLng: 126.90 };
const X_SCALE = 111320 * Math.cos((((BBOX.minLat + BBOX.maxLat) / 2) * Math.PI) / 180);
const Y_SCALE = 111320;
const WORLD_W = (BBOX.maxLng - BBOX.minLng) * X_SCALE;
const WORLD_H = (BBOX.maxLat - BBOX.minLat) * Y_SCALE;
const project = (p: LatLng) => ({ x: (p.lng - BBOX.minLng) * X_SCALE, y: (BBOX.maxLat - p.lat) * Y_SCALE });
const unproject = (x: number, y: number): LatLng => ({
  lat: Math.min(BBOX.maxLat, Math.max(BBOX.minLat, BBOX.maxLat - y / Y_SCALE)),
  lng: Math.min(BBOX.maxLng, Math.max(BBOX.minLng, BBOX.minLng + x / X_SCALE)),
});

// Reference landmarks drawn on the schematic background (public places only).
const LANDMARKS: [string, number, number][] = [
  ['정왕역', 37.3517, 126.7428], ['오이도역', 37.3624, 126.7387], ['월곶역', 37.3917, 126.7426], ['배곧', 37.3705, 126.7262],
  ['시흥시청', 37.3801, 126.8029], ['시흥시청역', 37.3821, 126.8057], ['장곡', 37.3786, 126.7856], ['은계', 37.4392, 126.8023],
  ['목감', 37.3817, 126.8607], ['신천역', 37.4366, 126.7910],
];
// Rough coastline hint (west/south sea) so the schematic is recognisable.
const COAST: LatLng[] = [
  { lat: 37.45, lng: 126.70 }, { lat: 37.40, lng: 126.73 }, { lat: 37.385, lng: 126.715 }, { lat: 37.37, lng: 126.70 },
];
const SEA_SOUTH: LatLng[] = [
  { lat: 37.345, lng: 126.70 }, { lat: 37.338, lng: 126.73 }, { lat: 37.333, lng: 126.76 }, { lat: 37.31, lng: 126.80 }, { lat: 37.30, lng: 126.80 }, { lat: 37.30, lng: 126.70 },
];

type View = { cx: number; cy: number; span: number };
const MIN_SPAN = 600, MAX_SPAN = Math.max(WORLD_W, WORLD_H);

function fitView(center: LatLng, markers: MapMarker[], polylines: MapPolyline[], circles: MapCircle[]): View {
  const pts: { x: number; y: number }[] = [];
  markers.forEach(m => pts.push(project(m.position)));
  polylines.forEach(l => l.path.forEach(p => pts.push(project(p))));
  circles.forEach(c => { const p = project(c.center); pts.push({ x: p.x - c.radius, y: p.y - c.radius }, { x: p.x + c.radius, y: p.y + c.radius }); });
  if (!pts.length) { const p = project(center); return { cx: p.x, cy: p.y, span: 4000 }; }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN * 2, (maxX - minX) * 1.25, (maxY - minY) * 1.25));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, span };
}

function SchematicMap({ center, markers = [], polylines = [], circles = [], onPick, height = 260, className = '' }: MapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const signature = JSON.stringify({ center, markers, polylines, circles });
  const fitted = useMemo(() => fitView(center, markers, polylines, circles), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState<View>(fitted);
  useEffect(() => setView(fitted), [fitted]);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);

  const s = view.span;
  const unit = s / 400; // ≈ one CSS pixel at 400px width
  const viewBox = `${view.cx - s / 2} ${view.cy - s / 2} ${s} ${s}`;

  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const w = pt.matrixTransform(ctm.inverse());
    return { x: w.x, y: w.y };
  };
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current, svg = svgRef.current;
    if (!d || !svg) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const perPx = d.view.span / svg.getBoundingClientRect().width;
    setView({ ...d.view, cx: d.view.cx - dx * perPx, cy: d.view.cy - dy * perPx });
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !onPick) return;
    const w = toWorld(e.clientX, e.clientY);
    if (w) onPick(unproject(w.x, w.y));
  };
  const zoom = (factor: number) => setView(v => ({ ...v, span: Math.min(MAX_SPAN, Math.max(MIN_SPAN, v.span * factor)) }));
  const pathD = (path: LatLng[]) => path.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
  const gridStep = s > 8000 ? 2000 : s > 3000 ? 1000 : 500;
  const gridLines: number[] = [];
  for (let g = Math.floor((view.cx - s) / gridStep) * gridStep; g < view.cx + s; g += gridStep) gridLines.push(g);
  const gridLinesY: number[] = [];
  for (let g = Math.floor((view.cy - s) / gridStep) * gridStep; g < view.cy + s; g += gridStep) gridLinesY.push(g);

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#eef3ea] ring-1 ring-slate-200 ${className}`} style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        className={`h-full w-full touch-none select-none ${onPick ? 'cursor-crosshair' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        role="img"
        aria-label="시흥시 모식도 지도"
      >
        <rect x={-WORLD_W} y={-WORLD_H} width={WORLD_W * 3} height={WORLD_H * 3} fill="#cfe3ef" />
        <rect x={0} y={0} width={WORLD_W} height={WORLD_H} fill="#eef3ea" />
        <path d={`${pathD(COAST)} Z`} fill="#cfe3ef" />
        <path d={`${pathD(SEA_SOUTH)} Z`} fill="#cfe3ef" />
        {gridLines.map(g => <line key={`x${g}`} x1={g} x2={g} y1={view.cy - s} y2={view.cy + s} stroke="#d9e2d4" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {gridLinesY.map(g => <line key={`y${g}`} y1={g} y2={g} x1={view.cx - s} x2={view.cx + s} stroke="#d9e2d4" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {LANDMARKS.map(([name, lat, lng]) => {
          const p = project({ lat, lng });
          return (
            <g key={name} opacity={0.75}>
              <rect x={p.x - 3 * unit} y={p.y - 3 * unit} width={6 * unit} height={6 * unit} fill="#94a3b8" />
              <text x={p.x + 6 * unit} y={p.y + 4 * unit} fontSize={11 * unit} fill="#64748b">{name}</text>
            </g>
          );
        })}
        {circles.map((c, i) => {
          const p = project(c.center);
          return <circle key={`c${i}`} cx={p.x} cy={p.y} r={c.radius} fill={c.color ?? '#245b47'} fillOpacity={0.08} stroke={c.color ?? '#245b47'} strokeWidth={1.5} strokeDasharray={c.dashed ? '6 4' : undefined} vectorEffect="non-scaling-stroke" />;
        })}
        {polylines.filter(l => l.path.length > 1).map((l, i) => (
          <path key={`l${i}`} d={pathD(l.path)} fill="none" stroke={l.color ?? '#245b47'} strokeOpacity={0.85} strokeWidth={l.width ?? 4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={l.dashed ? '6 5' : undefined} vectorEffect="non-scaling-stroke" />
        ))}
        {markers.map((m, i) => {
          const p = project(m.position);
          const r = (m.size === 'sm' ? 5 : 7) * unit;
          return (
            <g key={`m${i}`}>
              <circle cx={p.x} cy={p.y} r={r} fill={m.color ?? '#245b47'} stroke="#fff" strokeWidth={2 * unit} />
              {m.label && (
                <text x={p.x} y={p.y - r - 4 * unit} fontSize={12 * unit} fontWeight={700} textAnchor="middle" fill="#0f172a" stroke="#fff" strokeWidth={3 * unit} paintOrder="stroke">
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className="h-8 w-8 rounded-lg bg-white text-lg font-bold shadow" onClick={() => zoom(0.6)} aria-label="확대">+</button>
        <button type="button" className="h-8 w-8 rounded-lg bg-white text-lg font-bold shadow" onClick={() => zoom(1.6)} aria-label="축소">−</button>
        <button type="button" className="h-8 w-8 rounded-lg bg-white text-xs font-bold shadow" onClick={() => setView(fitted)} aria-label="맞춤 보기">⤢</button>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-slate-500">
        모식도 지도 (카카오맵 키 없음) · 격자 {gridStep >= 1000 ? `${gridStep / 1000}km` : `${gridStep}m`}
      </div>
      {onPick && <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow">지도를 눌러 위치 선택</div>}
    </div>
  );
}
