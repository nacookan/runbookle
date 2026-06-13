import {
  assertOnline,
  StorageError,
  type AttachmentFile,
  type RunbookAttachmentFile,
  type StorageClient,
  type StorageDataJson,
} from './storageClient';

export const DROPBOX_DATA_FILE_PATH = '/runbookle-data.json';

const DROPBOX_AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_URL = 'https://content.dropboxapi.com/2';
const ATTACHMENTS_ROOT_PATH = '/attachments';
const LIST_FOLDER_PAGE_SIZE = 1000;

export type DropboxTokenGrant = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string | null;
};

export type GetDropboxAccessToken = () => Promise<string>;

type DropboxTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type DropboxFileMetadata = {
  '.tag'?: string;
  id?: string;
  name?: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  client_modified?: string;
  server_modified?: string;
};

type DropboxListFolderResponse = {
  entries?: DropboxFileMetadata[];
  cursor?: string;
  has_more?: boolean;
};

type DropboxErrorResponse = {
  error_summary?: string;
  user_message?: string;
};

export class DropboxError extends StorageError {
  summary: string;

  constructor(message: string, status: number, summary = '') {
    super(message, status);
    this.name = 'DropboxError';
    this.summary = summary;
  }
}

export function createDropboxClient(getAccessToken: GetDropboxAccessToken): StorageClient {
  return {
    providerId: 'dropbox',
    providerLabel: 'Dropbox',
    loadDataJson: () => loadDataJson(getAccessToken),
    createDataJson: (json) => saveDataJson(getAccessToken, json),
    saveDataJson: (json) => saveDataJson(getAccessToken, json),
    listAllAttachments: () => listAllAttachments(getAccessToken),
    uploadAttachment: (runbookId, file) => uploadAttachment(getAccessToken, runbookId, file),
    getAttachmentMetadata: (fileId) => getAttachmentMetadata(getAccessToken, fileId),
    downloadAttachment: (fileId) => downloadFile(getAccessToken, fileId),
    deleteAttachment: (fileId) => deleteAttachment(getAccessToken, fileId),
  };
}

export async function createDropboxPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = new Uint8Array(64);
  crypto.getRandomValues(randomBytes);

  const verifier = base64UrlEncode(randomBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

  return {
    verifier,
    challenge: base64UrlEncode(new Uint8Array(digest)),
  };
}

export function buildDropboxAuthorizeUrl(appKey: string, redirectUri: string, codeChallenge: string, state: string) {
  const searchParams = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    token_access_type: 'offline',
    state,
  });

  return `${DROPBOX_AUTHORIZE_URL}?${searchParams.toString()}`;
}

export function exchangeDropboxCode(
  appKey: string,
  redirectUri: string,
  code: string,
  codeVerifier: string,
): Promise<DropboxTokenGrant> {
  return requestDropboxToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: appKey,
      redirect_uri: redirectUri,
    }),
  );
}

export function refreshDropboxAccessToken(appKey: string, refreshToken: string): Promise<DropboxTokenGrant> {
  return requestDropboxToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
    }),
  );
}

