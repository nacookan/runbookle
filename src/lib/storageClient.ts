export type StorageProviderId = 'googleDrive' | 'dropbox';

export type AttachmentFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  createdTime: string | null;
};

export type RunbookAttachmentFile = AttachmentFile & { runbookId: string };

export type StorageDataJson = {
  json: unknown;
  fileRef: string;
};

export type StorageClient = {
  providerId: StorageProviderId;
  providerLabel: string;
  loadDataJson: () => Promise<StorageDataJson | null>;
  createDataJson: (json: string) => Promise<string>;
  saveDataJson: (json: string, knownFileRef: string | null) => Promise<string>;
  listAllAttachments: () => Promise<RunbookAttachmentFile[]>;
  uploadAttachment: (runbookId: string, file: File) => Promise<AttachmentFile>;
  getAttachmentMetadata: (fileId: string) => Promise<AttachmentFile>;
  downloadAttachment: (fileId: string) => Promise<Blob>;
  deleteAttachment: (fileId: string) => Promise<void>;
};

export class StorageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
  }
}

export function assertOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new StorageError('オフラインのため保存できません。ローカルキャッシュには残っています。', 0);
  }
}
