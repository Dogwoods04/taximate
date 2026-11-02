import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, isMock } from '../api';
import { session } from '../api/client';
import { useAction, useApp } from '../lib/app';
import { Notice } from '../components/ui';

export default function LoginPage() {
  const { member, setMember } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const location = useLocation();
  const [nickname, setNickname] = useState('');
  const from = (location.state as { from?: string } | null)?.from;
  if (member) return <Navigate to={from ?? '/'} replace />;

  const valid = nickname.trim().length >= 2 && nickname.trim().length <= 20;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const res = await run(() => api.identity.login({ nickname: nickname.trim() }));
    if (!res) return;
    session.set(res.token);
    setMember(res.member);
    navigate(!res.member.locationConsent ? '/consent' : from ?? '/', { replace: true });
  };

  return (
    <div className="space-y-4 pt-4">
      <div>
        <h1 className="text-2xl font-bold">같은 방향, 함께 타요</h1>
        <p className="mt-1 text-sm text-slate-600">시흥에서 비슷한 동선으로 이동하는 이웃을 찾아 택시 동승을 조율해요.</p>
      </div>
      <form onSubmit={submit} className="card space-y-3">
        <label className="label" htmlFor="nickname">닉네임 (2–20자)</label>
        <input id="nickname" className="input" value={nickname} maxLength={20} onChange={e => setNickname(e.target.value)} placeholder="예: 정왕동출근러" autoFocus />
        <button type="submit" className="btn-primary w-full" disabled={!valid || busy}>시작하기</button>
      </form>
      <Notice tone="warn">
        개발용 로그인이에요. 닉네임만으로 계정이 만들어지며, 정식 출시 전 실제 인증(예: 카카오 로그인)으로 바뀔 예정이에요.
        {isMock && <> MOCK 모드에서는 닉네임 <b>admin</b>으로 로그인하면 관리자 화면을 볼 수 있어요.</>}
      </Notice>
    </div>
  );
}
