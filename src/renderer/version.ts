import { useEffect, useState } from 'react';

const FALLBACK_APP_VERSION = __APP_VERSION__;
let cachedAppVersion = FALLBACK_APP_VERSION;
let appVersionPromise: Promise<string> | null = null;

export const APP_VERSION = FALLBACK_APP_VERSION;

export function getAppVersion(): Promise<string> {
  if (typeof window === 'undefined' || !window.pinStack?.app?.getVersion) {
    return Promise.resolve(cachedAppVersion);
  }

  if (!appVersionPromise) {
    appVersionPromise = window.pinStack.app
      .getVersion()
      .then((version) => {
        cachedAppVersion = version || FALLBACK_APP_VERSION;
        return cachedAppVersion;
      })
      .catch(() => cachedAppVersion);
  }

  return appVersionPromise;
}

export function useAppVersion(): string {
  const [version, setVersion] = useState(cachedAppVersion);

  useEffect(() => {
    let cancelled = false
    getAppVersion().then((nextVersion) => {
      if (!cancelled) {
        setVersion(nextVersion);
      }
    });
    return () => {
      cancelled = true
    };
  }, []);

  return version;
}
