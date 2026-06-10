import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  Circle,
  CloudOff,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAppRouter } from '../../lib/router';
import { isPastRunbook } from '../../lib/date';
import { RunbookEditorPage } from './RunbookEditorPage';
import { RunbookListPage } from './RunbookListPage';
import { NewRunbookPage } from './NewRunbookPage';
import { checkRunbookText, type CheckIssue } from './checkRunbookText';
import type { TextEditorActions } from './TextEditor';
import { useRunbooks, type SaveStatus } from './useRunbooks';
import styles from './RunbooksApp.module.css';

type RunbooksAppProps = {
  accessToken: string | null;
  connectionError: string | null;
  isDriveConnected: boolean;
  isDriveReconnecting: boolean;
  onDisconnect: () => void;
  onReconnect: () => void;
};

export function RunbooksApp({
  accessToken,
  connectionError,
  isDriveConnected,
  isDriveReconnecting,
  onDisconnect,
  onReconnect,
}: RunbooksAppProps) {
  const runbooks = useRunbooks(accessToken);
  const { navigate, route } = useAppRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCheckDialogOpen, setIsCheckDialogOpen] = useState(false);
  const [editorActions, setEditorActions] = useState<TextEditorActions | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const topbarTitle = route.name === 'new' ? '新規作成' : route.name === 'edit' ? '編集' : 'Runbookle';
  const editingRunbook = route.name === 'edit' ? runbooks.data.runbooks.find((runbook) => runbook.id === route.id) : null;
  const canToggleArchive = editingRunbook ? !isPastRunbook(editingRunbook) : false;
  const checkIssues = useMemo(() => (editingRunbook ? checkRunbookText(editingRunbook.text) : []), [editingRunbook?.text]);
  const checkSummary = useMemo(() => createCheckSummary(checkIssues), [checkIssues]);
  const isSyncing = isDriveReconnecting || runbooks.saveStatus === 'loading';

  const handleSync = () => {
    if (!isDriveConnected) {
      onReconnect();
      return;
    }

    void runbooks.reloadFromDrive();
  };

  const selectCheckIssue = (issue: CheckIssue) => {
    setIsCheckDialogOpen(false);

    if (!issue.lineNumber) {
      return;
    }

    const textLineNumber = issue.lineNumber;

    window.requestAnimationFrame(() => {
      editorActions?.focusLine(textLineNumber + 1);
    });
  };

  useEffect(() => {
    if (route.name !== 'edit') {
      setEditorActions(null);
      setIsSaveDialogOpen(false);
      setIsCheckDialogOpen(false);
    }
  }, [route.name]);

  useEffect(() => {
    if (!isSaveDialogOpen && !isCheckDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSaveDialogOpen(false);
        setIsCheckDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCheckDialogOpen, isSaveDialogOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isMenuOpen]);

  return (
    <section className={styles.app} aria-label="Runbookle">
      <header className={styles.topbar}>
        <div className={styles.topbarSide}>
          {route.name === 'list' ? (
            <button className={styles.topbarAction} type="button" aria-label="新規予定を作成" onClick={() => navigate('/new')}>
              <Plus aria-hidden="true" size={20} />
            </button>
          ) : (
            <button className={styles.topbarAction} type="button" aria-label="一覧へ戻る" onClick={() => navigate('/')}>
              <ChevronLeft aria-hidden="true" size={24} strokeWidth={2.4} />
            </button>
          )}
        </div>
        <h1 className={styles.title}>
          {route.name === 'edit' ? (
            <button
              className={styles.titleButton}
              type="button"
              aria-label={`保存状態: ${getSaveStatusLabel(runbooks.saveStatus, isDriveReconnecting)}。保存日時を表示`}
              onClick={() => setIsSaveDialogOpen(true)}
            >
              <span>{topbarTitle}</span>
              <SaveStatusIcon status={runbooks.saveStatus} isDriveReconnecting={isDriveReconnecting} />
            </button>
          ) : (
            <TitleText
              isDriveConnected={isDriveConnected}
              isDriveReconnecting={isDriveReconnecting}
              title={topbarTitle}
              onReconnect={onReconnect}
            />
          )}
        </h1>
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            className={styles.menuButton}
            type="button"
            aria-label="メニュー"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <Menu aria-hidden="true" size={24} strokeWidth={2.4} />
          </button>
          {isMenuOpen ? (
            <div className={styles.menuPanel} role="menu">
              {editingRunbook && canToggleArchive ? (
                <button
                  className={styles.menuItem}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    runbooks.setRunbookArchived(editingRunbook.id, !editingRunbook.archived);
                    setIsMenuOpen(false);
                  }}
                >
                  {editingRunbook.archived ? <ArchiveRestore aria-hidden="true" size={18} /> : <Archive aria-hidden="true" size={18} />}
                  {editingRunbook.archived ? 'アーカイブ解除' : 'アーカイブ'}
                </button>
              ) : null}
              {editingRunbook ? (
                <button
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);

                    if (!window.confirm('このRunbookを削除しますか？')) {
                      return;
                    }

                    runbooks.deleteRunbook(editingRunbook.id);
                    navigate('/');
                  }}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  削除
                </button>
              ) : null}
              <button className={styles.menuItem} type="button" role="menuitem" onClick={onDisconnect}>
                <LogOut aria-hidden="true" size={18} />
                ログアウト
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {route.name === 'edit' && isSaveDialogOpen ? (
        <div className={styles.dialogBackdrop} role="presentation" onClick={() => setIsSaveDialogOpen(false)}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="save-dialog-title" className={styles.dialogTitle}>
              保存状態
            </h2>
            <p className={styles.dialogText}>{getSaveStatusLabel(runbooks.saveStatus, isDriveReconnecting)}</p>
            <p className={styles.dialogText}>最終保存: {formatSavedTime(runbooks.lastSavedAt)}</p>
            {!isDriveConnected ? (
              <button className={styles.dialogButton} type="button" onClick={onReconnect}>
                Google Driveに接続
              </button>
            ) : null}
            {runbooks.errorMessage ? <p className={styles.error}>{runbooks.errorMessage}</p> : null}
            <button className={styles.dialogButton} type="button" onClick={() => setIsSaveDialogOpen(false)}>
              閉じる
            </button>
          </section>
        </div>
      ) : null}

      {route.name === 'edit' && isCheckDialogOpen ? (
        <div className={styles.dialogBackdrop} role="presentation" onClick={() => setIsCheckDialogOpen(false)}>
          <section
            className={`${styles.dialog} ${styles.checkDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="check-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="check-dialog-title" className={styles.dialogTitle}>
              チェック結果
            </h2>
            <p className={styles.dialogText}>{formatCheckSummary(checkSummary)}</p>
            {checkIssues.length === 0 ? <p className={styles.dialogText}>問題は見つかりませんでした。</p> : null}
            {checkIssues.length > 0 ? (
              <div className={styles.checkResultList}>
                {checkIssues.map((issue, index) => (
                  <button
                    key={`${issue.type}-${issue.lineNumber ?? 'none'}-${index}`}
                    className={`${styles.checkResultRow} ${getIssueClass(issue)}`}
                    type="button"
                    onClick={() => selectCheckIssue(issue)}
                  >
                    <span className={styles.checkResultMeta}>
                      <span className={styles.checkResultType}>{getIssueTypeLabel(issue)}</span>
                      <span>{issue.lineNumber ? `${issue.lineNumber}行目` : '全体'}</span>
                    </span>
                    <span className={styles.checkResultMessage}>{issue.message}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button className={styles.dialogButton} type="button" onClick={() => setIsCheckDialogOpen(false)}>
              閉じる
            </button>
          </section>
        </div>
      ) : null}

      {runbooks.errorMessage || connectionError ? <p className={styles.errorBanner}>{runbooks.errorMessage ?? connectionError}</p> : null}

      {route.name === 'list' ? (
        <RunbookListPage
          isSyncing={isSyncing}
          runbooks={runbooks.data.runbooks}
          onNavigate={navigate}
          onSync={handleSync}
        />
      ) : null}
      {route.name === 'new' ? (
        <NewRunbookPage onCreate={runbooks.createRunbookFromDraft} onNavigate={navigate} />
      ) : null}
      {route.name === 'edit' ? (
        <RunbookEditorPage
          id={route.id}
          runbooks={runbooks.data.runbooks}
          updateRunbook={runbooks.updateRunbook}
          onNavigate={navigate}
          onEditorActionsChange={setEditorActions}
          onShowValidation={() => setIsCheckDialogOpen(true)}
          validationSummary={checkSummary}
        />
      ) : null}
    </section>
  );
}

function TitleText({
  isDriveConnected,
  isDriveReconnecting,
  onReconnect,
  title,
}: {
  isDriveConnected: boolean;
  isDriveReconnecting: boolean;
  onReconnect: () => void;
  title: string;
}) {
  if (isDriveConnected) {
    return title;
  }

  return (
    <button
      className={styles.titleButton}
      type="button"
      aria-label={isDriveReconnecting ? 'Google Drive接続を確認中' : 'Google Driveに再接続'}
      onClick={onReconnect}
    >
      <span>{title}</span>
      {isDriveReconnecting ? (
        <LoaderCircle className={`${styles.titleStatusIcon} ${styles.titleStatusIconSpinning}`} aria-hidden="true" size={16} />
      ) : (
        <CloudOff className={styles.titleStatusIconDisconnected} aria-hidden="true" size={16} />
      )}
    </button>
  );
}

function SaveStatusIcon({ isDriveReconnecting, status }: { isDriveReconnecting: boolean; status: SaveStatus }) {
  if (isDriveReconnecting) {
    return <LoaderCircle className={`${styles.titleStatusIcon} ${styles.titleStatusIconSpinning}`} aria-hidden="true" size={16} />;
  }

  if (status === 'local') {
    return <CloudOff className={styles.titleStatusIconDisconnected} aria-hidden="true" size={16} />;
  }

  if (status === 'saved') {
    return <CheckCircle2 className={styles.titleStatusIcon} aria-hidden="true" size={16} />;
  }

  if (status === 'saving' || status === 'loading') {
    return <LoaderCircle className={`${styles.titleStatusIcon} ${styles.titleStatusIconSpinning}`} aria-hidden="true" size={16} />;
  }

  if (status === 'error') {
    return <AlertCircle className={`${styles.titleStatusIcon} ${styles.titleStatusIconError}`} aria-hidden="true" size={16} />;
  }

  return <Circle className={styles.titleStatusIcon} aria-hidden="true" size={16} />;
}

type CheckSummary = {
  errorCount: number;
  warningCount: number;
  infoCount: number;
};

function createCheckSummary(issues: CheckIssue[]): CheckSummary {
  return {
    errorCount: issues.filter((issue) => issue.type === 'error').length,
    warningCount: issues.filter((issue) => issue.type === 'warning').length,
    infoCount: issues.filter((issue) => issue.type === 'info').length,
  };
}

function formatCheckSummary(summary: CheckSummary) {
  return `エラー ${summary.errorCount} / 警告 ${summary.warningCount} / 情報 ${summary.infoCount}`;
}

function getIssueClass(issue: CheckIssue) {
  if (issue.type === 'error') {
    return styles.checkResultRowError;
  }

  if (issue.type === 'warning') {
    return styles.checkResultRowWarning;
  }

  return styles.checkResultRowInfo;
}

function getIssueTypeLabel(issue: CheckIssue) {
  if (issue.type === 'error') {
    return 'エラー';
  }

  if (issue.type === 'warning') {
    return '警告';
  }

  return '情報';
}

function getSaveStatusLabel(status: SaveStatus, isDriveReconnecting = false) {
  if (isDriveReconnecting) {
    return 'Google Drive接続を確認中';
  }

  const labels: Record<SaveStatus, string> = {
    loading: '読み込み中',
    saving: '保存中',
    saved: '保存済み',
    dirty: '未保存',
    error: '保存失敗',
    local: 'Drive未接続 / ローカル保存',
  };

  return labels[status];
}

function formatSavedTime(value: string | null) {
  if (!value) {
    return '未保存';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
