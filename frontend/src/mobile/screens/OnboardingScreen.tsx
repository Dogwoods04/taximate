import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { beginKakaoLogin, kakaoPendingName } from '../../lib/kakaoLogin';
import GenderStep from './GenderStep';
import { api, isMock } from '../../api';
import { session } from '../../api/client';
import { useAction, useApp } from '../../lib/app';
import { formatTime } from '../../lib/format';
import { demoPrefix, loadAuthOptions, nicknameValid, stripPrefix, useAuthOptions, withPrefix } from '../../lib/authOptions';
import { ArrowIcon, CheckIcon, ChevronLeftIcon, InfoIcon } from '../components/icons';
import { REQUIRED_SERVICE_ITEMS, type Member } from '../../api/contract';
import type { LegalDocId } from '../../legal/documents';
import { LegalOverlay } from './LegalScreen';

export const SERVICES_NOTICE_VERSION = '2026-11-v1';

export const LOCATION_POLICY_VERSION = '2026-11-v1';

/** Inline link that opens a policy over the flow, so nothing typed on the step is lost. */
function LegalLink({ id, children }: { id: LegalDocId; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-white/80 underline underline-offset-4">{children}</button>
      {open && <LegalOverlay id={id} onClose={() => setOpen(false)} />}
    </>
  );
}
type Step = 'intro' | 'name' | 'age' | 'gender' | 'consent' | 'services';

/** First onboarding step this member still has to do (age → gender → location → services), or null when done. */
function nextStep(m: Member): Step | null {
  if (!m.ageConfirmed) return 'age';
  if (m.gender !== 'MALE' && m.gender !== 'FEMALE') return 'gender'; // rooms are same-gender only
  if (!m.locationConsent) return 'consent';
  if (!m.servicesConsent) return 'services';
  return null;
}

/** Start (intro) → 사용자 이름 → 위치 정보 동의 → 외부 서비스 동의, one dark full-screen flow with cross-step motion. */
export default function OnboardingScreen({ consentOnly = false, servicesOnly = false }: { consentOnly?: boolean; servicesOnly?: boolean }) {
  const { member, loading } = useApp();
  const [step, setStep] = useState<Step>(servicesOnly ? 'services' : consentOnly ? 'consent' : 'intro');
  const [leaving, setLeaving] = useState(false);
  const loggedInHere = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!member || consentOnly || servicesOnly) return;
    const next = sessionStorage.getItem(kakaoPendingName) === member.id ? 'name' : nextStep(member);
    if (next) setStep(next);
  }, [member?.id, loading, consentOnly, servicesOnly]);

  const go = (next: Step) => {
    setLeaving(true);
    setTimeout(() => { setStep(next); setLeaving(false); }, 380);
  };

  const only = consentOnly || servicesOnly;
  const finish = (m: Member) => { const next = nextStep(m); if (next) go(next); else navigate('/', { replace: true }); };
  if (!only && session.get() && loading) return <Dark><div className="grid flex-1 place-items-center"><div className="spinner" style={{ borderColor: 'rgba(255,255,255,.15)', borderTopColor: '#FFD966' }} /></div></Dark>;
  // A saved session skips the intro entirely.
  const onboarded = !!member && !nextStep(member);
  if (!only && member && onboarded && sessionStorage.getItem(kakaoPendingName) !== member.id && !loggedInHere.current) return <Navigate to="/" replace />;

  return (
    <Dark>
      {step === 'intro' && <Intro leaving={leaving} onStart={() => go('name')} />}
      {step === 'name' && <NameStep leaving={leaving} onBack={() => go('intro')} onDone={m => { loggedInHere.current = true; finish(m); }} />}
      {step === 'age' && <AgeStep leaving={leaving} onDone={m => { loggedInHere.current = true; finish(m); }} onSwitch={() => go('intro')} />}
      {step === 'gender' && <GenderStep onDone={finish} />}
      {step === 'consent' && <ConsentStep leaving={leaving} />}
      {step === 'services' && <ServicesStep leaving={leaving} />}
    </Dark>
  );
}

