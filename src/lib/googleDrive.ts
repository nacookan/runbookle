export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const RUNBOOKLE_DATA_FILE_NAME = 'runbookle-data.json';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_FILES_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const JSON_MIME_TYPE = 'application/json';

export type AppDataFile = {
  id: string;
  name: string;
  modifiedTime?: string;
};

export type AppDataJsonFile<T> = {
  fileId: string;
  data: T;
};

type DriveListResponse = {
  files?: AppDataFile[];
};

type DriveFileResponse = {
  id?: string;
  name?: string;
  modifiedTime?: string;
};

type DriveErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GoogleDriveError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoogleDriveError';
    this.status = status;
  }
}

export async function findAppDataFile(accessToken: string, fileName: string): Promise<AppDataFile | null> {
  assertOnline();

  const searchParams = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
    pageSize: '1',
    q: `name = '${escapeDriveQueryValue(fileName)}' and trashed = false`,
  });

  const response = await fetchDriveJson<DriveListResponse>(`${DRIVE_FILES_URL}?${searchParams.toString()}`, {
    headers: createAuthHeaders(accessToken),
  });

  return response.files?.[0] ?? null;
}

export async function readAppDataJsonFile<T>(
  accessToken: string,
  fileId: string,
  parse: (value: unknown) => T | null,
): Promise<T> {
  assertOnline();

  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: createAuthHeaders(accessToken),
  });

  await assertDriveResponse(response);

  const data = parse(await response.json());

  if (!data) {
    throw new GoogleDriveError('Drive上のデータ形式が正しくありません。', 422);
  }

  return data;
}

export async function createAppDataJsonFile<T>(
  accessToken: string,
  fileName: string,
  data: T,
): Promise<AppDataJsonFile<T>> {
  assertOnline();

  const metadata = {
    name: fileName,
    parents: ['appDataFolder'],
    mimeType: JSON_MIME_TYPE,
  };
  const boundary = createMultipartBoundary();
  const body = createMultipartBody(boundary, metadata, data);
  const searchParams = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,modifiedTime',
  });

  const response = await fetchDriveJson<DriveFileResponse>(`${DRIVE_UPLOAD_FILES_URL}?${searchParams.toString()}`, {
    method: 'POST',
    headers: {
      ...createAuthHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.id) {
    throw new GoogleDriveError('Drive上にデータファイルを作成できませんでした。', 500);
  }

  return {
    fileId: response.id,
    data,
  };
}

export async function updateAppDataJsonFile<T>(accessToken: string, fileId: string, data: T): Promise<void> {
  assertOnline();

  const searchParams = new URLSearchParams({
    uploadType: 'media',
    fields: 'id,modifiedTime',
  });

  await fetchDriveJson<DriveFileResponse>(
    `${DRIVE_UPLOAD_FILES_URL}/${encodeURIComponent(fileId)}?${searchParams.toString()}`,
    {
      method: 'PATCH',
      headers: {
        ...createAuthHeaders(accessToken),
        'Content-Type': JSON_MIME_TYPE,
      },
      body: JSON.stringify(data),
    },
  );
}

export async function saveAppDataJsonFile<T>(
  accessToken: string,
  fileName: string,
  data: T,
  knownFileId?: string | null,
): Promise<AppDataJsonFile<T>> {
  const targetFileId = knownFileId ?? (await findAppDataFile(accessToken, fileName))?.id;

  if (!targetFileId) {
    return createAppDataJsonFile(accessToken, fileName, data);
  }

  try {
    await updateAppDataJsonFile(accessToken, targetFileId, data);
    return {
      fileId: targetFileId,
      data,
    };
  } catch (error) {
    if (error instanceof GoogleDriveError && error.status === 404) {
      return createAppDataJsonFile(accessToken, fileName, data);
    }

    throw error;
  }
}

async function fetchDriveJson<T>(url: string, init?: RequestInit): Promise<T> {
  assertOnline();

  const response = await fetch(url, init);
  await assertDriveResponse(response);

  return (await response.json()) as T;
}

async function assertDriveResponse(response: Response) {
  if (response.ok) {
    return;
  }

  let message = `Google Drive API request failed: ${response.status}`;

  try {
    const data = (await response.json()) as DriveErrorResponse;
    message = data.error?.message || message;
  } catch {
    // Keep the generic message if Google did not return a JSON error body.
  }

  throw new GoogleDriveError(message, response.status);
}

function createAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function assertOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new GoogleDriveError('オフラインのためGoogle Driveに保存できません。ローカルキャッシュには残っています。', 0);
  }
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function createMultipartBoundary() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `runbookle-${crypto.randomUUID()}`;
  }

  return `runbookle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMultipartBody(boundary: string, metadata: object, data: unknown) {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(data),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
