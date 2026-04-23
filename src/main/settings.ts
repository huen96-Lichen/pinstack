import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AiPersonaSlot,
  AiHubSettings,
  AppSettings,
  CapsuleRuntimeSettings,
  CaptureLauncherPosition,
  CaptureSizeOption,
  RuntimeSettings
} from '../shared/types';
import { AI_MODEL_REGISTRY, isRegisteredAiModel } from '../shared/ai/modelRegistry';
import {
  CONFIGURABLE_SHORTCUT_KEYS,
  dedupeShortcutSettings,
  getShortcutSettings,
  pickShortcutSettings,
  resolveShortcutSettingsWithSwap,
  sanitizeShortcutByKey,
  isLegacyRetiredCaptureHubShortcut,
  type ShortcutSettings
} from '../shared/shortcuts';

interface SettingsContainer {
  appSettings?: Partial<AppSettings>;
  runtimeSettings?: Partial<RuntimeSettings>;
}

const fileWriteQueue = new Map<string, Promise<void>>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeShortcutValue(key: keyof ShortcutSettings, value: string | undefined): string | undefined {
  if (key === 'captureHubShortcut' && value && isLegacyRetiredCaptureHubShortcut(value)) {
    return undefined;
  }
  const sanitized = sanitizeShortcutByKey(key, value);
  if (sanitized === undefined) {
    return undefined;
  }
  return sanitized;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return [...new Set(value.map((item) => toStringValue(item)?.trim()).filter((item): item is string => Boolean(item)))];
}

function toPersonaSlots(value: unknown): AiPersonaSlot[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next: AiPersonaSlot[] = [];
  const allowedIds = new Set(['persona_1', 'persona_2', 'persona_3']);
  const allowedTemplates = new Set(['productivity-default', 'taxonomy-strict', 'naming-strict']);

  for (const raw of value) {
    const item = asRecord(raw);
    if (!item) {
      continue;
    }
    const id = toStringValue(item.id);
    const enabled = toBoolean(item.enabled);
    const templateId = toStringValue(item.templateId);
    const title = toStringValue(item.title);
    const markdown = toStringValue(item.markdown);

    if (!id || !allowedIds.has(id) || enabled === undefined || !templateId || !allowedTemplates.has(templateId)) {
      continue;
    }

    next.push({
      id: id as AiPersonaSlot['id'],
      enabled,
      templateId: templateId as AiPersonaSlot['templateId'],
      title: (title ?? '').trim() || id,
      markdown: (markdown ?? '').trim()
    });
  }

  if (next.length === 0) {
    return undefined;
  }

  return next.slice(0, 3);
}

