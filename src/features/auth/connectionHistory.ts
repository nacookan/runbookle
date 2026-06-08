const DRIVE_CONNECTED_KEY = 'runbookle.googleDrive.connected.v1';
const DRIVE_LOGGED_OUT_KEY = 'runbookle.googleDrive.loggedOut.v1';

export function loadHadDriveConnection() {
  try {
    return localStorage.getItem(DRIVE_CONNECTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function loadHasExplicitDriveLogout() {
  try {
    return localStorage.getItem(DRIVE_LOGGED_OUT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markDriveConnected() {
  try {
    localStorage.setItem(DRIVE_CONNECTED_KEY, 'true');
    localStorage.removeItem(DRIVE_LOGGED_OUT_KEY);
  } catch {
    // 接続履歴は利便性用なので、保存できなくてもアプリ動作は止めない。
  }
}

export function markDriveLoggedOut() {
  try {
    localStorage.removeItem(DRIVE_CONNECTED_KEY);
    localStorage.setItem(DRIVE_LOGGED_OUT_KEY, 'true');
  } catch {
    // ローカルストレージ不可の環境では現在のセッションだけ切断する。
  }
}
