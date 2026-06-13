import {
  assertOnline,
  StorageError,
  type AttachmentFile,
  type RunbookAttachmentFile,
  type StorageClient,
  type StorageDataJson,
} from './storageClient';

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const RUNBOOKLE_DATA_FILE_NAME = 'runbookle-data.json';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_FILES_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const JSON_MIME_TYPE = 'application/json';
const ATTACHMENT_FIELDS = 'id,name,mimeType,size,createdTime';

export type AppDataFile = {
  id: string;
  name: string;
  modifiedTime?: string;
};

type DriveListResponse = {
  files?: AppDataFile[];
};

type DriveAttachmentResponse = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  appProperties?: Record<string, string>;
};

type DriveAttachmentListResponse = {
  files?: DriveAttachmentResponse[];
  nextPageToken?: string;
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

export class GoogleDriveError extends StorageError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'GoogleDriveError';
  }
}

export function createGoogleDriveClient(accessToken: string): StorageClient {
  return {
    providerId: 'googleDrive',
    providerLabel: 'Google Drive',
    loadDataJson: () => loadAppDataJson(accessToken),
    createDataJson: (json) => createAppDataJsonFile(accessToken, RUNBOOKLE_DATA_FILE_NAME, json),
    saveDataJson: (json, knownFileRef) => saveAppDataJsonFile(accessToken, RUNBOOKLE_DATA_FILE_NAME, json, knownFileRef),
    listAllAttachments: () => listAllAttachments(accessToken),
    uploadAttachment: (runbookId, file) => uploadRunbookAttachment(accessToken, runbookId, file),
    getAttachmentMetadata: (fileId) => getAttachmentMetadata(accessToken, fileId),
    downloadAttachment: (fileId) => downloadAttachment(accessToken, fileId),
    deleteAttachment: (fileId) => deleteAttachment(accessToken, fileId),
  };
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

async function loadAppDataJson(accessToken: string): Promise<StorageDataJson | null> {
  const existingFile = await findAppDataFile(accessToken, RUNBOOKLE_DATA_FILE_NAME);

  if (!existingFile) {
    return null;
  }

  return {
    json: await readAppDataJson(accessToken, existingFile.id),
    fileRef: existingFile.id,
  };
}

async function readAppDataJson(accessToken: string, fileId: string): Promise<unknown> {
  assertOnline();

  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: createAuthHeaders(accessToken),
  });

  await assertDriveResponse(response);

  return response.json();
}

async function createAppDataJsonFile(accessToken: string, fileName: string, json: string): Promise<string> {
  assertOnline();

  const metadata = {
    name: fileName,
    parents: ['appDataFolder'],
    mimeType: JSON_MIME_TYPE,
  };
  const boundary = createMultipartBoundary();
  const body = createMultipartBody(boundary, metadata, json);
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

  return response.id;
}

async function updateAppDataJsonFile(accessToken: string, fileId: string, json: string): Promise<void> {
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
      body: json,
    },
  );
}

async function saveAppDataJsonFile(
  accessToken: string,
  fileName: string,
  json: string,
  knownFileId?: string | null,
): Promise<string> {
  const targetFileId = knownFileId ?? (await findAppDataFile(accessToken, fileName))?.id;

  if (!targetFileId) {
    return createAppDataJsonFile(accessToken, fileName, json);
  }

  try {
    await updateAppDataJsonFile(accessToken, targetFileId, json);
    return targetFileId;
  } catch (error) {
    if (error instanceof GoogleDriveError && error.status === 404) {
      return createAppDataJsonFile(accessToken, fileName, json);
    }

    throw error;
  }
}

