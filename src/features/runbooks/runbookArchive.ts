import {
  downloadAttachment,
  listAllAttachments,
  uploadRunbookAttachment,
  type RunbookAttachmentFile,
} from '../../lib/googleDrive';
import { createZip, readZip, readZipText, type ZipEntrySource } from '../../lib/zip';
import { parseRunbookleData } from './model';
import type { RunbookleData } from './types';

export type RunbookleArchive = {
  data: RunbookleData;
  attachments: RunbookleArchiveAttachment[];
};

export type RunbookleArchiveAttachment = {
  runbookId: string;
  name: string;
  mimeType: string;
  size: number | null;
  path: string;
  blob: Blob;
};

type AttachmentManifest = {
  schemaVersion: 1;
  exportedAt: string;
  attachments: AttachmentManifestItem[];
};

type AttachmentManifestItem = {
  runbookId: string;
  name: string;
  mimeType: string;
  size: number | null;
  createdTime: string | null;
  path: string;
};

const ATTACHMENTS_MANIFEST_FILE_NAME = 'attachments.json';
const RUNBOOKLE_DATA_FILE_NAME = 'runbookle-data.json';

export async function createRunbookleArchive(accessToken: string, data: RunbookleData): Promise<Blob> {
  const runbookIds = new Set(data.runbooks.map((runbook) => runbook.id));
  const attachments = (await listAllAttachments(accessToken))
    .filter((attachment) => runbookIds.has(attachment.runbookId))
    .sort((a, b) => a.runbookId.localeCompare(b.runbookId) || a.name.localeCompare(b.name));
  const usedPaths = new Set<string>([RUNBOOKLE_DATA_FILE_NAME, ATTACHMENTS_MANIFEST_FILE_NAME]);
  const manifestItems: AttachmentManifestItem[] = [];
  const entries: ZipEntrySource[] = [
    {
      path: RUNBOOKLE_DATA_FILE_NAME,
      data: JSON.stringify(data, null, 2),
    },
  ];

  for (const attachment of attachments) {
    const blob = await downloadAttachment(accessToken, attachment.id);
    const path = createAttachmentPath(attachment, usedPaths);

    usedPaths.add(path);
    manifestItems.push({
      runbookId: attachment.runbookId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size ?? blob.size,
      createdTime: attachment.createdTime,
      path,
    });
    entries.push({
      path,
      data: blob,
    });
  }

  const manifest: AttachmentManifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    attachments: manifestItems,
  };

  entries.push({
    path: ATTACHMENTS_MANIFEST_FILE_NAME,
    data: JSON.stringify(manifest, null, 2),
  });

  return createZip(entries);
}

export async function readRunbookleArchive(file: File): Promise<RunbookleArchive> {
  const entries = await readZip(file);
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const dataEntry = entryByPath.get(RUNBOOKLE_DATA_FILE_NAME);
  const manifestEntry = entryByPath.get(ATTACHMENTS_MANIFEST_FILE_NAME);

  if (!dataEntry || !manifestEntry) {
    throw new Error('Runbookleのエクスポートファイルではありません。');
  }

  const data = parseRunbookleData(JSON.parse(readZipText(dataEntry)));
  const manifest = parseAttachmentManifest(JSON.parse(readZipText(manifestEntry)));

  if (!data || !manifest) {
    throw new Error('Runbookleのエクスポートファイル形式が正しくありません。');
  }

  const runbookIds = new Set(data.runbooks.map((runbook) => runbook.id));
  const attachments = manifest.attachments.map((attachment): RunbookleArchiveAttachment => {
    const entry = entryByPath.get(attachment.path);

    if (!runbookIds.has(attachment.runbookId)) {
      throw new Error('添付ファイルの紐付け先Runbookが見つかりません。');
    }

    if (!entry) {
      throw new Error(`添付ファイルがZIP内に見つかりません: ${attachment.name}`);
    }

    return {
      runbookId: attachment.runbookId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: attachment.path,
      blob: new Blob([toArrayBuffer(entry.data)], { type: attachment.mimeType }),
    };
  });

  return {
    data,
    attachments,
  };
}

export async function uploadArchiveAttachment(
  accessToken: string,
  attachment: RunbookleArchiveAttachment,
): Promise<RunbookAttachmentFile> {
  const file = new File([attachment.blob], attachment.name, { type: attachment.mimeType });
  const uploaded = await uploadRunbookAttachment(accessToken, attachment.runbookId, file);

  return {
    ...uploaded,
    runbookId: attachment.runbookId,
  };
}

function parseAttachmentManifest(value: unknown): AttachmentManifest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeManifest = value as Partial<AttachmentManifest>;

  if (maybeManifest.schemaVersion !== 1 || !Array.isArray(maybeManifest.attachments)) {
    return null;
  }

  const attachments = maybeManifest.attachments.map(parseAttachmentManifestItem);

  if (attachments.some((attachment) => !attachment)) {
    return null;
  }

  return {
    schemaVersion: 1,
    exportedAt: typeof maybeManifest.exportedAt === 'string' ? maybeManifest.exportedAt : '',
    attachments: attachments.filter((attachment): attachment is AttachmentManifestItem => Boolean(attachment)),
  };
}

function parseAttachmentManifestItem(value: unknown): AttachmentManifestItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeAttachment = value as Partial<AttachmentManifestItem>;

  if (
    typeof maybeAttachment.runbookId !== 'string' ||
    typeof maybeAttachment.name !== 'string' ||
    typeof maybeAttachment.mimeType !== 'string' ||
    typeof maybeAttachment.path !== 'string' ||
    !maybeAttachment.path.startsWith('attachments/')
  ) {
    return null;
  }

  return {
    runbookId: maybeAttachment.runbookId,
    name: maybeAttachment.name,
    mimeType: maybeAttachment.mimeType,
    size: typeof maybeAttachment.size === 'number' && Number.isFinite(maybeAttachment.size) ? maybeAttachment.size : null,
    createdTime: typeof maybeAttachment.createdTime === 'string' ? maybeAttachment.createdTime : null,
    path: maybeAttachment.path,
  };
}

function createAttachmentPath(attachment: RunbookAttachmentFile, usedPaths: Set<string>) {
  const runbookId = sanitizePathSegment(attachment.runbookId);
  const attachmentId = sanitizePathSegment(attachment.id);
  const fileName = sanitizeFileName(attachment.name);
  let path = `attachments/${runbookId}/${attachmentId}/${fileName}`;
  let index = 2;

  while (usedPaths.has(path)) {
    path = `attachments/${runbookId}/${attachmentId}-${index}/${fileName}`;
    index += 1;
  }

  return path;
}

function sanitizeFileName(value: string) {
  const sanitized = value.replace(/[\\/\u0000-\u001f]/g, '_').trim();

  return sanitized || 'attachment';
}

function sanitizePathSegment(value: string) {
  const sanitized = value.replace(/[\\/\u0000-\u001f]/g, '_').trim();

  return sanitized || 'runbook';
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
