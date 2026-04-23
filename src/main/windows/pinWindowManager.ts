import { promises as fs } from 'node:fs';
import { BrowserWindow, nativeImage, screen } from 'electron';
import type { PinCardState, RecordItem } from '../../shared/types';
import { AppError } from '../errors';
import { logTelemetry } from '../telemetry';

interface PinWindowManagerOptions {
  preloadPath: string;
  rendererFilePath: string;
  rendererDevUrl?: string;
}

export class PinWindowManager {
  private readonly options: PinWindowManagerOptions;
  private static readonly PIN_WIDTH = 800;
  private static readonly MIN_IMAGE_WIDTH = 280;
  private static readonly MIN_HEIGHT = 120;
  private static readonly DEFAULT_TEXT_HEIGHT = 240;
  private static readonly DEFAULT_IMAGE_HEIGHT = 320;
  private static readonly MAX_HEIGHT_RATIO = 0.8;
  private static readonly TEXT_LINE_HEIGHT = 24; // matches `leading-6`
  private static readonly TEXT_FIXED_CHROME_HEIGHT = 126; // header + paddings + controls area
  private static readonly TEXT_HORIZONTAL_INSET = 72; // shell paddings + drag handle + content padding
  private static readonly TEXT_AVG_CHAR_WIDTH = 7.2; // approx width for text-sm Chinese/Latin mix
  private static readonly IMAGE_FIXED_CHROME_HEIGHT = 82; // window padding + shell padding + header row
  private static readonly IMAGE_HORIZONTAL_INSET = 36; // window padding + shell horizontal padding

  // Required mapping: pin id -> BrowserWindow
  private readonly windowMap: Map<string, BrowserWindow> = new Map();
  private readonly states: Map<string, PinCardState> = new Map();

  public constructor(options: PinWindowManagerOptions) {
    this.options = options;
  }

