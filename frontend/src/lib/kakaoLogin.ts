import { isMock } from '../api';

type KakaoSDK = { init(key: string): void; isInitialized(): boolean; Auth: { authorize(options: { redirectUri: string; state: string }): void } };
declare global { interface Window { Kakao?: KakaoSDK } }
export const kakaoPendingName = 'taximate.kakao.pendingName';
const transactionKey = 'taximate.kakao.transaction';
export const kakaoRedirectUri = () => `${location.origin}${import.meta.env.BASE_URL}auth/kakao`;
let sdkPromise: Promise<KakaoSDK> | undefined;
function sdk(): Promise<KakaoSDK> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
    script.integrity = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';
    script.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { script.remove(); reject(new Error('카카오 연결이 지연되고 있어요. 다시 시도해 주세요.')); }, 15000);
    script.onload = () => { clearTimeout(timer); if (window.Kakao) resolve(window.Kakao); else reject(new Error('카카오 SDK를 불러오지 못했어요.')); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('카카오 SDK를 불러오지 못했어요.')); };
    document.head.appendChild(script);
  });
  sdkPromise.catch(() => { sdkPromise = undefined; });
  return sdkPromise;
}

export async function beginKakaoLogin(returnToTry = false) {
  if (window.top !== window.self) {
    // Move to a same-origin top-level bridge first: SDK must never open Kakao in the iframe.
    window.top!.location.href = `${kakaoRedirectUri()}?begin=1&return=/try`;
    return;
  }
  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!isMock && !key) throw new Error('카카오 로그인 설정을 확인해 주세요.');
  const kakao = isMock ? null : await sdk();
  if (kakao && !kakao.isInitialized()) kakao.init(key!);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  const state = `${nonce}${returnToTry ? ':return=/try' : ''}`;
  sessionStorage.setItem(transactionKey, JSON.stringify({ state, returnToTry, at: Date.now() }));
  if (isMock) location.assign(`${kakaoRedirectUri()}?code=mock&state=${encodeURIComponent(state)}`);
  else kakao!.Auth.authorize({ redirectUri: kakaoRedirectUri(), state });
}

export function consumeKakaoState(state: string | null): boolean {
  const raw = sessionStorage.getItem(transactionKey);
  sessionStorage.removeItem(transactionKey);
  const saved = raw ? JSON.parse(raw) as { state: string; returnToTry: boolean; at: number } : null;
  if (!state || !saved || state !== saved.state || Date.now() - saved.at > 10 * 60 * 1000) throw new Error('로그인 확인 시간이 지났어요. 다시 시작해 주세요.');
  return saved.returnToTry;
}
