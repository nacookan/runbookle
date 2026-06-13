import { useRef, useState, type ChangeEvent } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { StorageClient } from '../../lib/storageClient';
import { formatAttachmentSize, getAttachmentErrorMessage, isImageAttachment, isPdfAttachment } from './attachmentUtils';
import type { RunbookAttachments } from './useRunbookAttachments';
import styles from './RunbooksApp.module.css';

type RunbookAttachmentsPageProps = {
  attachments: RunbookAttachments;
  client: StorageClient | null;
  id: string;
  onNavigate: (to: string) => void;
};

export function RunbookAttachmentsPage({ attachments, client, id, onNavigate }: RunbookAttachmentsPageProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const files = attachments.getAttachments(id);
  const isLoading = !attachments.isLoaded;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputFiles = event.target.files;

    if (!inputFiles || inputFiles.length === 0 || !client) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      for (const file of Array.from(inputFiles)) {
        const uploaded = await client.uploadAttachment(id, file);
        attachments.addAttachment(id, uploaded);
      }
    } catch (error) {
      setErrorMessage(getAttachmentErrorMessage(error));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <section className={styles.content} aria-label="添付ファイル">
      {!client ? (
        <p className={styles.empty}>ストレージに接続すると添付ファイルを利用できます。</p>
      ) : (
        <>
          <div className={styles.attachmentUpload}>
            <input
              ref={fileInputRef}
              className={styles.visuallyHidden}
              type="file"
              multiple
              onChange={(event) => void handleFileChange(event)}
            />
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              <Upload aria-hidden="true" size={16} />
              {isUploading ? 'アップロード中...' : 'ファイルを追加'}
            </Button>
          </div>

          {errorMessage || attachments.errorMessage ? <p className={styles.error}>{errorMessage ?? attachments.errorMessage}</p> : null}

          {isLoading ? (
            <p className={styles.empty}>読み込み中...</p>
          ) : files.length === 0 ? (
            <p className={styles.empty}>添付ファイルはありません。</p>
          ) : (
            <div className={styles.list}>
              {files.map((file) => (
                <article key={file.id} className={styles.runbookItem}>
                  <button
                    className={styles.runbookRowMain}
                    type="button"
                    onClick={() => onNavigate(`/runbooks/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file.id)}`)}
                  >
                    <span className={styles.attachmentRowMain}>
                      <AttachmentTypeIcon mimeType={file.mimeType} />
                      <span className={styles.attachmentName}>{file.name}</span>
                    </span>
                    <span className={styles.attachmentSize}>{formatAttachmentSize(file.size)}</span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AttachmentTypeIcon({ mimeType }: { mimeType: string }) {
  if (isImageAttachment(mimeType)) {
    return <ImageIcon className={styles.attachmentTypeIcon} aria-hidden="true" size={18} />;
  }

  if (isPdfAttachment(mimeType)) {
    return <FileText className={styles.attachmentTypeIcon} aria-hidden="true" size={18} />;
  }

  return <Paperclip className={styles.attachmentTypeIcon} aria-hidden="true" size={18} />;
}