export async function revokeDropboxToken(accessToken: string): Promise<void> {
  try {
    await fetch(`${DROPBOX_API_URL}/auth/token/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // 失効処理は利便性のためのベストエフォート。失敗してもローカルの切断は続行する。
  }
}

async function requestDropboxToken(body: URLSearchParams): Promise<DropboxTokenGrant> {
  assertOnline();

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  let data: DropboxTokenResponse = {};

  try {
    data = (await response.json()) as DropboxTokenResponse;
  } catch {
    // 非JSONレスポンスは下のエラー処理に任せる。
  }

  if (!response.ok || !data.access_token) {
    throw new DropboxError(
      data.error_description || `Dropbox認証に失敗しました: ${response.status}`,
      response.status,
      data.error ?? '',
    );
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
    refreshToken: data.refresh_token ?? null,
  };
}

async function loadDataJson(getAccessToken: GetDropboxAccessToken): Promise<StorageDataJson | null> {
  let blob: Blob;

  try {
    blob = await downloadFile(getAccessToken, DROPBOX_DATA_FILE_PATH);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }

  try {
    return {
      json: JSON.parse(await blob.text()) as unknown,
      fileRef: DROPBOX_DATA_FILE_PATH,
    };
  } catch {
    throw new DropboxError('Dropbox上のデータ形式が正しくありません。', 422);
  }
}

async function saveDataJson(getAccessToken: GetDropboxAccessToken, json: string): Promise<string> {
  await contentUpload(
    getAccessToken,
    {
      path: DROPBOX_DATA_FILE_PATH,
      mode: 'overwrite',
      autorename: false,
      mute: true,
    },
    new Blob([json], { type: 'application/json' }),
  );

  return DROPBOX_DATA_FILE_PATH;
}

async function listAllAttachments(getAccessToken: GetDropboxAccessToken): Promise<RunbookAttachmentFile[]> {
  const entries: DropboxFileMetadata[] = [];
  let result: DropboxListFolderResponse;

  try {
    result = await rpc<DropboxListFolderResponse>(getAccessToken, 'files/list_folder', {
      path: ATTACHMENTS_ROOT_PATH,
      recursive: true,
      limit: LIST_FOLDER_PAGE_SIZE,
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }

  entries.push(...(result.entries ?? []));

  while (result.has_more && result.cursor) {
    result = await rpc<DropboxListFolderResponse>(getAccessToken, 'files/list_folder/continue', {
      cursor: result.cursor,
    });
    entries.push(...(result.entries ?? []));
  }

  const attachments: RunbookAttachmentFile[] = [];

  for (const entry of entries) {
    if (entry['.tag'] !== 'file' || !entry.id || !entry.name) {
      continue;
    }

    const runbookId = parseRunbookIdFromPath(entry.path_display ?? entry.path_lower ?? '');

    if (!runbookId) {
      continue;
    }

    attachments.push({
      ...toAttachmentFile(entry),
      runbookId,
    });
  }

  return attachments;
}

async function uploadAttachment(getAccessToken: GetDropboxAccessToken, runbookId: string, file: File): Promise<AttachmentFile> {
  const path = `${ATTACHMENTS_ROOT_PATH}/${sanitizePathSegment(runbookId)}/${sanitizePathSegment(file.name)}`;
  const metadata = await contentUpload(
    getAccessToken,
    {
      path,
      mode: 'add',
      autorename: true,
      mute: true,
    },
    file,
  );

  if (!metadata.id) {
    throw new DropboxError('ファイルをアップロードできませんでした。', 500);
  }

  return toAttachmentFile(metadata, file.type);
}

async function getAttachmentMetadata(getAccessToken: GetDropboxAccessToken, fileId: string): Promise<AttachmentFile> {
  const metadata = await rpc<DropboxFileMetadata>(getAccessToken, 'files/get_metadata', { path: fileId });

  if (metadata['.tag'] !== 'file' || !metadata.id || !metadata.name) {
    throw new DropboxError('添付ファイルが見つかりません。', 404);
  }

  return toAttachmentFile(metadata);
}

async function deleteAttachment(getAccessToken: GetDropboxAccessToken, fileId: string): Promise<void> {
  try {
    await rpc(getAccessToken, 'files/delete_v2', { path: fileId });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

async function downloadFile(getAccessToken: GetDropboxAccessToken, path: string): Promise<Blob> {
  assertOnline();

  const accessToken = await getAccessToken();
  const response = await fetch(`${DROPBOX_CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': toApiArg({ path }),
    },
  });

  await assertDropboxResponse(response);

  return response.blob();
}

async function contentUpload(
  getAccessToken: GetDropboxAccessToken,
  args: object,
  body: Blob,
): Promise<DropboxFileMetadata> {
  assertOnline();

  const accessToken = await getAccessToken();
  const response = await fetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': toApiArg(args),
      'Content-Type': 'application/octet-stream',
    },
    body,
  });

  await assertDropboxResponse(response);

  return (await response.json()) as DropboxFileMetadata;
}

async function rpc<T>(getAccessToken: GetDropboxAccessToken, endpoint: string, args: object): Promise<T> {
  assertOnline();

  const accessToken = await getAccessToken();
  const response = await fetch(`${DROPBOX_API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  await assertDropboxResponse(response);

  return (await response.json()) as T;
}

async function assertDropboxResponse(response: Response) {
  if (response.ok) {
    return;
  }

  let summary = '';
  let message = `Dropbox API request failed: ${response.status}`;

  try {
    const data = (await response.json()) as DropboxErrorResponse;
    summary = data.error_summary ?? '';
    message = data.user_message || summary || message;
  } catch {
    // 非JSONエラー本文は既定メッセージのまま扱う。
  }

  throw new DropboxError(message, response.status, summary);
}

function isNotFoundError(error: unknown) {
  return error instanceof DropboxError && error.summary.includes('not_found');
}

function parseRunbookIdFromPath(path: string): string | null {
  const segments = path.split('/');

  // 期待する形式: /attachments/<runbookId>/<fileName>
  if (segments.length !== 4 || `/${segments[1]}` !== ATTACHMENTS_ROOT_PATH || !segments[2]) {
    return null;
  }

  return segments[2];
}

function toAttachmentFile(metadata: DropboxFileMetadata, fallbackMimeType?: string): AttachmentFile {
  const name = metadata.name ?? '';

  return {
    id: metadata.id ?? '',
    name,
    mimeType: fallbackMimeType || guessMimeType(name),
    size: typeof metadata.size === 'number' ? metadata.size : null,
    createdTime: metadata.client_modified ?? metadata.server_modified ?? null,
  };
}

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

// Dropboxのメタデータには mimeType がないため、プレビュー判定用に拡張子から推定する。
function guessMimeType(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined;

  return (extension && MIME_TYPES_BY_EXTENSION[extension]) || 'application/octet-stream';
}

function sanitizePathSegment(value: string) {
  const sanitized = value.replace(/[\\/\u0000-\u001f]/g, '_').trim();

  return sanitized || 'file';
}

// Dropbox-API-Arg ヘッダーはASCII以外を受け付けないため、非ASCII文字を\uXXXXにエスケープする。
function toApiArg(value: object) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