  public async createPinWindow(record: RecordItem): Promise<void> {
    const existing = this.windowMap.get(record.id);
    if (existing) {
      logTelemetry('pin.window.reuse', {
        recordId: record.id
      });
      existing.show();
      existing.focus();
      return;
    }

    const startedAt = Date.now();
    const base = await this.resolveWindowSize(record);
    const display = screen.getPrimaryDisplay().workArea;
    const offset = this.windowMap.size * 20;
    const x = Math.max(display.x + 20, display.x + 88 + offset);
    const y = Math.max(display.y + 20, display.y + 78 + offset);

    let pinWindow: BrowserWindow;
    try {
      pinWindow = new BrowserWindow({
        width: base.width,
        height: base.height,
        x,
        y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        movable: true,
        resizable: true,
        hasShadow: true,
        skipTaskbar: true,
        backgroundColor: '#00000000',
        ...(process.platform === 'darwin'
          ? {
              vibrancy: 'under-window',
              visualEffectState: 'active'
            }
          : {}),
        webPreferences: {
          preload: this.options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false
        }
      });
    } catch (error) {
      logTelemetry(
        'pin.window.create.failed',
        {
          recordId: record.id,
          error: error instanceof Error ? error.message : String(error)
        },
        'error'
      );
      throw new AppError('WINDOW_CREATE_FAILED', 'Failed to create pin window', String(error));
    }

    if (record.type === 'image') {
      const contentWidth = Math.max(1, base.width - PinWindowManager.IMAGE_HORIZONTAL_INSET);
      const contentHeight = Math.max(1, base.height - PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT);
      const aspectRatio = contentWidth / Math.max(contentHeight, 1);
      const minWidth = Math.min(base.width, PinWindowManager.MIN_IMAGE_WIDTH);
      const minHeight = Math.max(
        PinWindowManager.MIN_HEIGHT,
        Math.round(
          Math.max(1, minWidth - PinWindowManager.IMAGE_HORIZONTAL_INSET) / Math.max(aspectRatio, 0.01) +
            PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT
        )
      );

      pinWindow.setAspectRatio(aspectRatio, {
        width: PinWindowManager.IMAGE_HORIZONTAL_INSET,
        height: PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT
      });
      pinWindow.setMinimumSize(minWidth, minHeight);
    }

    try {
      if (this.options.rendererDevUrl) {
        const query = new URLSearchParams({
          view: 'pin',
          recordId: record.id,
          cardId: record.id
        });
        await pinWindow.loadURL(`${this.options.rendererDevUrl}?${query.toString()}`);
      } else {
        await pinWindow.loadFile(this.options.rendererFilePath, {
          query: {
            view: 'pin',
            recordId: record.id,
            cardId: record.id
          }
        });
      }
    } catch (error) {
      logTelemetry(
        'pin.window.load.failed',
        {
          recordId: record.id,
          error: error instanceof Error ? error.message : String(error)
        },
        'error'
      );
      pinWindow.destroy();
      throw new AppError('WINDOW_CREATE_FAILED', 'Failed to create pin window', String(error));
    }

    this.windowMap.set(record.id, pinWindow);
    this.states.set(record.id, {
      id: record.id,
      recordId: record.id,
      x,
      y,
      width: base.width,
      height: base.height,
      alwaysOnTop: true,
      visible: true
    });

    pinWindow.on('moved', () => this.updateBounds(record.id));
    pinWindow.on('resized', () => this.updateBounds(record.id));
    pinWindow.on('hide', () => this.updateVisibility(record.id, false));
    pinWindow.on('show', () => this.updateVisibility(record.id, true));
    pinWindow.on('closed', () => {
      this.windowMap.delete(record.id);
      this.states.delete(record.id);
      logTelemetry('pin.window.closed', {
        recordId: record.id,
        openCount: this.windowMap.size
      });
    });

    const durationMs = Date.now() - startedAt;
    logTelemetry('pin.window.created', {
      recordId: record.id,
      type: record.type,
      openCount: this.windowMap.size,
      durationMs
    });
    if (durationMs > 900) {
      logTelemetry(
        'pin.window.create.slow',
        {
          recordId: record.id,
          durationMs,
          thresholdMs: 900
        },
        'warn'
      );
    }
    if (this.windowMap.size > 30) {
      logTelemetry(
        'pin.window.count.high',
        {
          openCount: this.windowMap.size
        },
        'warn'
      );
    }
  }

  public closePinWindow(id: string): void {
    const pinWindow = this.windowMap.get(id);
    if (!pinWindow) {
      logTelemetry(
        'pin.window.close.missing',
        {
          recordId: id
        },
        'warn'
      );
      return;
    }
    logTelemetry('pin.window.close.request', {
      recordId: id,
      openCount: this.windowMap.size
    });
    pinWindow?.close();
  }

  // Compatibility for existing callers.
  public closePin(id: string): void {
    this.closePinWindow(id);
  }

  public toggleAlwaysOnTop(id: string): boolean {
    const pinWindow = this.windowMap.get(id);
    const state = this.states.get(id);

    if (!pinWindow || !state) {
      throw new AppError('RECORD_NOT_FOUND', `Pin window not found: ${id}`);
    }

    const next = !state.alwaysOnTop;
    pinWindow.setAlwaysOnTop(next, 'screen-saver');

    this.states.set(id, {
      ...state,
      alwaysOnTop: next
    });

    return next;
  }

  public hideAll(): void {
    for (const pinWindow of this.windowMap.values()) {
      pinWindow.hide();
    }
  }

