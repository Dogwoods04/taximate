import type { LatLng } from '../../api/contract';

export type MarkerKind = 'me' | 'origin' | 'destination' | 'meeting' | 'room' | 'pickup';
export interface MapMarker { position: LatLng; kind: MarkerKind; label?: string }
export type LineTone = 'route' | 'muted';
export interface MapPolyline { path: LatLng[]; tone?: LineTone }
export interface MapBubble { position: LatLng; title: string; sub?: string }
export interface MapLayers { markers?: MapMarker[]; polylines?: MapPolyline[]; bubble?: MapBubble | null }
/** Pixels of the map covered by UI on each side; focus/fit centre inside what is left. */
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface MapHandle {
  focus(point: LatLng, insets: Insets, zoom?: 'street' | 'keep'): void;
  fit(points: LatLng[], insets: Insets): void;
}

// Indigo: complementary to the base map's yellow/orange roads (and to our yellow UI), and clearly
// bluer/deeper than Kakao's light-blue water, so the route reads at a glance without looking harsh.
export const ROUTE_COLOR = '#4F46E5';
const FONT = "'Pretendard Variable',Pretendard,'Apple SD Gothic Neo',sans-serif";
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const label = (text?: string) => text
  ? `<div style="position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);white-space:nowrap;padding:5px 10px;border-radius:999px;background:#fff;color:#151515;font:600 12px ${FONT};box-shadow:0 4px 12px rgba(0,0,0,.12)">${esc(text)}</div>`
  : '';

/** HTML for a marker centred on its anchor (shared by the Kakao overlay and the schematic map). */
export function markerHtml(m: MapMarker): string {
  switch (m.kind) {
    case 'me':
      // "You are here": brand-yellow dot in a white ring with a soft pulsing halo. No heading arrow —
      // we take one GPS fix, so we don't know which way the user faces.
      return `<div style="position:relative;width:64px;height:64px;display:grid;place-items:center">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(247,197,72,.45);animation:pulse-ring 2.4s ease-out infinite"></div>
        <div style="position:absolute;inset:16px;border-radius:50%;background:rgba(247,197,72,.28)"></div>
        <div style="position:relative;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.28);display:grid;place-items:center">
          <div style="width:14px;height:14px;border-radius:50%;background:#F7C548;box-shadow:inset 0 0 0 1.5px rgba(21,21,21,.85)"></div>
        </div>
        ${label(m.label)}</div>`;
    case 'origin':
      return `<div style="position:relative;width:22px;height:22px;border-radius:50%;background:#fff;border:6px solid #151515;box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.25)">${label(m.label)}</div>`;
    case 'destination':
      return `<div style="position:relative;width:24px;height:24px;border-radius:50%;background:#151515;display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.25)"><div style="width:8px;height:8px;border-radius:50%;background:#FFD966"></div>${label(m.label)}</div>`;
    case 'meeting':
      return `<div style="position:relative;width:32px;height:32px;border-radius:50%;background:#FFD966;border:3px solid #151515;box-sizing:border-box;display:grid;place-items:center;box-shadow:0 4px 10px rgba(0,0,0,.2)"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 21V4h11l-1.5 4L16 12H7v9" fill="#151515"/></svg>${label(m.label)}</div>`;
    case 'pickup':
      // Where I board for my room (meeting point, else the room's start). Rounded square in the route
      // colour so it never reads as the round yellow "me" dot; the label names the place.
      return `<div style="position:relative;width:30px;height:30px;border-radius:9px;background:${ROUTE_COLOR};border:3px solid #fff;box-sizing:border-box;display:grid;place-items:center;box-shadow:0 4px 12px rgba(79,70,229,.45)"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 21V4h11l-1.5 4L16 12H7v9" fill="#fff"/></svg>${label(m.label)}</div>`;
    case 'room':
      return `<div style="position:relative;width:16px;height:16px;border-radius:50%;background:#FFD966;border:3px solid #151515;box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.25)">${label(m.label)}</div>`;
  }
}

/** The black "3 min" bubble from the Select mockup; anchored so it sits just above the point. */
export function bubbleHtml(b: MapBubble): string {
  return `<div style="width:60px;height:60px;border-radius:50%;background:#151515;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:${FONT};box-shadow:0 6px 16px rgba(0,0,0,.25);line-height:1.1;animation:pop .35s cubic-bezier(.2,.8,.2,1) both">
    <div style="font-size:16px;font-weight:700">${esc(b.title)}</div>${b.sub ? `<div style="font-size:10px;font-weight:500;opacity:.75;margin-top:2px">${esc(b.sub)}</div>` : ''}</div>`;
}

/**
 * Extra room a fit leaves around the fitted points so overlays drawn around them stay visible:
 * marker labels sit ~34px above a dot and are up to ~150px wide (centred); the time bubble is centred on the route.
 */
export const fitPadding = (i: Insets): Insets => ({ top: i.top + 44, right: i.right + 52, bottom: i.bottom + 32, left: i.left + 52 });

/** Visible-area centre in container pixels. */
export const visibleCenter = (w: number, h: number, i: Insets) => ({ x: i.left + (w - i.left - i.right) / 2, y: i.top + (h - i.top - i.bottom) / 2 });
