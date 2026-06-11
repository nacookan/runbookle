const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_CHECK_GRACE_PERIOD_MS = 10 * 1000;
const UPDATE_AVAILABLE_EVENT = 'runbookle:sw-update-available';

let isUpdateAvailable = false;
let activeRegistration: ServiceWorkerRegistration | null = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((registration) => {
        activeRegistration = registration;
        watchForUpdates(registration);
      })
      .catch((error) => {
        console.warn('Service worker registration failed.', error);
      });
  });
}

export function onServiceWorkerUpdateAvailable(listener: () => void) {
  if (isUpdateAvailable) {
    listener();
  }

  window.addEventListener(UPDATE_AVAILABLE_EVENT, listener);

  return () => {
    window.removeEventListener(UPDATE_AVAILABLE_EVENT, listener);
  };
}

export function checkForServiceWorkerUpdate() {
  void activeRegistration?.update();
}

function watchForUpdates(registration: ServiceWorkerRegistration) {
  let isInitialCheckGracePeriod = true;
  window.setTimeout(() => {
    isInitialCheckGracePeriod = false;
  }, INITIAL_CHECK_GRACE_PERIOD_MS);

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker || !registration.active) {
      return;
    }

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'activated' && !isInitialCheckGracePeriod) {
        isUpdateAvailable = true;
        window.dispatchEvent(new Event(UPDATE_AVAILABLE_EVENT));
      }
    });
  });

  checkForServiceWorkerUpdate();
  window.setInterval(checkForServiceWorkerUpdate, UPDATE_CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForServiceWorkerUpdate();
    }
  });
}
