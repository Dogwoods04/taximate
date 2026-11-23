import type { PlaceRef } from '../../api/contract';
import { useApp } from '../../lib/app';
import { useSavedPlaces, type SavedPlace } from '../../lib/savedPlaces';

export default function SavedDestinations({ onChoose }: { onChoose(place: PlaceRef): void }) {
  const { member } = useApp();
  const saved = useSavedPlaces(member?.id);
  const rows = (places: SavedPlace[], favorite: boolean) => <ul className="divide-y divide-line">
    {places.map(p => <li key={p.storageId} className="flex items-center gap-1">
      <button type="button" onClick={() => onChoose(p)} className="min-w-0 flex-1 py-3 text-left"><span className="block truncate text-sm font-semibold">{p.name ?? '저장한 장소'}</span>{p.address && <span className="block truncate text-xs text-mute">{p.address}</span>}</button>
      {!favorite && <button type="button" onClick={() => saved.toggleFavorite(p)} aria-label={`${p.name ?? '장소'} 즐겨찾기 ${saved.isFavorite(p) ? '해제' : '추가'}`} className="h-11 w-11 shrink-0 text-lg">{saved.isFavorite(p) ? '★' : '☆'}</button>}
      <button type="button" onClick={() => favorite ? saved.removeFavorite(p.storageId) : saved.removeRecent(p.storageId)} aria-label={`${p.name ?? '장소'} ${favorite ? '즐겨찾기' : '최근 목적지'} 삭제`} className="h-11 w-11 shrink-0 text-sm text-mute">삭제</button>
    </li>)}
  </ul>;
  return <div data-saved-destinations className="space-y-4 py-3">
    <section><h3 className="text-sm font-bold">즐겨찾기</h3>{saved.favorites.length ? rows(saved.favorites, true) : <p className="py-2 text-xs text-mute">검색 결과의 ☆를 눌러 저장해 보세요.</p>}</section>
    <section>
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold">최근 목적지</h3>{saved.recent.length > 0 && <button type="button" className="min-h-10 px-2 text-xs text-mute underline" onClick={saved.clearRecent}>전체 삭제</button>}</div>
      {saved.recent.length ? rows(saved.recent, false) : <p className="py-2 text-xs text-mute">아직 선택한 목적지가 없어요.</p>}
    </section>
  </div>;
}
