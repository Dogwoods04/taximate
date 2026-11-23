/**
 * Home "근처 열린 방" settings. Change the radius here.
 * The backend caps requests at `taximate.rooms.nearby.max-radius-meters` (application.yml, 3000 m):
 * keep `expandedRadiusMeters` at or below it, or raise both together.
 */
export const NEARBY_ROOMS = {
  /** First search radius from the reference point (current location or a searched origin), in metres. */
  defaultRadiusMeters: 500,
  /** Radius after "넓혀 보기", in metres. */
  expandedRadiusMeters: 3000,
  /** Mock mode stands in for the backend: mirrors `max-radius-meters` and `max-results`. */
  mock: { maxRadiusMeters: 3000, maxResults: 20 },
} as const;

/** 500 → "500m", 1000 → "1km", 1500 → "1.5km" (radius wording for the list header and empty state). */
export const formatRadius = (meters: number) => (meters >= 1000 ? `${Number((meters / 1000).toFixed(1))}km` : `${meters}m`);
