import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { LatLng, PlaceRef } from '../api/contract';
import { useErrorHandler } from '../lib/app';

/** Place search via the backend proxy (`/api/places/search`), so it also works in mock mode. */
export default function PlaceSearch({ placeholder, bias, onSelect }: { placeholder: string; bias?: LatLng; onSelect(place: PlaceRef): void }) {
  const onError = useErrorHandler();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceRef[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try { setResults(await api.places.search(query.trim(), bias)); } catch (error) { onError(error); } finally { setBusy(false); }
  };

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="btn-secondary shrink-0" disabled={busy || !query.trim()}>검색</button>
      </form>
      {results && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {results.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-500">검색 결과가 없어요. 다른 이름으로 찾거나 지도를 눌러 선택해 주세요.</li>}
          {results.map((p, i) => (
            <li key={p.providerPlaceId ?? i}>
              <button type="button" className="w-full bg-white px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => { onSelect(p); setResults(null); setQuery(''); }}>
                <div className="text-sm font-semibold">{p.name ?? '이름 없는 장소'}</div>
                {p.address && <div className="text-xs text-slate-500">{p.address}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