async function uploadRunbookAttachment(accessToken: string, runbookId: string, file: File): Promise<AttachmentFile> {
  assertOnline();

  const mimeType = file.type || 'application/octet-stream';
  const metadata = {
    name: file.name,
    parents: ['appDataFolder'],
    mimeType,
    appProperties: { runbookId },
  };
  const boundary = createMultipartBoundary();
  const body = createBinaryMultipartBody(boundary, metadata, file);
  const searchParams = new URLSearchParams({
    uploadType: 'multipart',
    fields: ATTACHMENT_FIELDS,
  });

  const response = await fetchDriveJson<DriveAttachmentResponse>(`${DRIVE_UPLOAD_FILES_URL}?${searchParams.toString()}`, {
    method: 'POST',
    headers: {
      ...createAuthHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.id) {
    throw new GoogleDriveError('ファイルをアップロードできませんでした。', 500);
  }

  return toAttachmentFile(response, file.name, file.size, mimeType);
}

async function listAllAttachments(accessToken: string): Promise<RunbookAttachmentFile[]> {
  assertOnline();

  const files = await fetchAppDataFiles(accessToken, 'trashed = false', `${ATTACHMENT_FIELDS},appProperties`);

  return files
    .filter(
      (file): file is DriveAttachmentResponse & { id: string; name: string; appProperties: Record<string, string> } =>
        Boolean(file.id && file.name && file.appProperties?.runbookId),
    )
    .map((file) => ({
      ...toAttachmentFile(file),
      runbookId: file.appProperties.runbookId,
    }));
}

async function getAttachmentMetadata(accessToken: string, fileId: string): Promise<AttachmentFile> {
  assertOnline();

  const searchParams = new URLSearchParams({ fields: ATTACHMENT_FIELDS });
  const response = await fetchDriveJson<DriveAttachmentResponse>(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${searchParams.toString()}`,
    { headers: createAuthHeaders(accessToken) },
  );

  if (!response.id || !response.name) {
    throw new GoogleDriveError('添付ファイルが見つかりません。', 404);
  }

  return toAttachmentFile(response);
}

async function downloadAttachment(accessToken: string, fileId: string): Promise<Blob> {
  assertOnline();

  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: createAuthHeaders(accessToken),
  });

  await assertDriveResponse(response);

  return response.blob();
}

async function deleteAttachment(accessToken: string, fileId: string): Promise<void> {
  assertOnline();

  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: createAuthHeaders(accessToken),
  });

  if (response.status === 404) {
    return;
  }

  await assertDriveResponse(response);
}

async function fetchAppDataFiles(accessToken: string, query: string, fields: string): Promise<DriveAttachmentResponse[]> {
  const files: DriveAttachmentResponse[] = [];
  let pageToken: string | undefined;

  do {
    const searchParams = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: `nextPageToken, files(${fields})`,
      pageSize: '1000',
      q: query,
    });

    if (pageToken) {
      searchParams.set('pageToken', pageToken);
    }

    const response = await fetchDriveJson<DriveAttachmentListResponse>(`${DRIVE_FILES_URL}?${searchParams.toString()}`, {
      headers: createAuthHeaders(accessToken),
    });

    files.push(...(response.files ?? []));
    pageToken = response.nextPageToken;
  } while (pageToken);

  return files;
}

function toAttachmentFile(file: DriveAttachmentResponse, fallbackName?: string, fallbackSize?: number, fallbackMimeType?: string): AttachmentFile {
  return {
    id: file.id ?? '',
    name: file.name ?? fallbackName ?? '',
    mimeType: file.mimeType ?? fallbackMimeType ?? 'application/octet-stream',
    size: file.size ? Number(file.size) : (fallbackSize ?? null),
    createdTime: file.createdTime ?? null,
  };
}

function createBinaryMultipartBody(boundary: string, metadata: object, file: File) {
  const contentType = file.type || 'application/octet-stream';
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;

  return new Blob([head, file, tail]);
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

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function createMultipartBoundary() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `runbookle-${crypto.randomUUID()}`;
  }

  return `runbookle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMultipartBody(boundary: string, metadata: object, json: string) {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    json,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
