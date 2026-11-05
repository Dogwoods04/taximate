import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { Gender, Member } from '../../api/contract';
import { useAction, useApp } from '../../lib/app';

export default function GenderStep({ onDone, profile = false }: { onDone?(member: Member): void; profile?: boolean }) {
  const { member, setMember, toast } = useApp();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const [gender, setGender] = useState<Gender | null>(member?.gender ?? null);
  const locked = member?.genderSource === 'KAKAO';
  const save = async () => {
    if (!gender) return;
    const updated = await run(() => api.identity.setGender({ gender }));
    if (!updated) return;
    setMember(updated);
    if (onDone) onDone(updated);
    else { toast('내 정보를 저장했어요.', 'info'); navigate('/'); }
  };
  return <div className="flex min-h-full flex-1 flex-col bg-ink px-6 pb-8 pt-12 text-white">
    {profile && <button type="button" onClick={() => navigate('/')} className="self-start py-3 text-white/70">← 돌아가기</button>}
    <p className="mt-10 text-[15px] font-semibold text-sun">{profile ? '내 정보' : '2 / 4'}</p>
    <h1 className="mt-3 text-[38px] font-bold leading-tight tracking-tight">성별을 알려 주세요</h1>
    <p className="mt-4 text-[15px] leading-relaxed text-white/60">같은 성별끼리만 타는 방에 쓰여요. 다른 사람에게는 보이지 않아요.</p>
    <div role="radiogroup" aria-label="성별" className="mt-10 space-y-3">
      {([['MALE', '남성'], ['FEMALE', '여성'], ['UNDISCLOSED', '선택 안 함']] as const).map(([value, label]) =>
        <button key={value} type="button" role="radio" aria-checked={gender === value} disabled={locked || busy} onClick={() => setGender(value)} className={`flex w-full items-center justify-between rounded-2xl border px-5 py-5 text-[18px] font-semibold ${gender === value ? 'border-sun bg-sun/10 text-sun' : 'border-white/20 text-white/80'}`}>
          {label}<span aria-hidden>{gender === value ? '●' : '○'}</span>
        </button>)}
    </div>
    {gender === 'UNDISCLOSED' && <p className="mt-4 text-sm leading-relaxed text-white/60">선택 안 함으로도 이용할 수 있어요. 같은 성별만 타는 방은 만들거나 찾고 참여할 수 없어요.</p>}
    {locked && <p className="mt-4 text-sm text-white/60">카카오에서 가져온 성별은 여기서 변경할 수 없어요.</p>}
    <button type="button" disabled={!gender || busy || locked} onClick={save} className="btn-sun mt-auto w-full shrink-0 translate-y-0">{busy ? '저장하는 중…' : profile ? '저장하기' : '계속'}</button>
  </div>;
}