function toFolderTokenMap(
  value: unknown
):
  | Partial<
      Record<'01_待处理' | '02_产品' | '03_设计' | '04_开发' | '05_AI' | '06_视频' | '07_运营' | '08_灵感' | '09_封存', string>
    >
  | undefined {
  const source = asRecord(value);
  if (!source) {
    return undefined;
  }

  const allowedKeys: Array<'01_待处理' | '02_产品' | '03_设计' | '04_开发' | '05_AI' | '06_视频' | '07_运营' | '08_灵感' | '09_封存'> = [
    '01_待处理',
    '02_产品',
    '03_设计',
    '04_开发',
    '05_AI',
    '06_视频',
    '07_运营',
    '08_灵感',
    '09_封存'
  ];
  const next: Partial<Record<(typeof allowedKeys)[number], string>> = {};
  for (const key of allowedKeys) {
    const token = toStringValue(source[key])?.trim();
    if (token) {
      next[key] = token;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function pickAiHubSettings(value: unknown): Partial<AiHubSettings> {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  const next: Partial<AiHubSettings> = {};
  const enabled = toBoolean(source.enabled);
  const defaultModelId = toStringValue(source.defaultModelId);
  const preferredLocalModelId = toStringValue(source.preferredLocalModelId);
  const preferredCloudModelId = toStringValue(source.preferredCloudModelId);
  const suggestionOnly = toBoolean(source.suggestionOnly);
  const entryVisibility = toStringValue(source.entryVisibility);
  const defaultProvider = toStringValue(source.defaultProvider);
  const aiFirstSearch = toBoolean(source.aiFirstSearch);
  const allowFallback = toBoolean(source.allowFallback);
  const processImages = toBoolean(source.processImages);
  const processOnlyUntitled = toBoolean(source.processOnlyUntitled);
  const namingTemplate = toStringValue(source.namingTemplate);
  const sortStrategy = toStringValue(source.sortStrategy);
  const categoryDictionary = toStringArray(source.categoryDictionary);
  const sourceDictionary = toStringArray(source.sourceDictionary);
  const personaSlots = toPersonaSlots(source.personaSlots);

  if (enabled !== undefined) {
    next.enabled = enabled;
  }
  if (defaultModelId !== undefined) {
    if (AI_MODEL_REGISTRY.length === 0 || isRegisteredAiModel(defaultModelId)) {
      next.defaultModelId = defaultModelId;
    }
  }
  if (preferredLocalModelId !== undefined) {
    if (AI_MODEL_REGISTRY.length === 0 || isRegisteredAiModel(preferredLocalModelId)) {
      next.preferredLocalModelId = preferredLocalModelId;
    }
  }
  if (preferredCloudModelId !== undefined) {
    next.preferredCloudModelId = preferredCloudModelId;
  }
  if (suggestionOnly !== undefined) {
    next.suggestionOnly = suggestionOnly;
  }
  if (entryVisibility === 'always' || entryVisibility === 'enabled_only' || entryVisibility === 'hidden') {
    next.entryVisibility = entryVisibility;
  }
  if (defaultProvider === 'local' || defaultProvider === 'cloud') {
    next.defaultProvider = defaultProvider;
  }
  if (aiFirstSearch !== undefined) {
    next.aiFirstSearch = aiFirstSearch;
  }
  if (allowFallback !== undefined) {
    next.allowFallback = allowFallback;
  }
  if (processImages !== undefined) {
    next.processImages = processImages;
  }
  if (processOnlyUntitled !== undefined) {
    next.processOnlyUntitled = processOnlyUntitled;
  }
  if (namingTemplate === 'category_title_keyword_source' || namingTemplate === 'category_source_title') {
    next.namingTemplate = namingTemplate;
  }
  if (sortStrategy === 'category_then_time' || sortStrategy === 'source_then_time') {
    next.sortStrategy = sortStrategy;
  }
  if (categoryDictionary !== undefined) {
    next.categoryDictionary = categoryDictionary;
  }
  if (sourceDictionary !== undefined) {
    next.sourceDictionary = sourceDictionary;
  }
  if (personaSlots !== undefined) {
    next.personaSlots = personaSlots;
  }

  return next;
}

function pickVaultkeeperSettings(value: unknown): Partial<NonNullable<AppSettings['vaultkeeper']>> {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  const next: Partial<NonNullable<AppSettings['vaultkeeper']>> = {};
  const enabled = toBoolean(source.enabled);
  const autoStart = toBoolean(source.autoStart);
  const projectRoot = toStringValue(source.projectRoot);
  const port = toNumber(source.port);
  const draftDir = toStringValue(source.draftDir);
  const inboxDir = toStringValue(source.inboxDir);
  const libraryDir = toStringValue(source.libraryDir);
  const attachmentsDir = toStringValue(source.attachmentsDir);
  const defaultAiEnhance = toBoolean(source.defaultAiEnhance);
  const enableWhisperX = toBoolean(source.enableWhisperX);
  const webpageMode = toStringValue(source.webpageMode);
  const namingRule = toStringValue(source.namingRule);
  const autoFrontmatter = toBoolean(source.autoFrontmatter);
  const autoTags = toBoolean(source.autoTags);
  const autoMarkdownlint = toBoolean(source.autoMarkdownlint);

  if (enabled !== undefined) {
    next.enabled = enabled;
  }
  if (autoStart !== undefined) {
    next.autoStart = autoStart;
  }
  if (projectRoot !== undefined) {
    next.projectRoot = projectRoot;
  }
  if (port !== undefined && port > 0 && port < 65536) {
    next.port = port;
  }
  if (draftDir !== undefined) {
    next.draftDir = draftDir;
  }
  if (inboxDir !== undefined) {
    next.inboxDir = inboxDir;
  }
  if (libraryDir !== undefined) {
    next.libraryDir = libraryDir;
  }
  if (attachmentsDir !== undefined) {
    next.attachmentsDir = attachmentsDir;
  }
  if (defaultAiEnhance !== undefined) {
    next.defaultAiEnhance = defaultAiEnhance;
  }
  if (enableWhisperX !== undefined) {
    next.enableWhisperX = enableWhisperX;
  }
  if (webpageMode === 'readable' || webpageMode === 'fuller') {
    next.webpageMode = webpageMode;
  }
  if (namingRule !== undefined) {
    next.namingRule = namingRule;
  }
  if (autoFrontmatter !== undefined) {
    next.autoFrontmatter = autoFrontmatter;
  }
  if (autoTags !== undefined) {
    next.autoTags = autoTags;
  }
  if (autoMarkdownlint !== undefined) {
    next.autoMarkdownlint = autoMarkdownlint;
  }

  return next;
}

function toCaptureSize(value: unknown): CaptureSizeOption | undefined {
  const source = asRecord(value);
  if (!source) {
    return undefined;
  }

  const width = toNumber(source.width);
  const height = toNumber(source.height);
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

function toCaptureSizeArray(value: unknown): CaptureSizeOption[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next: CaptureSizeOption[] = [];
  for (const item of value) {
    const source = asRecord(item);
    if (!source) {
      continue;
    }
    const width = toNumber(source.width);
    const height = toNumber(source.height);
    if (width === undefined || height === undefined) {
      continue;
    }
    if (width <= 0 || height <= 0) {
      continue;
    }
    next.push({
      width: Math.round(width),
      height: Math.round(height)
    });
  }

  return next;
}

function toCaptureLauncherPosition(value: unknown): CaptureLauncherPosition | undefined {
  const source = asRecord(value);
  if (!source) {
    return undefined;
  }

  const displayId = toNumber(source.displayId);
  const relativeX = toNumber(source.relativeX);
  const relativeY = toNumber(source.relativeY);

  if (displayId === undefined || relativeX === undefined || relativeY === undefined) {
    return undefined;
  }

  return {
    displayId: Math.round(displayId),
    relativeX: Math.max(0, Math.min(relativeX, 1)),
    relativeY: Math.max(0, Math.min(relativeY, 1))
  };
}

function toBalancedEntryOrder(value: unknown): CapsuleRuntimeSettings['balancedEntryOrder'] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const next = value
    .map((item) => toStringValue(item))
    .filter((item): item is 'screenshot' | 'ai' | 'workspace' => item === 'screenshot' || item === 'ai' || item === 'workspace');
  if (next.length !== 3) {
    return undefined;
  }
  const deduped = [...new Set(next)];
  if (deduped.length !== 3) {
    return undefined;
  }
  return deduped;
}

function pickCapsuleRuntimeSettings(value: unknown): Partial<CapsuleRuntimeSettings> {
  const source = asRecord(value);
  if (!source) {
    return {};
  }
  const next: Partial<CapsuleRuntimeSettings> = {};
  const enabled = toBoolean(source.enabled);
  const surfaceMode = toStringValue(source.surfaceMode);
  const anchorDisplayPolicy = toStringValue(source.anchorDisplayPolicy);
  const hoverEnabled = toBoolean(source.hoverEnabled);
  const animationPreset = toStringValue(source.animationPreset);
  const expandedAutoCollapseMs = toNumber(source.expandedAutoCollapseMs);
  const balancedEntryOrder = toBalancedEntryOrder(source.balancedEntryOrder);

  if (enabled !== undefined) {
    next.enabled = enabled;
  }
  if (surfaceMode === 'glass' || surfaceMode === 'vibrant' || surfaceMode === 'solid') {
    next.surfaceMode = surfaceMode;
  }
  if (anchorDisplayPolicy === 'active-display' || anchorDisplayPolicy === 'primary-display' || anchorDisplayPolicy === 'all-spaces') {
    next.anchorDisplayPolicy = anchorDisplayPolicy;
  }
  if (hoverEnabled !== undefined) {
    next.hoverEnabled = hoverEnabled;
  }
  if (animationPreset === 'smooth' || animationPreset === 'snappy') {
    next.animationPreset = animationPreset;
  }
  if (expandedAutoCollapseMs !== undefined && expandedAutoCollapseMs >= 0 && expandedAutoCollapseMs <= 10000) {
    next.expandedAutoCollapseMs = Math.round(expandedAutoCollapseMs);
  }
  if (balancedEntryOrder !== undefined) {
    next.balancedEntryOrder = balancedEntryOrder;
  }

  // New fields: displayTitle, quickApps, enabledModules
  const displayTitle = toStringValue(source.displayTitle);
  if (displayTitle !== undefined) {
    next.displayTitle = displayTitle;
  }
  if (Array.isArray(source.quickApps)) {
    next.quickApps = source.quickApps;
  }
  if (Array.isArray(source.enabledModules)) {
    next.enabledModules = source.enabledModules;
  }
  const showMusicContent = toBoolean(source.showMusicContent);
  if (showMusicContent !== undefined) {
    next.showMusicContent = showMusicContent;
  }
  const showQuickApps = toBoolean(source.showQuickApps);
  if (showQuickApps !== undefined) {
    next.showQuickApps = showQuickApps;
  }

  return next;
}

function pickAppSettings(value: unknown): Partial<AppSettings> {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  const next: Partial<AppSettings> = {};
  const pollIntervalMs = toNumber(source.pollIntervalMs);
  const autoPin = toBoolean(source.autoPin);
  const storageRoot = toStringValue(source.storageRoot);
  const shortcutSource = pickShortcutSettings({
    screenshotShortcut: toStringValue(source.screenshotShortcut),
    dashboardShortcut: toStringValue(source.dashboardShortcut),
    captureHubShortcut: toStringValue(source.captureHubShortcut),
    modeToggleShortcut: toStringValue(source.modeToggleShortcut),
    trayOpenDashboardShortcut: toStringValue(source.trayOpenDashboardShortcut),
    trayCycleModeShortcut: toStringValue(source.trayCycleModeShortcut),
    trayQuitShortcut: toStringValue(source.trayQuitShortcut)
  });
  const dashboardFocusOnShow = toBoolean(source.dashboardFocusOnShow);
  const aiCloudEnabled = toBoolean(source.aiCloudEnabled);
  const launchAtLogin = toBoolean(source.launchAtLogin);
  const defaultDashboardView = toStringValue(source.defaultDashboardView);
  const defaultScreenshotFormat = toStringValue(source.defaultScreenshotFormat);
  const scopeMode = toStringValue(source.scopeMode);
  const scopedApps = toStringArray(source.scopedApps);
  const aiHub = pickAiHubSettings(source.aiHub);
  const vaultkeeper = pickVaultkeeperSettings(source.vaultkeeper);

  if (pollIntervalMs !== undefined) {
    next.pollIntervalMs = pollIntervalMs;
  }
  if (autoPin !== undefined) {
    next.autoPin = autoPin;
  }
  if (storageRoot !== undefined) {
    next.storageRoot = storageRoot;
  }
  for (const key of CONFIGURABLE_SHORTCUT_KEYS) {
    const normalized = normalizeShortcutValue(key, shortcutSource[key]);
    if (normalized !== undefined) {
      next[key] = normalized;
    }
  }
  if (dashboardFocusOnShow !== undefined) {
    next.dashboardFocusOnShow = dashboardFocusOnShow;
  }
  if (aiCloudEnabled !== undefined) {
    next.aiCloudEnabled = aiCloudEnabled;
  }
  if (launchAtLogin !== undefined) {
    next.launchAtLogin = launchAtLogin;
  }
  if (defaultDashboardView === 'all' || defaultDashboardView === 'text' || defaultDashboardView === 'images' || defaultDashboardView === 'ai') {
    next.defaultDashboardView = defaultDashboardView;
  }
  if (defaultScreenshotFormat === 'png') {
    next.defaultScreenshotFormat = defaultScreenshotFormat;
  }
  if (scopeMode === 'global' || scopeMode === 'blacklist' || scopeMode === 'whitelist') {
    next.scopeMode = scopeMode;
  }
  if (scopedApps !== undefined) {
    next.scopedApps = scopedApps;
  }
  if (Object.keys(aiHub).length > 0) {
    next.aiHub = aiHub as AiHubSettings;
  }
  if (Object.keys(vaultkeeper).length > 0) {
    next.vaultkeeper = vaultkeeper as NonNullable<AppSettings['vaultkeeper']>;
  }

  return next;
}

function pickRuntimeSettings(value: unknown): Partial<RuntimeSettings> {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  const next: Partial<RuntimeSettings> = {};
  const mode = toStringValue(source.mode);
  const dashboardSizePreset = toStringValue(source.dashboardSizePreset);
  const uiMode = toStringValue(source.uiMode);
  const enableImagePin = toBoolean(source.enableImagePin);
  const enableTextPin = toBoolean(source.enableTextPin);
  const enableFlowPin = toBoolean(source.enableFlowPin);
  const pinBehaviorMode = toStringValue(source.pinBehaviorMode);
  const dashboardAlwaysOnTop = toBoolean(source.dashboardAlwaysOnTop);
  const enableCaptureLauncher = toBoolean(source.enableCaptureLauncher);
  const rememberCaptureRecentSizes = toBoolean(source.rememberCaptureRecentSizes);
  const defaultCaptureSizePreset = toStringValue(source.defaultCaptureSizePreset);
  const defaultCaptureCustomSize = toCaptureSize(source.defaultCaptureCustomSize);
  const showStatusHints = toBoolean(source.showStatusHints);
  const captureRecentSizes = toCaptureSizeArray(source.captureRecentSizes);
  const captureLauncherPosition = toCaptureLauncherPosition(source.captureLauncherPosition);
  const capsule = pickCapsuleRuntimeSettings(source.capsule);
  const dashboardBounds = asRecord(source.dashboardBounds);

  if (mode === 'auto' || mode === 'silent' || mode === 'off') {
    next.mode = mode;
  }
  if (pinBehaviorMode === 'auto' || pinBehaviorMode === 'custom' || pinBehaviorMode === 'off') {
    next.pinBehaviorMode = pinBehaviorMode;
  }
  if (dashboardSizePreset === 'small' || dashboardSizePreset === 'medium' || dashboardSizePreset === 'large') {
    next.dashboardSizePreset = dashboardSizePreset;
  }
  if (uiMode === 'legacy' || uiMode === 'modern') {
    next.uiMode = uiMode;
  }
  if (enableImagePin !== undefined) {
    next.enableImagePin = enableImagePin;
  }
  if (enableTextPin !== undefined) {
    next.enableTextPin = enableTextPin;
  }
  if (enableFlowPin !== undefined) {
    next.enableFlowPin = enableFlowPin;
  }
  if (dashboardAlwaysOnTop !== undefined) {
    next.dashboardAlwaysOnTop = dashboardAlwaysOnTop;
  }
  if (enableCaptureLauncher !== undefined) {
    next.enableCaptureLauncher = enableCaptureLauncher;
  }
  if (rememberCaptureRecentSizes !== undefined) {
    next.rememberCaptureRecentSizes = rememberCaptureRecentSizes;
  }
  if (
    defaultCaptureSizePreset === 'recent' ||
    defaultCaptureSizePreset === '1080x1350' ||
    defaultCaptureSizePreset === '1920x1080' ||
    defaultCaptureSizePreset === 'custom'
  ) {
    next.defaultCaptureSizePreset = defaultCaptureSizePreset;
  }
  if (defaultCaptureCustomSize !== undefined) {
    next.defaultCaptureCustomSize = defaultCaptureCustomSize;
  }
  if (showStatusHints !== undefined) {
    next.showStatusHints = showStatusHints;
  }
  if (captureRecentSizes !== undefined) {
    next.captureRecentSizes = captureRecentSizes;
  }
  if (captureLauncherPosition !== undefined) {
    next.captureLauncherPosition = captureLauncherPosition;
  }
  if (Object.keys(capsule).length > 0) {
    next.capsule = {
      ...(next.capsule ?? {}),
      ...capsule
    } as CapsuleRuntimeSettings;
  }
  if (dashboardBounds) {
    const width = toNumber(dashboardBounds.width);
    const height = toNumber(dashboardBounds.height);
    if (width !== undefined && height !== undefined) {
      next.dashboardBounds = { width, height };
    }
  }

  return next;
}

function sanitizeAppSettingsForDisk(settings: AppSettings): AppSettings {
  return {
    ...settings,
    aiHub: {
      ...settings.aiHub,
      cloudApiKey: undefined
    }
  };
}

async function readSettingsContainer(settingsFilePath: string): Promise<SettingsContainer> {
  try {
    const raw = await fs.readFile(settingsFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const container = asRecord(parsed);
    if (!container) {
      return {};
    }

    return {
      appSettings: pickAppSettings(container.appSettings),
      runtimeSettings: pickRuntimeSettings(container.runtimeSettings)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to load settings container, fallback to defaults.', error);
    }
    return {};
  }
}

async function writeSettingsContainer(settingsFilePath: string, payload: SettingsContainer): Promise<void> {
  const tmpPath = `${settingsFilePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(payload, null, 2);
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, settingsFilePath);
}

async function enqueueFileWrite(settingsFilePath: string, task: () => Promise<void>): Promise<void> {
  const previous = fileWriteQueue.get(settingsFilePath) ?? Promise.resolve();
  const current = previous
    .catch(() => {
      // Ignore previous write failure and continue queue.
    })
    .then(task);

  fileWriteQueue.set(settingsFilePath, current);

  try {
    await current;
  } finally {
    if (fileWriteQueue.get(settingsFilePath) === current) {
      fileWriteQueue.delete(settingsFilePath);
    }
  }
}

export class SettingsService {
  private readonly settingsFilePath: string;
  private readonly legacySettingsFilePath?: string;
  private readonly defaultShortcutSettings: ShortcutSettings;
  private value: AppSettings;

  public constructor(settingsFilePath: string, defaults: AppSettings, legacySettingsFilePath?: string) {
    this.settingsFilePath = settingsFilePath;
    this.legacySettingsFilePath = legacySettingsFilePath;
    this.defaultShortcutSettings = getShortcutSettings(defaults);
    this.value = defaults;
  }

  public async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsFilePath), { recursive: true });

    const container = await readSettingsContainer(this.settingsFilePath);
    const legacyFallback = {
      ...(await this.readLegacySettingsFromFile(this.settingsFilePath)),
      ...(await this.readLegacySettingsFromFile(this.legacySettingsFilePath))
    };

    const defaultVaultkeeper = this.value.vaultkeeper ?? {
      enabled: false,
      autoStart: true,
      projectRoot: '',
      port: 3210
    };

    this.value = {
      ...this.value,
      ...legacyFallback,
      ...container.appSettings,
      aiHub: {
        ...this.value.aiHub,
        ...(legacyFallback.aiHub ?? {}),
        ...(container.appSettings?.aiHub ?? {})
      },
      vaultkeeper: {
        ...defaultVaultkeeper,
        ...(legacyFallback.vaultkeeper ?? {}),
        ...(container.appSettings?.vaultkeeper ?? {})
      }
    };
    this.value = this.applyShortcutDedupe(this.value);

    await this.persist();
  }

  public get(): AppSettings {
    return { ...this.value };
  }

  public async update(next: Partial<AppSettings>): Promise<AppSettings> {
    const merged: AppSettings = {
      ...this.value,
      ...next,
      aiHub: next.aiHub
        ? {
            ...this.value.aiHub,
            ...next.aiHub
          }
        : this.value.aiHub,
      vaultkeeper: next.vaultkeeper
        ? { ...this.value.vaultkeeper, ...next.vaultkeeper }
        : this.value.vaultkeeper,
    };
    this.value = this.applyShortcutConflictResolution(this.value, merged, next);
    await this.persist();
    return this.get();
  }

  private applyShortcutConflictResolution(
    current: AppSettings,
    merged: AppSettings,
    patch: Partial<AppSettings>
  ): AppSettings {
    const shortcutPatch = pickShortcutSettings(patch);
    const resolvedShortcuts =
      Object.keys(shortcutPatch).length === 0
        ? dedupeShortcutSettings(getShortcutSettings(merged), this.defaultShortcutSettings)
        : resolveShortcutSettingsWithSwap(
            getShortcutSettings(current),
            shortcutPatch,
            this.defaultShortcutSettings
          );
    return {
      ...merged,
      ...resolvedShortcuts
    };
  }

  private applyShortcutDedupe(settings: AppSettings): AppSettings {
    return {
      ...settings,
      ...dedupeShortcutSettings(getShortcutSettings(settings), this.defaultShortcutSettings)
    };
  }

  private async readLegacySettingsFromFile(settingsFilePath?: string): Promise<Partial<AppSettings>> {
    if (!settingsFilePath) {
      return {};
    }

    try {
      const raw = await fs.readFile(settingsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return pickAppSettings(parsed);
    } catch {
      return {};
    }
  }

  private async persist(): Promise<void> {
    await enqueueFileWrite(this.settingsFilePath, async () => {
      const container = await readSettingsContainer(this.settingsFilePath);
      await writeSettingsContainer(this.settingsFilePath, {
        ...container,
        appSettings: sanitizeAppSettingsForDisk(this.value)
      });
    });
  }
}

export class RuntimeSettingsService {
  private readonly settingsFilePath: string;
  private readonly legacyRuntimeSettingsFilePath?: string;
  private value: RuntimeSettings;

  public constructor(settingsFilePath: string, defaults: RuntimeSettings, legacyRuntimeSettingsFilePath?: string) {
    this.settingsFilePath = settingsFilePath;
    this.legacyRuntimeSettingsFilePath = legacyRuntimeSettingsFilePath;
    this.value = defaults;
  }

  public async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsFilePath), { recursive: true });

    const container = await readSettingsContainer(this.settingsFilePath);
    const legacyFallback = {
      ...(await this.readLegacyRuntimeSettingsFromFile(this.settingsFilePath)),
      ...(await this.readLegacyRuntimeSettingsFromFile(this.legacyRuntimeSettingsFilePath))
    };

    this.value = {
      ...this.value,
      ...legacyFallback,
      ...container.runtimeSettings
    };

    await this.persist();
  }

  public get(): RuntimeSettings {
    return { ...this.value };
  }

  public async update(next: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
    this.value = {
      ...this.value,
      ...next,
      capsule: next.capsule
        ? {
            ...this.value.capsule,
            ...next.capsule
          }
        : this.value.capsule
    };
    await this.persist();
    return this.get();
  }

  private async readLegacyRuntimeSettingsFromFile(settingsFilePath?: string): Promise<Partial<RuntimeSettings>> {
    if (!settingsFilePath) {
      return {};
    }

    try {
      const raw = await fs.readFile(settingsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return pickRuntimeSettings(parsed);
    } catch {
      return {};
    }
  }

  private async persist(): Promise<void> {
    await enqueueFileWrite(this.settingsFilePath, async () => {
      const container = await readSettingsContainer(this.settingsFilePath);
      await writeSettingsContainer(this.settingsFilePath, {
        ...container,
        runtimeSettings: this.value
      });
    });
  }
}
