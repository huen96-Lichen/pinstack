import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import type {
  AppSettings,
  CapsuleActionDispatchInput,
  CapsuleEvent,
  CapsuleStateSnapshot,
  RuntimeSettings
} from '../../shared/types';
import { reduceCapsuleState } from '../services/capsule/statusReducer';
import { StatusPriorityQueue } from '../services/capsule/statusPriorityQueue';
import { logTelemetry } from '../telemetry';

// ---------------------------------------------------------------------------
// Protocol message types (shared with the Swift subprocess)
// ---------------------------------------------------------------------------

interface UpdateStateMessage {
  type: 'update_state';
  businessLabel: string;
  connectionStatus: string;
  recentTitle: string;
  recentSubtitle: string;
  displayTitle: string;
  quickApps: Array<{ id: string; name: string; icon: string; appPath: string; actionType: string; actionValue: string }>;
  enabledActions: string[];
  displayPolicy?: 'all-spaces' | 'active-display' | 'primary-display';
  showMusicContent?: boolean;
  showQuickApps?: boolean;
}

interface ExpandMessage {
  type: 'expand';
}

interface CollapseMessage {
  type: 'collapse';
}

interface QuitMessage {
  type: 'quit';
}

type IncomingMessage = UpdateStateMessage | ExpandMessage | CollapseMessage | QuitMessage;

interface ReadyMessage {
  type: 'ready';
}

interface StateChangedMessage {
  type: 'state_changed';
  state: 'open' | 'closed';
}

interface ActionMessage {
  type: 'action';
  action: 'screenshot' | 'ai' | 'workspace' | 'expand' | 'collapse' | 'open_app' | 'open_settings' | 'dashboard';
  appValue?: string;
}

interface SyncSettingMessage {
  type: 'sync_setting';
  showMusicContent?: boolean;
}

type OutgoingMessage = ReadyMessage | StateChangedMessage | ActionMessage | SyncSettingMessage;

// ---------------------------------------------------------------------------
// Public interface (identical to capsuleWindowController.ts)
// ---------------------------------------------------------------------------

export interface CapsuleWindowControllerOptions {
  preloadPath: string;
  rendererFilePath: string;
  rendererDevUrl?: string;
  isDev: boolean;
  getSettings: () => AppSettings;
  getRuntimeSettings: () => RuntimeSettings;
  getRecentContent: () => Promise<CapsuleStateSnapshot['recentContent']>;
  getAiConnectionState: () => Promise<CapsuleStateSnapshot['aiConnectionState']>;
  takeScreenshot: () => Promise<void>;
  openAiWindow: () => void;
  openWorkspace: () => void;
}

export interface CapsuleWindowController {
  ensureWindow: () => void;
  show: () => void;
  hide: () => void;
  updateFromRuntime: (runtime: RuntimeSettings) => void;
  handleDisplayEnvironmentChanged: () => void;
  getWindow: () => null;
  getStateSnapshot: () => CapsuleStateSnapshot;
  dispatchAction: (input: CapsuleActionDispatchInput) => Promise<CapsuleStateSnapshot>;
  updateUiState: (uiState: CapsuleStateSnapshot['uiState']) => CapsuleStateSnapshot;
  ingestEvent: (event: CapsuleEvent) => CapsuleStateSnapshot;
  destroy: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function derivePriority(type: CapsuleEvent['type']): CapsuleEvent['priority'] {
  if (type === 'screenshotCompleted' || type === 'aiProcessingCompleted') {
    return 'high';
  }
  if (type === 'aiProcessingStarted') {
    return 'medium';
  }
  return 'low';
}

function resolveBinaryPath(isDev: boolean): string {
  if (isDev) {
    return path.join(__dirname, '../../native/PinStackNotch/.build/release/PinStackNotch');
  }
  return path.join(process.resourcesPath, 'native/PinStackNotch/PinStackNotch');
}

function sendJson(proc: ChildProcess, msg: IncomingMessage): void {
  if (!proc.stdin || proc.stdin.destroyed) {
    return;
  }
  try {
    proc.stdin.write(JSON.stringify(msg) + '\n');
  } catch {
    // Best-effort; the process may have already exited.
  }
}

function safeKillProcess(proc: ChildProcess): void {
  try {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.end(); // Close write side gracefully to avoid EPIPE
    }
  } catch {
    // Ignore
  }
  const ref = proc;
  setTimeout(() => {
    if (ref && !ref.killed) {
      ref.kill('SIGKILL');
    }
  }, 500);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNotchSubprocessController(options: CapsuleWindowControllerOptions): CapsuleWindowController {
  const queue = new StatusPriorityQueue(5);
  let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  let hasCrashed = false; // Track if process crashed (not cleanly stopped)

  let childProcess: ChildProcess | null = null;
  let stdoutBuffer = '';

  let state: CapsuleStateSnapshot = {
    uiState: 'collapsed',
    businessState: 'idle',
    queueSize: 0,
    updatedAt: Date.now()
  };

  // ---- State helpers (same logic as capsuleWindowController) ----

  function applyState(input: Parameters<typeof reduceCapsuleState>[1]): CapsuleStateSnapshot {
    state = reduceCapsuleState(state, input);
    return state;
  }

  function scheduleAutoCollapse(): void {
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
      autoCollapseTimer = null;
    }
    const timeoutMs = options.getRuntimeSettings().capsule.expandedAutoCollapseMs;
    if (state.uiState !== 'expanded' || timeoutMs <= 0) {
      return;
    }
    autoCollapseTimer = setTimeout(() => {
      updateUiState('collapsed');
      ingestEvent({
        id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'capsuleCollapsed',
        createdAt: Date.now(),
        priority: 'low'
      });
    }, timeoutMs);
  }

