import { Fragment } from 'react';
import { operatorFacts, operatorIncomplete, type Block, type LegalDoc } from './documents';

/** Highlights 〔미정 / 결정 필요 / 전문가 확인 필요〕 markers inside a line of policy text. */
function Text({ children }: { children: string }) {
  const parts = children.split(/(〔[^〕]+〕)/);
  return (
    <>
      {parts.map((part, i) => part.startsWith('〔')
        ? <mark key={i} className="mx-0.5 rounded-md bg-sun/35 px-1.5 py-0.5 text-[0.92em] font-semibold text-ink [box-decoration-break:clone]">{part.slice(1, -1)}</mark>
        : <Fragment key={i}>{part}</Fragment>)}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <p className="leading-relaxed"><Text>{block.p}</Text></p>;
  if ('ul' in block) return (
    <ul className="space-y-1.5 pl-1">
      {block.ul.map((item, i) => (
        <li key={i} className="flex gap-2.5 leading-relaxed"><span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-mute" /><span><Text>{item}</Text></span></li>
      ))}
    </ul>
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-[0.875rem]">
        <thead><tr>{block.table.head.map(h => <th key={h} className="border-b-2 border-line px-2 py-2 font-semibold text-mute-dark">{h}</th>)}</tr></thead>
        <tbody>
          {block.table.rows.map((row, r) => (
            <tr key={r} className="align-top">{row.map((cell, c) => <td key={c} className={`border-b border-line px-2 py-2.5 leading-relaxed ${c === 0 ? 'whitespace-nowrap font-semibold' : ''}`}><Text>{cell}</Text></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Draft, not reviewed" banner shown on top of every legal page. */
export function DraftNotice() {
  const o = operatorFacts();
  return (
    <div className="rounded-2xl bg-fog-soft px-4 py-3.5 text-[0.8125rem] leading-relaxed text-mute-dark">
      <b className="text-ink">전문가 검토 전 초안이에요.</b> 법률 전문가의 검토를 거치지 않았고, 시행 전에 내용이 바뀔 수 있어요.
      노란 표시는 아직 정하지 않았거나 확인이 필요한 부분이에요. · 버전 {o.version}
      {operatorIncomplete() && <><br />운영자 정보가 아직 입력되지 않았어요.</>}
    </div>
  );
}

export default function LegalView({ doc }: { doc: LegalDoc }) {
  return (
    <article className="space-y-8 text-[0.9375rem] text-ink">
      <DraftNotice />
      {doc.sections.map(s => (
        <section key={s.title} className="space-y-3">
          <h2 className="text-[1.125rem] font-bold tracking-tight">{s.title}</h2>
          {s.blocks.map((b, i) => <BlockView key={i} block={b} />)}
        </section>
      ))}
    </article>
  );
}
