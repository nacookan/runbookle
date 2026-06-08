const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

type TokenCallback = (response: GoogleTokenResponse) => void;

export type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: '' | 'consent' | 'select_account' }) => void;
};

type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: TokenCallback;
        prompt?: '' | 'consent' | 'select_account';
      }) => GoogleTokenClient;
      revoke: (token: string, done: () => void) => void;
    };
  };
};

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.google?.accounts?.oauth2) {
          resolve(window.google);
        } else {
          reject(new Error('Google Identity Services の初期化に失敗しました。'));
        }
      });
      existingScript.addEventListener('error', () => reject(new Error('Google Identity Services を読み込めません。')));
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
      } else {
        reject(new Error('Google Identity Services の初期化に失敗しました。'));
      }
    };
    script.onerror = () => reject(new Error('Google Identity Services を読み込めません。'));
    document.head.appendChild(script);
  });
}
