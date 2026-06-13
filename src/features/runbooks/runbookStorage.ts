import { StorageError, type StorageClient } from '../../lib/storageClient';
import type { RunbookleData } from './types';
import { createEmptyRunbookleData, parseRunbookleData } from './model';

export type RunbookleDataFile = {
  fileRef: string;
  data: RunbookleData;
};

export async function loadOrCreateRunbookleData(
  client: StorageClient,
  fallbackData: RunbookleData,
): Promise<RunbookleDataFile> {
  const existingFile = await client.loadDataJson();

  if (existingFile) {
    const data = parseRunbookleData(existingFile.json);

    if (!data) {
      throw new StorageError('保存されているデータ形式が正しくありません。', 422);
    }

    return {
      fileRef: existingFile.fileRef,
      data,
    };
  }

  const dataToCreate = fallbackData.runbooks.length > 0 ? fallbackData : createEmptyRunbookleData();

  return {
    fileRef: await client.createDataJson(JSON.stringify(dataToCreate)),
    data: dataToCreate,
  };
}

export async function saveRunbookleData(
  client: StorageClient,
  data: RunbookleData,
  knownFileRef?: string | null,
): Promise<RunbookleDataFile> {
  return {
    fileRef: await client.saveDataJson(JSON.stringify(data), knownFileRef ?? null),
    data,
  };
}
