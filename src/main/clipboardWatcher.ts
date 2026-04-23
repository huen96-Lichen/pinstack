import { createHash } from 'node:crypto';
import { clipboard } from 'electron';
import type { NativeImage } from 'electron';
import { AppError } from './errors';
import { logTelemetry } from './telemetry';

export const DEFAULT_CLIPBOARD_POLL_INTERVAL_MS = 600;

export type ClipboardContent =
  | { type: 'text'; text: string; textHash: string }
  | { type: 'image'; image: NativeImage; imageBufferHash: string };

export interface ClipboardDetectionDebug {
  sourceApp?: string | null;
  inferredCategory?: 'image' | 'text' | 'flow';
}

export type OnNewContent = (
  payload: ClipboardContent
) => Promise<void | ClipboardDetectionDebug> | void | ClipboardDetectionDebug;

export class ClipboardWatcher {
  private readonly pollIntervalMs: number;
  private readonly onNewContent: OnNewContent;

  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private lastTextHash: string | null = null;
  private lastImageHash: string | null = null;
  private ignoreNextCopyCount = 0;
  private skippedTickCount = 0;

  public constructor(
    pollIntervalMs: number = DEFAULT_CLIPBOARD_POLL_INTERVAL_MS,
    onNewContent: OnNewContent
  ) {
    const safeInterval =
      Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
        ? Math.floor(pollIntervalMs)
        : DEFAULT_CLIPBOARD_POLL_INTERVAL_MS;

    this.pollIntervalMs = safeInterval;
    this.onNewContent = onNewContent;
  }

  public isRunning(): boolean {
    return this.timer !== null;
  }

  public start(): void {
    if (this.timer) {
      return;
    }

    try {
      this.lastTextHash = this.hashText(clipboard.readText());
      this.lastImageHash = this.hashImageBuffer(clipboard.readImage().toPNG());
    } catch (error) {
      console.error('[ClipboardWatcher.start] Failed to read initial clipboard snapshot', error);
      this.lastTextHash = null;
      this.lastImageHash = null;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  public ignoreNextCopy(count: number = 1): void {
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
    this.ignoreNextCopyCount += safeCount;
  }

  private async tick(): Promise<void> {
    if (this.isTicking) {
      this.skippedTickCount += 1;
      if (this.skippedTickCount % 10 === 0) {
        logTelemetry(
          'stability.anomaly',
          {
            name: 'clipboard.tick.skipped',
            skippedTickCount: this.skippedTickCount
          },
          'warn'
        );
      }
      return;
    }

    const startedAt = Date.now();
    this.isTicking = true;

    try {
      const text = clipboard.readText();
      const textHash = this.hashText(text);
      if (textHash && textHash !== this.lastTextHash) {
        this.lastTextHash = textHash;
        if (this.consumeIgnoreOnce()) {
          return;
        }
        const debug = await this.onNewContent({ type: 'text', text, textHash });
        this.logDetection('text', debug);
      }

      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const png = image.toPNG();
        const imageHash = this.hashImageBuffer(png);
        if (imageHash && imageHash !== this.lastImageHash) {
          this.lastImageHash = imageHash;
          if (this.consumeIgnoreOnce()) {
            return;
          }
          const debug = await this.onNewContent({ type: 'image', image, imageBufferHash: imageHash });
          this.logDetection('image', debug);
        }
      }
    } catch (error) {
      console.error(new AppError('INTERNAL_ERROR', 'Clipboard tick failed', String(error)));
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs > this.pollIntervalMs * 1.2) {
        logTelemetry(
          'stability.anomaly',
          {
            name: 'clipboard.tick.slow',
            durationMs,
            pollIntervalMs: this.pollIntervalMs
          },
          'warn'
        );
      }
      this.isTicking = false;
    }
  }

  private hashText(text: string): string | null {
    const value = text.trim();
    if (!value) {
      return null;
    }

    return createHash('md5').update(value).digest('hex');
  }

  private hashImageBuffer(buffer: Buffer): string | null {
    if (!buffer.length) {
      return null;
    }

    return createHash('md5').update(buffer).digest('hex');
  }

  private consumeIgnoreOnce(): boolean {
    if (this.ignoreNextCopyCount <= 0) {
      return false;
    }

    this.ignoreNextCopyCount -= 1;
    return true;
  }

  private logDetection(
    contentType: ClipboardContent['type'],
    debug: void | ClipboardDetectionDebug
  ): void {
    console.log({
      sourceApp: debug?.sourceApp ?? null,
      inferredCategory: debug?.inferredCategory ?? null,
      contentType
    });
  }
}
