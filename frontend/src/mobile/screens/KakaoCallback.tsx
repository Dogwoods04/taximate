import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { session } from '../../api/client';
import { useApp } from '../../lib/app';
import { beginKakaoLogin, consumeKakaoState, kakaoPendingName, kakaoRedirectUri } from '../../lib/kakaoLogin';
import { describeError } from '../../lib/errors';

export default function KakaoCallback() {
  const started = useRef(false);
  const { setMember, toast } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.search);
    if (params.get('begin') === '1') {
      void beginKakaoLogin(params.get('return') === '/try').catch(e => setError(e.message));
      return;
    }
    void (async () => {
      let returnToTry = false;
      try {
        returnToTry = consumeKakaoState(params.get('state'));
        // Remove the one-time code from browser history before making network calls.
        history.replaceState(history.state, '', kakaoRedirectUri());
        if (params.has('error')) throw new Error(params.get('error') === 'access_denied' ? '카카오 로그인을 취소했어요.' : '카카오 로그인에 실패했어요.');
        const code = params.get('code');
        if (!code) throw new Error('로그인 정보를 확인할 수 없어요.');
        const result = await api.identity.kakaoLogin({ code, redirectUri: kakaoRedirectUri() });
        session.set(result.token); setMember(result.member);
        if (result.isNew) sessionStorage.setItem(kakaoPendingName, result.member.id);
        else sessionStorage.removeItem(kakaoPendingName);
        if (returnToTry) location.replace(`${import.meta.env.BASE_URL}try`);
        else navigate('/start', { replace: true });
      } catch (e) {
        const message = e instanceof Error && e.name !== 'ApiError' ? e.message : describeError(e);
        if (returnToTry) {
          sessionStorage.setItem('taximate.login.message', message);
          location.replace(`${import.meta.env.BASE_URL}try`);
        } else { toast(message); navigate('/start', { replace: true }); }
      }
    })();
  }, [navigate, setMember, toast]);
  return <div className="absolute inset-0 grid place-content-center gap-5 bg-ink px-8 text-center text-white">
    <p>{error || '카카오 로그인 확인 중…'}</p>
    {error && <button className="btn-sun" onClick={() => location.replace(`${import.meta.env.BASE_URL}try`)}>시작 화면으로</button>}
  </div>;
}
