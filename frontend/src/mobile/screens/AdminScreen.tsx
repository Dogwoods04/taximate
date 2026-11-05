import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { AdminMetrics, ModerationAction, Report, ReportStatus } from '../../api/contract';
import { useAction, useApp, useErrorHandler } from '../../lib/app';
import { formatTime, reportReasonLabel, reportStatusLabel, targetTypeLabel } from '../../lib/format';
import { RefreshIcon } from '../components/icons';
import { Spinner } from '../components/ui';
import PageShell from './PageShell';

type Filter = ReportStatus | 'ALL';
const ACTION_LABEL: Record<ModerationAction, string> = {
  HIDE_ROOM: '방 숨기기', HIDE_MESSAGE: '메시지 가리기', RESTRICT_MEMBER: '회원 이용 제한', DISMISS: '기각',
};
const FILTERS: { value: Filter; label: string }[] = [{ value: 'OPEN', label: '대기' }, { value: 'RESOLVED', label: '조치' }, { value: 'DISMISSED', label: '기각' }, { value: 'ALL', label: '전체' }];

export default function AdminScreen() {
  const onError = useErrorHandler();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, m] = await Promise.all([api.admin.reports(filter === 'ALL' ? undefined : filter), api.admin.metrics()]);
      setReports(list);
      setMetrics(m);
    } catch (error) { onError(error); }
  }, [filter, onError]);
  useEffect(() => { setReports(null); void load(); }, [load]);

  return (
    <PageShell title="운영자" sub={metrics ? `최근 ${metrics.periodDays}일 지표와 신고` : '지표와 신고'}
      action={<button type="button" onClick={() => void load()} aria-label="새로고침" className="grid h-11 w-11 place-items-center rounded-full bg-fog"><RefreshIcon size={18} /></button>}>
      {metrics && (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="미처리 신고" value={metrics.openReports} highlight={metrics.openReports > 0} />
          <Tile label="기간 내 신고" value={metrics.reportsInPeriod} />
          <Tile label="등록된 이동" value={metrics.tripsCreated} />
          <Tile label="매칭 성공" value={metrics.tripsMatched} />
          <Tile label="매칭 없음" value={metrics.tripsNoMatch} />
          <Tile label="만료" value={metrics.tripsExpired} />
          <Tile label="매칭 실패율" value={`${Math.round(metrics.matchFailureRate * 100)}%`} />
          <Tile label="생성된 방" value={metrics.roomsCreated} />
          <Tile label="확정된 방" value={metrics.roomsConfirmed} />
        </div>
      )}

      <h2 className="mt-10 text-[22px] font-bold tracking-tight">신고</h2>
      <div className="mt-3 flex gap-1 rounded-full bg-fog p-1">
        {FILTERS.map(f => (
          <button key={f.value} type="button" onClick={() => setFilter(f.value)}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition ${filter === f.value ? 'bg-ink text-white' : 'text-mute-dark'}`}>{f.label}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {!reports && <Spinner />}
        {reports?.length === 0 && <p className="py-8 text-center text-sm text-mute">해당하는 신고가 없어요.</p>}
        {reports?.map(r => <ReportCard key={r.id} report={r} onDone={() => void load()} />)}
      </div>
    </PageShell>
  );
}

function Tile({ label, value, highlight = false }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-3.5 ${highlight ? 'bg-sun' : 'bg-fog-soft'}`}>
      <div className="text-[11px] font-medium text-ink/55">{label}</div>
      <div className="mt-1 text-[22px] font-bold tracking-tight">{value}</div>
    </div>
  );
}

function ReportCard({ report, onDone }: { report: Report; onDone(): void }) {
  const { toast } = useApp();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const [note, setNote] = useState('');
  const actions: ModerationAction[] = [
    ...(report.targetType === 'ROOM' ? ['HIDE_ROOM' as const] : []),
    ...(report.targetType === 'MESSAGE' ? ['HIDE_MESSAGE' as const] : []),
    'RESTRICT_MEMBER', 'DISMISS',
  ];
  const act = async (action: ModerationAction) => {
    if (action !== 'DISMISS' && !window.confirm(`“${ACTION_LABEL[action]}” 조치를 할까요?`)) return;
    const done = await run(() => api.admin.action(report.id, { action, note: note.trim() || null }));
    if (done) { toast(`${ACTION_LABEL[action]} 처리했어요.`, 'info'); onDone(); }
  };

  return (
    <div className="rounded-card border border-line p-5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip bg-ink text-white">{targetTypeLabel[report.targetType]}</span>
          <span className="chip bg-sun text-ink">{reportReasonLabel[report.reason]}</span>
        </div>
        <span className="text-xs font-semibold text-mute">{reportStatusLabel[report.status]}</span>
      </div>
      <div className="mt-3 rounded-2xl bg-fog-soft px-4 py-3">
        <div className="break-words text-[15px]">{report.targetPreview ?? '(내용 없음)'}</div>
        {report.targetType === 'ROOM' && <button type="button" className="mt-1 text-xs font-semibold underline" onClick={() => navigate(`/rooms/${report.targetId}`, { state: { moderation: true } })}>방 보기</button>}
      </div>
      {report.detail && <p className="mt-3 leading-relaxed">“{report.detail}”</p>}
      <div className="mt-2 text-xs text-mute">신고자 {report.reporterNickname} · {formatTime(report.createdAt)}</div>
      {report.status === 'OPEN' ? (
        <>
          <input className="field mt-4" value={note} onChange={e => setNote(e.target.value)} placeholder="처리 메모 (선택)" maxLength={500} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {actions.map(a => (
              <button key={a} type="button" disabled={busy} onClick={() => act(a)}
                className={`h-12 rounded-2xl text-[14px] font-semibold transition active:scale-[.98] disabled:opacity-50 ${a === 'DISMISS' ? 'bg-fog text-mute-dark' : 'bg-ink text-white'}`}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-2 text-xs text-mute">처리 {report.resolvedAt ? formatTime(report.resolvedAt) : '-'}{report.resolutionNote && ` · 메모: ${report.resolutionNote}`}</div>
      )}
    </div>
  );
}
