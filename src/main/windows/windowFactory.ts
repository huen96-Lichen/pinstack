import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { logTelemetry } from '../telemetry';

export interface RendererLoadOptions {
  isDev: boolean;
  rendererDevUrl?: string;
  rendererFilePath: string;
  view?: string;
}

export interface ManagedWindowOptions {
  browserWindow: BrowserWindowConstructorOptions;
  renderer: RendererLoadOptions;
  centerOnCreate?: boolean;
  onCreate?: (windowRef: BrowserWindow) => void;
}

interface RendererFallbackCandidate {
  mode: 'dev' | 'file' | 'file-query';
  target: string;
  view?: string;
}

function buildRendererUrl(baseUrl: string, view?: string): string {
  if (!view) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  url.searchParams.set('view', view);
  return url.toString();
}

export function centerWindowOnActiveDisplay(windowRef: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const bounds = windowRef.getBounds();
  const x = Math.round(display.x + (display.width - bounds.width) / 2);
  const y = Math.round(display.y + (display.height - bounds.height) / 2);
  windowRef.setPosition(x, y);
}

export function loadRendererContent(windowRef: BrowserWindow, options: RendererLoadOptions): void {
  const fallbackCandidates: RendererFallbackCandidate[] = [];

  if (options.isDev && options.rendererDevUrl) {
    fallbackCandidates.push({
      mode: 'dev',
      target: buildRendererUrl(options.rendererDevUrl, options.view),
      view: options.view
    });
  }

  if (options.view) {
    fallbackCandidates.push({
      mode: 'file-query',
      target: options.rendererFilePath,
      view: options.view
    });
  } else {
    fallbackCandidates.push({
      mode: 'file',
      target: options.rendererFilePath
    });
  }

  const appPath = app.getAppPath();
  const rendererFromAppPath = path.join(appPath, 'dist', 'renderer', 'index.html');
  const rendererFromResourcesApp = path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'index.html');
  for (const candidate of [rendererFromAppPath, rendererFromResourcesApp]) {
    if (existsSync(candidate) && candidate !== options.rendererFilePath) {
      fallbackCandidates.push({
        mode: options.view ? 'file-query' : 'file',
        target: candidate,
        view: options.view
      });
    }
  }

  const tryLoadAt = (index: number): void => {
    const candidate = fallbackCandidates[index];
    if (!candidate) {
      console.error('[windowFactory] renderer load failed: exhausted all candidates', {
        rendererFilePath: options.rendererFilePath,
        rendererDevUrl: options.rendererDevUrl ?? null,
        isDev: options.isDev,
        view: options.view ?? null
      });
      return;
    }

    const loadMeta = {
      mode: candidate.mode,
      target: candidate.target,
      view: candidate.view ?? null
    };
    logTelemetry('window.renderer.load', loadMeta);
    console.info('[windowFactory] renderer load attempt', loadMeta);

    const loadPromise =
      candidate.mode === 'dev'
        ? windowRef.loadURL(candidate.target)
        : candidate.mode === 'file-query' && candidate.view
          ? windowRef.loadFile(candidate.target, {
              query: {
                view: candidate.view
              }
            })
          : windowRef.loadFile(candidate.target);

    void loadPromise.catch((error) => {
      console.error('[windowFactory] renderer load failed, trying fallback', {
        index,
        mode: candidate.mode,
        target: candidate.target,
        view: candidate.view ?? null,
        error
      });
      tryLoadAt(index + 1);
    });
  };

  tryLoadAt(0);
}

