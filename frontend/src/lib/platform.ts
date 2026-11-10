/**
 * Boot-time platform detection. Decides which app renders (mobile vs PC) and tags <html> with
 * `data-platform` (ios | android | mobile | pc) and `data-view` (mobile | pc) so CSS can target quirks.
 */
export type PlatformKind = 'ios' | 'android' | 'mobile' | 'pc';
export interface Platform {
  /** The device itself. */
  kind: PlatformKind;
  /** Which app renders: the mobile app on phones, inside the PC phone-frame iframe, or when forced with ?view=mobile. */
  view: 'mobile' | 'pc';
  /** Rendered inside another page (the PC "사용해보기" phone frame). */
  embedded: boolean;
}

const VIEW_KEY = 'taximate.view';

function detectKind(): PlatformKind {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  // iPadOS 13+ reports itself as a Mac; a touch screen gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Mobi|Opera Mini|IEMobile|webOS|BlackBerry|Kindle|Silk/i.test(ua)) return 'mobile';
  // Touch-only device with a phone/tablet-sized screen and no fine pointer at all.
  const coarseOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  if (coarseOnly && Math.min(screen.width, screen.height) < 820) return 'mobile';
  return 'pc';
}

function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

function detectView(kind: PlatformKind, embedded: boolean): 'mobile' | 'pc' {
  if (kind !== 'pc' || embedded) return 'mobile';
  // ?view=mobile on a PC opens the plain mobile app and keeps it for this tab; ?view=pc undoes it.
  // (Not stored when embedded: a same-origin iframe shares the tab's sessionStorage with the PC page.)
  const param = new URLSearchParams(window.location.search).get('view');
  const store = storage();
  try {
    if (param === 'mobile') store?.setItem(VIEW_KEY, 'mobile');
    if (param === 'pc') store?.removeItem(VIEW_KEY);
    return store?.getItem(VIEW_KEY) === 'mobile' ? 'mobile' : 'pc';
  } catch {
    return param === 'mobile' ? 'mobile' : 'pc';
  }
}

function detect(): Platform {
  const embedded = isEmbedded();
  const kind = detectKind();
  return { kind, embedded, view: detectView(kind, embedded) };
}

export const platform: Platform = detect();

/** Tags <html>; on Android also tracks the visual viewport so the app frame shrinks above the keyboard. */
export function applyPlatform() {
  const root = document.documentElement;
  root.dataset.platform = platform.kind;
  root.dataset.view = platform.view;
  if (platform.embedded) root.dataset.embedded = 'true';
  // Short visible height (iPhone Safari with its toolbars ≈ 690px, small phones): a smaller root font size makes
  // the rem-based UI (text, spacing, buttons) ~9% more compact. Decided once at boot, keyboard closed — a
  // media query would shrink the UI whenever the Android keyboard resizes the viewport.
  if (platform.view === 'mobile' && window.innerHeight > 0 && window.innerHeight <= COMPACT_MAX_HEIGHT) root.dataset.density = 'compact';
  if (platform.view === 'mobile' && platform.kind !== 'ios') trackVisualViewport();
  watchDeviceEmulation();
}

/**
 * Chrome DevTools device toolbar (Ctrl+Shift+M) turns on touch emulation and a phone-sized screen without
 * reloading. The page cannot see the shortcut itself, but it sees the pointer media change: reload so the
 * boot-time detection picks the matching app (phone → mobile app, back to mouse → PC site).
 * A real phone never gains a fine pointer, and a view forced with ?view=mobile is left alone.
 */
function watchDeviceEmulation() {
  if (platform.embedded) return;
  let forced = false;
  try { forced = storage()?.getItem(VIEW_KEY) === 'mobile'; } catch { /* storage blocked */ }
  if (forced) return;
  let timer = 0;
  const check = () => {
    clearTimeout(timer);
    // Wait for the emulated screen size and pointer settings to settle.
    timer = window.setTimeout(() => {
      const view = detectKind() === 'pc' ? 'pc' : 'mobile';
      if (view !== platform.view) window.location.reload();
    }, 300);
  };
  for (const query of ['(pointer: coarse)', '(any-pointer: fine)', '(hover: hover)'])
    matchMedia(query).addEventListener('change', check);
}
const COMPACT_MAX_HEIGHT = 760;

/** Root font size ÷ 16: px layout constants in JS scale with the rem-based UI. */
export const remScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;

// ---------------------------------------------------------------- keyboard / visual viewport

type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let keyboardOpen = false;

/**
 * Android Chrome (default `resizes-visual`) and some other browsers overlay the keyboard on the page
 * instead of resizing it. We size the app frame to the visual viewport (`--app-h`) so sheets sit above
 * the keyboard, and report whether the keyboard is open. iOS is left alone: Safari pans the page itself.
 */
function trackVisualViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  let baseline = 0;
  let width = 0;
  const update = () => {
    const height = vv ? vv.height : window.innerHeight;
    const w = vv ? vv.width : window.innerWidth;
    // Rotation / window resize: start a new baseline (the tallest height seen at this width).
    if (Math.abs(w - width) > 1) { width = w; baseline = 0; }
    baseline = Math.max(baseline, height, window.innerHeight);
    const open = baseline - height > 120 && isTextInput(document.activeElement);
    root.style.setProperty('--app-h', `${Math.round(height)}px`);
    // If the browser panned the layout viewport, keep the frame aligned with what is visible.
    root.style.setProperty('--app-top', `${Math.round(vv ? Math.max(0, vv.offsetTop) : 0)}px`);
    root.dataset.keyboard = open ? 'open' : 'closed';
    if (open !== keyboardOpen) { keyboardOpen = open; listeners.forEach(l => l(open)); }
  };
  update();
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', () => setTimeout(update, 50));
  document.addEventListener('focusout', () => setTimeout(update, 50));
  // Nothing should ever scroll the document itself; the frame clips.
  window.addEventListener('scroll', () => { if (window.scrollY !== 0 && !vv) window.scrollTo(0, 0); });
}

function isTextInput(el: Element | null) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type);
  return (el as HTMLElement).isContentEditable === true;
}

export function isKeyboardOpen() { return keyboardOpen; }
export function onKeyboardChange(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
