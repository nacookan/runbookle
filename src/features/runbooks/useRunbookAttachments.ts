import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAllAttachments, type AttachmentFile, type RunbookAttachmentFile } from '../../lib/googleDrive';
import { getAttachmentErrorMessage } from './attachmentUtils';

export type RunbookAttachments = {
  attachmentRunbookIds: Set<string>;
  isLoaded: boolean;
  errorMessage: string | null;
  getAttachments: (runbookId: string) => AttachmentFile[];
  addAttachment: (runbookId: string, file: AttachmentFile) => void;
  removeAttachment: (runbookId: string, fileId: string) => void;
  replaceAllAttachments: (files: RunbookAttachmentFile[]) => void;
};

const EMPTY_ATTACHMENTS: AttachmentFile[] = [];

export function useRunbookAttachments(accessToken: string | null): RunbookAttachments {
  const [attachmentsByRunbookId, setAttachmentsByRunbookId] = useState<Map<string, AttachmentFile[]>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setAttachmentsByRunbookId(new Map());
      setIsLoaded(false);
      setErrorMessage(null);
      return;
    }

    let disposed = false;
    setIsLoaded(false);
    setErrorMessage(null);

    listAllAttachments(accessToken)
      .then((files) => {
        if (disposed) {
          return;
        }

        setAttachmentsByRunbookId(groupAttachments(files));
      })
      .catch((error) => {
        if (!disposed) {
          setErrorMessage(getAttachmentErrorMessage(error));
        }
      })
      .finally(() => {
        if (!disposed) {
          setIsLoaded(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, [accessToken]);

  const getAttachments = useCallback(
    (runbookId: string) => attachmentsByRunbookId.get(runbookId) ?? EMPTY_ATTACHMENTS,
    [attachmentsByRunbookId],
  );

  const addAttachment = useCallback((runbookId: string, file: AttachmentFile) => {
    setAttachmentsByRunbookId((current) => {
      const next = new Map(current);
      next.set(runbookId, [...(next.get(runbookId) ?? []), file]);
      return next;
    });
  }, []);

  const removeAttachment = useCallback((runbookId: string, fileId: string) => {
    setAttachmentsByRunbookId((current) => {
      const list = current.get(runbookId);

      if (!list) {
        return current;
      }

      const next = new Map(current);
      next.set(runbookId, list.filter((file) => file.id !== fileId));
      return next;
    });
  }, []);

  const replaceAllAttachments = useCallback((files: RunbookAttachmentFile[]) => {
    setAttachmentsByRunbookId(groupAttachments(files));
    setIsLoaded(true);
    setErrorMessage(null);
  }, []);

  const attachmentRunbookIds = useMemo(() => {
    const ids = new Set<string>();

    for (const [runbookId, files] of attachmentsByRunbookId) {
      if (files.length > 0) {
        ids.add(runbookId);
      }
    }

    return ids;
  }, [attachmentsByRunbookId]);

  return {
    attachmentRunbookIds,
    isLoaded,
    errorMessage,
    getAttachments,
    addAttachment,
    removeAttachment,
    replaceAllAttachments,
  };
}

function groupAttachments(files: RunbookAttachmentFile[]) {
  const grouped = new Map<string, AttachmentFile[]>();

  for (const file of files) {
    const list = grouped.get(file.runbookId);

    if (list) {
      list.push(file);
    } else {
      grouped.set(file.runbookId, [file]);
    }
  }

  return grouped;
}
