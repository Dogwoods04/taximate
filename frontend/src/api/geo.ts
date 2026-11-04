import type { LatLng, RouteSnapshot } from './contract';
const xScale = 111320 * Math.cos(37.37 * Math.PI / 180);
const yScale = 111320;
export const distance = (a: LatLng, b: LatLng) => Math.hypot((a.lng - b.lng) * xScale, (a.lat - b.lat) * yScale);
export const mask = (p: LatLng): LatLng => ({ lat: Number(p.lat.toFixed(3)), lng: Number(p.lng.toFixed(3)) });
export const roundMeters = (n: number) => Math.round(n / 10) * 10;
const mix = (a: LatLng, b: LatLng, t: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
export function sample(path: LatLng[], step = 50): LatLng[] {
  return path.flatMap((a, i) => {
    const b = path[i + 1];
    if (!b) return [a];
    const count = Math.max(1, Math.ceil(distance(a, b) / step));
    return Array.from({ length: count }, (_, j) => mix(a, b, j / count));
  });
}
export function preview(path: LatLng[]): LatLng[] {
  const points = sample(path, 25);
  let walked = 0;
  const cumulative = points.map((p, i) => { if (i) walked += distance(points[i - 1], p); return walked; });
  return points.filter((_, i) => cumulative[i] >= 200 && cumulative[i] <= walked - 200).filter((_, i) => i % 3 === 0).map(mask);
}
/** Mock taxi fare (KRW): 4,800 base up to 1.6km, then 100 per started 131m. */
export const mockFare = (meters: number) => 4800 + 100 * Math.ceil(Math.max(0, meters - 1600) / 131);
export function route(origin: LatLng, destination: LatLng): RouteSnapshot {
  const path = [origin, { lat: destination.lat, lng: origin.lng }, destination];
  const meters = distance(path[0], path[1]) + distance(path[1], path[2]);
  return { id: crypto.randomUUID(), provider: 'MOCK', distanceMeters: Math.round(meters), durationSeconds: Math.max(60, Math.round(meters / 8)), path, taxiFareWon: mockFare(meters), calculatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString() };
}
export function routeComparison(a: LatLng[], b: LatLng[]) {
  const points = sample(a), other = sample(b);
  const start = a[0], end = a[a.length - 1], bs = b[0], be = b[b.length - 1];
  const ax = (end.lng - start.lng) * xScale, ay = (end.lat - start.lat) * yScale;
  const bx = (be.lng - bs.lng) * xScale, by = (be.lat - bs.lat) * yScale;
  return { cosine: (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1), overlap: points.filter(p => other.some(q => distance(p, q) <= 150)).length / Math.max(1, points.length) };
}
