// キー名は互換のため、Google Driveのみ対応だった時期の値を維持している。
// loggedOutフラグはプロバイダ共通の「明示的にログアウトした」記録として使う。
const DRIVE_CONNECTED_KEY = 'runbookle.googleDrive.connected.v1';
const STORAGE_LOGGED_OUT_KEY = 'runbookle.googleDrive.loggedOut.v1';

export function loadHadGoogleDriveConnection() {
  try {
    return localStorage.getItem(DRIVE_CONNECTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function loadHasExplicitStorageLogout() {
  try {
    return localStorage.getItem(STORAGE_LOGGED_OUT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGoogleDriveConnected() {
  try {
    localStorage.setItem(DRIVE_CONNECTED_KEY, 'true');
    localStorage.removeItem(STORAGE_LOGGED_OUT_KEY);
  } catch {
    // 接続履歴は利便性用なので、保存できなくてもアプリ動作は止めない。
  }
}

export function clearStorageLogoutFlag() {
  try {
    localStorage.removeItem(STORAGE_LOGGED_OUT_KEY);
  } catch {
    // 接続履歴は利便性用なので、保存できなくてもアプリ動作は止めない。
  }
}

export function markStorageLoggedOut() {
  try {
    localStorage.removeItem(DRIVE_CONNECTED_KEY);
    localStorage.setItem(STORAGE_LOGGED_OUT_KEY, 'true');
  } catch {
    // ローカルストレージ不可の環境では現在のセッションだけ切断する。
  }
}