export function createManagedWindow(options: ManagedWindowOptions): BrowserWindow {
  const windowRef = new BrowserWindow(options.browserWindow);
  let triedSelfHealReload = false;

  logTelemetry('window.created', {
    title: options.browserWindow.title ?? null,
    width: options.browserWindow.width ?? null,
    height: options.browserWindow.height ?? null,
    frame: options.browserWindow.frame ?? null,
    transparent: options.browserWindow.transparent ?? null,
    alwaysOnTop: options.browserWindow.alwaysOnTop ?? null
  });

  if (options.centerOnCreate !== false) {
    centerWindowOnActiveDisplay(windowRef);
  }

  windowRef.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[windowFactory] did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
      title: options.browserWindow.title ?? null
    });
  });

  windowRef.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelMap: Record<number, string> = {
      0: 'info',
      1: 'warn',
      2: 'error',
      3: 'debug'
    };
    console.log('[windowFactory] renderer console', {
      level: levelMap[level] ?? String(level),
      message,
      line,
      sourceId,
      title: options.browserWindow.title ?? null
    });
  });

  windowRef.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[windowFactory] preload-error', {
      preloadPath,
      error,
      title: options.browserWindow.title ?? null
    });
  });

  windowRef.webContents.on('render-process-gone', (_event, details) => {
    console.error('[windowFactory] render-process-gone', {
      details,
      title: options.browserWindow.title ?? null
    });
  });

  windowRef.webContents.on('did-finish-load', () => {
    console.info('[windowFactory] did-finish-load', {
      title: options.browserWindow.title ?? null,
      url: windowRef.webContents.getURL()
    });
    setTimeout(() => {
      if (windowRef.isDestroyed()) {
        return;
      }
      void windowRef.webContents
        .executeJavaScript(
          `(() => {
            const root = document.getElementById('root');
            if (!root) return { childCount: -1, textLength: -1, bodyBg: 'n/a' };
            const text = (document.body?.innerText || '').trim();
            const bodyStyle = window.getComputedStyle(document.body);
            const rootStyle = window.getComputedStyle(root);
            const first = root.firstElementChild;
            const firstStyle = first ? window.getComputedStyle(first) : null;
            const windowPage = document.querySelector('.pinstack-window-page');
            const windowPanel = document.querySelector('.pinstack-window-panel');
            const windowPageStyle = windowPage ? window.getComputedStyle(windowPage) : null;
            const windowPanelStyle = windowPanel ? window.getComputedStyle(windowPanel) : null;
            const sampleNodes = Array.from(document.querySelectorAll('button, h1, h2, h3, p, span, input, textarea'));
            const visibleSampleNodes = sampleNodes.filter((node) => {
              const style = window.getComputedStyle(node);
              if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0) {
                return false;
              }
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            const rootRect = root.getBoundingClientRect();
            const firstRect = first ? first.getBoundingClientRect() : null;
            return {
              childCount: root.childElementCount,
              textLength: text.length,
              bodyBg: bodyStyle.backgroundColor,
              bodyOpacity: bodyStyle.opacity,
              rootOpacity: rootStyle.opacity,
              rootDisplay: rootStyle.display,
              rootRect: {
                width: rootRect.width,
                height: rootRect.height
              },
              firstTag: first?.tagName ?? null,
              firstOpacity: firstStyle?.opacity ?? null,
              firstDisplay: firstStyle?.display ?? null,
              firstBg: firstStyle?.backgroundColor ?? null,
              bodyColor: bodyStyle.color,
              hasWindowPage: Boolean(windowPage),
              windowPageBg: windowPageStyle?.backgroundColor ?? null,
              windowPageColor: windowPageStyle?.color ?? null,
              hasWindowPanel: Boolean(windowPanel),
              windowPanelBg: windowPanelStyle?.backgroundColor ?? null,
              windowPanelColor: windowPanelStyle?.color ?? null,
              sampleNodeCount: sampleNodes.length,
              visibleSampleNodeCount: visibleSampleNodes.length,
              firstVisibleSampleText: (visibleSampleNodes[0]?.textContent || '').trim().slice(0, 48),
              firstRect: firstRect
                ? {
                    width: firstRect.width,
                    height: firstRect.height
                  }
                : null
            };
          })()`,
          true
        )
        .then((inspected) => {
          console.info('[windowFactory] renderer root inspected', {
            title: options.browserWindow.title ?? null,
            inspected
          });

          if (!inspected || typeof inspected !== 'object') {
            return;
          }
          const childCount = (inspected as { childCount?: number }).childCount ?? -1;
          if (childCount <= 0 && !triedSelfHealReload) {
            triedSelfHealReload = true;
            console.warn('[windowFactory] renderer root empty after load, triggering one self-heal reload', {
              title: options.browserWindow.title ?? null
            });
            windowRef.webContents.reloadIgnoringCache();
          }
        })
        .catch((error) => {
          console.error('[windowFactory] failed to inspect renderer root state', {
            error,
            title: options.browserWindow.title ?? null
          });
        });
    }, 1200);
  });

  loadRendererContent(windowRef, options.renderer);
  options.onCreate?.(windowRef);
  return windowRef;
}
