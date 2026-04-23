export type TelemetryLevel = 'info' | 'warn' | 'error';

export type TelemetryEvent =
  | 'permissions.status.checked'
  | 'permissions.settings.open.requested'
  | 'permissions.settings.open.result'
  | 'window.created'
  | 'window.renderer.load'
  | 'capture.screenshot.diagnostics'
  | 'pin.window.reuse'
  | 'pin.window.created'
  | 'pin.window.closed'
  | 'pin.window.close.request'
  | 'pin.window.create.failed'
  | 'pin.window.load.failed'
  | 'pin.window.create.slow'
  | 'pin.window.count.high'
  | 'pin.window.close.missing'
  | 'stability.info'
  | 'stability.anomaly'
  | 'stability.error'
  | 'stability.summary'
  | 'renderer.capture.hub.mounted'
  | 'renderer.permission.details.opened'
  | 'renderer.permission.refresh'
  | 'renderer.permission.item.refresh'
  | 'renderer.permission.settings.open'
  | 'renderer.permission.diagnostics.copy'
  | 'renderer.settings.permission.refresh'
  | 'renderer.toolbar.permission.refresh'
  | 'renderer.toolbar.permission.settings.open'
  | 'ai.task.started'
  | 'ai.task.completed'
  | 'ai.task.failed'
  | 'ai.route.selected'
  | 'ai.fallback.triggered'
  | 'ai.latency.bucket'
  | 'capsule.hover.enter'
  | 'capsule.hover.leave'
  | 'capsule.expand.open'
  | 'capsule.expand.close'
  | 'capsule.event.enqueued'
  | 'capsule.event.dequeued'
  | 'capsule.render.frameBudget';

type TelemetryPayload = Record<string, unknown>;

const TELEMETRY_EVENTS = new Set<TelemetryEvent>([
  'permissions.status.checked',
  'permissions.settings.open.requested',
  'permissions.settings.open.result',
  'window.created',
  'window.renderer.load',
  'capture.screenshot.diagnostics',
  'pin.window.reuse',
  'pin.window.created',
  'pin.window.closed',
  'pin.window.close.request',
  'pin.window.create.failed',
  'pin.window.load.failed',
  'pin.window.create.slow',
  'pin.window.count.high',
  'pin.window.close.missing',
  'stability.info',
  'stability.anomaly',
  'stability.error',
  'stability.summary',
  'renderer.capture.hub.mounted',
  'renderer.permission.details.opened',
  'renderer.permission.refresh',
  'renderer.permission.item.refresh',
  'renderer.permission.settings.open',
  'renderer.permission.diagnostics.copy',
  'renderer.settings.permission.refresh',
  'renderer.toolbar.permission.refresh',
  'renderer.toolbar.permission.settings.open',
  'ai.task.started',
  'ai.task.completed',
  'ai.task.failed',
  'ai.route.selected',
  'ai.fallback.triggered',
  'ai.latency.bucket',
  'capsule.hover.enter',
  'capsule.hover.leave',
  'capsule.expand.open',
  'capsule.expand.close',
  'capsule.event.enqueued',
  'capsule.event.dequeued',
  'capsule.render.frameBudget'
]);

export function isTelemetryEvent(value: string): value is TelemetryEvent {
  return TELEMETRY_EVENTS.has(value as TelemetryEvent);
}

export function logTelemetry(
  event: TelemetryEvent,
  payload: TelemetryPayload = {},
  level: TelemetryLevel = 'info'
): void {
  const record = {
    event,
    timestamp: Date.now(),
    ...payload
  };

  if (level === 'warn') {
    console.warn('[TELEMETRY]', record);
    return;
  }

  if (level === 'error') {
    console.error('[TELEMETRY]', record);
    return;
  }

  console.info('[TELEMETRY]', record);
}
