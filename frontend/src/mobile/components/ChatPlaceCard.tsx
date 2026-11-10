import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { Message, PlaceRef, RoomDetail } from '../../api/contract';
import { distance } from '../../api/geo';
import { useAction } from '../../lib/app';

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
/**
 * Names as people say them: “서울특별시청” → “서울시청”, “진부(오대산)역” → “진부역”.
 * Kakao returns official names, so a chat phrase rarely equals them character for character.
 */
const colloquial = (s: string) => normalize(s.replace(/\([^)]*\)/g, ''))
  .replace(/특별자치시|특별자치도|특별시|광역시/g, m => (m.endsWith('도') ? '도' : '시'));

/** 'proposal': a member's “X(주소)을(를) … 제안해요” card message. */
type Intent = 'meeting' | 'destination' | 'proposal';
type Phrase = { phrase: string; intent?: Intent };

/** “만나는 지점/약속 장소/출발지 …” → meeting place; “목적지/도착지/내리는 곳 …” → destination. */
const MEETING_WORDS = '(?:만나는|만날|모이는|모일)\\s*(?:지점|장소|곳|위치)|약속\\s*장소|출발지|출발\\s*장소|타는\\s*곳';
const DEST_WORDS = '목적지|도착지|도착\\s*장소|내리는\\s*곳|내릴\\s*곳|가는\\s*곳';
/** “<topic>을 <X>(으)로 바꿀까요/변경해요/정해요/할까요/가요…”: X may contain spaces (“경기 과학기술대학교”). */
const INTENT_PATTERN = new RegExp(
  `(${MEETING_WORDS}|${DEST_WORDS})\\s*(?:을|를|은|는|이|가|도)?\\s*(.{2,30}?)\\s*(?:쪽으로|으로|로)\\s*(?:바꿔|바꾸|바꿀|바꿨|변경|정해|정하|정할|할까|하면|해요|하죠|합시다|가요|갈까|가면|어때|괜찮)`, 'g');
const DEST_TOPIC = new RegExp(`^(?:${DEST_WORDS})$`);

