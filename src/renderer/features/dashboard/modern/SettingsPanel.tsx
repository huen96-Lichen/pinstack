import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PinStackIconButton, PinStackIcon } from '../../../design-system/icons';
import { SectionHeader, SettingsNavItem } from '../../../design-system/primitives';
import type {
  AiDiagnosticsSnapshot,
  AiHealthResult,
  AiTestResult,
  AiRuntimeStatus,
  AppSettings,
  LocalModelSettingsStatus,
  PermissionStatusSnapshot,
  RuntimeSettings
} from '../../../../shared/types';
import {
  getEnabledAiModels,
  getAiModelById,
  mergeAiModelCatalog,
  type AiModelCatalogItem
} from '../../../../shared/ai/modelRegistry';
import { emitSettingsUpdated, DEFAULT_PERSONA_SLOTS } from '../shared/dashboardUtils';
import { GeneralSettings, SettingsSection, selectClass } from './settings/GeneralSettings';
import { AiHubSettings } from './settings/AiHubSettings';
import { ShortcutSettings } from './settings/ShortcutSettings';
import { CaptureSettings } from './settings/CaptureSettings';
import { NotchSettings } from './settings/NotchSettings';

interface SettingsPanelProps {
  appSettings: AppSettings;
  runtimeSettings: RuntimeSettings;
  onClose: () => void;
  mode?: 'general' | 'capture' | 'notch' | 'ai';
  embedded?: boolean;
}

function getLocalPreferredModelId(settings: AppSettings): string {
  const preferred = getAiModelById(settings.aiHub.defaultModelId);
  if (preferred?.channel === 'local') {
    return preferred.id;
  }
  return getEnabledAiModels().find((item) => item.channel === 'local')?.id ?? 'gemma4:e4b';
}

