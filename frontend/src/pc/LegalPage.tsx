import { Link, Navigate, useParams } from 'react-router-dom';
import { isLegalDocId, legalDoc, legalTitle, LEGAL_DOC_IDS } from '../legal/documents';
import LegalView from '../legal/LegalView';
import { TopNav } from './components/chrome';

/** PC: /legal/:doc — the same policy text as the app, in a readable column with tabs between the three documents. */
export default function LegalPage() {
  const { doc } = useParams();
  if (!isLegalDocId(doc)) return <Navigate to="/legal/terms" replace />;
  const d = legalDoc(doc);
  return (
    <div className="min-h-screen bg-white text-ink">
      <TopNav />
      <main className="mx-auto max-w-[760px] px-6 pb-24 pt-12">
        <nav aria-label="약관 및 정책" className="flex flex-wrap gap-2">
          {LEGAL_DOC_IDS.map(id => (
            <Link key={id} to={`/legal/${id}`} replace
              className={`rounded-full px-4 py-2 text-[14px] font-semibold transition ${id === doc ? 'bg-ink text-white' : 'bg-fog-soft text-mute-dark hover:text-ink'}`}>
              {legalTitle(id)}
            </Link>
          ))}
        </nav>
        <h1 className="mt-10 text-[40px] font-bold leading-tight tracking-[-0.035em]">{d.title}</h1>
        <p className="mb-8 mt-2 text-[15px] text-mute">{d.summary}</p>
        <LegalView doc={d} />
      </main>
    </div>
  );
}