function Dark({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex flex-col overflow-y-auto bg-ink text-white">{children}</div>;
}

const rise = (leaving: boolean, delay: number) => leaving
  ? { className: 'animate-sink', style: { animationDelay: `${Math.min(delay, 120)}ms` } }
  : { className: 'animate-rise', style: { animationDelay: `${delay}ms` } };

function Brand() {
  return (
    <div className="flex items-center gap-1.5">
      <ArrowIcon size={26} className="-scale-x-100 text-white" />
      <span className="text-[1.625rem] font-bold tracking-tight text-sun">택시메이트</span>
    </div>
  );
}

// ---------------------------------------------------------------- Start

function Intro({ leaving, onStart }: { leaving: boolean; onStart(): void }) {
  const [info, setInfo] = useState(false);
  const [options, setOptions] = useState({ devLogin: false, kakao: false });
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadAuthOptions().then(setOptions).catch(() => setAuthError('로그인 방법을 불러오지 못했어요. 새로고침해 주세요.'));
    const message = sessionStorage.getItem('taximate.login.message');
    if (message) { setAuthError(message); sessionStorage.removeItem('taximate.login.message'); }
  }, []);
  const kakao = async () => {
    setBusy(true); setAuthError('');
    try { await beginKakaoLogin(); } catch (e) { setAuthError(e instanceof Error ? e.message : '다시 시도해 주세요.'); setBusy(false); }
  };
  return (
    <div className="flex min-h-full flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between border-b border-white/25 pb-6">
        <Brand />
        <button type="button" onClick={() => setInfo(v => !v)} aria-expanded={info} aria-label="서비스 안내" className="text-sun transition active:scale-90"><InfoIcon size={26} /></button>
      </header>
      {info && (
        <p className="animate-fade mt-4 rounded-2xl bg-white/[.06] px-4 py-3 text-[0.8125rem] leading-relaxed text-white/70">
          택시메이트는 시흥에서 비슷한 동선으로 이동하는 이웃을 찾아 택시 동승을 조율해 주는 MVP 서비스예요. 택시 호출·결제는 하지 않고, 다른 사람에게는 대략적인 위치만 보여요.
        </p>
      )}

      <div className="mt-[9vh] text-center">
        <h1 {...rise(leaving, 0)} className={`${rise(leaving, 0).className} text-[2.5rem] font-bold leading-[1.15] tracking-[-0.03em]`}>같은 방향이면,<br />함께 타요</h1>
        <p {...rise(leaving, 90)} className={`${rise(leaving, 90).className} mt-4 text-[1.0625rem] text-white/60`}>시흥 이웃과 택시를 나눠 타는 가장 가벼운 방법</p>
      </div>

      <RouteArt leaving={leaving} />

      <div className={`mt-auto shrink-0 ${leaving ? 'animate-sink' : 'animate-rise'}`} style={{ animationDelay: leaving ? '60ms' : '220ms' }}>
        <button type="button" disabled={!options.kakao || busy} className="btn w-full gap-3 text-[1.125rem]" style={{ background: '#FEE500', color: 'rgba(0,0,0,.85)' }} onClick={kakao}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C5.9 3 1 6.7 1 11.2c0 2.9 2 5.5 5 7l-1.3 4.6c-.1.4.3.6.6.4l5.4-3.6 1.3.1c6.1 0 11-3.7 11-8.3S18.1 3 12 3Z" /></svg>
          {busy ? '연결 중…' : '카카오 로그인'}
        </button>
        {options.devLogin && <button type="button" className="mt-4 w-full py-2 text-center text-sm text-white/65 underline underline-offset-4" onClick={onStart}>닉네임으로 체험하기</button>}
        {authError && <p role="alert" className="mt-3 text-center text-sm text-white/75">{authError}</p>}
      </div>
    </div>
  );
}

