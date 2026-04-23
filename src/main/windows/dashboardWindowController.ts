import { BrowserWindow, screen } from 'electron';
import type { AppSettings, DashboardBounds, RuntimeSettings } from '../../shared/types';
import { centerWindowOnActiveDisplay, createManagedWindow } from './windowFactory';

const DASHBOARD_MIN_WIDTH = 600;
const DASHBOARD_MIN_HEIGHT = 200;
const DASHBOARD_MAX_WIDTH_RATIO = 0.95;
const DASHBOARD_MAX_HEIGHT_RATIO = 0.9;

export interface DashboardWindowControllerOptions {
  preloadPath: string;
  rendererFilePath: string;
  rendererDevUrl?: string;
  isDev: boolean;
  getSettings: () => AppSettings;
  getRuntimeSettings: () => RuntimeSettings;
  updateRuntimeSettings: (patch: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;
  isQuitting: () => boolean;
}

export interface DashboardWindowController {
  ensureWindow: () => BrowserWindow;
  show: () => void;
  toggle: () => void;
  hide: () => void;
  minimize: () => void;
  updateFromRuntime: (runtime: RuntimeSettings) => void;
  handleDisplayEnvironmentChanged: () => void;
  getWindow: () => BrowserWindow | null;
  getAlwaysOnTop: () => Promise<boolean>;
  toggleAlwaysOnTop: () => Promise<boolean>;
}

export function createDashboardWindowController(options: DashboardWindowControllerOptions): DashboardWindowController {
  let dashboardWindow: BrowserWindow | null = null;
  let persistTimer: NodeJS.Timeout | null = null;

  function getActiveDisplayWorkArea() {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  }

  function getDashboardMaxSize() {
    const workArea = getActiveDisplayWorkArea();
    return {
      maxWidth: Math.max(DASHBOARD_MIN_WIDTH, Math.floor(workArea.width * DASHBOARD_MAX_WIDTH_RATIO)),
      maxHeight: Math.max(DASHBOARD_MIN_HEIGHT, Math.floor(workArea.height * DASHBOARD_MAX_HEIGHT_RATIO))
    };
  }

  function clampDashboardBounds(bounds: DashboardBounds): DashboardBounds {
    const { maxWidth, maxHeight } = getDashboardMaxSize();
    return {
      width: Math.max(DASHBOARD_MIN_WIDTH, Math.min(Math.floor(bounds.width), maxWidth)),
      height: Math.max(DASHBOARD_MIN_HEIGHT, Math.min(Math.floor(bounds.height), maxHeight))
    };
  }

  function resolvePresetBounds(preset: RuntimeSettings['dashboardSizePreset']): DashboardBounds {
    const { maxWidth, maxHeight } = getDashboardMaxSize();
    const widthBaseMap: Record<RuntimeSettings['dashboardSizePreset'], number> = {
      small: 800,
      medium: 920,
      large: 1040
    };
    const heightBaseMap: Record<RuntimeSettings['dashboardSizePreset'], number> = {
      small: 220,
      medium: 260,
      large: 300
    };

    return {
      width: Math.max(DASHBOARD_MIN_WIDTH, Math.min(widthBaseMap[preset], maxWidth)),
      height: Math.max(DASHBOARD_MIN_HEIGHT, Math.min(heightBaseMap[preset], maxHeight))
    };
  }

  function resolveInitialDashboardBounds(runtime: RuntimeSettings): DashboardBounds {
    if (runtime.dashboardBounds) {
      return clampDashboardBounds(runtime.dashboardBounds);
    }

    return resolvePresetBounds(runtime.dashboardSizePreset);
  }

  function scheduleRuntimeDashboardBoundsPersist(nextBounds: DashboardBounds): void {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    persistTimer = setTimeout(() => {
      persistTimer = null;
      void options.updateRuntimeSettings({
        dashboardBounds: nextBounds
      });
    }, 180);
  }

  function applyWindowSizeLimits(windowRef: BrowserWindow): void {
    const { maxWidth, maxHeight } = getDashboardMaxSize();
    windowRef.setMinimumSize(DASHBOARD_MIN_WIDTH, DASHBOARD_MIN_HEIGHT);
    windowRef.setMaximumSize(maxWidth, maxHeight);
  }

  function clampWindowPositionToVisibleWorkArea(windowRef: BrowserWindow): void {
    const display = screen.getDisplayMatching(windowRef.getBounds()).workArea;
    const bounds = windowRef.getBounds();
    const maxX = Math.max(display.x, display.x + display.width - bounds.width);
    const maxY = Math.max(display.y, display.y + display.height - bounds.height);
    const nextX = Math.round(Math.max(display.x, Math.min(bounds.x, maxX)));
    const nextY = Math.round(Math.max(display.y, Math.min(bounds.y, maxY)));

    if (nextX !== bounds.x || nextY !== bounds.y) {
      windowRef.setPosition(nextX, nextY);
    }
  }

  function setWindowBounds(windowRef: BrowserWindow, bounds: DashboardBounds): void {
    const safeBounds = clampDashboardBounds(bounds);
    windowRef.setSize(safeBounds.width, safeBounds.height);
  }

  function updateWindowFromRuntime(windowRef: BrowserWindow, runtime: RuntimeSettings): void {
    applyWindowSizeLimits(windowRef);
    if (runtime.dashboardBounds) {
      setWindowBounds(windowRef, runtime.dashboardBounds);
    } else {
      setWindowBounds(windowRef, resolvePresetBounds(runtime.dashboardSizePreset));
    }
  }

  function ensureWindow(): BrowserWindow {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      return dashboardWindow;
    }

    const initialBounds = resolveInitialDashboardBounds(options.getRuntimeSettings());
    const { maxWidth, maxHeight } = getDashboardMaxSize();
    const runtime = options.getRuntimeSettings();

    const windowRef = createManagedWindow({
      browserWindow: {
        width: initialBounds.width,
        height: initialBounds.height,
        minWidth: DASHBOARD_MIN_WIDTH,
        minHeight: DASHBOARD_MIN_HEIGHT,
        maxWidth,
        maxHeight,
        resizable: true,
        show: false,
        title: 'PinStack Dashboard',
        autoHideMenuBar: true,
        frame: false,
        movable: true,
        alwaysOnTop: runtime.dashboardAlwaysOnTop,
        backgroundColor: '#f5f5f3',
        transparent: false,
        fullscreenable: false,
        maximizable: false,
        webPreferences: {
          preload: options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false
        }
      },
      renderer: {
        isDev: options.isDev,
        rendererDevUrl: options.rendererDevUrl,
        rendererFilePath: options.rendererFilePath
      },
      onCreate: (createdWindow) => {
        createdWindow.on('close', (event) => {
          if (!options.isQuitting()) {
            event.preventDefault();
            createdWindow.hide();
          }
        });

        createdWindow.on('resize', () => {
          const [width, height] = createdWindow.getSize();
          const safeBounds = clampDashboardBounds({ width, height });
          scheduleRuntimeDashboardBoundsPersist(safeBounds);
        });
      }
    });

    dashboardWindow = windowRef;
    return windowRef;
  }

