import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon } from '../components/icons';

/** Plain scrolling page (내 방, 운영자) in the same visual language: big title, back pill. */
export default function PageShell({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      <div className="animate-fade px-6 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate('/')} aria-label="홈으로" className="-ml-6 grid h-14 w-12 place-items-center rounded-r-full bg-ink pr-1 text-white shadow-float">
            <ChevronLeftIcon size={22} />
          </button>
          {action}
        </div>
        <h1 className="animate-rise mt-8 text-[40px] font-bold leading-tight tracking-[-0.035em]">{title}</h1>
        {sub && <p className="animate-rise mt-2 text-[15px] text-mute" style={{ animationDelay: '60ms' }}>{sub}</p>}
        <div className="animate-rise mt-8" style={{ animationDelay: '120ms' }}>{children}</div>
      </div>
    </div>
  );
}
