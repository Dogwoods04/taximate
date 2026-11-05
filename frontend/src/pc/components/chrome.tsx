import { Link } from 'react-router-dom';

/** Our mark: the app's navigation arrow on a yellow tile. */
export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="택시메이트 홈">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-sun text-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.5.1 1.7l6.6 1.5 1.5 6.6c.2.8 1.4.9 1.7.1L20.5 3.5Z" fill="currentColor" /></svg>
      </span>
      <span className={`text-[19px] font-bold tracking-[-0.03em] ${dark ? 'text-white' : 'text-ink'}`}>택시메이트</span>
    </Link>
  );
}

export function TryButton({ className = '', size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-16 px-10 text-[19px]' : 'h-11 px-5 text-[15px]';
  return (
    <Link to="/try" className={`inline-flex items-center justify-center gap-2 rounded-full bg-sun font-bold text-ink transition hover:bg-sun-deep active:scale-[.98] ${cls} ${className}`}>
      사용해보기
      <svg width={size === 'lg' ? 20 : 16} height={size === 'lg' ? 20 : 16} viewBox="0 0 24 24" aria-hidden><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Link>
  );
}

export function TopNav({ links = true, dark = false }: { links?: boolean; dark?: boolean }) {
  const link = `rounded-full px-3.5 py-2 text-[15px] font-medium transition ${dark ? 'text-white/70 hover:text-white' : 'text-mute-dark hover:bg-fog-soft hover:text-ink'}`;
  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-md ${dark ? 'border-white/10 bg-ink/85' : 'border-line/70 bg-white/85'}`}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 lg:px-10">
        <Logo dark={dark} />
        <nav className="flex items-center gap-1" aria-label="주요 메뉴">
          {links && <>
            <a href="#about" className={`${link} hidden md:inline-flex`}>소개</a>
            <a href="#how" className={`${link} hidden md:inline-flex`}>이용 방법</a>
            <a href="#features" className={`${link} hidden md:inline-flex`}>특징</a>
            <a href="#faq" className={`${link} hidden md:inline-flex`}>자주 묻는 질문</a>
          </>}
          {links ? <TryButton className="ml-3" /> : (
            <Link to="/" className={link}>← 서비스 소개</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
