import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleDriveError } from '../../lib/googleDrive';
import { loadLocalRunbookleData, saveLocalRunbookleData } from './localRunbookCache';
import { createEmptyRunbookleData, createRunbook, createRunbookleData } from './model';
import { loadOrCreateRunbookleData, saveRunbookleData } from './driveRunbookStorage';
import type { Runbook, RunbookDraft, RunbookleData } from './types';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'dirty' | 'error' | 'local';

type UseRunbooksResult = {
  createRunbookFromDraft: (draft: RunbookDraft) => string;
  data: RunbookleData;
  deleteRunbook: (id: string) => void;
  errorMessage: string | null;
  lastSavedAt: string | null;
  saveNow: () => Promise<void>;
  saveStatus: SaveStatus;
  setRunbookArchived: (id: string, archived: boolean) => void;
  updateRunbook: (id: string, updater: (runbook: Runbook) => Runbook) => void;
};

const AUTOSAVE_DELAY_MS = 1000;

export function useRunbooks(accessToken: string | null): UseRunbooksResult {
  const initialLocalData = useRef<RunbookleData | null>(loadLocalRunbookleData());
  const [data, setData] = useState<RunbookleData>(initialLocalData.current ?? createEmptyRunbookleData());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(accessToken ? 'loading' : 'local');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialLocalData.current?.updatedAt ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dataRef = useRef(data);
  const fileIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveRequestIdRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!accessToken) {
      fileIdRef.current = null;
      setErrorMessage(null);
      setSaveStatus('local');
      return;
    }

    let disposed = false;
    const fallbackData = dataRef.current ?? initialLocalData.current ?? createEmptyRunbookleData();

    setSaveStatus('loading');
    setErrorMessage(null);

    loadOrCreateRunbookleData(accessToken, fallbackData)
      .then(({ data: driveData, fileId }) => {
        if (disposed) {
          return;
        }

        fileIdRef.current = fileId;

        if (dirtyRef.current) {
          setLastSavedAt(driveData.updatedAt);
          setSaveStatus('dirty');
          return;
        }

        const localData = dataRef.current;
        if (localData && Date.parse(localData.updatedAt) > Date.parse(driveData.updatedAt)) {
          dataRef.current = localData;
          setData(localData);
          setLastSavedAt(driveData.updatedAt);
          setSaveStatus('dirty');
          return;
        }

        dataRef.current = driveData;
        dirtyRef.current = false;
        setData(driveData);
        setLastSavedAt(driveData.updatedAt);
        saveLocalRunbookleData(driveData);
        setSaveStatus('saved');
      })
      .catch((error) => {
        if (disposed) {
          return;
        }

        setErrorMessage(createSaveErrorMessage(error));
        setSaveStatus('error');
      });

    return () => {
      disposed = true;
    };
  }, [accessToken]);

  const mutateData = useCallback(
    (updater: (currentData: RunbookleData) => RunbookleData) => {
      setData((currentData) => {
        const nextData = updater(currentData);

        dataRef.current = nextData;
        dirtyRef.current = Boolean(accessToken);
        saveLocalRunbookleData(nextData);
        setLastSavedAt(nextData.updatedAt);
        setSaveStatus(accessToken ? 'dirty' : 'local');
        setErrorMessage(null);

        return nextData;
      });
    },
    [accessToken],
  );

  const createRunbookFromDraft = useCallback(
    (draft: RunbookDraft) => {
      const now = new Date().toISOString();
      const runbook = createRunbook(draft, now);

      mutateData((currentData) => createRunbookleData([...currentData.runbooks, runbook], now));

      return runbook.id;
    },
    [mutateData],
  );

  const updateRunbook = useCallback(
    (id: string, updater: (runbook: Runbook) => Runbook) => {
      const now = new Date().toISOString();

      mutateData((currentData) =>
        createRunbookleData(
          currentData.runbooks.map((runbook) =>
            runbook.id === id
              ? {
                  ...updater(runbook),
                  id: runbook.id,
                  createdAt: runbook.createdAt,
                  updatedAt: now,
                }
              : runbook,
          ),
          now,
        ),
      );
    },
    [mutateData],
  );

  const deleteRunbook = useCallback(
    (id: string) => {
      const now = new Date().toISOString();

      mutateData((currentData) =>
        createRunbookleData(
          currentData.runbooks.filter((runbook) => runbook.id !== id),
          now,
        ),
      );
    },
    [mutateData],
  );

  const setRunbookArchived = useCallback(
    (id: string, archived: boolean) => {
      updateRunbook(id, (runbook) => ({
        ...runbook,
        archived,
      }));
    },
    [updateRunbook],
  );

  const saveNow = useCallback(async () => {
    const dataToSave = dataRef.current;

    if (!accessToken) {
      saveLocalRunbookleData(dataToSave);
      dirtyRef.current = false;
      setLastSavedAt(dataToSave.updatedAt);
      setSaveStatus('local');
      return;
    }

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;

    saveLocalRunbookleData(dataToSave);
    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      const result = await saveRunbookleData(accessToken, dataToSave, fileIdRef.current);

      if (saveRequestIdRef.current !== requestId) {
        return;
      }

      fileIdRef.current = result.fileId;
      setLastSavedAt(result.data.updatedAt);
      saveLocalRunbookleData(result.data);

      if (dataRef.current === dataToSave) {
        dirtyRef.current = false;
        setSaveStatus('saved');
      } else {
        dirtyRef.current = true;
        setSaveStatus('dirty');
      }
    } catch (error) {
      if (saveRequestIdRef.current !== requestId) {
        return;
      }

      dirtyRef.current = true;
      setErrorMessage(createSaveErrorMessage(error));
      setSaveStatus('error');
    }
  }, [accessToken]);

  useEffect(() => {
    if (saveStatus !== 'dirty') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [data, saveNow, saveStatus]);

  return useMemo(
    () => ({
      createRunbookFromDraft,
      data,
      deleteRunbook,
      errorMessage,
      lastSavedAt,
      saveNow,
      saveStatus,
      setRunbookArchived,
      updateRunbook,
    }),
    [
      createRunbookFromDraft,
      data,
      deleteRunbook,
      errorMessage,
      lastSavedAt,
      saveNow,
      saveStatus,
      setRunbookArchived,
      updateRunbook,
    ],
  );
}

function createSaveErrorMessage(error: unknown) {
  if (error instanceof GoogleDriveError) {
    if (error.status === 401) {
      return 'Google Driveの認可が期限切れです。ログアウトして接続し直してください。';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '保存に失敗しました。';
}
