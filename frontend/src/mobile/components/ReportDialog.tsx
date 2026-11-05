import { useState } from 'react';
import { api } from '../../api';
import type { ReportReason, ReportTargetType } from '../../api/contract';
import { useAction, useApp } from '../../lib/app';
import { reportReasonLabel, targetTypeLabel } from '../../lib/format';
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
      <p className="mb-5 truncate rounded-2xl bg-fog-soft px-4 py-3 text-sm text-mute-dark">{target.preview || '(내용 없음)'}</p>
      <h3 className="mb-2 text-[13px] font-semibold text-mute">신고 사유</h3>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {(Object.keys(reportReasonLabel) as ReportReason[]).map(r => (
          <button key={r} type="button" onClick={() => setReason(r)}
            className={`rounded-2xl px-3 py-3 text-[14px] font-medium transition ${reason === r ? 'bg-ink text-white' : 'bg-fog-soft text-ink'}`}>
            {reportReasonLabel[r]}
          </button>
        ))}
      </div>
      <label className="mb-2 block text-[13px] font-semibold text-mute" htmlFor="report-detail">상세 내용 (선택, 500자)</label>
      <textarea id="report-detail" className="field mb-5 min-h-[96px] resize-none" maxLength={500} value={detail} onChange={e => setDetail(e.target.value)} placeholder="어떤 일이 있었는지 알려 주세요." />
      <button type="button" className="btn-ink w-full" disabled={busy} onClick={submit}>신고하기</button>
    </Sheet>
  );
}