  // ---- Data refresh (poll every 2s, push to Swift) ----

  async function refreshBridgeData(): Promise<void> {
    if (!childProcess || childProcess.killed) {
      return;
    }
    try {
      const [recentContent, aiConnectionState] = await Promise.all([
        options.getRecentContent(),
        options.getAiConnectionState()
      ]);

      state = {
        ...state,
        recentContent,
        aiConnectionState,
        updatedAt: Date.now()
      };

      const businessLabel = state.businessState === 'idle' ? '' : state.businessState;
      const connectionStatus = aiConnectionState ?? 'unknown';
      const recentTitle = recentContent?.title ?? '';
      const recentSubtitle = recentContent?.useCase ?? '';

      const runtime = options.getRuntimeSettings();
      const capsuleSettings = runtime.capsule;

      sendJson(childProcess, {
        type: 'update_state',
        businessLabel,
        connectionStatus,
        recentTitle,
        recentSubtitle,
        displayTitle: capsuleSettings.displayTitle || 'PinStack',
        quickApps: capsuleSettings.quickApps || [],
        enabledActions: capsuleSettings.enabledModules || ['screenshot', 'ai', 'workspace'],
        displayPolicy: capsuleSettings.anchorDisplayPolicy || 'all-spaces',
        showMusicContent: capsuleSettings.showMusicContent ?? true,
        showQuickApps: capsuleSettings.showQuickApps ?? true
      });
    } catch {
      // Best-effort; bridge polling is resilient.
    }
  }

  function startRefreshTicker(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(() => {
      void refreshBridgeData();
    }, 2000);
  }

  function stopRefreshTicker(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // ---- Swift message handling ----

  function handleSwiftMessage(msg: OutgoingMessage): void {
    if (msg.type === 'ready') {
      logTelemetry('stability.info', { name: 'notch subprocess ready' });
      retryCount = 0; // Reset retry counter on successful ready
      void refreshBridgeData();
      return;
    }

    if (msg.type === 'state_changed') {
      const newUiState: CapsuleStateSnapshot['uiState'] =
        msg.state === 'open' ? 'expanded' : 'collapsed';
      if (newUiState !== state.uiState) {
        const previous = state.uiState;
        applyState({ uiState: newUiState, queueSize: queue.size() });
        if (newUiState === 'expanded') {
          logTelemetry('capsule.expand.open', { from: previous, source: 'swift' });
        } else {
          logTelemetry('capsule.expand.close', { to: newUiState, source: 'swift' });
        }
        scheduleAutoCollapse();
      }
      return;
    }

    if (msg.type === 'action') {
      void handleSwiftAction(msg.action);
      return;
    }

  if (msg.type === 'sync_setting') {
    if (msg.showMusicContent !== undefined) {
      logTelemetry('stability.info', {
        name: 'capsule sync_setting ignored',
        showMusicContent: msg.showMusicContent
      });
    }
    return;
  }
  }

  async function handleSwiftAction(action: ActionMessage['action']): Promise<void> {
    switch (action) {
      case 'screenshot': {
        ingestEvent({
          id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'screenshotCompleted',
          createdAt: Date.now(),
          priority: derivePriority('screenshotCompleted')
        });
        await options.takeScreenshot();
        void refreshBridgeData();
        break;
      }
      case 'ai': {
        ingestEvent({
          id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'aiProcessingStarted',
          createdAt: Date.now(),
          priority: derivePriority('aiProcessingStarted')
        });
        options.openAiWindow();
        break;
      }
      case 'workspace': {
        ingestEvent({
          id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'workspaceOpenRequested',
          createdAt: Date.now(),
          priority: derivePriority('workspaceOpenRequested')
        });
        options.openWorkspace();
        break;
      }
      case 'open_app': {
        // App launching is handled directly by Swift via NSWorkspace
        break;
      }
      case 'open_settings': {
        // Open PinStack settings panel
        ingestEvent({
          id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'workspaceOpenRequested',
          createdAt: Date.now(),
          priority: derivePriority('workspaceOpenRequested')
        });
        options.openWorkspace();
        break;
      }
      case 'expand': {
        updateUiState('expanded');
        ingestEvent({
          id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'capsuleExpanded',
          createdAt: Date.now(),
          priority: derivePriority('capsuleExpanded')
        });
        break;
      }
      case 'collapse': {
        updateUiState('collapsed');
        ingestEvent({
          id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'capsuleCollapsed',
          createdAt: Date.now(),
          priority: derivePriority('capsuleCollapsed')
        });
        break;
      }
      case 'dashboard': {
        options.openWorkspace();
        break;
      }
    }
  }

  // ---- Process lifecycle ----

  function spawnProcess(): void {
    const binaryPath = resolveBinaryPath(options.isDev);
    const fallbackBinaryPath = path.join(process.resourcesPath, 'PinStackNotch');
    logTelemetry('stability.info', { name: 'notch subprocess spawning', binaryPath, retryCount });

    // Clean environment: remove DYLD_* variables that can crash Swift runtime
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string' && !key.startsWith('DYLD_')) {
        cleanEnv[key] = value;
      }
    }

