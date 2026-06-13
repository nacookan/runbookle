import { useCallback, useEffect, useRef, useState } from 'react';
import { googleClientId } from '../../lib/env';
import { DRIVE_APPDATA_SCOPE } from '../../lib/googleDrive';
import { loadHadGoogleDriveConnection, loadHasExplicitStorageLogout, markGoogleDriveConnected, markStorageLoggedOut } from './connectionHistory';
import { loadGoogleIdentity, type GoogleTokenClient } from './googleIdentity';
import { clearSessionToken, loadSessionToken, saveSessionToken } from './sessionTokenCache';
import type { GoogleSession } from './types';

export type GoogleAuthStatus = 'idle' | 'loading' | 'ready' | 'missingConfig' | 'error';

type ConnectOptions = {
  silent?: boolean;
};

export function useGoogleAuth() {
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const silentRequestRef = useRef(false);
  const silentTimeoutRef = useRef<number | null>(null);
  const [session, setSession] = useState<GoogleSession | null>(loadSessionToken);
  const [hasDriveConnectionHint, setHasDriveConnectionHint] = useState(loadHadGoogleDriveConnection);
  const [hasExplicitDriveLogout, setHasExplicitDriveLogout] = useState(loadHasExplicitStorageLogout);
  const [isReconnectPending, setIsReconnectPending] = useState(false);
  const [status, setStatus] = useState<GoogleAuthStatus>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);

  const clearSilentReconnect = useCallback(() => {
    silentRequestRef.current = false;
    setIsReconnectPending(false);

    if (silentTimeoutRef.current !== null) {
      window.clearTimeout(silentTimeoutRef.current);
      silentTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!googleClientId) {
      setStatus('missingConfig');
      return;
    }

    let disposed = false;
    setStatus('loading');
    setLoginError(null);

    loadGoogleIdentity()
      .then((google) => {
        if (disposed) {
          return;
        }

        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: DRIVE_APPDATA_SCOPE,
          callback: (response) => {
            const isSilentRequest = silentRequestRef.current;
            clearSilentReconnect();

            if (response.error) {
              if (!isSilentRequest) {
                setLoginError(response.error_description || 'Google連携に失敗しました。');
              }
              return;
            }

            if (!response.access_token) {
              if (!isSilentRequest) {
                setLoginError('Googleのアクセストークンを取得できませんでした。');
              }
              return;
            }

            const nextSession = {
              accessToken: response.access_token,
              expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
              scope: response.scope ?? DRIVE_APPDATA_SCOPE,
            };

            setSession(nextSession);
            saveSessionToken(nextSession);
            markGoogleDriveConnected();
            setHasDriveConnectionHint(true);
            setHasExplicitDriveLogout(false);
            setLoginError(null);
          },
        });

        setStatus('ready');
      })
      .catch((error) => {
        if (!disposed) {
          setStatus('error');
          setLoginError(error instanceof Error ? error.message : 'Google Drive連携の準備に失敗しました。');
        }
      });

    return () => {
      disposed = true;
      clearSilentReconnect();
    };
  }, [clearSilentReconnect]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const timeoutMs = Math.max(session.expiresAt - Date.now(), 0);
    const timeoutId = window.setTimeout(() => {
      setSession(null);
      clearSessionToken();
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [session]);

  const connect = useCallback((prompt: '' | 'select_account' = 'select_account', options: ConnectOptions = {}) => {
    if (!tokenClientRef.current) {
      if (!options.silent) {
        setLoginError('Google Drive連携の準備がまだ完了していません。');
      }
      return;
    }

    setLoginError(null);
    silentRequestRef.current = Boolean(options.silent);

    if (options.silent) {
      setIsReconnectPending(true);

      if (silentTimeoutRef.current !== null) {
        window.clearTimeout(silentTimeoutRef.current);
      }

      silentTimeoutRef.current = window.setTimeout(() => {
        clearSilentReconnect();
      }, 5000);
    } else {
      clearSilentReconnect();
    }

    try {
      tokenClientRef.current.requestAccessToken({
        prompt,
      });
    } catch (error) {
      clearSilentReconnect();
      if (!options.silent) {
        setLoginError(error instanceof Error ? error.message : 'Google Drive連携に失敗しました。');
      }
    }
  }, [clearSilentReconnect]);

  const logout = useCallback(() => {
    const accessToken = session?.accessToken;

    setSession(null);
    clearSessionToken();
    clearSilentReconnect();
    markStorageLoggedOut();
    setHasDriveConnectionHint(false);
    setHasExplicitDriveLogout(true);

    if (accessToken) {
      window.google?.accounts.oauth2.revoke(accessToken, () => undefined);
    }
  }, [clearSilentReconnect, session]);

  return {
    connect,
    hasDriveConnectionHint,
    hasExplicitDriveLogout,
    isConnected: Boolean(session),
    isReconnectPending,
    loginError,
    logout,
    session,
    status,
  };
}
