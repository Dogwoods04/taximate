import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AdminMetrics, ModerationAction, Report, ReportStatus } from '../api/contract';
import { useAction, useApp, useErrorHandler } from '../lib/app';
import { formatTime, reportReasonLabel, reportStatusLabel, targetTypeLabel } from '../lib/format';
import { Segmented, Spinner } from '../components/ui';

type Filter = ReportStatus | 'ALL';
const ACTION_LABEL: Record<ModerationAction, string> = {
  HIDE_ROOM: '방 숨기기', HIDE_MESSAGE: '메시지 가리기', RESTRICT_MEMBER: '회원 이용 제한', DISMISS: '기각',
};

export default function AdminPage() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">운영 관리</h1>
        <button type="button" className="btn-ghost text-xs" onClick={() => void load()}>새로고침</button>
      </div>

      {metrics && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-700">최근 {metrics.periodDays}일 지표</h2>
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
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">신고 목록</h2>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'OPEN', label: '대기' }, { value: 'RESOLVED', label: '조치' }, { value: 'DISMISSED', label: '기각' }, { value: 'ALL', label: '전체' }]} />
        {!reports && <Spinner />}
        {reports?.length === 0 && <p className="py-6 text-center text-sm text-slate-400">해당하는 신고가 없어요.</p>}
        {reports?.map(r => <ReportCard key={r.id} report={r} onDone={() => void load()} />)}
      </div>
    </div>
  );
}

function Tile({ label, value, highlight = false }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${highlight ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${highlight ? 'text-red-600' : ''}`}>{value}</div>
    </div>
  );
}

function ReportCard({ report, onDone }: { report: Report; onDone(): void }) {
  const { toast } = useApp();
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
    <div className="card space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="chip bg-slate-800 text-white">{targetTypeLabel[report.targetType]}</span>
          <span className="chip bg-red-100 text-red-700">{reportReasonLabel[report.reason]}</span>
        </div>
        <span className={`chip ${report.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{reportStatusLabel[report.status]}</span>
      </div>
      <div className="rounded-lg bg-slate-50 px-3 py-2">
        <div className="text-xs text-slate-500">대상 미리보기</div>
        <div className="break-words">{report.targetPreview ?? '(내용 없음)'}</div>
        {report.targetType === 'ROOM' && <Link to={`/rooms/${report.targetId}`} className="text-xs text-brand-700 underline">방 보기</Link>}
      </div>
      {report.detail && <p className="text-slate-700">“{report.detail}”</p>}
      <div className="text-xs text-slate-500">신고자 {report.reporterNickname} · {formatTime(report.createdAt)}</div>
      {report.status === 'OPEN' ? (
        <>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="처리 메모 (선택)" maxLength={500} />
          <div className="grid grid-cols-2 gap-2">
            {actions.map(a => (
              <button key={a} type="button" disabled={busy} onClick={() => act(a)} className={a === 'DISMISS' ? 'btn-secondary py-2' : 'btn-danger py-2'}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-xs text-slate-500">
          처리 {report.resolvedAt ? formatTime(report.resolvedAt) : '-'}{report.resolutionNote && ` · 메모: ${report.resolutionNote}`}
        </div>
      )}
    </div>
  );
}
