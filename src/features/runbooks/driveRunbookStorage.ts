import {
  createAppDataJsonFile,
  findAppDataFile,
  readAppDataJsonFile,
  RUNBOOKLE_DATA_FILE_NAME,
  saveAppDataJsonFile,
} from '../../lib/googleDrive';
import type { RunbookleData } from './types';
import { createEmptyRunbookleData, parseRunbookleData } from './model';

export type RunbookleDataFile = {
  fileId: string;
  data: RunbookleData;
};

export async function loadOrCreateRunbookleData(
  accessToken: string,
  fallbackData: RunbookleData,
): Promise<RunbookleDataFile> {
  const existingFile = await findAppDataFile(accessToken, RUNBOOKLE_DATA_FILE_NAME);

  if (existingFile) {
    return {
      fileId: existingFile.id,
      data: await readAppDataJsonFile(accessToken, existingFile.id, parseRunbookleData),
    };
  }

  const dataToCreate = fallbackData.runbooks.length > 0 ? fallbackData : createEmptyRunbookleData();

  return createAppDataJsonFile(accessToken, RUNBOOKLE_DATA_FILE_NAME, dataToCreate);
}

export function saveRunbookleData(
  accessToken: string,
  data: RunbookleData,
  knownFileId?: string | null,
): Promise<RunbookleDataFile> {
  return saveAppDataJsonFile(accessToken, RUNBOOKLE_DATA_FILE_NAME, data, knownFileId);
}
