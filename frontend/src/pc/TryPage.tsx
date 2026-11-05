import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isMock } from '../api';
import PhoneFrame, { frameSize, PHONE_SIZES, type PhoneSize } from './components/PhoneFrame';
import { TopNav } from './components/chrome';

type Step = { title: string; body: string; tip?: string };
const STEPS: Step[] = [
  { title: '시작하기', body: '‘시작하기’를 누르고 닉네임을 정한 뒤, 위치 정보 안내와 외부 서비스 이용에 동의해요.', tip: '닉네임만으로 시작해요. 전화번호나 실명은 받지 않아요.' },
  { title: '어디로 갈까요?', body: '홈 아래쪽 ‘어디로 갈까요?’를 눌러 출발지와 목적지를 역·건물 이름으로 검색해요.', tip: isMock ? '체험용 데이터: 정왕역 → 시흥시청은 방이 있고, 정왕역 → 월곶역은 방이 없어요.' : '예: 정왕역 → 시흥시청' },
  { title: '비슷한 동선의 방 고르기', body: '지도에 예상 경로가 그려지고, 출발지와 목적지가 가까운 방이 가까운 순으로 보여요. 카드마다 1인 예상 요금과 빈 자리가 있어요.' },
  { title: '참여하거나 새 방 만들기', body: '방을 눌러 소개를 보고 ‘이 방 선택하기’로 참여해요. 맞는 방이 없으면 ‘새 방 만들기’로 직접 열어요.' },
  { title: '만날 장소·채팅', body: '출발까지 남은 시간, 만나는 곳, 1인 요금을 확인하고 ‘약속으로 확정하기’를 눌러요. 옆으로 넘기면 채팅이에요.', tip: isMock ? '체험용 방장은 채팅에 답하고, 내가 확정하면 잠시 뒤 함께 확정해요.' : undefined },
  { title: '함께 타고 요금 나누기', body: '약속 장소에서 만나 택시 한 대를 함께 잡고, 내린 뒤 요금을 나눠요. 택시 호출과 결제는 앱 밖에서 해요.' },
];

const TIPS = [
  'PC에서는 위치가 부정확할 수 있어요 — 시흥시청 기준으로 보여요.',
  '옆으로 넘기는 화면(방 정보 ↔ 채팅)은 아래 작은 막대를 눌러 넘길 수 있어요.',
  '화면 안의 앱은 휴대폰에서 여는 것과 같은 실제 앱이에요.',
];

/** Which guide step the live app is on (same-origin iframe, read-only peek at its route and sheets). */
function stepOf(frame: HTMLIFrameElement | null): number | null {
  try {
    const win = frame?.contentWindow;
    if (!win) return null;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const path = win.location.pathname.slice(base.length) || '/';
    const doc = win.document;
    if (/^\/(start|consent|services)/.test(path)) return 0;
    if (path.startsWith('/rooms/')) return 4;
    if (path === '/') {
      const select = doc.querySelector('section[aria-label="출발지·도착지 선택"]');
      if (!select) return 1;
      return /이 방 선택하기|새 방 만들기|방 만들기/.test(select.textContent ?? '') && /방장|빈 자리|정원/.test(select.textContent ?? '') ? 3 : 2;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TryPage() {
  const [params] = useSearchParams();
  // Deep links on PC (/rooms/…) open here with ?path=…; only same-site app paths are accepted.
  const requested = params.get('path');
  const path = requested && /^\/(?!\/)[\w\-/]*$/.test(requested) ? requested : '/';
  const src = `${import.meta.env.BASE_URL}${path.slice(1)}?view=mobile`;

  const [size, setSize] = useState<PhoneSize>(PHONE_SIZES[0]);
  const [active, setActive] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const pinnedUntil = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // Follow the app: highlight the step it is on, unless the user just picked a step by hand.
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < pinnedUntil.current) return;
      const s = stepOf(frame.current);
      if (s != null) setActive(a => (a === s ? a : s));
    }, 700);
    return () => clearInterval(t);
  }, []);

  const pick = (i: number) => { setActive(i); pinnedUntil.current = Date.now() + 8000; };

  return (
    <div className="flex min-h-screen flex-col bg-fog-soft text-ink lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <TopNav links={false} />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-6 py-8 lg:min-h-0 lg:flex-row lg:gap-12 lg:px-10 lg:py-6">
        <Guide active={active} onPick={pick} />
        <PhoneStage size={size} onSize={setSize} onReload={() => setReloadKey(k => k + 1)}>
          <iframe key={`${reloadKey}-${size.id}`} ref={frame} src={src} title="택시메이트 모바일 앱" allow="geolocation" />
        </PhoneStage>
      </main>
    </div>
  );
}

