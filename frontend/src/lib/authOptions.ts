import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AuthOptions, Member } from '../api/contract';

let cached: Promise<AuthOptions> | undefined;
/** GET /auth/options once per page load (a failed request is retried next time). */
export function loadAuthOptions(): Promise<AuthOptions> {
  if (!cached) { cached = api.identity.options(); cached.catch(() => { cached = undefined; }); }
  return cached;
}

export function useAuthOptions(): AuthOptions | null {
  const [options, setOptions] = useState<AuthOptions | null>(null);
  useEffect(() => { let live = true; void loadAuthOptions().then(o => { if (live) setOptions(o); }).catch(() => {}); return () => { live = false; }; }, []);
  return options;
}

/** The fixed demo-account prefix for nickname (DEV) accounts, or null (Kakao members and unrestricted servers). */
export function demoPrefix(options: AuthOptions | null, member?: Member | null): string | null {
  const prefix = options?.devLoginPrefix?.trim();
  if (!prefix || (member && (member.authProvider !== 'DEV' || member.role === 'ADMIN'))) return null;
  return prefix;
}

/** Editable part of a nickname: without a leading `${prefix}_` (also when the user typed it themselves). */
export function stripPrefix(prefix: string | null, nickname: string): string {
  if (!prefix) return nickname;
  const value = nickname.trimStart();
  return value.startsWith(`${prefix}_`) ? value.slice(prefix.length + 1) : value;
}

/** Full nickname sent to the API: `${prefix}_${typed}` (never doubled), trimmed. */
export function withPrefix(prefix: string | null, typed: string): string {
  const rest = stripPrefix(prefix, typed).trim();
  return prefix ? `${prefix}_${rest}` : rest;
}

/** 2–20 chars in total, and something typed after the prefix. */
export function nicknameValid(prefix: string | null, typed: string): boolean {
  const full = withPrefix(prefix, typed);
  return full.length >= 2 && full.length <= 20 && (!prefix || stripPrefix(prefix, typed).trim().length > 0);
}
