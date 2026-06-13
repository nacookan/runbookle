import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StorageError, type StorageClient } from '../../lib/storageClient';
import { loadLocalDataProvider, loadLocalRunbookleData, saveLocalDataProvider, saveLocalRunbookleData } from './localRunbookCache';
import { createEmptyRunbookleData, createRunbook, createRunbookleData } from './model';
import { loadOrCreateRunbookleData, saveRunbookleData } from './runbookStorage';
import type { Runbook, RunbookDraft, RunbookleData } from './types';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'dirty' | 'error' | 'local';

type UseRunbooksResult = {
  createRunbookFromDraft: (draft: RunbookDraft) => string;
  data: RunbookleData;
  deleteRunbook: (id: string) => void;
  errorMessage: string | null;
  lastSavedAt: string | null;
  reloadFromStorage: () => Promise<void>;
  replaceData: (nextData: RunbookleData) => Promise<void>;
  saveNow: () => Promise<void>;
  saveStatus: SaveStatus;
  setRunbookArchived: (id: string, archived: boolean) => void;
  updateRunbook: (id: string, updater: (runbook: Runbook) => Runbook) => void;
};

const AUTOSAVE_DELAY_MS = 1000;

export function useRunbooks(client: StorageClient | null): UseRunbooksResult {
  const initialLocalData = useRef<RunbookleData | null>(loadLocalRunbookleData());
  const [data, setData] = useState<RunbookleData>(initialLocalData.current ?? createEmptyRunbookleData());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(client ? 'loading' : 'local');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialLocalData.current?.updatedAt ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dataRef = useRef(data);
  const fileRefRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!client) {
      fileRefRef.current = null;
      setErrorMessage(null);
      setSaveStatus('local');
      return;
    }

    let disposed = false;

    // ローカルキャッシュは同じプロバイダのものだけ引き継ぐ。
    // プロバイダを切り替えた場合は、前のプロバイダのデータを持ち込まず空から始める。
    const isSameProviderCache = loadLocalDataProvider() === client.providerId;
    const fallbackData = isSameProviderCache
      ? (dataRef.current ?? initialLocalData.current ?? createEmptyRunbookleData())
      : createEmptyRunbookleData();

    if (!isSameProviderCache) {
      dataRef.current = fallbackData;
      dirtyRef.current = false;
      setData(fallbackData);
    }

    setSaveStatus('loading');
    setErrorMessage(null);

    loadOrCreateRunbookleData(client, fallbackData)
      .then(({ data: remoteData, fileRef }) => {
        if (disposed) {
          return;
        }

        fileRefRef.current = fileRef;

        if (isSameProviderCache) {
          if (dirtyRef.current) {
            setLastSavedAt(remoteData.updatedAt);
            setSaveStatus('dirty');
            return;
          }

          const localData = dataRef.current;
          if (localData && Date.parse(localData.updatedAt) > Date.parse(remoteData.updatedAt)) {
            dataRef.current = localData;
            setData(localData);
            setLastSavedAt(remoteData.updatedAt);
            setSaveStatus('dirty');
            return;
          }
        }

        dataRef.current = remoteData;
        dirtyRef.current = false;
        setData(remoteData);
        setLastSavedAt(remoteData.updatedAt);
        saveLocalRunbookleData(remoteData);
        saveLocalDataProvider(client.providerId);
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
  }, [client]);

  const mutateData = useCallback(
    (updater: (currentData: RunbookleData) => RunbookleData) => {
      setData((currentData) => {
        const nextData = updater(currentData);

        dataRef.current = nextData;
        dirtyRef.current = Boolean(client);
        saveLocalRunbookleData(nextData);
        setLastSavedAt(nextData.updatedAt);
        setSaveStatus(client ? 'dirty' : 'local');
        setErrorMessage(null);

        return nextData;
      });
    },
    [client],
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

  const saveData = useCallback(async (dataToSave: RunbookleData) => {
    if (!client) {
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
      const result = await saveRunbookleData(client, dataToSave, fileRefRef.current);

      if (saveRequestIdRef.current !== requestId) {
        return;
      }

      fileRefRef.current = result.fileRef;
      setLastSavedAt(result.data.updatedAt);
      saveLocalRunbookleData(result.data);
      saveLocalDataProvider(client.providerId);

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
  }, [client]);

  const saveNow = useCallback(async () => {
    await saveData(dataRef.current);
  }, [saveData]);

  const replaceData = useCallback(
    async (nextData: RunbookleData) => {
      if (!client) {
        dataRef.current = nextData;
        dirtyRef.current = false;
        saveLocalRunbookleData(nextData);
        setData(nextData);
        setLastSavedAt(nextData.updatedAt);
        setSaveStatus('local');
        setErrorMessage(null);
        return;
      }

      const requestId = saveRequestIdRef.current + 1;
      saveRequestIdRef.current = requestId;

      setSaveStatus('saving');
      setErrorMessage(null);

      try {
        const result = await saveRunbookleData(client, nextData, fileRefRef.current);

        if (saveRequestIdRef.current !== requestId) {
          return;
        }

        fileRefRef.current = result.fileRef;
        dataRef.current = result.data;
        dirtyRef.current = false;
        saveLocalRunbookleData(result.data);
        saveLocalDataProvider(client.providerId);
        setData(result.data);
        setLastSavedAt(result.data.updatedAt);
        setSaveStatus('saved');
      } catch (error) {
        if (saveRequestIdRef.current === requestId) {
          setErrorMessage(createSaveErrorMessage(error));
          setSaveStatus('error');
        }

        throw error;
      }
    },
    [client],
  );

  const reloadFromStorage = useCallback(async () => {
    if (!client) {
      setErrorMessage('ストレージに接続すると同期できます。');
      setSaveStatus('local');
      return;
    }

    if (dirtyRef.current) {
      setErrorMessage('未保存の変更があるため同期できません。保存完了後にもう一度同期してください。');
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    setSaveStatus('loading');
    setErrorMessage(null);

    try {
      const result = await loadOrCreateRunbookleData(client, dataRef.current);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      fileRefRef.current = result.fileRef;
      dataRef.current = result.data;
      dirtyRef.current = false;
      setData(result.data);
      setLastSavedAt(result.data.updatedAt);
      saveLocalRunbookleData(result.data);
      saveLocalDataProvider(client.providerId);
      setSaveStatus('saved');
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setErrorMessage(createSaveErrorMessage(error));
      setSaveStatus('error');
    }
  }, [client]);

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
      reloadFromStorage,
      replaceData,
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
      reloadFromStorage,
      replaceData,
      saveNow,
      saveStatus,
      setRunbookArchived,
      updateRunbook,
    ],
  );
}

function createSaveErrorMessage(error: unknown) {
  if (error instanceof StorageError) {
    if (error.status === 401) {
      return 'ストレージの認可が期限切れです。接続し直してください。';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '保存に失敗しました。';
}
