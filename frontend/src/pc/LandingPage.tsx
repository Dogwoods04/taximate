import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PhoneShot } from './components/PhoneFrame';
import { Logo, TopNav, TryButton } from './components/chrome';
import shotStart from './assets/app-start.jpg';
import shotHome from './assets/app-home.jpg';
import shotSelect from './assets/app-select.jpg';
import shotIntro from './assets/app-intro.jpg';
import shotRoom from './assets/app-room.jpg';
import shotChat from './assets/app-chat.jpg';

const STEPS = [
  { title: '출발지·목적지 검색', body: '역이나 건물 이름으로 어디서 어디로 가는지 찾아요.' },
  { title: '비슷한 동선의 방 찾기', body: '출발지와 목적지가 가까운 방을 가까운 순으로 보여 드려요.' },
  { title: '방 참여 또는 만들기', body: '마음에 드는 방에 참여하거나, 없으면 새 방을 열어요.' },
  { title: '만날 장소에서 함께 택시', body: '정한 장소와 시간에 만나 택시 한 대를 함께 잡아요.' },
  { title: '요금 나누기', body: '내린 뒤 실제 요금을 함께 탄 사람끼리 똑같이 나눠요.' },
];

const FAQ: { q: string; a: ReactNode }[] = [
  { q: '택시 호출이나 결제도 앱에서 하나요?', a: '아니요. 택시메이트는 같은 방향의 이웃을 연결하고 약속을 정하는 데까지만 도와요. 택시는 만난 자리에서 평소처럼 잡고, 요금은 함께 탄 사람끼리 직접 나눠요. 앱에 표시되는 요금은 참고용 예상치예요.' },
  { q: '위치 정보와 개인정보는 어떻게 다루나요?', a: '현재 위치는 주변 방을 찾거나 출발지까지 걷는 길을 보여 줄 때처럼 필요할 때 한 번만 확인하고 저장하지 않아요. 다른 사람에게는 정확한 좌표 대신 근처 역·건물 같은 공공장소 이름으로 보여요. 가입은 닉네임만으로 하고, 채팅에서도 전화번호 같은 개인정보는 공유하지 않도록 안내해요.' },
  { q: '지금 정식 서비스인가요?', a: '아니요. 시흥에서 운영해 보는 테스트 서비스예요. 기능과 화면은 바뀔 수 있고, 테스트 중에는 데모 데이터가 함께 보일 수 있어요.' },
  { q: '요금은 어떻게 나누나요?', a: '방마다 함께 탄 인원으로 똑같이 나누는 방식이에요. 방 목록과 방 소개에서 예상 경로와 1인 예상 요금을 미리 볼 수 있어요.' },
  { q: '모르는 사람과 타는 게 걱정돼요.', a: '참여 전에 방장 닉네임, 만나는 곳, 출발 시간, 방 소개를 확인할 수 있어요. 모두가 약속을 확정해야 출발 준비가 끝나고, 불편한 사람이나 메시지는 바로 신고할 수 있어요.' },
  { q: 'PC에서도 쓸 수 있나요?', a: <>택시메이트는 휴대폰에서 쓰도록 만들었어요. PC에서는 <Link to="/try" className="font-semibold text-ink underline underline-offset-4">사용해보기</Link>에서 휴대폰 화면 그대로 체험해 볼 수 있어요. PC는 위치가 부정확할 수 있어 시흥시청 기준으로 보일 수 있어요.</> },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <TopNav />
      <Hero />
      <About />
      <How />
      <section id="features" aria-label="특징" className="bg-white">
        <Feature eyebrow="가까운 방부터" title={<>내 주변에서 출발하는 방을<br />가까운 순으로</>} shot={shotHome} alt="홈 화면: 근처 출발 방 카드" points={['홈을 열면 지금 있는 곳 근처에서 출발하는 방이 가까운 순서로 보여요.', '출발 시간과 빈 자리를 카드에서 바로 확인해요.']} />
        <Feature flip eyebrow="미리 보는 경로와 요금" title={<>예상 경로와<br />1인 요금을 먼저</>} shot={shotSelect} alt="출발지·도착지 선택 화면: 경로와 비슷한 동선의 방" points={['출발지와 목적지를 고르면 지도에 예상 경로와 걸리는 시간이 그려져요.', '비슷한 동선의 방마다 1인 예상 요금과 남은 자리를 보여 드려요.']} />
        <Feature eyebrow="알아보기 쉬운 이름" title={<>동네 이름 대신<br />공공장소 이름으로</>} shot={shotIntro} alt="방 소개 화면: 만나는 곳과 예상 요금" points={['출발지와 만나는 곳은 “○○동” 대신 역 출구·정류장·건물처럼 누구나 찾을 수 있는 이름으로 안내해요.', '방에 함께 가기로 하면 지금 위치에서 출발지까지 걸어가는 길과 시간을 보여 줘요.']} />
        <Feature flip eyebrow="약속은 한 화면에서" title={<>만나는 곳, 시간,<br />채팅까지 한 번에</>} shot={shotRoom} second={shotChat} alt="이동 중 화면: 출발까지 남은 시간과 1인 요금" points={['출발까지 남은 시간, 만나는 곳, 1인 요금을 한 화면에서 확인해요.', '모두가 약속을 확정하면 준비 끝. 옆으로 넘기면 같은 방 사람들과 채팅해요.']} />
      </section>
      <Privacy />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <RouteBackdrop />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pb-24 lg:pt-20">
        <div className="pc-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-[14px] font-semibold text-sun">
            <span className="h-1.5 w-1.5 rounded-full bg-sun" /> 시흥 테스트 서비스
          </p>
          <h1 className="mt-6 text-[56px] font-bold leading-[1.12] tracking-[-0.045em] xl:text-[68px]">
            같은 방향이면,<br /><span className="text-sun">함께 타요</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-[19px] leading-relaxed text-white/70">
            택시메이트는 시흥에서 같은 방향으로 가는 이웃을 찾아 택시를 나눠 타도록 연결해 주는 서비스예요.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <TryButton size="lg" />
            <a href="#how" className="inline-flex h-16 items-center rounded-full px-7 text-[17px] font-semibold text-white/80 ring-1 ring-white/20 transition hover:bg-white/5 hover:text-white">이용 방법 보기</a>
          </div>
          <p className="mt-5 text-[14px] text-white/45">PC에서는 휴대폰 화면 그대로 체험할 수 있어요.</p>
        </div>
        <div className="relative hidden justify-center lg:flex">
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sun/10 blur-3xl" aria-hidden />
          <PhoneShot src={shotStart} alt="택시메이트 시작 화면" scale={0.66} className="relative -rotate-3" />
          <PhoneShot src={shotSelect} alt="비슷한 동선의 방을 보여 주는 화면" scale={0.6} className="relative -ml-8 mt-28 rotate-3" />
        </div>
      </div>
    </section>
  );
}