  public showAll(): void {
    for (const pinWindow of this.windowMap.values()) {
      pinWindow.showInactive();
      pinWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }

  public getStates(): PinCardState[] {
    return [...this.states.values()];
  }

  public getWindowMap(): ReadonlyMap<string, BrowserWindow> {
    return this.windowMap;
  }

  private updateBounds(id: string): void {
    const pinWindow = this.windowMap.get(id);
    const state = this.states.get(id);
    if (!pinWindow || !state) {
      return;
    }

    const bounds = pinWindow.getBounds();
    this.states.set(id, {
      ...state,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
  }

  private updateVisibility(id: string, visible: boolean): void {
    const state = this.states.get(id);
    if (!state) {
      return;
    }

    this.states.set(id, {
      ...state,
      visible
    });
  }

  private async resolveWindowSize(record: RecordItem): Promise<{ width: number; height: number }> {
    const width = PinWindowManager.PIN_WIDTH;
    const maxHeight = this.getMaxAllowedHeight();

    if (record.type === 'video') {
      throw new AppError('INVALID_ARGUMENT', 'Video record does not support pin window');
    }

    if (record.type === 'text') {
      const text = await this.readTextContent(record);
      const estimated = this.estimateTextHeight(text, width);
      return {
        width,
        height: this.clampHeight(estimated, maxHeight)
      };
    }

    const targetWidth = PinWindowManager.PIN_WIDTH;
    const targetContentWidth = Math.max(1, targetWidth - PinWindowManager.IMAGE_HORIZONTAL_INSET);
    const maxContentHeight = Math.max(
      1,
      maxHeight - PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT
    );
    const fallbackHeight = this.clampHeight(
      PinWindowManager.DEFAULT_IMAGE_HEIGHT + PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT,
      maxHeight
    );

    const image = nativeImage.createFromPath(record.path);
    if (image.isEmpty()) {
      return { width: targetWidth, height: fallbackHeight };
    }

    const { width: imgWidth, height: imgHeight } = image.getSize();
    if (imgWidth <= 0 || imgHeight <= 0) {
      return { width: targetWidth, height: fallbackHeight };
    }

    const targetContentHeight = Math.round((imgHeight * targetContentWidth) / imgWidth);

    if (targetContentHeight <= maxContentHeight) {
      return {
        width: targetWidth,
        height: this.clampHeight(
          targetContentHeight + PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT,
          maxHeight
        )
      };
    }

    const fittedContentHeight = maxContentHeight;
    const fittedContentWidth = Math.max(1, Math.round((imgWidth * fittedContentHeight) / imgHeight));

    return {
      width: fittedContentWidth + PinWindowManager.IMAGE_HORIZONTAL_INSET,
      height: this.clampHeight(
        fittedContentHeight + PinWindowManager.IMAGE_FIXED_CHROME_HEIGHT,
        maxHeight
      )
    };
  }

  private async readTextContent(record: RecordItem): Promise<string> {
    try {
      const text = await fs.readFile(record.path, 'utf8');
      if (text.trim().length > 0) {
        return text;
      }
    } catch {
      // Fall through to preview text.
    }

    return record.previewText ?? '';
  }

  private estimateTextHeight(text: string, width: number): number {
    const normalized = text.replace(/\r\n/g, '\n');
    const contentWidth = Math.max(220, width - PinWindowManager.TEXT_HORIZONTAL_INSET);
    const maxCharsPerLine = Math.max(
      12,
      Math.floor(contentWidth / PinWindowManager.TEXT_AVG_CHAR_WIDTH)
    );

    const visualLines = normalized.split('\n').reduce((total, line) => {
      const len = line.length;
      if (len === 0) {
        return total + 1;
      }
      return total + Math.max(1, Math.ceil(len / maxCharsPerLine));
    }, 0);

    const boundedLines = Math.max(1, Math.min(visualLines, 300));
    const dynamicHeight =
      PinWindowManager.TEXT_FIXED_CHROME_HEIGHT + boundedLines * PinWindowManager.TEXT_LINE_HEIGHT;

    return Number.isFinite(dynamicHeight) ? dynamicHeight : PinWindowManager.DEFAULT_TEXT_HEIGHT;
  }

  private getMaxAllowedHeight(): number {
    const workAreaHeight = screen.getPrimaryDisplay().workArea.height;
    return Math.max(
      PinWindowManager.MIN_HEIGHT,
      Math.floor(workAreaHeight * PinWindowManager.MAX_HEIGHT_RATIO)
    );
  }

  private clampHeight(value: number, max: number): number {
    return Math.max(PinWindowManager.MIN_HEIGHT, Math.min(value, max));
  }
}
