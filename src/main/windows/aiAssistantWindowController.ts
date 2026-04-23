import { BrowserWindow } from 'electron';
import { createManagedWindow } from './windowFactory';

export interface AiAssistantWindowControllerOptions {
  preloadPath: string;
  rendererFilePath: string;
  rendererDevUrl?: string;
  isDev: boolean;
}

export interface AiAssistantWindowController {
  show: () => void;
  getWindow: () => BrowserWindow | null;
}

const AI_ASSISTANT_DEFAULT_WIDTH = 860;
const AI_ASSISTANT_DEFAULT_HEIGHT = 620;
const AI_ASSISTANT_MIN_WIDTH = 720;
const AI_ASSISTANT_MIN_HEIGHT = 460;

export function createAiAssistantWindowController(options: AiAssistantWindowControllerOptions): AiAssistantWindowController {
  let windowRef: BrowserWindow | null = null;

  function ensureWindow(): BrowserWindow {
    if (windowRef && !windowRef.isDestroyed()) {
      return windowRef;
    }

    const nextWindow = createManagedWindow({
      browserWindow: {
        width: AI_ASSISTANT_DEFAULT_WIDTH,
        height: AI_ASSISTANT_DEFAULT_HEIGHT,
        minWidth: AI_ASSISTANT_MIN_WIDTH,
        minHeight: AI_ASSISTANT_MIN_HEIGHT,
        title: 'PinStack AI Assistant',
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#F5F5F3',
        fullscreenable: false,
        ...(process.platform === 'darwin'
          ? {
              titleBarStyle: 'hiddenInset' as const,
              trafficLightPosition: { x: 14, y: 12 },
              vibrancy: 'sidebar' as const,
              visualEffectState: 'active' as const
            }
          : {}),
        webPreferences: {
          preload: options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false
        }
      },
      renderer: {
        isDev: options.isDev,
        rendererDevUrl: options.rendererDevUrl,
        rendererFilePath: options.rendererFilePath,
        view: 'ai-assistant'
      },
      onCreate: (createdWindow) => {
        createdWindow.on('closed', () => {
          windowRef = null;
        });
      }
    });

    windowRef = nextWindow;
    return nextWindow;
  }

  return {
    show() {
      const target = ensureWindow();
      if (target.isMinimized()) {
        target.restore();
      }
      target.show();
      target.focus();
    },
    getWindow() {
      return windowRef && !windowRef.isDestroyed() ? windowRef : null;
    }
  };
}
