import { useState } from 'react';
import { api } from '../api';
import type { ReportReason, ReportTargetType } from '../api/contract';
import { useAction, useApp } from '../lib/app';
import { reportReasonLabel, targetTypeLabel } from '../lib/format';
import { Sheet } from './ui';

export interface ReportTarget { type: ReportTargetType; id: string; preview: string }

export default function ReportDialog({ target, onClose }: { target: ReportTarget; onClose(): void }) {
  const { toast } = useApp();
  const { busy, run } = useAction();
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [detail, setDetail] = useState('');

  const submit = async () => {
    const report = await run(() => api.reports.create({ targetType: target.type, targetId: target.id, reason, detail: detail.trim() || null }));
    if (report) { toast('신고가 접수되었어요. 운영자가 확인할게요.', 'info'); onClose(); }
  };

  return (
    <Sheet title={`${targetTypeLabel[target.type]} 신고`} onClose={onClose}>
      <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">대상: {target.preview}</p>
      <label className="label">신고 사유</label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(Object.keys(reportReasonLabel) as ReportReason[]).map(r => (
          <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-xl border px-3 py-2 text-sm ${reason === r ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200'}`}>
            {reportReasonLabel[r]}
          </button>
        ))}
      </div>
      <label className="label" htmlFor="report-detail">상세 내용 (선택, 500자 이내)</label>
      <textarea id="report-detail" className="input mb-4 h-24" maxLength={500} value={detail} onChange={e => setDetail(e.target.value)} placeholder="어떤 일이 있었는지 알려 주세요." />
      <button type="button" className="btn-primary w-full" disabled={busy} onClick={submit}>신고하기</button>
    </Sheet>
  );
}
