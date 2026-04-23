import { useEffect } from 'react';

/**
 * Adds dashboard-view-* classes to document elements on mount and removes
 * them on unmount.  Used by the Dashboard, CaptureHub, and CaptureOverlay
 * views so they share the same global CSS scoping convention.
 */
export function useDomClasses(): void {
  useEffect(() => {
    document.documentElement.classList.add('dashboard-view-html');
    document.body.classList.add('dashboard-view-body');
    const root = document.getElementById('root');
    root?.classList.add('dashboard-view-root');

    return () => {
      document.documentElement.classList.remove('dashboard-view-html');
      document.body.classList.remove('dashboard-view-body');
      root?.classList.remove('dashboard-view-root');
    };
  }, []);
}