function Guide({ active, onPick }: { active: number; onPick(i: number): void }) {
  return (
    <section aria-label="사용 가이드" className="flex flex-col lg:min-h-0 lg:w-1/2 lg:max-w-[600px]">
      <p className="text-[15px] font-bold text-[#4F46E5]">사용 가이드</p>
      <h1 className="mt-2 text-[34px] font-bold leading-tight tracking-[-0.04em] xl:text-[38px]"><span className="lg:hidden">아래</span><span className="hidden lg:inline">오른쪽</span> 휴대폰에서<br />직접 눌러 보세요</h1>
      <div className="no-scrollbar mt-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-4">
        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <li key={s.title}>
                <button type="button" onClick={() => onPick(i)} aria-current={on ? 'step' : undefined}
                  className={`flex w-full gap-4 rounded-[22px] px-5 py-4 text-left transition ${on ? 'bg-white shadow-[0_10px_30px_-12px_rgba(21,21,21,.25)] ring-2 ring-ink' : 'hover:bg-white/70'}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold transition ${on ? 'bg-sun text-ink' : 'bg-white text-mute-dark ring-1 ring-line'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[17px] font-bold tracking-tight ${on ? 'text-ink' : 'text-mute-dark'}`}>{s.title}</span>
                    {on && <span className="animate-fade mt-1.5 block text-[15px] leading-relaxed text-mute-dark">{s.body}</span>}
                    {on && s.tip && <span className="animate-fade mt-3 block rounded-2xl bg-sun-pale px-4 py-2.5 text-[13.5px] leading-relaxed text-[#6B5200]">{s.tip}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 rounded-[22px] bg-white p-5 ring-1 ring-line">
          <p className="text-[14px] font-bold">알아 두면 좋아요</p>
          <ul className="mt-2 space-y-1.5">
            {TIPS.map(t => <li key={t} className="flex gap-2.5 text-[14px] leading-relaxed text-mute-dark"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-mute" />{t}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Right half: the phone, scaled to the space it has (aspect kept), with size / reload controls. */
function PhoneStage({ size, onSize, onReload, children }: { size: PhoneSize; onSize(s: PhoneSize): void; onReload(): void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  const frame = frameSize(size);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => {
      const stacked = window.innerWidth < 1024;
      // Stacked layout: fit the window height (minus the nav) so the whole phone is visible while scrolled to it.
      const availH = stacked ? window.innerHeight - 64 - 96 : node.clientHeight;
      const availW = node.clientWidth;
      setScale(Math.max(0.4, Math.min(1.1, availH / frame.h, availW / frame.w)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(node);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [frame.h, frame.w]);

  return (
    <section aria-label="휴대폰 화면" className="flex flex-col items-center lg:min-h-0 lg:flex-1">
      <div ref={box} className="flex w-full flex-1 items-start justify-center lg:min-h-0 lg:items-center">
        <PhoneFrame w={size.w} h={size.h} scale={scale}>{children}</PhoneFrame>
      </div>
      <div className="mt-4 flex shrink-0 items-center gap-2">
        <div className="flex rounded-full bg-white p-1 ring-1 ring-line" role="radiogroup" aria-label="휴대폰 크기">
          {PHONE_SIZES.map(s => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === size.id} onClick={() => onSize(s)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${s.id === size.id ? 'bg-ink text-white' : 'text-mute-dark hover:text-ink'}`}>{s.label}</button>
          ))}
        </div>
        <button type="button" onClick={onReload} className="rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-mute-dark ring-1 ring-line transition hover:text-ink">새로고침</button>
      </div>
    </section>
  );
}
