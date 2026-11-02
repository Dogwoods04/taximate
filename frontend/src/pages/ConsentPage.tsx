import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAction, useApp } from '../lib/app';
import { formatTime } from '../lib/format';
import { Notice } from '../components/ui';

export const LOCATION_POLICY_VERSION = '2026-11-v1';

export default function ConsentPage() {
  const { member, refreshMember, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const consent = member?.locationConsent ?? null;

  const agree = async () => {
    const ok = await run(() => api.identity.agree({ policyVersion: LOCATION_POLICY_VERSION }));
    if (!ok) return;
    await refreshMember();
    toast('위치 정보 이용에 동의했어요.', 'info');
    navigate(from && from !== '/consent' ? from : '/', { replace: true });
  };
  const withdraw = async () => {
    if (!window.confirm('동의를 철회하면 진행 중인 이동이 취소되고, 새 이동을 등록할 수 없어요. 철회할까요?')) return;
    const done = await run(async () => { await api.identity.withdraw(); return true; });
    if (!done) return;
    await refreshMember();
    toast('위치 정보 이용 동의를 철회했어요. 진행 중인 이동은 취소되었어요.', 'info');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">위치 정보 이용 안내</h1>
      <div className="card space-y-4 text-sm leading-relaxed text-slate-700">
        <Section title="수집하는 정보">
          이동을 등록할 때 입력한 <b>출발지·목적지 좌표</b>, 그리고 “현재 위치 사용”을 누른 경우에 한해 <b>1회 GPS 위치</b>를 수집해요.
        </Section>
        <Section title="이용 목적">
          비슷한 동선의 동행을 찾고(출발·도착 반경 500m), 함께 만나기 좋은 장소를 추천하기 위해서만 사용해요.
        </Section>
        <Section title="보관 기간">
          이동이 끝나거나 취소·만료된 뒤 <b>24시간 이내에 정밀 좌표를 삭제</b>해요.
        </Section>
        <Section title="다른 사람에게 보이는 정보">
          다른 이용자에게는 <b>약 100m 단위의 대략적인 지역</b>과 동네 이름만 보여요. 정확한 좌표는 본인에게만 표시돼요. 만날 장소는 공공장소(역 출구, 정류장 등)예요.
        </Section>
        <Section title="백그라운드 추적 없음">
          앱은 위치를 계속 추적하지 않아요. 위치는 버튼을 누를 때 한 번만 요청해요.
        </Section>
        <p className="text-xs text-slate-500">정책 버전 {LOCATION_POLICY_VERSION}. 동의는 언제든 이 화면에서 철회할 수 있어요.</p>
      </div>

      {consent ? (
        <>
          <Notice>✅ {formatTime(consent.agreedAt)}에 동의했어요 (버전 {consent.policyVersion}).</Notice>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={() => navigate('/')}>이동 등록하러 가기</button>
            <button type="button" className="btn-danger" disabled={busy} onClick={withdraw}>동의 철회</button>
          </div>
        </>
      ) : (
        <>
          <Notice tone="warn">동의하지 않으면 이동을 등록하거나 동행을 찾을 수 없어요.</Notice>
          <button type="button" className="btn-primary w-full" disabled={busy || member?.status === 'RESTRICTED'} onClick={agree}>위 내용에 동의합니다</button>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-1 font-semibold text-slate-900">{title}</h2>
      <p>{children}</p>
    </div>
  );
}
