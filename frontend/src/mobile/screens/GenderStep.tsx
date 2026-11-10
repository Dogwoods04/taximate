import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { Gender, Member } from '../../api/contract';
import { useAction, useApp } from '../../lib/app';
import { demoPrefix, nicknameValid, stripPrefix, useAuthOptions, withPrefix } from '../../lib/authOptions';
import { kakaoPendingName } from '../../lib/kakaoLogin';
import { Notice, Sheet } from '../components/ui';

export default function GenderStep({ onDone, profile = false }: { onDone?(member: Member): void; profile?: boolean }) {
  const { member, setMember, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const options = useAuthOptions();
  // Demo (DEV) accounts keep the server's prefix as a fixed part of the name.
  const prefix = demoPrefix(options, member);
  const [nickname, setNickname] = useState(member?.nickname ?? '');
  const [gender, setGender] = useState<Gender | null>(member?.gender === 'MALE' || member?.gender === 'FEMALE' ? member.gender : null);
  const [withdrawing, setWithdrawing] = useState(false);
  const locked = member?.genderSource === 'KAKAO';
  const full = withPrefix(prefix, nickname);
  const rename = async () => {
    const updated = await run(() => api.identity.rename({ nickname: full }));
    if (updated) { setMember(updated); setNickname(updated.nickname); toast('이름을 저장했어요.', 'info'); }
  };
  const save = async () => {
    if (!gender) return;
    const updated = await run(() => api.identity.setGender({ gender }));
    if (!updated) return;
    setMember(updated);
    if (onDone) onDone(updated);
    else { toast('내 정보를 저장했어요.', 'info'); navigate('/'); }
  };
  return <div className="flex min-h-full flex-1 flex-col overflow-y-auto bg-ink px-6 pb-8 pt-12 text-white">
    {profile && <button type="button" onClick={() => navigate('/')} className="self-start py-3 text-white/70">← 돌아가기</button>}
    <p className="mt-10 text-[0.9375rem] font-semibold text-sun">{profile ? '내 정보' : '2 / 4'}</p>
    {profile && <section className="mt-6 space-y-3">
      <p className="text-sm text-white/60">로그인 방식 · {member?.authProvider === 'KAKAO' ? '카카오' : '닉네임'}</p>
      <label htmlFor="profile-nickname" className="block text-sm">닉네임</label>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-white/10 px-3">
          {prefix && <span className="shrink-0 select-none font-semibold text-sun" title="체험용 계정의 고정된 앞부분">{prefix}_</span>}
          <input id="profile-nickname" value={stripPrefix(prefix, nickname)} onChange={e => setNickname(stripPrefix(prefix, e.target.value))}
            maxLength={prefix ? 20 - prefix.length - 1 : 20} className="min-w-0 flex-1 bg-transparent py-3 outline-none" />
        </div>
        <button type="button" onClick={rename} disabled={busy || !nicknameValid(prefix, nickname) || full === member?.nickname} className="rounded-xl bg-sun px-4 text-sm font-semibold text-ink">이름 변경</button>
      </div>
      {prefix && <p className="text-[0.8125rem] text-white/50">체험용 계정은 '{prefix}_'로 시작해요</p>}
    </section>}
    <h1 className="mt-3 text-[2.375rem] font-bold leading-tight tracking-tight">성별을 알려 주세요</h1>
    <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/60">택시 동승은 같은 성별끼리만 할 수 있어서, 같은 성별의 방만 보여 드려요. 성별은 다른 사람에게 보이지 않아요.</p>
    <div role="radiogroup" aria-label="성별" className="mt-10 space-y-3">
      {([['MALE', '남성'], ['FEMALE', '여성']] as const).map(([value, label]) =>
        <button key={value} type="button" role="radio" aria-checked={gender === value} disabled={locked || busy} onClick={() => setGender(value)} className={`flex w-full items-center justify-between rounded-2xl border px-5 py-5 text-[1.125rem] font-semibold ${gender === value ? 'border-sun bg-sun/10 text-sun' : 'border-white/20 text-white/80'}`}>
          {label}<span aria-hidden>{gender === value ? '●' : '○'}</span>
        </button>)}
    </div>
    {locked && <p className="mt-4 text-sm text-white/60">카카오에서 가져온 성별은 여기서 변경할 수 없어요.</p>}
    <button type="button" disabled={!gender || busy || locked} onClick={save} className="btn-sun mt-auto w-full shrink-0 translate-y-0">{busy ? '저장하는 중…' : profile ? '저장하기' : '계속'}</button>
    {profile && <button type="button" onClick={() => setWithdrawing(true)} className="mx-auto mt-5 shrink-0 py-2 text-[0.8125rem] text-white/40 underline underline-offset-4">회원 탈퇴</button>}
    {withdrawing && <WithdrawSheet onClose={() => setWithdrawing(false)} />}
  </div>;
}

const WITHDRAW_EFFECTS = [
  '진행 중인 이동이 취소돼요.',
  '참여 중인 방에서 나가고, 내가 만든 모집 방은 취소돼요.',
  '내가 보낸 메시지가 삭제돼요.',
  '동의 기록과 성별 정보가 삭제돼요.',
];

function WithdrawSheet({ onClose }: { onClose(): void }) {
  const { logout, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const withdraw = async () => {
    const done = await run(async () => { await api.identity.deleteAccount(); return true; });
    if (!done) return;
    sessionStorage.removeItem(kakaoPendingName);
    logout();
    navigate('/start', { replace: true });
    toast('탈퇴가 완료됐어요.', 'info');
  };
  return (
    <Sheet title="회원 탈퇴할까요?" onClose={onClose}>
      <p className="text-[0.9375rem] leading-relaxed text-mute-dark">탈퇴하면 이렇게 돼요.</p>
      <ul className="mt-3 space-y-2.5">
        {WITHDRAW_EFFECTS.map(text => (
          <li key={text} className="flex gap-2.5 text-[0.9375rem] leading-snug text-ink"><span className="font-bold text-[#B3261E]">·</span>{text}</li>
        ))}
      </ul>
      <div className="mt-5"><Notice tone="error">탈퇴는 되돌릴 수 없어요. 같은 계정으로 다시 로그인하면 새 회원으로 시작해요.</Notice></div>
      <div className="mt-6 flex gap-3">
        <button type="button" className="btn-fog flex-1" disabled={busy} onClick={onClose}>취소</button>
        <button type="button" className="btn flex-1 bg-[#B3261E] text-white disabled:opacity-60" disabled={busy} onClick={withdraw}>{busy ? '탈퇴하는 중…' : '탈퇴하기'}</button>
      </div>
    </Sheet>
  );
}
