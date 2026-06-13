const REFRESH_TOKEN_KEY = 'runbookle.dropbox.refreshToken.v1';
const SESSION_TOKEN_KEY = 'runbookle.dropbox.sessionToken.v1';
const PKCE_REQUEST_KEY = 'runbookle.dropbox.pkceRequest.v1';
const EXPIRY_MARGIN_MS = 60_000;

export type DropboxSessionToken = {
  accessToken: string;
  expiresAt: number;
};

export type DropboxPkceRequest = {
  verifier: string;
  state: string;
};

// 長期接続維持のため、refresh tokenはlocalStorageに保存する。
// XSS時に漏えいするトレードオフは development-notes.md に記載済み。
export function loadDropboxRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveDropboxRefreshToken(refreshToken: string) {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // 保存できない環境では現在のセッションだけ接続を維持する。
  }
}

export function clearDropboxRefreshToken() {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // localStorage不可の環境ではメモリ上の状態だけで動作する。
  }
}

export function loadDropboxSessionToken(): DropboxSessionToken | null {
  try {
    const serialized = sessionStorage.getItem(SESSION_TOKEN_KEY);

    if (!serialized) {
      return null;
    }

    const maybeToken = JSON.parse(serialized) as Partial<DropboxSessionToken>;

    if (typeof maybeToken.accessToken !== 'string' || typeof maybeToken.expiresAt !== 'number') {
      clearDropboxSessionToken();
      return null;
    }

    if (maybeToken.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
      clearDropboxSessionToken();
      return null;
    }

    return {
      accessToken: maybeToken.accessToken,
      expiresAt: maybeToken.expiresAt,
    };
  } catch {
    return null;
  }
}

export function saveDropboxSessionToken(token: DropboxSessionToken) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  } catch {
    // セッション内キャッシュは利便性用なので、保存できなくても接続自体は成立させる。
  }
}

export function clearDropboxSessionToken() {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // sessionStorage不可の環境ではメモリ上の状態だけで動作する。
  }
}

export function loadDropboxPkceRequest(): DropboxPkceRequest | null {
  try {
    const serialized = sessionStorage.getItem(PKCE_REQUEST_KEY);

    if (!serialized) {
      return null;
    }

    const maybeRequest = JSON.parse(serialized) as Partial<DropboxPkceRequest>;

    if (typeof maybeRequest.verifier !== 'string' || typeof maybeRequest.state !== 'string') {
      return null;
    }

    return {
      verifier: maybeRequest.verifier,
      state: maybeRequest.state,
    };
  } catch {
    return null;
  }
}

export function saveDropboxPkceRequest(request: DropboxPkceRequest) {
  sessionStorage.setItem(PKCE_REQUEST_KEY, JSON.stringify(request));
}

export function clearDropboxPkceRequest() {
  try {
    sessionStorage.removeItem(PKCE_REQUEST_KEY);
  } catch {
    // 後始末に失敗しても認可フロー自体には影響しない。
  }
}
