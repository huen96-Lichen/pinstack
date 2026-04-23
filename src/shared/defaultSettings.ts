import type { AiHubSettings, AppSettings, RuntimeSettings } from './types';
import { getEnabledAiModels } from './ai/modelRegistry';

export const DEFAULT_STORAGE_ROOT_PLACEHOLDER = '~/PinStack';

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  mode: 'auto',
  pinBehaviorMode: 'auto',
  enableImagePin: true,
  enableTextPin: true,
  enableFlowPin: true,
  dashboardSizePreset: 'medium',
  uiMode: 'modern',
  dashboardAlwaysOnTop: true,
  enableCaptureLauncher: true,
  rememberCaptureRecentSizes: true,
  defaultCaptureSizePreset: 'recent',
  showStatusHints: true,
  captureRecentSizes: [],
  captureLauncherPosition: undefined,
  capsule: {
    enabled: true,
    surfaceMode: 'glass',
    anchorDisplayPolicy: 'active-display',
    hoverEnabled: true,
    animationPreset: 'smooth',
    expandedAutoCollapseMs: 2200,
    balancedEntryOrder: ['screenshot', 'ai', 'workspace'],
    displayTitle: 'PinStack',
    quickApps: [
      { id: 'wechat', name: '微信', icon: 'message.fill', appPath: '/Applications/WeChat.app', actionType: 'app', actionValue: '/Applications/WeChat.app' },
      { id: 'browser', name: '浏览器', icon: 'safari.fill', appPath: '', actionType: 'url', actionValue: 'https://google.com' },
      { id: 'terminal', name: '终端', icon: 'terminal.fill', appPath: '/System/Applications/Utilities/Terminal.app', actionType: 'app', actionValue: '/System/Applications/Utilities/Terminal.app' },
      { id: 'finder', name: '访达', icon: 'folder.fill', appPath: '/System/Library/CoreServices/Finder.app', actionType: 'app', actionValue: '/System/Library/CoreServices/Finder.app' },
      { id: 'notes', name: '备忘录', icon: 'note.text', appPath: '/System/Applications/Notes.app', actionType: 'app', actionValue: '/System/Applications/Notes.app' },
      { id: 'music', name: '音乐', icon: 'music.note', appPath: '/System/Applications/Music.app', actionType: 'app', actionValue: '/System/Applications/Music.app' },
      { id: 'settings', name: '系统设置', icon: 'gearshape.fill', appPath: '/System/Applications/System Settings.app', actionType: 'app', actionValue: '/System/Applications/System Settings.app' },
      { id: 'calculator', name: '计算器', icon: 'calculator', appPath: '/System/Applications/Calculator.app', actionType: 'app', actionValue: '/System/Applications/Calculator.app' },
    ],
    enabledModules: ['screenshot', 'ai', 'workspace'],
    showMusicContent: true,
    showQuickApps: true
  }
};

function createDefaultAiHubSettings(): AiHubSettings {
  const enabledModels = getEnabledAiModels();
  const defaultLocalModel = enabledModels.find((item) => item.channel === 'local')?.id ?? 'gemma4:e4b';
  const defaultCloudModel = enabledModels.find((item) => item.channel === 'cloud')?.id ?? 'cloud:mock';
  return {
    enabled: true,
    entryVisibility: 'enabled_only',
    defaultProvider: 'local',
    defaultModelId: defaultLocalModel,
    preferredLocalModelId: defaultLocalModel,
    preferredCloudModelId: defaultCloudModel,
    aiFirstSearch: true,
    suggestionOnly: true,
    allowFallback: true,
    processImages: false,
    processOnlyUntitled: true,
    namingTemplate: 'category_title_keyword_source',
    sortStrategy: 'category_then_time',
    personaSlots: [
      {
        id: 'persona_1',
        enabled: true,
        templateId: 'productivity-default',
        title: '默认效率助手',
        markdown: '# PinStack AI 助手\n你是整理助手，优先给出可执行、简洁、可回滚的建议。'
      },
      {
        id: 'persona_2',
        enabled: false,
        templateId: 'taxonomy-strict',
        title: '分类严格模式',
        markdown: '# 分类规则\n优先使用既有分类字典，不要发明新分类。'
      },
      {
        id: 'persona_3',
        enabled: false,
        templateId: 'naming-strict',
        title: '命名严格模式',
        markdown: '# 命名规则\n标题必须简短清晰，遵循命名模板，避免夸张措辞。'
      }
    ],
    categoryDictionary: ['产品', '设计', '开发', 'AI', '视频', '运营', '灵感', '待处理'],
    sourceDictionary: ['PinStack', '网页收藏', '手动录入', '会议整理', '外部导入']
  };
}

export function createDefaultAppSettings(options?: {
  storageRoot?: string;
  vaultkeeperProjectRoot?: string;
}): AppSettings {
  return {
    pollIntervalMs: 600,
    autoPin: true,
    storageRoot: options?.storageRoot ?? DEFAULT_STORAGE_ROOT_PLACEHOLDER,
    screenshotShortcut: 'CommandOrControl+Shift+1',
    dashboardShortcut: 'CommandOrControl+Shift+P',
    captureHubShortcut: 'CommandOrControl+Shift+2',
    modeToggleShortcut: 'CommandOrControl+Shift+M',
    trayOpenDashboardShortcut: 'CommandOrControl+Shift+D',
    trayCycleModeShortcut: 'CommandOrControl+Shift+R',
    trayQuitShortcut: 'CommandOrControl+Shift+Q',
    dashboardFocusOnShow: true,
    aiCloudEnabled: false,
    launchAtLogin: false,
    defaultDashboardView: 'all',
    defaultScreenshotFormat: 'png',
    scopeMode: 'global',
    scopedApps: [],
    aiHub: createDefaultAiHubSettings(),
    vaultkeeper: {
      enabled: false,
      autoStart: true,
      projectRoot: options?.vaultkeeperProjectRoot ?? '',
      port: 3210,
      defaultAiEnhance: false,
      enableWhisperX: false,
      webpageMode: 'readable',
      namingRule: '[source]_[title]_[date]',
      autoFrontmatter: true,
      autoTags: true,
      autoMarkdownlint: true
    }
  };
}
