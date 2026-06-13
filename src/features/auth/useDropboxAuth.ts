import { useCallback, useEffect, useRef, useState } from 'react';
import { dropboxAppKey } from '../../lib/env';
import {
  buildDropboxAuthorizeUrl,
  createDropboxPkcePair,
  DropboxError,
  exchangeDropboxCode,
  refreshDropboxAccessToken,
  revokeDropboxToken,
} from '../../lib/dropbox';
import { StorageError } from '../../lib/storageClient';
import {
  clearDropboxPkceRequest,
  clearDropboxRefreshToken,
  clearDropboxSessionToken,
  loadDropboxPkceRequest,
  loadDropboxRefreshToken,
  loadDropboxSessionToken,
  saveDropboxPkceRequest,
  saveDropboxRefreshToken,
  saveDropboxSessionToken,
  type DropboxSessionToken,
} from './dropboxTokenCache';

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export type DropboxAuth = {
  connect: () => void;
  getAccessToken: () => Promise<string>;
  hasRefreshToken: boolean;
  isAvailable: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  loginError: string | null;
  logout: () => void;
};

export function useDropboxAuth(): DropboxAuth {
  const [refreshToken, setRefreshToken] = useState<string | null>(loadDropboxRefreshToken);
  const [session, setSession] = useState<DropboxSessionToken | null>(loadDropboxSessionToken);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const refreshTokenRef = useRef(refreshToken);
  const sessionRef = useRef(session);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  const bootstrappedRef = useRef(false);

  const applySession = useCallback((nextSession: DropboxSessionToken | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);

    if (nextSession) {
      saveDropboxSessionToken(nextSession);
    } else {
      clearDropboxSessionToken();
    }
  }, []);

  const applyRefreshToken = useCallback((nextRefreshToken: string | null) => {
    refreshTokenRef.current = nextRefreshToken;
    setRefreshToken(nextRefreshToken);

    if (nextRefreshToken) {
      saveDropboxRefreshToken(nextRefreshToken);
    } else {
      clearDropboxRefreshToken();
    }
  }, []);

  const disconnect = useCallback(() => {
    applyRefreshToken(null);
    applySession(null);
  }, [applyRefreshToken, applySession]);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const currentSession = sessionRef.current;

    if (currentSession && currentSession.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return currentSession.accessToken;
    }

    const currentRefreshToken = refreshTokenRef.current;

    if (!currentRefreshToken) {
      throw new StorageError('Dropboxに接続されていません。', 401);
    }

    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = refreshDropboxAccessToken(dropboxAppKey, currentRefreshToken)
        .then((grant) => {
          applySession({
            accessToken: grant.accessToken,
            expiresAt: grant.expiresAt,
          });

          if (grant.refreshToken) {
            applyRefreshToken(grant.refreshToken);
          }

          return grant.accessToken;
        })
        .catch((error) => {
          if (isRevokedGrantError(error)) {
            disconnect();
          }

          throw error;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
    }

    return refreshPromiseRef.current;
  }, [applyRefreshToken, applySession, disconnect]);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    bootstrappedRef.current = true;

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const authError = url.searchParams.get('error');
    const returnedState = url.searchParams.get('state');
    const pkceRequest = loadDropboxPkceRequest();

    if (pkceRequest && (code || authError)) {
      clearDropboxPkceRequest();
      cleanAuthParamsFromUrl();

      if (!code || authError) {
        setLoginError('Dropbox連携がキャンセルまたは拒否されました。');
        return;
      }

      if (returnedState !== pkceRequest.state) {
        setLoginError('Dropbox連携の応答を確認できませんでした。もう一度接続してください。');
        return;
      }

      setIsAuthorizing(true);

      exchangeDropboxCode(dropboxAppKey, getRedirectUri(), code, pkceRequest.verifier)
        .then((grant) => {
          applySession({
            accessToken: grant.accessToken,
            expiresAt: grant.expiresAt,
          });

          if (grant.refreshToken) {
            applyRefreshToken(grant.refreshToken);
          }

          setLoginError(null);
        })
        .catch((error) => {
          setLoginError(error instanceof Error ? error.message : 'Dropbox連携に失敗しました。');
        })
        .finally(() => {
          setIsAuthorizing(false);
        });

      return;
    }

    if (refreshTokenRef.current && !sessionRef.current) {
      setIsAuthorizing(true);

      getAccessToken()
        .catch(() => {
          // 失効していた場合はgetAccessToken内で切断済み。次回の接続操作に任せる。
        })
        .finally(() => {
          setIsAuthorizing(false);
        });
    }
  }, [applyRefreshToken, applySession, getAccessToken]);

  // 失効が近づいたら自動でリフレッシュし、利用中の接続を維持する。
  useEffect(() => {
    if (!session || !refreshToken) {
      return;
    }

    const timeoutMs = Math.max(session.expiresAt - TOKEN_REFRESH_MARGIN_MS / 2 - Date.now(), 0);
    const timeoutId = window.setTimeout(() => {
      getAccessToken().catch(() => {
        // 失敗時は次のAPI呼び出し時に再試行される。
      });
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [getAccessToken, refreshToken, session]);

  const connect = useCallback(() => {
    if (!dropboxAppKey) {
      setLoginError('VITE_DROPBOX_APP_KEY が未設定です。.env.local を設定してください。');
      return;
    }

    setLoginError(null);

    createDropboxPkcePair()
      .then(({ verifier, challenge }) => {
        const state = crypto.randomUUID();

        saveDropboxPkceRequest({ verifier, state });
        window.location.assign(buildDropboxAuthorizeUrl(dropboxAppKey, getRedirectUri(), challenge, state));
      })
      .catch((error) => {
        setLoginError(error instanceof Error ? error.message : 'Dropbox連携を開始できませんでした。');
      });
  }, []);

  const logout = useCallback(() => {
    const accessToken = sessionRef.current?.accessToken;

    disconnect();
    setLoginError(null);

    if (accessToken) {
      void revokeDropboxToken(accessToken);
    }
  }, [disconnect]);

  return {
    connect,
    getAccessToken,
    hasRefreshToken: Boolean(refreshToken),
    isAvailable: Boolean(dropboxAppKey),
    isConnected: Boolean(refreshToken && session),
    isReconnecting: isAuthorizing,
    loginError,
    logout,
  };
}

function isRevokedGrantError(error: unknown) {
  return error instanceof DropboxError && (error.summary === 'invalid_grant' || error.status === 401);
}

function getRedirectUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

function cleanAuthParamsFromUrl() {
  const url = new URL(window.location.href);

  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
