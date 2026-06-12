import { GoogleDriveError } from '../../lib/googleDrive';

export function formatAttachmentSize(size: number | null) {
  if (size === null) {
    return '';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mimeType: string) {
  return mimeType.startsWith('image/');
}

export function isPdfAttachment(mimeType: string) {
  return mimeType === 'application/pdf';
}

export function getAttachmentErrorMessage(error: unknown) {
  if (error instanceof GoogleDriveError) {
    if (error.status === 401) {
      return 'Google Driveの認可が期限切れです。ログアウトして接続し直してください。';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '添付ファイルの操作に失敗しました。';
}
