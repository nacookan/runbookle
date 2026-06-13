import type { StorageProviderId } from '../../lib/storageClient';
import { RUNBOOKLE_SCHEMA_VERSION, type RunbookleData } from './types';
import { parseRunbookleData } from './model';

const LOCAL_RUNBOOK_CACHE_KEY = `runbookle.data.v${RUNBOOKLE_SCHEMA_VERSION}`;
const LOCAL_RUNBOOK_CACHE_PROVIDER_KEY = `runbookle.data.provider.v${RUNBOOKLE_SCHEMA_VERSION}`;

export function loadLocalRunbookleData(): RunbookleData | null {
  let serializedData: string | null = null;

  try {
    serializedData = localStorage.getItem(LOCAL_RUNBOOK_CACHE_KEY);
  } catch {
    return null;
  }

  try {
    return serializedData ? parseRunbookleData(JSON.parse(serializedData)) : null;
  } catch {
    return null;
  }
}

export function saveLocalRunbookleData(data: RunbookleData) {
  try {
    localStorage.setItem(LOCAL_RUNBOOK_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ストレージ保存はlocalStorageの可否に依存させない。
  }
}

// キャッシュがどのプロバイダのデータかを記録する。
// プロバイダ切り替え時に、前のプロバイダのキャッシュを新しいプロバイダへ持ち込まないために使う。
export function loadLocalDataProvider(): StorageProviderId | null {
  try {
    const value = localStorage.getItem(LOCAL_RUNBOOK_CACHE_PROVIDER_KEY);

    return value === 'googleDrive' || value === 'dropbox' ? value : null;
  } catch {
    return null;
  }
}

export function saveLocalDataProvider(providerId: StorageProviderId) {
  try {
    localStorage.setItem(LOCAL_RUNBOOK_CACHE_PROVIDER_KEY, providerId);
  } catch {
    // 記録できない環境ではプロバイダ照合をスキップして動作する。
  }
}
