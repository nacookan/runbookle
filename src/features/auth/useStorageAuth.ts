import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDropboxClient } from '../../lib/dropbox';
import { createGoogleDriveClient } from '../../lib/googleDrive';
import type { StorageClient, StorageProviderId } from '../../lib/storageClient';
import { clearStorageLogoutFlag, loadHasExplicitStorageLogout, markStorageLoggedOut } from './connectionHistory';
import { clearStoredProvider, loadStoredProvider, saveStoredProvider } from './storageProvider';
import { useDropboxAuth } from './useDropboxAuth';
import { useGoogleAuth, type GoogleAuthStatus } from './useGoogleAuth';

const PROVIDER_LABELS: Record<StorageProviderId, string> = {
  googleDrive: 'Google Drive',
  dropbox: 'Dropbox',
};

export type StorageAuth = {
  client: StorageClient | null;
  providerId: StorageProviderId | null;
  providerLabel: string | null;
  isConnected: boolean;
  isReconnecting: boolean;
  loginError: string | null;
  googleStatus: GoogleAuthStatus;
  isDropboxAvailable: boolean;
  hasConnectionHint: boolean;
  hasExplicitLogout: boolean;
  connectGoogle: () => void;
  connectDropbox: () => void;
  reconnect: () => void;
  logout: () => void;
};

export function useStorageAuth(): StorageAuth {
  const google = useGoogleAuth();
  const dropbox = useDropboxAuth();
  const [providerId, setProviderId] = useState<StorageProviderId | null>(() => {
    const stored = loadStoredProvider();

    if (stored) {
      return stored;
    }

    // プロバイダ選択機能より前からのユーザーは、Google Drive接続履歴を選択済みとして扱う。
    return google.hasDriveConnectionHint ? 'googleDrive' : null;
  });
  const [hasExplicitLogout, setHasExplicitLogout] = useState(loadHasExplicitStorageLogout);
  const silentReconnectTriedRef = useRef(false);

  useEffect(() => {
    if (google.isConnected) {
      saveStoredProvider('googleDrive');
      setProviderId('googleDrive');
      setHasExplicitLogout(false);
    }
  }, [google.isConnected]);

  useEffect(() => {
    if (dropbox.isConnected) {
      saveStoredProvider('dropbox');
      setProviderId('dropbox');
      clearStorageLogoutFlag();
      setHasExplicitLogout(false);
    }
  }, [dropbox.isConnected]);

  // Google Driveのサイレント再接続。起動時に1回だけ試す。
  const googleConnect = google.connect;
  useEffect(() => {
    if (
      silentReconnectTriedRef.current ||
      providerId !== 'googleDrive' ||
      google.status !== 'ready' ||
      google.isConnected ||
      !google.hasDriveConnectionHint ||
      google.hasExplicitDriveLogout
    ) {
      return;
    }

    silentReconnectTriedRef.current = true;
    googleConnect('', { silent: true });
  }, [google.hasDriveConnectionHint, google.hasExplicitDriveLogout, google.isConnected, google.status, googleConnect, providerId]);

  const client = useMemo(() => {
    if (providerId === 'googleDrive' && google.session) {
      return createGoogleDriveClient(google.session.accessToken);
    }

    if (providerId === 'dropbox' && dropbox.isConnected) {
      return createDropboxClient(dropbox.getAccessToken);
    }

    return null;
  }, [dropbox.getAccessToken, dropbox.isConnected, google.session, providerId]);

  const connectGoogle = useCallback(() => {
    googleConnect();
  }, [googleConnect]);

  const reconnect = useCallback(() => {
    if (providerId === 'dropbox') {
      dropbox.connect();
      return;
    }

    googleConnect('');
  }, [dropbox.connect, googleConnect, providerId]);

  const googleLogout = google.logout;
  const dropboxLogout = dropbox.logout;
  const logout = useCallback(() => {
    if (providerId === 'dropbox') {
      dropboxLogout();
      markStorageLoggedOut();
    } else {
      googleLogout();
    }

    clearStoredProvider();
    setProviderId(null);
    setHasExplicitLogout(true);
  }, [dropboxLogout, googleLogout, providerId]);

  const isConnected = providerId === 'googleDrive' ? google.isConnected : providerId === 'dropbox' ? dropbox.isConnected : false;
  const isReconnecting =
    providerId === 'googleDrive' ? google.isReconnectPending : providerId === 'dropbox' ? dropbox.isReconnecting : false;

  return {
    client,
    providerId,
    providerLabel: providerId ? PROVIDER_LABELS[providerId] : null,
    isConnected,
    isReconnecting,
    loginError: google.loginError ?? dropbox.loginError,
    googleStatus: google.status,
    isDropboxAvailable: dropbox.isAvailable,
    hasConnectionHint: google.hasDriveConnectionHint || dropbox.hasRefreshToken,
    hasExplicitLogout,
    connectGoogle,
    connectDropbox: dropbox.connect,
    reconnect,
    logout,
  };
}
