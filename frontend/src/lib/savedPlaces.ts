import { useCallback, useEffect, useState } from 'react';
import type { PlaceRef } from '../api/contract';

export interface SavedPlace extends PlaceRef { storageId: string; usedAt: number }
interface SavedState { version: 1; recent: SavedPlace[]; favorites: SavedPlace[] }
const EVENT = 'taximate:saved-places';
const MAX_RECENT = 12;
const MAX_FAVORITES = 30;
const RECENT_AGE = 30 * 86400000;
const empty = (): SavedState => ({ version: 1, recent: [], favorites: [] });
const storageKey = (id: string) => `taximate.saved-places.v1.${import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'}.${id}`;
const publicKinds = ['SEARCH', 'STATION_EXIT', 'BUS_STOP', 'LANDMARK'];
const validPlace = (p: unknown): p is PlaceRef => {
  if (!p || typeof p !== 'object') return false;
  const value = p as PlaceRef;
  return typeof value.name === 'string' && !!value.name.trim() && publicKinds.includes(value.kind)
    && Number.isFinite(value.location?.lat) && Math.abs(value.location.lat) <= 90
    && Number.isFinite(value.location?.lng) && Math.abs(value.location.lng) <= 180;
};
const placeId = (p: PlaceRef) => p.providerPlaceId
  ? `provider:${p.providerPlaceId}` : `${p.name?.trim()}@${p.location.lat.toFixed(6)},${p.location.lng.toFixed(6)}`;
const saved = (p: PlaceRef): SavedPlace => ({ name: p.name, address: p.address, kind: p.kind,
  providerPlaceId: p.providerPlaceId, location: { ...p.location }, storageId: placeId(p), usedAt: Date.now() });

function read(memberId?: string): SavedState {
  if (!memberId) return empty();
  try {
    const serialized = localStorage.getItem(storageKey(memberId));
    const raw = JSON.parse(serialized || 'null');
    if (raw?.version !== 1) return empty();
    const sanitize = (items: unknown, recent: boolean) => {
      const seen = new Set<string>();
      return (Array.isArray(items) ? items : []).filter((p): p is SavedPlace => {
        if (!validPlace(p)) return false;
        const usedAt = (p as SavedPlace).usedAt;
        if (!Number.isFinite(usedAt) || usedAt > Date.now() + 60000) return false;
        if (recent && Date.now() - usedAt > RECENT_AGE) return false;
        const id = placeId(p); if (seen.has(id)) return false; seen.add(id); return true;
      }).map(p => ({ ...saved(p), usedAt: p.usedAt })).slice(0, recent ? MAX_RECENT : MAX_FAVORITES);
    };
    // Legacy saveRecent settings no longer disable automatic history; preserve saved places.
    const cleaned: SavedState = { version: 1, recent: sanitize(raw.recent, true), favorites: sanitize(raw.favorites, false) };
    // Prune expired records physically whenever the app next reads this account's history.
    const normalized = JSON.stringify(cleaned);
    if (serialized !== normalized) {
      try { localStorage.setItem(storageKey(memberId), normalized); } catch { /* read-only storage */ }
    }
    return cleaned;
  } catch { return empty(); }
}

function write(memberId: string | undefined, update: (state: SavedState) => SavedState) {
  if (!memberId) return;
  try { localStorage.setItem(storageKey(memberId), JSON.stringify(update(read(memberId)))); }
  catch { return; /* Storage can be unavailable; selecting a destination must still work. */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: memberId }));
}

export function clearSavedPlaces(memberId?: string) {
  if (!memberId) return;
  try { localStorage.removeItem(storageKey(memberId)); } catch { /* unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: memberId }));
}

/** Named search results only: GPS and map-picked locations are never recorded. */
export function useSavedPlaces(memberId?: string) {
  const [snapshot, setSnapshot] = useState(() => ({ memberId, state: read(memberId) }));
  useEffect(() => {
    const refresh = () => setSnapshot({ memberId, state: read(memberId) });
    refresh();
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === memberId) refresh(); };
    const storageChanged = (event: StorageEvent) => { if (memberId && (!event.key || event.key === storageKey(memberId))) refresh(); };
    window.addEventListener(EVENT, changed); window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener(EVENT, changed); window.removeEventListener('storage', storageChanged); };
  }, [memberId]);
  // Never expose the previous account's data during the effect turn after an account switch.
  const state = snapshot.memberId === memberId ? snapshot.state : read(memberId);
  const rememberDestination = useCallback((p: PlaceRef) => {
    if (!validPlace(p)) return;
    write(memberId, s => ({ ...s, recent: [saved(p), ...s.recent.filter(v => v.storageId !== placeId(p))].slice(0, MAX_RECENT) }));
  }, [memberId]);
  const toggleFavorite = useCallback((p: PlaceRef) => {
    if (!validPlace(p)) return;
    write(memberId, s => ({ ...s, favorites: s.favorites.some(v => v.storageId === placeId(p))
      ? s.favorites.filter(v => v.storageId !== placeId(p))
      : [saved(p), ...s.favorites].slice(0, MAX_FAVORITES) }));
  }, [memberId]);
  const removeRecent = useCallback((id: string) => write(memberId, s => ({ ...s, recent: s.recent.filter(v => v.storageId !== id) })), [memberId]);
  const removeFavorite = useCallback((id: string) => write(memberId, s => ({ ...s, favorites: s.favorites.filter(v => v.storageId !== id) })), [memberId]);
  const clearRecent = useCallback(() => write(memberId, s => ({ ...s, recent: [] })), [memberId]);
  return { ...state, rememberDestination, toggleFavorite, removeRecent, removeFavorite, clearRecent,
    isFavorite: (p: PlaceRef) => validPlace(p) && state.favorites.some(v => v.storageId === placeId(p)) };
}
