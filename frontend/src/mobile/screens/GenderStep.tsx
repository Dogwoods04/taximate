import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { Gender, Member } from '../../api/contract';
import { useAction, useApp } from '../../lib/app';

export default function GenderStep({ onDone, profile = false }: { onDone?(member: Member): void; profile?: boolean }) {
  const { member, setMember, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(member?.nickname ?? '');
  const [gender, setGender] = useState<Gender | null>(member?.gender ?? null);
  const locked = member?.genderSource === 'KAKAO';
  const rename = async () => {
    const updated = await run(() => api.identity.rename({ nickname: nickname.trim() }));
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
      <div className="flex gap-2"><input id="profile-nickname" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20} className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-3" />
        <button type="button" onClick={rename} disabled={busy || nickname.trim().length < 2 || nickname.trim() === member?.nickname} className="rounded-xl bg-sun px-4 text-sm font-semibold text-ink">이름 변경</button></div>
    </section>}
    <h1 className="mt-3 text-[2.375rem] font-bold leading-tight tracking-tight">성별을 알려 주세요</h1>
    <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/60">같은 성별끼리만 타는 방에 쓰여요. 다른 사람에게는 보이지 않아요.</p>
    <div role="radiogroup" aria-label="성별" className="mt-10 space-y-3">
      {([['MALE', '남성'], ['FEMALE', '여성'], ['UNDISCLOSED', '선택 안 함']] as const).map(([value, label]) =>
        <button key={value} type="button" role="radio" aria-checked={gender === value} disabled={locked || busy} onClick={() => setGender(value)} className={`flex w-full items-center justify-between rounded-2xl border px-5 py-5 text-[1.125rem] font-semibold ${gender === value ? 'border-sun bg-sun/10 text-sun' : 'border-white/20 text-white/80'}`}>
          {label}<span aria-hidden>{gender === value ? '●' : '○'}</span>
        </button>)}
    </div>
    {gender === 'UNDISCLOSED' && <p className="mt-4 text-sm leading-relaxed text-white/60">선택 안 함으로도 이용할 수 있어요. 같은 성별만 타는 방은 만들거나 찾고 참여할 수 없어요.</p>}
    {locked && <p className="mt-4 text-sm text-white/60">카카오에서 가져온 성별은 여기서 변경할 수 없어요.</p>}
    <button type="button" disabled={!gender || busy || locked} onClick={save} className="btn-sun mt-auto w-full shrink-0 translate-y-0">{busy ? '저장하는 중…' : profile ? '저장하기' : '계속'}</button>
  </div>;
}
