import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { LatLng, PlaceRef } from '../api/contract';
import { useAction, useApp, useErrorHandler } from '../lib/app';
import { isApiError } from '../lib/errors';
import { toLocalInput, toOffsetIso } from '../lib/format';
import MapView, { type MapMarker } from '../components/MapView';
import PlaceSearch from '../components/PlaceSearch';
import { Notice, Segmented, Spinner } from '../components/ui';

const SIHEUNG_CENTER: LatLng = { lat: 37.375, lng: 126.77 };
type Departure = 'now' | '15' | '30' | 'custom';
type Target = 'origin' | 'destination';

export default function NewTripPage() {
  const { member, toast } = useApp();
  const onError = useErrorHandler();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [origin, setOrigin] = useState<PlaceRef | null>(null);
  const [destination, setDestination] = useState<PlaceRef | null>(null);
  const [target, setTarget] = useState<Target>('origin');
  const [locating, setLocating] = useState(false);
  const [departure, setDeparture] = useState<Departure>('now');
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60000)));
  const [passengerCount, setPassengerCount] = useState(1);
  const [maxWait, setMaxWait] = useState(15);
  const [maxDetour, setMaxDetour] = useState(10);

  useEffect(() => {
    let cancelled = false;
    api.trips.active()
      .then(trip => { if (!cancelled && trip) navigate(`/trips/${trip.id}`, { replace: true }); })
      .catch(onError)
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [navigate, onError]);

  const assign = (place: PlaceRef, which: Target) => {
    if (which === 'origin') { setOrigin(place); if (!destination) setTarget('destination'); }
    else setDestination(place);
  };

  const pickOnMap = async (point: LatLng) => {
    const which = target;
    try {
      const place = await api.places.reverse(point);
      assign({ ...place, kind: 'MAP_PICK', location: point }, which);
    } catch {
      assign({ name: '지도에서 선택한 위치', location: point, kind: 'MAP_PICK' }, which);
    }
  };

  // One-shot GPS fix, only when the user taps the button. No watchPosition / background tracking.
  const locateOnce = () => {
    if (!('geolocation' in navigator)) { toast('이 브라우저는 위치 기능을 지원하지 않아요. 검색이나 지도로 선택해 주세요.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        let place: PlaceRef = { name: '현재 위치', location: point, kind: 'GPS' };
        try { const r = await api.places.reverse(point); place = { ...place, address: r.address ?? null }; } catch { /* label stays generic */ }
        setOrigin(place);
        setTarget('destination');
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast('현재 위치를 가져오지 못했어요. 장소를 검색하거나 지도를 눌러 출발지를 선택해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const departureDate = (): Date => {
    if (departure === 'now') return new Date();
    if (departure === 'custom') return new Date(custom);
    return new Date(Date.now() + Number(departure) * 60000);
  };

  const submit = async () => {
    if (!origin || !destination) return;
    const date = departureDate();
    if (Number.isNaN(date.getTime())) { toast('출발 시간을 확인해 주세요.'); return; }
    try {
      const trip = await run(async () => {
        try {
          return await api.trips.create({
            origin, destination, desiredDepartureAt: toOffsetIso(date),
            maxWaitMinutes: maxWait, maxDetourMinutes: maxDetour, passengerCount,
          });
        } catch (error) {
          if (isApiError(error, 'ACTIVE_TRIP_EXISTS')) {
            const active = await api.trips.active();
            if (active) { toast('이미 진행 중인 이동이 있어 그 화면으로 이동해요.', 'info'); navigate(`/trips/${active.id}`); return undefined; }
          }
          throw error;
        }
      });
      if (trip) navigate(`/trips/${trip.id}`);
    } catch (error) { onError(error); }
  };

  if (checking) return <Spinner />;
  const markers: MapMarker[] = [];
  if (origin) markers.push({ position: origin.location, label: '출발', color: '#245b47' });
  if (destination) markers.push({ position: destination.location, label: '도착', color: '#dc2626' });
  const noConsent = !member?.locationConsent;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">어디로 이동하세요?</h1>
      {noConsent && (
        <Notice tone="warn">
          이동을 등록하려면 위치 정보 이용 동의가 필요해요. <Link to="/consent" className="font-semibold underline">동의하러 가기</Link>
        </Notice>
      )}

      <div className="card space-y-3">
        <PlaceField label="출발지" place={origin} onClear={() => setOrigin(null)} />
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" disabled={locating} onClick={locateOnce}>
            📍 {locating ? '위치 확인 중…' : '현재 위치 사용'}
          </button>
        </div>
        <PlaceSearch placeholder="출발지 검색 (예: 정왕역)" bias={origin?.location} onSelect={p => assign(p, 'origin')} />
        <hr className="border-slate-100" />
        <PlaceField label="도착지" place={destination} onClear={() => setDestination(null)} />
        <PlaceSearch placeholder="도착지 검색 (예: 시흥시청)" bias={origin?.location} onSelect={p => assign(p, 'destination')} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">지도에서 선택</span>
          <div className="w-44">
            <Segmented value={target} onChange={setTarget} options={[{ value: 'origin', label: '출발지' }, { value: 'destination', label: '도착지' }]} />
          </div>
        </div>
        <MapView center={origin?.location ?? SIHEUNG_CENTER} markers={markers} onPick={pickOnMap} height={240} />
      </div>

      <div className="card space-y-4">
        <div>
          <span className="label">희망 출발 시간</span>
          <Segmented value={departure} onChange={setDeparture} options={[{ value: 'now', label: '지금' }, { value: '15', label: '+15분' }, { value: '30', label: '+30분' }, { value: 'custom', label: '직접' }]} />
          {departure === 'custom' && (
            <input type="datetime-local" className="input mt-2" value={custom} min={toLocalInput(new Date())} max={toLocalInput(new Date(Date.now() + 7 * 86400000))} onChange={e => setCustom(e.target.value)} />
          )}
        </div>
        <div>
          <span className="label">함께 타는 인원 (나 포함)</span>
          <Segmented value={passengerCount} onChange={setPassengerCount} options={[1, 2, 3].map(n => ({ value: n, label: `${n}명` }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="maxWait">최대 대기</label>
            <select id="maxWait" className="input" value={maxWait} onChange={e => setMaxWait(Number(e.target.value))}>
              {[0, 5, 10, 15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n}분</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="maxDetour">허용 우회</label>
            <select id="maxDetour" className="input" value={maxDetour} onChange={e => setMaxDetour(Number(e.target.value))}>
              {[0, 5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}분</option>)}
            </select>
          </div>
        </div>
      </div>

      <button type="button" className="btn-primary w-full py-3 text-base" disabled={!origin || !destination || busy || noConsent} onClick={submit}>
        경로 확인하기
      </button>
    </div>
  );
}

function PlaceField({ label, place, onClear }: { label: string; place: PlaceRef | null; onClear(): void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="label">{label}</div>
        {place ? (
          <>
            <div className="truncate text-sm font-semibold">{place.name ?? '선택한 위치'}</div>
            {place.address && <div className="truncate text-xs text-slate-500">{place.address}</div>}
          </>
        ) : (
          <div className="text-sm text-slate-400">아직 선택하지 않았어요</div>
        )}
      </div>
      {place && <button type="button" className="btn-ghost text-xs" onClick={onClear}>변경</button>}
    </div>
  );
}
