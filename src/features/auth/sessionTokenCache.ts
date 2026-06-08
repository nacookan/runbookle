import type { GoogleSession } from './types';

const SESSION_TOKEN_CACHE_KEY = 'runbookle.googleDrive.sessionToken.v1';
const EXPIRY_MARGIN_MS = 10_000;

export function loadSessionToken(): GoogleSession | null {
  try {
    const serializedSession = sessionStorage.getItem(SESSION_TOKEN_CACHE_KEY);

    if (!serializedSession) {
      return null;
    }

    const maybeSession = JSON.parse(serializedSession) as Partial<GoogleSession>;

    if (
      typeof maybeSession.accessToken !== 'string' ||
      typeof maybeSession.expiresAt !== 'number' ||
      typeof maybeSession.scope !== 'string'
    ) {
      clearSessionToken();
      return null;
    }

    if (maybeSession.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
      clearSessionToken();
      return null;
    }

    return {
      accessToken: maybeSession.accessToken,
      expiresAt: maybeSession.expiresAt,
      scope: maybeSession.scope,
    };
  } catch {
    return null;
  }
}

export function saveSessionToken(session: GoogleSession) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_CACHE_KEY, JSON.stringify(session));
  } catch {
    // セッション内キャッシュは利便性用なので、保存できなくてもログイン自体は成立させる。
  }
}

export function clearSessionToken() {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_CACHE_KEY);
  } catch {
    // sessionStorage不可の環境ではメモリ上の状態だけで動作する。
  }
}
