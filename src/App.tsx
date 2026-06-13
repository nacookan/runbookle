import { useState } from 'react';
import { Button } from './components/ui/Button';
import { useStorageAuth } from './features/auth/useStorageAuth';
import { loadLocalRunbookleData } from './features/runbooks/localRunbookCache';
import { RunbooksApp } from './features/runbooks/RunbooksApp';
import styles from './App.module.css';

function App() {
  const {
    client,
    connectDropbox,
    connectGoogle,
    googleStatus,
    hasConnectionHint,
    hasExplicitLogout,
    isConnected,
    isDropboxAvailable,
    isReconnecting,
    loginError,
    logout,
    providerLabel,
    reconnect,
  } = useStorageAuth();
  const [hasInitialLocalCache] = useState(() => Boolean(loadLocalRunbookleData()));
  const isGoogleLoginDisabled = googleStatus === 'loading' || googleStatus === 'missingConfig' || googleStatus === 'error';
  const shouldShowApp = isConnected || hasConnectionHint || (!hasExplicitLogout && hasInitialLocalCache);

  return (
    <div className={styles.page}>
      <main className={`${styles.main} ${shouldShowApp ? styles.mainApp : styles.mainAuth}`}>
        {shouldShowApp ? (
          <RunbooksApp
            client={client}
            connectionError={loginError}
            isStorageConnected={isConnected}
            isStorageReconnecting={isReconnecting}
            providerLabel={providerLabel}
            onDisconnect={logout}
            onReconnect={reconnect}
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
              <p className={styles.authMessage}>ストレージに接続してスタート</p>
              <Button type="button" className={styles.connectButton} onClick={connectGoogle} disabled={isGoogleLoginDisabled}>
                Google Driveに接続
              </Button>
              <Button type="button" className={styles.connectButton} onClick={connectDropbox} disabled={!isDropboxAvailable}>
                Dropboxに接続
              </Button>
              <ul className={styles.privacyList}>
                <li>データは、あなた自身のGoogle DriveまたはDropboxに保存されます。</li>
                <li>本サービスのサーバーには保存しません。</li>
              </ul>
              {googleStatus === 'missingConfig' ? (
                <p className={styles.notice}>VITE_GOOGLE_CLIENT_ID が未設定です。.env.local を設定してください。</p>
              ) : null}
              {googleStatus === 'loading' ? <p className={styles.notice}>Google連携を読み込んでいます。</p> : null}
              {loginError ? <p className={styles.notice}>{loginError}</p> : null}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