/** Prefer the last place: “시흥시청 말고 시흥소방서로” means the fire station. */
function placePhrase(body: string): Phrase | undefined {
  const proposal = body.match(/^(.+?)\(.+\)을\(를\) 만날 장소나 목적지로 제안해요$/);
  if (proposal) return { phrase: proposal[1].trim(), intent: 'proposal' };
  // An explicit “change the meeting place / destination to X” names any place, whatever its name ends with.
  const intent = [...body.matchAll(INTENT_PATTERN)].at(-1);
  if (intent) {
    const phrase = intent[2].trim().replace(/\s*(?:앞|쪽|근처|부근|입구)$/, '').replace(/^["'“‘]|["'”’]$/g, '').trim();
    if (phrase.length >= 2) return { phrase, intent: DEST_TOPIC.test(intent[1]) ? 'destination' : 'meeting' };
  }
  const pattern = /[가-힣A-Za-z0-9·]+(?:로|길|동)\s*\d+(?:-\d+)?|[가-힣A-Za-z0-9·]+(?:주민센터|대학교|정류장|터미널|백화점|소방서|아파트|아울렛|병원|학교|센터|공원|시청|구청|마트|빌딩|타워|호텔|카페|은행|역)(?:\s*\d+\s*번?\s*출구)?|\d+\s*번?\s*출구/g;
  const matches = [...body.matchAll(pattern)];
  const last = matches.at(-1)?.[0].trim();
  return last ? { phrase: last } : undefined;
}

function matchesPlace(phrase: string, place: PlaceRef) {
  const q = normalize(phrase), name = normalize(place.name ?? ''), address = normalize(place.address ?? '');
  const cq = colloquial(phrase), short = colloquial(place.name ?? ''), shortAddress = colloquial(place.address ?? '');
  // A station result must not silently replace a specifically mentioned exit.
  const exit = q.match(/^(.+역)(\d+)번?출구$/);
  if (exit) return name.includes(exit[1]) && name.match(/(\d+)번?출구/)?.[1] === exit[2];
  if (name.includes(q) || address.includes(q) || short.includes(cq) || shortAddress.includes(cq)) return true;
  // “경기 과학기술대학교” ↔ “경기과학기술대학교”: every word of the phrase appears in the name or address.
  const words = phrase.split(/\s+/).map(normalize).filter(Boolean);
  return words.length > 1 && words.every(w => name.includes(w) || address.includes(w) || short.includes(colloquial(w)));
}

type Suggestion = { phrase: string; intent?: Intent; place: PlaceRef; messageId: string };

/**
 * Already the room's meeting place or destination → nothing to suggest. Same name, or close enough:
 * meeting points carry exact coordinates; the destination shown to members is a ~110 m grid point.
 */
function isCurrentPlace(room: RoomDetail, place: PlaceRef) {
  const name = normalize(place.name ?? '');
  const mp = room.meetingPoint;
  if (mp && ((name && normalize(mp.name) === name) || distance(mp.location, place.location) <= 60)) return true;
  if (name && room.destinationName && normalize(room.destinationName) === name) return true;
  return distance(room.approxDestination, place.location) <= 150;
}

export default function ChatPlaceCard({ room, messages, myId, onSaved, onSent }: {
  room: RoomDetail; messages: Message[]; myId?: string;
  onSaved(room: RoomDetail): void; onSent(message: Message): void;
}) {
  const storageKey = `taximate.chatPlaces.${myId}.${room.id}`;
  const [handled] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as string[]); }
    catch { return new Set(); }
  });
  const seen = useRef(new Set<string>());
  const cache = useRef(new Map<string, Promise<PlaceRef | null>>());
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { busy, run } = useAction();
  const proposalId = useRef(crypto.randomUUID());
  const near = room.meetingPoint?.location ?? room.approxOrigin;

  useEffect(() => {
    if (room.readOnly) { setSuggestion(null); return; }
    let latest: (Phrase & { messageId: string }) | undefined;
    for (const message of messages) {
      if (seen.current.has(message.id)) continue;
      if (message.type !== 'TEXT' || message.hidden || !message.body) continue;
      const found = placePhrase(message.body);
      if (found && !handled.has(normalize(found.phrase))) latest = { ...found, messageId: message.id };
    }
    if (!latest) return;
    let cancelled = false;
    const candidate = latest;
    const timer = setTimeout(() => {
      // One candidate from a history/burst, never a queue of stale popup cards.
      setSuggestion(null); setConfirm(false);
      const key = normalize(candidate.phrase);
      let lookup = cache.current.get(key);
      if (!lookup) {
        lookup = api.places.search(candidate.phrase, near).then(results => {
          const p = results[0];
          // “목적지를 X로” and a member's proposal may name a place anywhere in the country (outside Siheung too);
          // a place only mentioned in passing has to be nearby to count as a meeting spot.
          const anywhere = candidate.intent === 'destination' || candidate.intent === 'proposal';
          return p && matchesPlace(candidate.phrase, p) && (anywhere || distance(near, p.location) <= 30000) ? p : null;
        }).catch(() => null);
        cache.current.set(key, lookup);
      }
      void lookup.then(place => {
        if (!cancelled) messages.forEach(m => seen.current.add(m.id));
        if (!cancelled && place && !handled.has(key) && !isCurrentPlace(room, place)) {
          setSuggestion({ ...candidate, place }); proposalId.current = crypto.randomUUID();
        }
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [messages, room.readOnly, near.lat, near.lng, handled]);

  const dismiss = () => {
    if (!suggestion) return;
    handled.add(normalize(suggestion.phrase));
    handled.add(normalize(suggestion.place.name ?? suggestion.phrase));
    try { sessionStorage.setItem(storageKey, JSON.stringify([...handled])); } catch { /* private mode */ }
    setSuggestion(null); setConfirm(false);
  };
  // Re-checked on every render: once the host applies it (or it already is the meeting place / destination), hide.
  if (!suggestion || room.readOnly || isCurrentPlace(room, suggestion.place) || !messages.some(m => m.id === suggestion.messageId && !m.hidden)) return null;
  const { place } = suggestion;
  const name = place.name || suggestion.phrase;
  const far = distance(near, place.location) > 30000;
  const apply = async (destination: boolean) => {
    const updated = await run(() => destination
      ? api.rooms.destination(room.id, { destination: place })
      : api.rooms.plan(room.id, {
        meetingPoint: { name, address: place.address, location: place.location, kind: 'CUSTOM' },
        departureAt: room.departureAt, terms: room.terms,
      }));
    if (updated) { dismiss(); onSaved(updated); }
  };
  const propose = async () => {
    const sent = await run(() => api.messages.send(room.id, {
      body: `${name}(${place.address || '주소 정보 없음'})을(를) 만날 장소나 목적지로 제안해요`, clientMessageId: proposalId.current,
    }));
    if (sent) { dismiss(); onSent(sent); }
  };
  return <aside aria-label="채팅 장소 제안" aria-live="polite" className="relative mt-2 shrink-0 rounded-2xl border border-ink/10 bg-sun-pale p-3 text-[0.8125rem]">
    <button type="button" aria-label="장소 제안 닫기" disabled={busy} onClick={dismiss} className="absolute right-1 top-1 grid h-8 w-8 place-items-center text-lg">×</button>
    <p className="pr-7 font-semibold">{name}</p>
    <p className="pr-7 text-xs text-mute-dark">{place.address}</p>
    {room.myRole === 'HOST' ? confirm ? <>
      <p className="mt-2">목적지를 {name}로 바꾸면 경로·요금이 다시 계산되고 모두 다시 확정해야 해요</p>
      <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void apply(true)} className="flex-1 rounded-xl bg-ink px-3 py-2 text-white">목적지 변경 확정</button><button type="button" disabled={busy} onClick={() => setConfirm(false)} className="rounded-xl bg-white px-3 py-2">돌아가기</button></div>
    </> : <>
      <p className="mt-2">{suggestion.intent === 'destination' || far ? '목적지로 바꿀까요?' : suggestion.intent === 'meeting' ? '만날 장소로 바꿀까요?' : '만날 장소나 목적지로 바꿀까요?'}</p>
      {/* The sentence's intent (“목적지를 …로”) decides which choice is the primary (black) button. */}
      <div className={`mt-2 flex gap-2 ${suggestion.intent === 'destination' ? 'flex-row-reverse' : ''}`}>
        {/* A place far from where we meet (another city) can only be the destination. */}
        {!far && <button type="button" aria-label={`만날 장소를 ${name}로 바꿀까요?`} disabled={busy} onClick={() => void apply(false)} className={`flex-1 rounded-xl px-3 py-2 ${suggestion.intent === 'destination' ? 'bg-white' : 'bg-ink text-white'}`}>만날 장소로</button>}
        <button type="button" aria-label={`목적지를 ${name}로 바꿀까요?`} disabled={busy} onClick={() => setConfirm(true)} className={`flex-1 rounded-xl px-3 py-2 ${suggestion.intent === 'destination' || far ? 'bg-ink text-white' : 'bg-white'}`}>목적지로</button>
      </div>
    </> : <button type="button" disabled={busy} onClick={() => void propose()} className="mt-2 w-full rounded-xl bg-ink px-3 py-2 text-white">방장에게 제안하기</button>}
  </aside>;
}