    try {
      childProcess = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: cleanEnv,
        cwd: path.dirname(binaryPath)
      });
    } catch (err) {
      if (!options.isDev) {
        logTelemetry('stability.info', {
          name: 'notch subprocess primary spawn failed, trying legacy path',
          error: err instanceof Error ? err.message : String(err),
          binaryPath,
          fallbackBinaryPath
        });
        try {
          childProcess = spawn(fallbackBinaryPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: cleanEnv,
            cwd: path.dirname(fallbackBinaryPath)
          });
        } catch (fallbackErr) {
          logTelemetry('stability.error', {
            name: 'notch subprocess spawn failed',
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          });
          scheduleRestart();
          return;
        }
      } else {
        logTelemetry('stability.error', {
          name: 'notch subprocess spawn failed',
          error: err instanceof Error ? err.message : String(err)
        });
        scheduleRestart();
        return;
      }
    }

    stdoutBuffer = '';

    childProcess.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg: OutgoingMessage = JSON.parse(trimmed);
          handleSwiftMessage(msg);
        } catch {
          logTelemetry('stability.info', { name: 'notch subprocess invalid json', line: trimmed });
        }
      }
    });

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim();
      if (text) {
        logTelemetry('stability.info', { name: 'notch subprocess stderr', output: text });
      }
    });

    childProcess.on('exit', (code, signal) => {
      logTelemetry('stability.info', {
        name: 'notch subprocess exited',
        code,
        signal
      });
      // Mark as crashed if exit was abnormal (signal or non-zero code)
      if (signal || code !== 0) {
        hasCrashed = true;
      }
      childProcess = null;
      stopRefreshTicker();
      scheduleRestart();
    });

    childProcess.on('error', (err) => {
      logTelemetry('stability.error', {
        name: 'notch subprocess error',
        error: err.message
      });
      childProcess = null;
      stopRefreshTicker();
      scheduleRestart();
    });

    // Suppress EPIPE errors when writing to a process that has already exited
    childProcess.stdin?.on('error', () => {
      // Ignore — the process may have closed stdin before we finished writing
    });
  }

  function scheduleRestart(): void {
    if (retryCount >= MAX_RETRIES) {
      logTelemetry('stability.error', {
        name: 'notch subprocess max retries reached',
        retryCount
      });
      return;
    }
    retryCount++;
    setTimeout(() => {
      // Only restart if we haven't been destroyed in the meantime.
      if (retryCount > 0) {
        spawnProcess();
      }
    }, RETRY_DELAY_MS);
  }

  function killProcess(): void {
    if (childProcess) {
      try {
        sendJson(childProcess, { type: 'quit' });
      } catch {
        // Ignore write errors during shutdown.
      }
      const proc = childProcess;
      childProcess = null;
      safeKillProcess(proc);
    }
    // Only reset retry counter if the process didn't crash
    if (!hasCrashed) {
      retryCount = 0;
    }
    hasCrashed = false;
    stopRefreshTicker();
  }

  // ---- Public API (CapsuleWindowController) ----

  function ensureWindow(): void {
    if (childProcess && !childProcess.killed) {
      return;
    }
    // Don't restart if we've exceeded max retries due to crashes
    if (retryCount >= MAX_RETRIES) {
      logTelemetry('stability.info', {
        name: 'notch subprocess skipped (max retries exceeded)',
        retryCount
      });
      return;
    }
    spawnProcess();
    startRefreshTicker();
  }

  function show(): void {
    const runtime = options.getRuntimeSettings();
    if (!runtime.capsule.enabled) {
      return;
    }
    ensureWindow();
  }

  function hide(): void {
    killProcess();
  }

  function updateFromRuntime(runtime: RuntimeSettings): void {
    if (!runtime.capsule.enabled) {
      hide();
      return;
    }
    logTelemetry('stability.info', {
      name: 'capsule.runtime.updated',
      animationPreset: runtime.capsule.animationPreset
    });
    // If the subprocess is not running, start it.
    if (!childProcess || childProcess.killed) {
      ensureWindow();
    }
  }

  function handleDisplayEnvironmentChanged(): void {
    // The Swift subprocess manages its own display positioning via NSWindow.
    // No action needed from the Electron side.
  }

  function getWindow(): null {
    return null;
  }

  function getStateSnapshot(): CapsuleStateSnapshot {
    return state;
  }

  function updateUiState(uiState: CapsuleStateSnapshot['uiState']): CapsuleStateSnapshot {
    const previous = state.uiState;
    const next = applyState({ uiState, queueSize: queue.size() });

    if (previous !== uiState) {
      if (uiState === 'hover') {
        logTelemetry('capsule.hover.enter', { from: previous });
      } else if (previous === 'hover' && uiState === 'collapsed') {
        logTelemetry('capsule.hover.leave', { to: uiState });
      }
      if (uiState === 'expanded') {
        logTelemetry('capsule.expand.open', { from: previous });
      } else if (previous === 'expanded') {
        logTelemetry('capsule.expand.close', { to: uiState });
      }
    }

    // Send expand/collapse to Swift subprocess
    if (childProcess && !childProcess.killed) {
      if (uiState === 'expanded') {
        sendJson(childProcess, { type: 'expand' });
      } else {
        sendJson(childProcess, { type: 'collapse' });
      }
    }

    scheduleAutoCollapse();
    return next;
  }

  function ingestEvent(event: CapsuleEvent): CapsuleStateSnapshot {
    queue.push(event);
    logTelemetry('capsule.event.enqueued', { type: event.type, priority: event.priority, queueSize: queue.size() });
    const consumed = queue.consume();
    if (!consumed) {
      return state;
    }
    const next = applyState({ event: consumed, queueSize: queue.size() });
    logTelemetry('capsule.event.dequeued', { type: consumed.type, queueSize: queue.size() });
    return next;
  }

  async function dispatchAction(input: CapsuleActionDispatchInput): Promise<CapsuleStateSnapshot> {
    if (input.action === 'screenshot') {
      ingestEvent({
        id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'screenshotCompleted',
        createdAt: Date.now(),
        priority: derivePriority('screenshotCompleted')
      });
      await options.takeScreenshot();
      void refreshBridgeData();
      return state;
    }

    if (input.action === 'open_ai') {
      ingestEvent({
        id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'aiProcessingStarted',
        createdAt: Date.now(),
        priority: derivePriority('aiProcessingStarted')
      });
      options.openAiWindow();
      return state;
    }

    if (input.action === 'open_workspace') {
      ingestEvent({
        id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'workspaceOpenRequested',
        createdAt: Date.now(),
        priority: derivePriority('workspaceOpenRequested')
      });
      options.openWorkspace();
      return state;
    }

    if (input.action === 'expand') {
      updateUiState('expanded');
      ingestEvent({
        id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'capsuleExpanded',
        createdAt: Date.now(),
        priority: derivePriority('capsuleExpanded')
      });
      return state;
    }

    // Default: collapse
    updateUiState('collapsed');
    ingestEvent({
      id: `capsule_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'capsuleCollapsed',
      createdAt: Date.now(),
      priority: derivePriority('capsuleCollapsed')
    });
    return state;
  }

  function destroy(): void {
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
      autoCollapseTimer = null;
    }
    stopRefreshTicker();
    killProcess();
  }

  return {
    ensureWindow,
    show,
    hide,
    updateFromRuntime,
    handleDisplayEnvironmentChanged,
    getWindow,
    getStateSnapshot,
    dispatchAction,
    updateUiState,
    ingestEvent,
    destroy
  };
}