  function show(): void {
    const windowRef = ensureWindow();
    const runtime = options.getRuntimeSettings();
    windowRef.setAlwaysOnTop(runtime.dashboardAlwaysOnTop);
    applyWindowSizeLimits(windowRef);
    centerWindowOnActiveDisplay(windowRef);
    windowRef.show();
    windowRef.focus();
    windowRef.webContents.send('dashboard.shown');
  }

  function toggle(): void {
    const windowRef = ensureWindow();
    if (windowRef.isVisible()) {
      windowRef.hide();
      return;
    }

    show();
  }

  function hide(): void {
    if (!dashboardWindow || dashboardWindow.isDestroyed()) {
      return;
    }
    dashboardWindow.hide();
  }

  function minimize(): void {
    const windowRef = ensureWindow();
    windowRef.minimize();
  }

  async function toggleAlwaysOnTop(): Promise<boolean> {
    const next = !options.getRuntimeSettings().dashboardAlwaysOnTop;
    await options.updateRuntimeSettings({ dashboardAlwaysOnTop: next });
    return next;
  }

  async function getAlwaysOnTop(): Promise<boolean> {
    return ensureWindow().isAlwaysOnTop();
  }

  return {
    ensureWindow,
    show,
    toggle,
    hide,
    minimize,
    updateFromRuntime(runtime) {
      if (!dashboardWindow || dashboardWindow.isDestroyed()) {
        return;
      }
      updateWindowFromRuntime(dashboardWindow, runtime);
    },
    handleDisplayEnvironmentChanged() {
      if (!dashboardWindow || dashboardWindow.isDestroyed()) {
        return;
      }
      updateWindowFromRuntime(dashboardWindow, options.getRuntimeSettings());
      clampWindowPositionToVisibleWorkArea(dashboardWindow);
    },
    getWindow() {
      return dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null;
    },
    getAlwaysOnTop,
    toggleAlwaysOnTop
  };
}