export function SettingsPanel({
  appSettings,
  runtimeSettings,
  onClose,
  mode = 'general',
  embedded = false
}: SettingsPanelProps): JSX.Element {
  const [settingsTab, setSettingsTab] = useState<'general' | 'capture' | 'notch' | 'ai'>(mode);
  const [searchQuery, setSearchQuery] = useState('');

  // Search: map keywords to tabs and auto-switch when a match is found
  const searchTabMap: Record<string, 'general' | 'capture' | 'notch' | 'ai'> = {
    // general
    '置顶': 'general', '启动': 'general', '窗口': 'general', '版本': 'general', '权限': 'general', '数据': 'general',
    // capture
    '捕获': 'capture', '截图': 'capture', '弹出': 'capture', '格式': 'capture', '尺寸': 'capture', '模式': 'capture',
    '图片': 'capture', '文本': 'capture', '状态': 'capture', '范围': 'capture', '应用': 'capture',
    // notch
    '菜单栏': 'notch', '胶囊': 'notch', '音乐': 'notch', '桌面': 'notch', '悬停': 'notch', '收起': 'notch',
    '快捷': 'notch', '动画': 'notch',
    // ai
    'ai': 'ai', '模型': 'ai', '本地': 'ai', '云端': 'ai', '健康': 'ai', '测试': 'ai', '密钥': 'ai',
    'vaultkeeper': 'ai', 'vk': 'ai', '整理': 'ai', '摘要': 'ai', '命名': 'ai', 'persona': 'ai',
  };

  const activeTab = useMemo(() => {
    if (!searchQuery.trim()) return settingsTab;
    const q = searchQuery.trim().toLowerCase();
    for (const [keyword, tab] of Object.entries(searchTabMap)) {
      if (q.includes(keyword) || keyword.includes(q)) return tab;
    }
    return settingsTab;
  }, [searchQuery, settingsTab]);

  const showGeneralSections = activeTab === 'general';
  const showCaptureSections = activeTab === 'capture';
  const showNotchSections = activeTab === 'notch';
  const showAiSections = activeTab === 'ai';
  const [localAppSettings, setLocalAppSettings] = useState(appSettings);
  const [localRuntimeSettings, setLocalRuntimeSettings] = useState(runtimeSettings);
  const [runningApps, setRunningApps] = useState<string[]>([]);
  const [selectedScopeApp, setSelectedScopeApp] = useState('');
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatusSnapshot | null>(null);
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelSettingsStatus | null>(null);
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<AiRuntimeStatus | null>(null);
  const [aiHealthResult, setAiHealthResult] = useState<AiHealthResult | null>(null);
  const [aiTestResult, setAiTestResult] = useState<AiTestResult | null>(null);
  const [aiModelCatalog, setAiModelCatalog] = useState<AiModelCatalogItem[]>(() => mergeAiModelCatalog([], appSettings.aiHub.defaultModelId));
  const [isLoadingLocalModelStatus, setIsLoadingLocalModelStatus] = useState(false);
  const [selectedLocalModel, setSelectedLocalModel] = useState<string>(getLocalPreferredModelId(appSettings));
  const [expandedInstallModelId, setExpandedInstallModelId] = useState<string | null>(null);

  useEffect(() => {
    setSettingsTab(mode);
  }, [mode]);

  useEffect(() => {
    setLocalAppSettings(appSettings);
    setSelectedLocalModel(getLocalPreferredModelId(appSettings));
    setExpandedInstallModelId(null);
    setAiModelCatalog((prev) =>
      prev.length > 0 ? mergeAiModelCatalog(
        prev.map((item) => ({
          id: item.id,
          isInstalled: item.isInstalled,
          isConfigured: item.isConfigured,
          isAvailable: item.isAvailable,
          status: item.status,
          note: item.note,
          checkedAt: item.checkedAt
        })),
        appSettings.aiHub.defaultModelId
      ) : mergeAiModelCatalog([], appSettings.aiHub.defaultModelId)
    );
  }, [appSettings]);

  useEffect(() => {
    setLocalRuntimeSettings(runtimeSettings);
  }, [runtimeSettings]);

  useEffect(() => {
    let cancelled = false;
    const loadApps = async () => {
      setIsLoadingApps(true);
      try {
        const apps = await window.pinStack.settings.listScopedApps();
        if (!cancelled) {
          setRunningApps(apps);
          setSelectedScopeApp((prev) => prev || apps[0] || '');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingApps(false);
        }
      }
    };

    void loadApps();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showAiSections) {
      return;
    }

    const handler = () => {
      const section = document.querySelector('[data-ai-hub-section]');
      if (section instanceof HTMLElement) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('pinstack-scroll-ai-hub', handler as EventListener);
    return () => {
      window.removeEventListener('pinstack-scroll-ai-hub', handler as EventListener);
    };
  }, [showAiSections]);

  useEffect(() => {
    if (!showAiSections) {
      return;
    }

    let cancelled = false;

    const loadLocalModelStatus = async (refreshPreflight: boolean) => {
      setIsLoadingLocalModelStatus(true);
      try {
        const [status, catalog, runtime] = await Promise.all([
          window.pinStack.settings.localModel.getStatus(refreshPreflight),
          window.pinStack.ai.listModels(),
          window.pinStack.ai.getRuntimeStatus()
        ]);
        if (!cancelled) {
          setLocalModelStatus(status);
          setAiModelCatalog(catalog);
          setAiRuntimeStatus(runtime);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? `本地模型状态读取失败：${error.message}` : '本地模型状态读取失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLocalModelStatus(false);
        }
      }
    };

    void loadLocalModelStatus(false);
    return () => {
      cancelled = true;
    };
  }, [showAiSections]);

  useEffect(() => {
    let cancelled = false;

    const loadPermissionStatus = async (source: 'renderer-query' | 'refresh') => {
      try {
        const snapshot = await window.pinStack.permissions.getStatus(source);
        if (!cancelled) {
          setPermissionStatus(snapshot);
        }
      } catch {
        if (!cancelled) {
          setPermissionStatus(null);
        }
      }
    };

    void loadPermissionStatus('renderer-query');
    const unsubscribe = window.pinStack.permissions.onStatusUpdated((snapshot) => {
      if (!cancelled) {
        setPermissionStatus(snapshot);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const scopeAppList = useMemo(() => [...localAppSettings.scopedApps].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')), [localAppSettings.scopedApps]);
  const availableScopeApps = useMemo(
    () =>
      runningApps
        .filter((appName) => !localAppSettings.scopedApps.includes(appName))
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [runningApps, localAppSettings.scopedApps]
  );
  const hasUnsavedChanges = useMemo(
    () =>
      JSON.stringify(localAppSettings) !== JSON.stringify(appSettings) ||
      JSON.stringify(localRuntimeSettings) !== JSON.stringify(runtimeSettings),
    [appSettings, localAppSettings, localRuntimeSettings, runtimeSettings]
  );

  useEffect(() => {
    setSelectedScopeApp((prev) => {
      if (availableScopeApps.length === 0) {
        return '';
      }
      if (prev && availableScopeApps.includes(prev)) {
        return prev;
      }
      return availableScopeApps[0] ?? '';
    });
  }, [availableScopeApps]);

  const updateAppSettings = async (patch: Partial<AppSettings>) => {
    setLocalAppSettings((prev) => ({
      ...prev,
      ...patch
    }));
  };

  const updateRuntimeSettings = async (patch: Partial<RuntimeSettings>) => {
    setLocalRuntimeSettings((prev) => ({
      ...prev,
      ...patch
    }));
  };

  const updateAiHubSettings = async (patch: Partial<AppSettings['aiHub']>) => {
    setLocalAppSettings((prev) => ({
      ...prev,
      aiHub: {
        ...prev.aiHub,
        ...patch
      }
    }));
  };

  const updateModePreset = async (nextMode: 'auto' | 'custom' | 'off') => {
    if (nextMode === 'auto') {
      await updateRuntimeSettings({
        mode: 'auto',
        pinBehaviorMode: 'auto',
        enableImagePin: true,
        enableTextPin: true
      });
      return;
    }

    if (nextMode === 'off') {
      await updateRuntimeSettings({
        mode: 'off',
        pinBehaviorMode: 'off',
        enableImagePin: false,
        enableTextPin: false
      });
      return;
    }

    await updateRuntimeSettings({
      mode: 'auto',
      pinBehaviorMode: 'custom'
    });
  };

  const addScopeApp = async () => {
    if (!selectedScopeApp.trim()) {
      return;
    }

    await updateAppSettings({
      scopedApps: [...new Set([...localAppSettings.scopedApps, selectedScopeApp.trim()])]
    });
  };

  const removeScopeApp = async (appName: string) => {
    await updateAppSettings({
      scopedApps: localAppSettings.scopedApps.filter((item) => item !== appName)
    });
  };

  const saveAllSettings = async () => {
    try {
      const [nextAppSettings, nextRuntimeSettings] = await Promise.all([
        window.pinStack.settings.set(localAppSettings),
        window.pinStack.settings.runtime.update(localRuntimeSettings)
      ]);
      setLocalAppSettings(nextAppSettings);
      setLocalRuntimeSettings(nextRuntimeSettings);
      emitSettingsUpdated();
      setStatusMessage('设置已保存并生效。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `保存设置失败：${error.message}` : '保存设置失败');
    }
  };

  const discardAllSettings = () => {
    setLocalAppSettings(appSettings);
    setLocalRuntimeSettings(runtimeSettings);
    setStatusMessage('已撤销未保存的更改。');
  };

  const openStorageRoot = async () => {
    await window.pinStack.settings.openStorageRoot();
    setStatusMessage('已尝试打开本地数据目录。');
  };

  const resetOnboarding = () => {
    localStorage.removeItem('pinstack.onboarding.completed');
    setStatusMessage('首次引导已重置，下次打开会再次显示。');
  };

  const refreshLocalModelStatus = async () => {
    setIsLoadingLocalModelStatus(true);
    try {
      const [status, catalog, runtime] = await Promise.all([
        window.pinStack.settings.localModel.getStatus(true),
        window.pinStack.ai.listModels(),
        window.pinStack.ai.getRuntimeStatus()
      ]);
      setLocalModelStatus(status);
      setAiModelCatalog(catalog);
      setAiRuntimeStatus(runtime);
      setStatusMessage('本地模型状态已刷新。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `刷新失败：${error.message}` : '刷新本地模型状态失败');
    } finally {
      setIsLoadingLocalModelStatus(false);
    }
  };

  const runAiHealthCheck = async (): Promise<AiHealthResult | null> => {
    setIsLoadingLocalModelStatus(true);
    try {
      const [result, status, catalog, runtime] = await Promise.all([
        window.pinStack.ai.healthCheck(),
        window.pinStack.settings.localModel.getStatus(true),
        window.pinStack.ai.listModels(),
        window.pinStack.ai.getRuntimeStatus()
      ]);
      setAiHealthResult(result);
      setLocalModelStatus(status);
      setAiModelCatalog(catalog);
      setAiRuntimeStatus(runtime);
      setStatusMessage(result.ok ? `健康检查成功：${result.message}` : `健康检查失败：${result.message}`);
      return result;
    } catch (error) {
      setStatusMessage(error instanceof Error ? `健康检查失败：${error.message}` : '健康检查失败');
      return null;
    } finally {
      setIsLoadingLocalModelStatus(false);
    }
  };

  const runAiTest = async (): Promise<AiTestResult | null> => {
    setIsLoadingLocalModelStatus(true);
    try {
      const [result, runtime] = await Promise.all([window.pinStack.ai.test(), window.pinStack.ai.getRuntimeStatus()]);
      setAiTestResult(result);
      setAiRuntimeStatus(runtime);
      setStatusMessage(result.ok ? '测试调用成功。' : `测试调用失败：${result.errorMessage ?? '未知错误'}`);
      return result;
    } catch (error) {
      setStatusMessage(error instanceof Error ? `测试调用失败：${error.message}` : '测试调用失败');
      return null;
    } finally {
      setIsLoadingLocalModelStatus(false);
    }
  };

  const applyLocalModelSelection = async (targetModelId?: string) => {
    const nextModelId = targetModelId ?? selectedLocalModel;
    try {
      await updateAiHubSettings({
        defaultProvider: 'local',
        defaultModelId: nextModelId,
        preferredLocalModelId: nextModelId
      });
      const model = getAiModelById(nextModelId);
      if (model?.provider === 'ollama' && model.channel === 'local') {
        const status = await window.pinStack.settings.localModel.setModel(nextModelId);
        setLocalModelStatus(status);
      }
      const [catalog, runtime] = await Promise.all([window.pinStack.ai.listModels(), window.pinStack.ai.getRuntimeStatus()]);
      setAiModelCatalog(catalog);
      setAiRuntimeStatus(runtime);
      setStatusMessage(`默认 AI 模型已切换为 ${nextModelId}。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? `模型切换失败：${error.message}` : '模型切换失败');
    }
  };

  const clearAiConversation = async () => {
    try {
      await window.pinStack.ai.clearChatSession();
      setStatusMessage('当前 AI 会话已清空。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `清空会话失败：${error.message}` : '清空会话失败');
    }
  };

  const getAiDiagnostics = async (): Promise<AiDiagnosticsSnapshot | null> => {
    try {
      return await window.pinStack.ai.getDiagnostics();
    } catch (error) {
      setStatusMessage(error instanceof Error ? `读取诊断失败：${error.message}` : '读取诊断失败');
      return null;
    }
  };

  const migrateAiSecrets = async (): Promise<boolean> => {
    try {
      const migrated = await window.pinStack.ai.migrateSecrets();
      if (migrated) {
        const next = await window.pinStack.settings.get();
        setLocalAppSettings(next);
        setStatusMessage('已迁移云端密钥到系统钥匙串，并清理设置明文字段。');
      } else {
        setStatusMessage('未发现需要迁移的云端明文密钥。');
      }
      return migrated;
    } catch (error) {
      setStatusMessage(error instanceof Error ? `密钥迁移失败：${error.message}` : '密钥迁移失败');
      return false;
    }
  };

  const toggleInstallGuide = (modelId: string) => {
    setExpandedInstallModelId((prev) => (prev === modelId ? null : modelId));
  };

  const copyInstallCommand = async (modelId: string) => {
    const command = `ollama pull ${modelId}`;
    try {
      await window.pinStack.capture.ignoreNextCopy();
      await navigator.clipboard.writeText(command);
      setStatusMessage(`安装命令已复制：${command}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? `复制安装命令失败：${error.message}` : '复制安装命令失败');
    }
  };

  const openInstallPage = async (modelId: string) => {
    const aiModelOptions = mergeAiModelCatalog(
      aiModelCatalog.map((item) => ({
        id: item.id,
        isInstalled: item.isInstalled,
        isConfigured: item.isConfigured,
        isAvailable: item.isAvailable,
        status: item.status,
        note: item.note,
        checkedAt: item.checkedAt
      })),
      localAppSettings.aiHub.defaultModelId
    );
    const model = aiModelOptions.find((item) => item.id === modelId) ?? getAiModelById(modelId);
    const targetUrl = model?.installUrl?.trim();
    if (!targetUrl) {
      setStatusMessage('当前模型暂未提供安装页面。');
      return;
    }
    try {
      await window.pinStack.settings.openExternalUrl(targetUrl);
      setStatusMessage(`已打开 ${model?.displayName ?? modelId} 的安装页面。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? `打开安装页面失败：${error.message}` : '打开安装页面失败');
    }
  };

  const openLocalAiInstallOverview = async () => {
    try {
      await window.pinStack.settings.openExternalUrl('https://ollama.com/download');
      setStatusMessage('已打开本地 AI 安装总说明页。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `打开安装总说明失败：${error.message}` : '打开安装总说明失败');
    }
  };

  const switchBackToLocalAi = async () => {
    const nextLocalModel = getLocalPreferredModelId(localAppSettings);
    setSelectedLocalModel(nextLocalModel);
    try {
      await updateAiHubSettings({
        defaultProvider: 'local',
        defaultModelId: nextLocalModel
      });
      const [status, catalog, runtime] = await Promise.all([
        window.pinStack.settings.localModel.getStatus(true),
        window.pinStack.ai.listModels(),
        window.pinStack.ai.getRuntimeStatus()
      ]);
      setLocalModelStatus(status);
      setAiModelCatalog(catalog);
      setAiRuntimeStatus(runtime);
      setStatusMessage('已切回本地 AI。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `切回本地 AI 失败：${error.message}` : '切回本地 AI 失败');
    }
  };

  return (
    <div className={embedded ? 'space-y-5' : 'motion-popover pinstack-subpanel w-[780px] max-w-[min(780px,calc(100vw-48px))] overflow-hidden'}>
      {!embedded ? (
        <div className="border-b border-[color:var(--ps-border-subtle)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <SectionHeader
              eyebrow="PinStack"
              title="设置"
              description="默认行为与偏好。"
              action={hasUnsavedChanges ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--ps-status-warning)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ps-status-warning)]" />
                  未保存
                </span>
              ) : undefined}
            />
            <PinStackIconButton icon="close" label="关闭设置" size="sm" tone="soft" onClick={onClose} />
          </div>
        </div>
      ) : null}

      <div className={embedded ? 'space-y-5' : 'flex max-h-[80vh] overflow-hidden'}>
        {/* ---- 左侧固定导航栏 ---- */}
        {!embedded && (
          <nav className="settings-sidebar-nav w-[200px] shrink-0 border-r border-[color:var(--ps-border-subtle)] overflow-y-auto px-3 py-4">
            <div className="space-y-1">
              <SettingsNavItem
                icon="settings"
                label="通用"
                active={activeTab === 'general'}
                onClick={() => { setSettingsTab('general'); setSearchQuery(''); }}
              />
              <SettingsNavItem
                icon="capture"
                label="捕获与弹出"
                active={activeTab === 'capture'}
                onClick={() => { setSettingsTab('capture'); setSearchQuery(''); }}
              />
              <SettingsNavItem
                icon="pin-top"
                label="菜单栏"
                active={activeTab === 'notch'}
                onClick={() => { setSettingsTab('notch'); setSearchQuery(''); }}
              />
              <SettingsNavItem
                icon="spark"
                label="AI 设置"
                active={activeTab === 'ai'}
                onClick={() => { setSettingsTab('ai'); setSearchQuery(''); }}
                badge="Beta"
              />
            </div>

            {/* 底部保存/取消区 */}
            <div className="mt-auto pt-4 border-t border-[color:var(--ps-border-subtle)]">
              <div className="text-[11px] text-[color:var(--ps-text-tertiary)] mb-2">
                {hasUnsavedChanges ? '有未保存的更改' : '所有更改已保存'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="pinstack-btn pinstack-btn-ghost motion-button h-8 flex-1 px-2 text-[12px]"
                  onClick={discardAllSettings}
                  disabled={!hasUnsavedChanges}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="pinstack-btn pinstack-btn-primary motion-button h-8 flex-1 px-2 text-[12px]"
                  onClick={() => void saveAllSettings()}
                  disabled={!hasUnsavedChanges}
                >
                  保存
                </button>
              </div>
            </div>
          </nav>
        )}

        {/* ---- 右侧内容区（独立滚动） ---- */}
        <div className={embedded ? 'space-y-5' : 'min-w-0 flex-1 overflow-y-auto px-6 py-5'}>
          {/* 搜索栏 */}
          {!embedded && (
            <div className="relative mb-4">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ps-text-tertiary)]">
                <PinStackIcon name="search" size={14} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索设置..."
                className="settings-search-input w-full"
              />
            </div>
          )}

          <AnimatePresence mode="wait">
            {showGeneralSections && (
              <motion.div
                key="general"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <GeneralSettings
                  localAppSettings={localAppSettings}
                  localRuntimeSettings={localRuntimeSettings}
                  setLocalRuntimeSettings={setLocalRuntimeSettings}
                  updateAppSettings={updateAppSettings}
                  updateRuntimeSettings={updateRuntimeSettings}
                  openStorageRoot={openStorageRoot}
                  resetOnboarding={resetOnboarding}
                  permissionStatus={permissionStatus}
                  appVersion=""
                  embedded={embedded}
                  onClose={onClose}
                />
                <ShortcutSettings
                  localAppSettings={localAppSettings}
                  setLocalAppSettings={setLocalAppSettings}
                  setStatusMessage={setStatusMessage}
                />
              </motion.div>
            )}

            {showCaptureSections && (
              <motion.div
                key="capture"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <CaptureSettings
                  localAppSettings={localAppSettings}
                  localRuntimeSettings={localRuntimeSettings}
                  setLocalRuntimeSettings={setLocalRuntimeSettings}
                  updateAppSettings={updateAppSettings}
                  updateRuntimeSettings={updateRuntimeSettings}
                  updateModePreset={updateModePreset}
                  runningApps={runningApps}
                  isLoadingApps={isLoadingApps}
                  selectedScopeApp={selectedScopeApp}
                  setSelectedScopeApp={setSelectedScopeApp}
                  addScopeApp={addScopeApp}
                  removeScopeApp={removeScopeApp}
                />
              </motion.div>
            )}

            {showNotchSections && (
              <motion.div
                key="notch"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <NotchSettings
                  localRuntimeSettings={localRuntimeSettings}
                  updateRuntimeSettings={updateRuntimeSettings}
                />
              </motion.div>
            )}

            {showAiSections && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <AiHubSettings
                  localAppSettings={localAppSettings}
                  updateAppSettings={updateAppSettings}
                  localModelStatus={localModelStatus}
                  aiRuntimeStatus={aiRuntimeStatus}
                  aiHealthResult={aiHealthResult}
                  aiTestResult={aiTestResult}
                  aiModelCatalog={aiModelCatalog}
                  isLoadingLocalModelStatus={isLoadingLocalModelStatus}
                  selectedLocalModel={selectedLocalModel}
                  setSelectedLocalModel={setSelectedLocalModel}
                  updateAiHubSettings={updateAiHubSettings}
                  refreshLocalModelStatus={refreshLocalModelStatus}
                  runAiHealthCheck={runAiHealthCheck}
                  runAiTest={runAiTest}
                  applyLocalModelSelection={applyLocalModelSelection}
                  clearAiConversation={clearAiConversation}
                  getAiDiagnostics={getAiDiagnostics}
                  migrateAiSecrets={migrateAiSecrets}
                  setStatusMessage={setStatusMessage}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {statusMessage ? (
            <div className="pinstack-section-panel px-3 py-2 text-[12px] text-[color:var(--ps-text-secondary)]">
              {statusMessage}
            </div>
          ) : null}
        </div>
      </div>

    </div>
  );
}
