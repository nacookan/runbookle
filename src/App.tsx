import { useEffect, useRef, useState } from 'react';
import { Button } from './components/ui/Button';
import { useGoogleAuth } from './features/auth/useGoogleAuth';
import { loadLocalRunbookleData } from './features/runbooks/localRunbookCache';
import { RunbooksApp } from './features/runbooks/RunbooksApp';
import styles from './App.module.css';

function App() {
  const {
    connect,
    hasDriveConnectionHint,
    hasExplicitDriveLogout,
    isConnected,
    isReconnectPending,
    loginError,
    logout,
    session,
    status,
  } = useGoogleAuth();
  const silentReconnectTriedRef = useRef(false);
  const [hasInitialLocalCache] = useState(() => Boolean(loadLocalRunbookleData()));
  const isLoginDisabled = status === 'loading' || status === 'missingConfig' || status === 'error';
  const shouldShowApp = isConnected || hasDriveConnectionHint || (!hasExplicitDriveLogout && hasInitialLocalCache);

  useEffect(() => {
    if (
      silentReconnectTriedRef.current ||
      status !== 'ready' ||
      isConnected ||
      !hasDriveConnectionHint ||
      hasExplicitDriveLogout
    ) {
      return;
    }

    silentReconnectTriedRef.current = true;
    connect('', { silent: true });
  }, [connect, hasDriveConnectionHint, hasExplicitDriveLogout, isConnected, status]);

  return (
    <div className={styles.page}>
      <main className={`${styles.main} ${shouldShowApp ? styles.mainApp : styles.mainAuth}`}>
        {shouldShowApp ? (
          <RunbooksApp
            accessToken={session?.accessToken ?? null}
            connectionError={loginError}
            isDriveConnected={isConnected}
            isDriveReconnecting={isReconnectPending}
            onDisconnect={logout}
            onReconnect={() => connect('')}
          />
        ) : (
          <section className={styles.panel} aria-labelledby="app-title">
            <div className={styles.brand}>
              <img className={styles.brandMark} src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
              <div className={styles.brandText}>
                <p className={styles.eyebrow}>大切な日を、迷わず進もう</p>
                <h1 id="app-title" className={styles.title}>
                  Runbookle
                </h1>
              </div>
            </div>

            <p className={styles.lead}>
              旅行、出張、イベント、そして日常に。
              <br />
              時刻付きの行動メモを作って、いつでも確認。
            </p>

            <div className={styles.authArea}>
              <p className={styles.authMessage}>Google Driveに接続してスタート</p>
              <Button type="button" className={styles.googleButton} onClick={() => connect()} disabled={isLoginDisabled}>
                Google Driveに接続
              </Button>
              <ul className={styles.privacyList}>
                <li>データは、あなた自身のGoogle Driveに保存されます。</li>
                <li>本サービスのサーバーには保存しません。</li>
              </ul>
              {status === 'missingConfig' ? (
                <p className={styles.notice}>VITE_GOOGLE_CLIENT_ID が未設定です。.env.local を設定してください。</p>
              ) : null}
              {status === 'loading' ? <p className={styles.notice}>Google連携を読み込んでいます。</p> : null}
              {loginError ? <p className={styles.notice}>{loginError}</p> : null}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