/** Decorative: the mockup's light beam, with two dotted paths merging into one route. */
function RouteArt({ leaving }: { leaving: boolean }) {
  return (
    <div className={`pointer-events-none relative mx-auto my-6 min-h-[8.75rem] w-full max-w-[20rem] flex-1 basis-[200px] max-h-[240px] ${leaving ? 'animate-sink' : 'animate-fade'}`} aria-hidden>
      <div className="absolute inset-x-[18%] bottom-0 top-0 rounded-t-[48px] bg-gradient-to-b from-sun/40 via-sun/10 to-transparent [clip-path:polygon(18%_0,82%_0,100%_100%,0_100%)]" />
      <svg viewBox="0 0 320 220" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        <path d="M60 20 C 80 90, 150 100, 160 140" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
        <path d="M260 30 C 240 90, 170 100, 160 140" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
        <path d="M160 140 L 160 210" fill="none" stroke="#FFD966" strokeWidth="6" strokeLinecap="round" strokeDasharray="14 6" style={{ animation: 'route-dash 1.2s linear infinite' }} />
        <circle cx="60" cy="20" r="8" fill="#151515" stroke="#fff" strokeWidth="4" />
        <circle cx="260" cy="30" r="8" fill="#151515" stroke="#fff" strokeWidth="4" />
        <circle cx="160" cy="140" r="11" fill="#FFD966" stroke="#151515" strokeWidth="4" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- 사용자 이름

function NameStep({ leaving, onBack, onDone }: { leaving: boolean; onBack(): void; onDone(member: Member): void }) {
  const { member, setMember } = useApp();
  const { busy, run } = useAction();
  const options = useAuthOptions();
  // Demo accounts: the server's prefix is a fixed part of the name ("샘플_" + what the user types).
  const prefix = demoPrefix(options, member);
  const [nickname, setNickname] = useState(member?.nickname ?? '');
  const [over14, setOver14] = useState(false);
  const needAge = !member?.ageConfirmed;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 450); return () => clearTimeout(t); }, []);
  useEffect(() => { if (prefix) setNickname(n => stripPrefix(prefix, n)); }, [prefix]);
  const typed = stripPrefix(prefix, nickname).trim();
  const full = withPrefix(prefix, nickname);
  const valid = nicknameValid(prefix, nickname) && (!needAge || over14);

  // A failed confirmation keeps the member unconfirmed; onboarding then shows the age step on its own.
  const confirmAge = async (m: Member) => m.ageConfirmed ? m : (await run(() => api.identity.confirmAge({ over14: true }))) ?? m;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    if (member) {
      const updated = full === member.nickname ? member : await run(() => api.identity.rename({ nickname: full }));
      if (!updated) return;
      sessionStorage.removeItem(kakaoPendingName);
      const confirmed = await confirmAge(updated);
      setMember(confirmed); onDone(confirmed); return;
    }
    // With a demo prefix the backend accepts only "<prefix>_…" names — and admin names. Try the name as typed
    // first (silently; it succeeds only for an admin), then the demo name.
    let res: Awaited<ReturnType<typeof api.identity.login>> | undefined;
    if (prefix && typed !== full) res = await api.identity.login({ nickname: typed }).catch(() => undefined);
    if (!res) res = await run(() => api.identity.login({ nickname: full }));
    if (!res) return;
    session.set(res.token);
    const confirmed = await confirmAge(res.member);
    setMember(confirmed);
    onDone(confirmed);
  };

  return (
    <form onSubmit={submit} className="flex min-h-full flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
      <button type="button" onClick={onBack} aria-label="뒤로" className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80 transition active:bg-white/10"><ChevronLeftIcon /></button>
      <p {...rise(leaving, 0)} className={`${rise(leaving, 0).className} mt-10 short:mt-5 text-[0.9375rem] font-semibold text-sun`}>1 / 4</p>
      <h1 {...rise(leaving, 60)} className={`${rise(leaving, 60).className} mt-3 text-[2.75rem] short:text-[2.25rem] font-bold leading-[1.1] tracking-[-0.035em]`}>어떻게<br />불러드릴까요?</h1>
      <p {...rise(leaving, 120)} className={`${rise(leaving, 120).className} mt-4 text-[1.0625rem] leading-relaxed text-white/55`}>함께 탈 이웃에게 보이는 이름이에요.</p>

      <div {...rise(leaving, 180)} className={`${rise(leaving, 180).className} mt-14 short:mt-8`}>
        <label htmlFor="nickname" className="sr-only">사용자 이름</label>
        <div className="flex items-center gap-2.5 border-b-2 border-white/20 pb-3 transition-colors focus-within:border-sun">
          {prefix && <span className="shrink-0 select-none rounded-xl bg-sun/15 px-2.5 py-1 text-[1.375rem] font-bold tracking-tight text-sun" title="체험용 계정의 고정된 앞부분">{prefix}_</span>}
          <input
            ref={input}
            id="nickname"
            value={nickname}
            maxLength={prefix ? 20 - prefix.length - 1 : 20}
            autoComplete="nickname"
            onChange={e => setNickname(stripPrefix(prefix, e.target.value))}
            placeholder={prefix ? '이름' : '사용자 이름'}
            className="min-w-0 flex-1 bg-transparent text-[2.125rem] font-semibold tracking-tight text-white caret-sun outline-none placeholder:text-white/20"
          />
        </div>
        <div className="mt-3 flex justify-between text-[0.8125rem] text-white/40">
          <span>{typed.length > 0 && full.length < 2 ? '2자 이상 입력해 주세요' : '2–20자'}</span>
          <span>{prefix && !typed ? 0 : full.length}/20</span>
        </div>
        {prefix && <p className="mt-2 text-[0.8125rem] text-white/60">체험용 계정은 '{prefix}_'로 시작해요</p>}
      </div>

      <div className={`mt-auto pt-10 ${leaving ? 'animate-sink' : 'animate-rise'}`} style={{ animationDelay: leaving ? '0ms' : '240ms' }}>
        {needAge && <AgeCheck on={over14} onToggle={() => setOver14(v => !v)} className="mb-5" />}
        <p className="mb-4 text-center text-[0.8125rem] leading-relaxed text-white/50">계속하면 <LegalLink id="terms">이용약관</LegalLink>에 동의하고 <LegalLink id="privacy">개인정보 처리방침</LegalLink>을 확인한 것으로 봐요.</p>
        <button type="submit" className="btn-sun w-full" disabled={!valid || busy}>{busy ? '확인 중…' : '계속'}</button>
        <p className="mt-4 text-center text-xs leading-relaxed text-white/35">
          {member?.authProvider === 'KAKAO' ? '카카오 이름을 가져왔어요. 원하는 이름으로 바꿀 수 있어요.' : '닉네임으로 체험하는 개발용 로그인이에요.'}
          {isMock && <><br />MOCK 모드: <b className="text-white/60">admin</b>으로 시작하면 운영자 메뉴가 보여요.</>}
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 만 14세 이상 확인

function AgeCheck({ on, onToggle, className = '' }: { on: boolean; onToggle(): void; className?: string }) {
  return (
    <div className={className}>
      <button type="button" role="checkbox" aria-checked={on} onClick={onToggle}
        className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-5 py-4 text-left transition ${on ? 'border-sun/60 bg-sun/[.06]' : 'border-white/15'}`}>
        <span className="text-[1.0625rem] font-semibold">만 14세 이상입니다 <span className="text-[0.8125rem] font-medium text-sun">(필수)</span></span>
        <Check on={on} />
      </button>
      <p className="mt-2 px-1 text-[0.8125rem] text-white/45">만 14세 미만은 이용할 수 없어요.</p>
    </div>
  );
}

/** Existing members who never confirmed their age (the name step asks everyone who passes through it). */
function AgeStep({ leaving, onDone, onSwitch }: { leaving: boolean; onDone(member: Member): void; onSwitch(): void }) {
  const { setMember, logout } = useApp();
  const { busy, run } = useAction();
  const [over14, setOver14] = useState(false);
  const submit = async () => {
    const updated = await run(() => api.identity.confirmAge({ over14: true }));
    if (!updated) return;
    setMember(updated); onDone(updated);
  };
  return (
    <div className="flex min-h-full flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
      <div className="h-11" />
      <p {...rise(leaving, 0)} className={`${rise(leaving, 0).className} mt-10 short:mt-5 text-[0.9375rem] font-semibold text-sun`}>시작하기 전에</p>
      <h1 {...rise(leaving, 60)} className={`${rise(leaving, 60).className} mt-3 text-[2.75rem] short:text-[2.25rem] font-bold leading-[1.1] tracking-[-0.035em]`}>나이를<br />확인할게요</h1>
      <p {...rise(leaving, 120)} className={`${rise(leaving, 120).className} mt-4 text-[1.0625rem] leading-relaxed text-white/55`}>택시메이트는 만 14세 이상만 이용할 수 있어요. 한 번만 확인하면 돼요.</p>

      <div className={`mt-auto pt-10 ${leaving ? 'animate-sink' : 'animate-rise'}`} style={{ animationDelay: leaving ? '0ms' : '200ms' }}>
        <AgeCheck on={over14} onToggle={() => setOver14(v => !v)} className="mb-5" />
        <button type="button" className="btn-sun w-full" disabled={!over14 || busy} onClick={submit}>{busy ? '확인 중…' : '계속'}</button>
        <button type="button" className="mt-4 w-full py-2 text-center text-sm text-white/50 underline underline-offset-4"
          onClick={() => { sessionStorage.removeItem(kakaoPendingName); logout(); onSwitch(); }}>다른 계정으로 시작하기</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 위치 정보 동의

const POINTS: [string, string][] = [
  ['필요할 때 한 번만', '홈 화면을 열 때와 내 위치 버튼을 누를 때만 GPS를 한 번 확인해요. 계속 추적하지 않아요.'],
  ['동선을 찾는 데만', '출발지·도착지는 비슷한 동선의 이웃(반경 500m)과 만날 장소를 찾는 데만 써요.'],
  ['남에게는 장소 이름만', '다른 이용자에게는 내가 고른 장소 이름(역·건물 등)과 예상 경로만 보여요. 내 GPS 위치와 주소는 보이지 않아요.'],
  ['24시간 안에 삭제', '이동이 끝나거나 취소·만료되면 24시간 이내에 정밀 좌표를 지워요.'],
];

function ConsentStep({ leaving }: { leaving: boolean }) {
  const { member, refreshMember, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const consent = member?.locationConsent ?? null;

  const agree = async () => {
    const ok = await run(() => api.identity.agree({ policyVersion: LOCATION_POLICY_VERSION }));
    if (!ok) return;
    await refreshMember();
    const next = from && !['/consent', '/start', '/services'].includes(from) ? from : '/';
    if (member && !member.servicesConsent) navigate('/services', { replace: true, state: { from: next } });
    else navigate(next, { replace: true });
  };
  const withdraw = async () => {
    if (!window.confirm('동의를 철회하면 진행 중인 이동이 취소되고, 동행을 찾을 수 없어요. 철회할까요?')) return;
    const done = await run(async () => { await api.identity.withdraw(); return true; });
    if (!done) return;
    await refreshMember();
    toast('위치 정보 이용 동의를 철회했어요.', 'info');
  };

  return (
    <div className="flex min-h-full flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
      {consent
        ? <button type="button" onClick={() => navigate('/')} aria-label="뒤로" className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80 transition active:bg-white/10"><ChevronLeftIcon /></button>
        : <div className="h-11" />}
      <p {...rise(leaving, 0)} className={`${rise(leaving, 0).className} mt-10 short:mt-5 text-[0.9375rem] font-semibold text-sun`}>{consent ? '위치 정보 동의' : '3 / 4'}</p>
      <h1 {...rise(leaving, 60)} className={`${rise(leaving, 60).className} mt-3 text-[2.75rem] short:text-[2.25rem] font-bold leading-[1.1] tracking-[-0.035em]`}>위치는<br />필요한 순간에만.</h1>

      <ol className="mt-10 space-y-6 short:mt-6 short:space-y-4">
        {POINTS.map(([title, body], i) => (
          <li key={title} {...rise(leaving, 120 + i * 60)} className={`${rise(leaving, 120 + i * 60).className} flex gap-4`}>
            <span className="mt-0.5 text-[0.9375rem] font-bold tabular-nums text-sun">0{i + 1}</span>
            <div>
              <div className="text-[1.1875rem] font-semibold tracking-tight">{title}</div>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-white/55">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={`mt-auto pt-10 ${leaving ? 'animate-sink' : 'animate-rise'}`} style={{ animationDelay: '420ms' }}>
        <p className="mb-4 text-center text-[0.8125rem] text-white/50"><LegalLink id="location">위치기반서비스 이용약관</LegalLink><span className="mx-2 text-white/25">·</span><LegalLink id="privacy">개인정보 처리방침</LegalLink></p>
        {consent ? (
          <>
            <p className="mb-4 text-center text-[0.8125rem] text-white/50">{formatTime(consent.agreedAt)}에 동의했어요 · 버전 {consent.policyVersion}</p>
            <div className="flex gap-3">
              <button type="button" className="btn-sun flex-1" onClick={() => navigate('/')}>돌아가기</button>
              <button type="button" className="btn flex-none bg-white/10 text-white/80" disabled={busy} onClick={withdraw}>동의 철회</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="btn-sun w-full" disabled={busy || member?.status === 'RESTRICTED'} onClick={agree}>동의하고 시작하기</button>
            <p className="mt-4 text-center text-xs text-white/35">정책 버전 {LOCATION_POLICY_VERSION} · 메뉴에서 언제든 철회할 수 있어요</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 외부 서비스 동의

type Service = { id: 'kakao' | 'tmap'; name: string; owner: string; uses: string[]; sent: string };
const SERVICES: Service[] = [
  {
    id: 'kakao', name: 'KAKAO API', owner: '카카오 · 카카오모빌리티',
    uses: ['지도 표시 (카카오맵)', '출발지·도착지 장소 검색 (카카오 로컬)', '자동차 경로와 예상 택시요금 (카카오모빌리티 길찾기)'],
    sent: '검색어, 출발지·도착지 좌표, 지도에서 보고 있는 위치',
  },
  {
    id: 'tmap', name: 'TMAP API', owner: 'SK open API · 티맵모빌리티',
    uses: ['내 위치에서 방 출발지까지 걷는 길과 시간 (보행자 경로안내)'],
    sent: '버튼을 눌렀을 때의 내 위치 1회와 방 출발지 좌표',
  },
];

function Check({ on }: { on: boolean }) {
  return (
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 transition ${on ? 'border-sun bg-sun text-ink' : 'border-white/30 text-transparent'}`} aria-hidden>
      <CheckIcon size={18} />
    </span>
  );
}

