import { useNavigate, useParams } from 'react-router-dom';
import { isLegalDocId, legalDoc, legalTitle, LEGAL_DOC_IDS, operatorFacts, type LegalDocId } from '../../legal/documents';
import LegalView, { DraftNotice } from '../../legal/LegalView';
import { FramePortal } from '../components/ui';
import { ChevronRightIcon } from '../components/icons';
import PageShell from './PageShell';

/** Back to wherever the page was opened from; a page opened directly goes to the given fallback. */
function useBack(fallback: string) {
  const navigate = useNavigate();
  return () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback, { replace: true });
}

/** /legal (list) and /legal/:doc — readable without logging in, like any public policy page. */
export default function LegalScreen() {
  const { doc } = useParams();
  const navigate = useNavigate();
  const back = useBack(doc ? '/legal' : '/');
  if (doc && isLegalDocId(doc)) {
    const d = legalDoc(doc);
    return <PageShell title={d.title} onBack={back}><LegalView doc={d} /></PageShell>;
  }
  const o = operatorFacts();
  return (
    <PageShell title="약관 및 정책" sub="택시메이트 이용에 관한 문서예요." onBack={back}>
      <DraftNotice />
      <ul className="mt-6 divide-y divide-line">
        {LEGAL_DOC_IDS.map(id => (
          <li key={id}>
            <button type="button" onClick={() => navigate(`/legal/${id}`)} className="flex w-full items-center justify-between gap-4 py-4 text-left transition active:opacity-50">
              <span>
                <span className="block text-[1.25rem] font-bold tracking-tight">{legalTitle(id)}</span>
                <span className="mt-0.5 block text-[0.8125rem] text-mute">{legalDoc(id).summary}</span>
              </span>
              <ChevronRightIcon className="shrink-0 text-line" />
            </button>
          </li>
        ))}
      </ul>
      <dl className="mt-8 space-y-2 rounded-2xl border border-line px-4 py-4 text-[0.875rem]">
        {([['운영자', o.name], ['문의', o.contact], ['개인정보 보호책임자', o.privacyOfficer]] as const).map(([k, val]) => (
          <div key={k} className="flex gap-3"><dt className="w-[7.5rem] shrink-0 text-mute">{k}</dt><dd className={val.startsWith('〔') ? 'text-mute' : 'font-medium'}>{val.startsWith('〔') ? '미정' : val}</dd></div>
        ))}
      </dl>
    </PageShell>
  );
}

/** Full-screen reader opened over a flow (onboarding) without leaving it, so typed input survives. */
export function LegalOverlay({ id, onClose }: { id: LegalDocId; onClose(): void }) {
  const d = legalDoc(id);
  return (
    <FramePortal>
      <div className="absolute inset-0 z-[60] text-ink">
        <PageShell title={d.title} onBack={onClose}><LegalView doc={d} /></PageShell>
      </div>
    </FramePortal>
  );
}
