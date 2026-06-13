import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { AttachmentFile, StorageClient } from '../../lib/storageClient';
import { formatAttachmentSize, getAttachmentErrorMessage, isImageAttachment, isPdfAttachment } from './attachmentUtils';
import type { RunbookAttachments } from './useRunbookAttachments';
import styles from './RunbooksApp.module.css';

export type AttachmentPageActions = {
  fileName: string;
  requestDelete: () => void;
};

type RunbookAttachmentPageProps = {
  attachments: RunbookAttachments;
  client: StorageClient | null;
  id: string;
  fileId: string;
  onNavigate: (to: string) => void;
  onActionsChange?: (actions: AttachmentPageActions | null) => void;
};

export function RunbookAttachmentPage({ attachments, client, id, fileId, onNavigate, onActionsChange }: RunbookAttachmentPageProps) {
  const [metadata, setMetadata] = useState<AttachmentFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setIsLoading(false);
      return;
    }

    let disposed = false;
    let objectUrl: string | null = null;

    setIsLoading(true);
    setErrorMessage(null);
    setMetadata(null);
    setPreviewUrl(null);
    setIsEnlarged(false);

    client
      .getAttachmentMetadata(fileId)
      .then(async (file) => {
        if (disposed) {
          return;
        }

        setMetadata(file);

        if (isImageAttachment(file.mimeType) || isPdfAttachment(file.mimeType)) {
          const blob = await client.downloadAttachment(fileId);

          if (disposed) {
            return;
          }

          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
        }
      })
      .catch((error) => {
        if (disposed) {
          return;
        }

        setErrorMessage(getAttachmentErrorMessage(error));
      })
      .finally(() => {
        if (disposed) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      disposed = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [client, fileId]);

  useEffect(() => {
    if (!onActionsChange) {
      return;
    }

    if (!client || !metadata) {
      onActionsChange(null);
      return;
    }

    onActionsChange({
      fileName: metadata.name,
      requestDelete: () => {
        if (!window.confirm('この添付ファイルを削除しますか？')) {
          return;
        }

        client
          .deleteAttachment(fileId)
          .then(() => {
            attachments.removeAttachment(id, fileId);
            onNavigate(`/runbooks/${encodeURIComponent(id)}/attachments`);
          })
          .catch((error) => setErrorMessage(getAttachmentErrorMessage(error)));
      },
    });

    return () => {
      onActionsChange(null);
    };
  }, [attachments.removeAttachment, client, metadata, fileId, id, onActionsChange, onNavigate]);

  const handleDownload = async () => {
    if (!client || !metadata) {
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      const blob = await client.downloadAttachment(fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = metadata.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(getAttachmentErrorMessage(error));
    } finally {
      setIsDownloading(false);
    }
  };

  if (!client) {
    return (
      <section className={styles.content} aria-label="添付ファイル">
        <p className={styles.empty}>ストレージに接続すると添付ファイルを利用できます。</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className={styles.content} aria-label="添付ファイル">
        <p className={styles.empty}>読み込み中...</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className={styles.content} aria-label="添付ファイル">
        <p className={styles.error}>{errorMessage}</p>
      </section>
    );
  }

  if (!metadata) {
    return null;
  }

  if (isImageAttachment(metadata.mimeType) && previewUrl) {
    return (
      <section className={styles.content} aria-label="添付ファイル">
        <div className={`${styles.attachmentImageContainer} ${isEnlarged ? styles.attachmentImageContainerEnlarged : ''}`}>
          <img
            className={`${styles.attachmentImage} ${isEnlarged ? styles.attachmentImageEnlarged : ''}`}
            src={previewUrl}
            alt={metadata.name}
            onClick={() => setIsEnlarged((current) => !current)}
          />
        </div>
      </section>
    );
  }

  if (isPdfAttachment(metadata.mimeType) && previewUrl) {
    return (
      <section className={styles.content} aria-label="添付ファイル">
        <iframe className={styles.attachmentPdfFrame} src={previewUrl} title={metadata.name} />
      </section>
    );
  }

  return (
    <section className={styles.content} aria-label="添付ファイル">
      <div className={styles.attachmentDownload}>
        <p className={styles.dialogText}>{metadata.name}</p>
        <p className={styles.attachmentMeta}>{formatAttachmentSize(metadata.size)}</p>
        <Button type="button" onClick={() => void handleDownload()} disabled={isDownloading}>
          <Download aria-hidden="true" size={16} />
          {isDownloading ? 'ダウンロード中...' : 'ダウンロード'}
        </Button>
      </div>
    </section>
  );
}
