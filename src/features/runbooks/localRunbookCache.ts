import { RUNBOOKLE_SCHEMA_VERSION, type RunbookleData } from './types';
import { parseRunbookleData } from './model';

const LOCAL_RUNBOOK_CACHE_KEY = `runbookle.data.v${RUNBOOKLE_SCHEMA_VERSION}`;

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
    // Drive保存はlocalStorageの可否に依存させない。
  }
}
