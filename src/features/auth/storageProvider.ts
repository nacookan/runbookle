import type { StorageProviderId } from '../../lib/storageClient';

const PROVIDER_KEY = 'runbookle.storageProvider.v1';

export function loadStoredProvider(): StorageProviderId | null {
  try {
    const value = localStorage.getItem(PROVIDER_KEY);

    return value === 'googleDrive' || value === 'dropbox' ? value : null;
  } catch {
    return null;
  }
}

export function saveStoredProvider(providerId: StorageProviderId) {
  try {
    localStorage.setItem(PROVIDER_KEY, providerId);
  } catch {
    // 保存できない環境では現在のセッションだけプロバイダ選択を保持する。
  }
}

export function clearStoredProvider() {
  try {
    localStorage.removeItem(PROVIDER_KEY);
  } catch {
    // localStorage不可の環境ではメモリ上の状態だけで動作する。
  }
}