function ServicesStep({ leaving }: { leaving: boolean }) {
  const { member, refreshMember, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const consent = member?.servicesConsent ?? null;
  const agreedAt = consent?.agreedAt ?? null;
  const [checked, setChecked] = useState<Record<Service['id'], boolean>>({ kakao: !!agreedAt, tmap: !!agreedAt });
  const all = SERVICES.every(s => checked[s.id]);
  const toggle = (id: Service['id']) => { if (!agreedAt) setChecked(c => ({ ...c, [id]: !c[id] })); };
  const toggleAll = () => { if (!agreedAt) setChecked({ kakao: !all, tmap: !all }); };
  const done = async () => {
    if (!agreedAt) {
      const ok = await run(() => api.identity.agreeServices({ policyVersion: SERVICES_NOTICE_VERSION, items: REQUIRED_SERVICE_ITEMS }));
      if (!ok) return;
      await refreshMember();
    }
    navigate(from && !['/consent', '/start', '/services'].includes(from) ? from : '/', { replace: true });
  };
  const withdraw = async () => {
    if (!window.confirm('외부 서비스 이용 동의를 철회하면 지도와 경로 기능을 쓸 수 없어요. 철회할까요?')) return;
    const done = await run(async () => { await api.identity.withdrawServices(); return true; });
    if (!done) return;
    await refreshMember();
    setChecked({ kakao: false, tmap: false });
    toast('외부 서비스 이용 동의를 철회했어요.', 'info');
  };

  return (
    <div className="flex min-h-full flex-1 flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
      {agreedAt
        ? <button type="button" onClick={() => navigate('/')} aria-label="뒤로" className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80 transition active:bg-white/10"><ChevronLeftIcon /></button>
        : <div className="h-11" />}
      <p {...rise(leaving, 0)} className={`${rise(leaving, 0).className} mt-10 short:mt-5 text-[0.9375rem] font-semibold text-sun`}>{agreedAt ? '외부 서비스 이용' : '4 / 4'}</p>
      <h1 {...rise(leaving, 60)} className={`${rise(leaving, 60).className} mt-3 text-[2.5rem] short:text-[2.125rem] font-bold leading-[1.12] tracking-[-0.035em]`}>함께 쓰는<br />외부 서비스</h1>
      <p {...rise(leaving, 100)} className={`${rise(leaving, 100).className} mt-4 text-[0.9375rem] leading-relaxed text-white/55`}>택시메이트는 아래 서비스를 이용해 지도와 경로를 보여 드려요. 항목마다 확인하고 체크해 주세요.</p>

      <button type="button" onClick={toggleAll} disabled={!!agreedAt} {...rise(leaving, 140)}
        className={`${rise(leaving, 140).className} mt-8 flex items-center justify-between rounded-2xl bg-white/[.08] px-5 py-4 text-left`}>
        <span className="text-[1.0625rem] font-semibold">모두 확인하고 동의해요</span>
        <Check on={all} />
      </button>

      <ul className="mt-3 space-y-3">
        {SERVICES.map((s, i) => (
          <li key={s.id} {...rise(leaving, 180 + i * 60)} className={rise(leaving, 180 + i * 60).className}>
            <button type="button" role="checkbox" aria-checked={checked[s.id]} onClick={() => toggle(s.id)} disabled={!!agreedAt}
              className={`flex w-full items-start gap-4 rounded-2xl border px-5 py-4 text-left transition ${checked[s.id] ? 'border-sun/60 bg-sun/[.06]' : 'border-white/15'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[1.125rem] font-bold tracking-tight">{s.name}</span>
                  <span className="truncate text-[0.75rem] text-white/45">{s.owner}</span>
                </div>
                <ul className="mt-2 space-y-1 text-[0.875rem] leading-snug text-white/75">
                  {s.uses.map(u => <li key={u} className="flex gap-2"><span className="text-sun">·</span>{u}</li>)}
                </ul>
                <p className="mt-2 text-[0.7813rem] leading-snug text-white/45">전달되는 정보: {s.sent}</p>
              </div>
              <Check on={checked[s.id]} />
            </button>
          </li>
        ))}
      </ul>

      <div className={`mt-auto pt-8 ${leaving ? 'animate-sink' : 'animate-rise'}`} style={{ animationDelay: '420ms' }}>
        <p className="mb-4 text-center text-[0.8125rem] text-white/50"><LegalLink id="privacy">개인정보 처리방침</LegalLink>에서 외부로 보내는 정보를 자세히 볼 수 있어요</p>
        {agreedAt && <p className="mb-4 text-center text-[0.8125rem] text-white/50">{formatTime(agreedAt)}에 동의했어요 · 버전 {consent!.policyVersion}</p>}
        {agreedAt ? (
          <div className="flex gap-3">
            <button type="button" className="btn-sun flex-1" onClick={() => navigate('/')}>돌아가기</button>
            <button type="button" className="btn flex-none bg-white/10 text-white/80" disabled={busy} onClick={withdraw}>동의 철회</button>
          </div>
        ) : (
          <button type="button" className="btn-sun w-full" disabled={!all || busy || member?.status === 'RESTRICTED'} onClick={done}>{busy ? '저장하는 중…' : '동의하고 시작하기'}</button>
        )}
        {!agreedAt && <p className="mt-4 text-center text-xs text-white/35">두 항목 모두 체크해야 시작할 수 있어요 · 버전 {SERVICES_NOTICE_VERSION}</p>}
      </div>
    </div>
  );
}
