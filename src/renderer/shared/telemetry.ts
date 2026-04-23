export type RendererTelemetryEvent =
  | 'renderer.capture.hub.mounted'
  | 'renderer.permission.details.opened'
  | 'renderer.permission.refresh'
  | 'renderer.permission.item.refresh'
  | 'renderer.permission.settings.open'
  | 'renderer.permission.diagnostics.copy'
  | 'renderer.settings.permission.refresh'
  | 'renderer.toolbar.permission.refresh'
  | 'renderer.toolbar.permission.settings.open';

const rendererSessionId = `renderer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let rendererEventSeq = 0;
let traceSeq = 0;

export function createTraceId(scope = 'ui'): string {
  traceSeq += 1;
  return `${scope}-${Date.now().toString(36)}-${traceSeq.toString(36)}`;
}

export function trackRendererTelemetry(
  event: RendererTelemetryEvent,
  payload: Record<string, unknown> = {},
  options: { traceId?: string } = {}
): void {
  rendererEventSeq += 1;
  void window.pinStack.telemetry
    .track(event, {
      rendererSessionId,
      rendererEventSeq,
      traceId: options.traceId ?? null,
      ...payload
    })
    .catch(() => undefined);
}
