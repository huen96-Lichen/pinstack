import { logTelemetry } from './telemetry';

type ProbeMeta = Record<string, unknown> | undefined;

interface StabilityProbeOptions {
  enabled?: boolean;
  summaryIntervalMs?: number;
}

export class StabilityProbe {
  private readonly enabled: boolean;
  private readonly summaryIntervalMs: number;
  private readonly counters = new Map<string, number>();
  private anomalyCount = 0;
  private timer: NodeJS.Timeout | null = null;

  public constructor(options: StabilityProbeOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.summaryIntervalMs = Math.max(5000, options.summaryIntervalMs ?? 30000);
  }

  public start(): void {
    if (!this.enabled || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.printSummary();
    }, this.summaryIntervalMs);

    this.timer.unref();
    this.info('probe.start', { summaryIntervalMs: this.summaryIntervalMs });
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.printSummary();
    this.info('probe.stop');
  }

  public info(event: string, meta?: ProbeMeta): void {
    if (!this.enabled) {
      return;
    }
    this.bump(event);
    logTelemetry('stability.info', {
      name: event,
      ...(meta ?? {})
    });
  }

  public anomaly(event: string, meta?: ProbeMeta): void {
    if (!this.enabled) {
      return;
    }
    this.bump(event);
    this.anomalyCount += 1;
    logTelemetry(
      'stability.anomaly',
      {
        name: event,
        ...(meta ?? {})
      },
      'warn'
    );
  }

  public error(event: string, error: unknown, meta?: ProbeMeta): void {
    if (!this.enabled) {
      return;
    }
    this.bump(event);
    this.anomalyCount += 1;
    logTelemetry(
      'stability.error',
      {
        name: event,
        ...(meta ?? {}),
        error: error instanceof Error ? error.message : String(error)
      },
      'error'
    );
  }

  public async measure<T>(
    event: string,
    task: () => Promise<T>,
    options: { slowMs?: number; meta?: ProbeMeta } = {}
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await task();
      const durationMs = Date.now() - start;
      this.info(event, {
        durationMs,
        ...(options.meta ?? {})
      });
      if (typeof options.slowMs === 'number' && durationMs > options.slowMs) {
        this.anomaly(`${event}.slow`, {
          durationMs,
          thresholdMs: options.slowMs,
          ...(options.meta ?? {})
        });
      }
      return result;
    } catch (error) {
      this.error(`${event}.failed`, error, options.meta);
      throw error;
    }
  }

  private bump(event: string): void {
    const current = this.counters.get(event) ?? 0;
    this.counters.set(event, current + 1);
  }

  private printSummary(): void {
    if (!this.enabled) {
      return;
    }

    const entries = [...this.counters.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([event, count]) => ({ event, count }));

    logTelemetry('stability.summary', {
      anomalyCount: this.anomalyCount,
      counters: entries
    });
  }
}