/** Decorative route lines in the app's colours (drawn, no imagery). */
function RouteBackdrop() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60" viewBox="0 0 1440 720" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path d="M-40 560 C 240 520, 360 380, 620 400 S 980 300, 1160 160 S 1400 60, 1500 40" fill="none" stroke="#4F46E5" strokeOpacity=".55" strokeWidth="3" />
      <path d="M-40 640 C 300 600, 480 520, 700 520 S 1100 420, 1500 380" fill="none" stroke="#FFD966" strokeOpacity=".35" strokeWidth="2" className="pc-route-dash" strokeLinecap="round" />
      <circle cx="620" cy="400" r="7" fill="#FFD966" />
      <circle cx="1160" cy="160" r="7" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="3" />
    </svg>
  );
}

function SectionHead({ eyebrow, title, sub, center = false }: { eyebrow: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-[720px] text-center' : 'max-w-[720px]'}>
      <p className="text-[15px] font-bold text-[#4F46E5]">{eyebrow}</p>
      <h2 className="mt-3 text-[40px] font-bold leading-[1.22] tracking-[-0.04em]">{title}</h2>
      {sub && <p className="mt-4 text-[18px] leading-relaxed text-mute-dark">{sub}</p>}
    </div>
  );
}

function About() {
  const items = [
    { k: '같은 방향', v: '출발지와 목적지가 모두 가까운 이웃만 이어 드려요.' },
    { k: '한 대를 함께', v: '택시 한 대를 나눠 타면 1인 요금이 줄어요.' },
    { k: '가볍게 시작', v: '닉네임만 정하면 바로 쓸 수 있어요.' },
  ];
  return (
    <section id="about" className="mx-auto max-w-[1200px] px-6 py-24 lg:px-10">
      <SectionHead eyebrow="택시메이트는" title={<>혼자 타긴 아까운 길,<br />같은 쪽으로 가는 이웃과 나눠요</>}
        sub="정왕역에서 시흥시청까지, 배곧에서 월곶까지. 같은 시간 같은 방향으로 움직이는 사람을 찾아 한 대의 택시로 함께 가도록 도와요." />
      <dl className="mt-14 grid gap-5 md:grid-cols-3">
        {items.map(i => (
          <div key={i.k} className="rounded-[28px] bg-fog-soft p-8">
            <dt className="text-[22px] font-bold tracking-tight">{i.k}</dt>
            <dd className="mt-2 text-[16px] leading-relaxed text-mute-dark">{i.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function How() {
  return (
    <section id="how" className="bg-fog-soft">
      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:px-10">
        <SectionHead eyebrow="이용 방법" title="다섯 단계면 함께 출발해요" />
        <ol className="mt-14 grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-[24px] bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,.04)]">
              <span className={`grid h-10 w-10 place-items-center rounded-full text-[16px] font-bold ${i === STEPS.length - 1 ? 'bg-sun text-ink' : 'bg-ink text-white'}`}>{i + 1}</span>
              <h3 className="mt-5 text-[18px] font-bold leading-snug tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-mute-dark">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Feature({ eyebrow, title, points, shot, second, alt, flip = false }: {
  eyebrow: string; title: ReactNode; points: string[]; shot: string; second?: string; alt: string; flip?: boolean;
}) {
  return (
    <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 py-20 md:grid-cols-2 lg:px-10">
      <div className={flip ? 'md:order-2' : ''}>
        <SectionHead eyebrow={eyebrow} title={title} />
        <ul className="mt-8 space-y-4">
          {points.map(p => (
            <li key={p} className="flex gap-3 text-[17px] leading-relaxed text-mute-dark">
              <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-sun-deep" />{p}
            </li>
          ))}
        </ul>
      </div>
      <div className={`relative flex justify-center ${flip ? 'md:order-1' : ''}`}>
        <div className="absolute inset-x-6 bottom-6 top-12 rounded-[48px] bg-gradient-to-b from-sun-pale to-fog-soft" aria-hidden />
        <PhoneShot src={shot} alt={alt} scale={0.62} className="relative" />
        {second && <PhoneShot src={second} alt="채팅 화면" scale={0.5} className="relative -ml-16 mt-32 hidden lg:block" />}
      </div>
    </div>
  );
}

function Privacy() {
  const items = [
    { t: '위치는 필요할 때 한 번만', d: '주변 방을 찾을 때, 출발지까지 걷는 길을 볼 때만 현재 위치를 한 번 확인하고 저장하지 않아요.' },
    { t: '정확한 좌표 대신 장소 이름', d: '다른 사람에게는 근처 역·정류장·건물 이름으로 보여 내 집 위치가 드러나지 않아요.' },
    { t: '닉네임만으로 시작', d: '전화번호나 실명 없이 닉네임으로 시작하고, 불편한 일은 바로 신고할 수 있어요.' },
  ];
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:px-10">
        <p className="text-[15px] font-bold text-sun">안심하고 쓰도록</p>
        <h2 className="mt-3 text-[40px] font-bold leading-[1.22] tracking-[-0.04em]">내 위치는 꼭 필요한 만큼만</h2>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {items.map(i => (
            <div key={i.t} className="rounded-[28px] bg-white/[.06] p-8 ring-1 ring-white/10">
              <h3 className="text-[20px] font-bold tracking-tight">{i.t}</h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-white/65">{i.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mx-auto max-w-[920px] px-6 py-24 lg:px-10">
      <SectionHead center eyebrow="자주 묻는 질문" title="궁금한 점이 있나요?" />
      <ul className="mt-12 divide-y divide-line border-y border-line">
        {FAQ.map((f, i) => (
          <li key={f.q}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-6 py-6 text-left text-[19px] font-semibold tracking-tight">
              {f.q}
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fog transition ${open === i ? 'rotate-45 bg-ink text-white' : ''}`} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              </span>
            </button>
            {open === i && <p className="animate-fade -mt-1 pb-7 pr-14 text-[16.5px] leading-relaxed text-mute-dark">{f.a}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 pb-24 lg:px-10">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[40px] bg-gradient-to-br from-sun to-sun-deep px-8 py-20 text-center">
        <h2 className="text-[44px] font-bold leading-tight tracking-[-0.04em]">지금 PC에서 바로 체험해 보세요</h2>
        <p className="mx-auto mt-4 max-w-[560px] text-[18px] leading-relaxed text-ink/70">왼쪽에는 사용 가이드, 오른쪽에는 실제 휴대폰 화면. 닉네임만 정하면 시작해요.</p>
        <Link to="/try" className="mt-10 inline-flex h-[72px] items-center gap-3 rounded-full bg-ink px-14 text-[22px] font-bold text-white shadow-[0_20px_40px_-16px_rgba(21,21,21,.6)] transition hover:bg-ink-soft active:scale-[.98]">
          사용해보기
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M5 12h14m-6-6 6 6-6 6" stroke="#FFD966" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-fog-soft">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-12 md:flex-row md:items-start md:justify-between lg:px-10">
        <div>
          <Logo />
          <p className="mt-4 max-w-[520px] text-[14px] leading-relaxed text-mute">
            시흥 지역 테스트 서비스예요. 택시 호출과 결제는 제공하지 않으며, 표시되는 요금은 참고용 예상치예요.
          </p>
        </div>
        <nav className="flex gap-6 text-[14px] font-medium text-mute-dark" aria-label="바닥글">
          <a href="#how" className="hover:text-ink">이용 방법</a>
          <a href="#faq" className="hover:text-ink">자주 묻는 질문</a>
          <Link to="/try" className="hover:text-ink">사용해보기</Link>
        </nav>
      </div>
    </footer>
  );
}
