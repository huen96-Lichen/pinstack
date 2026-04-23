import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToggleSwitch } from '../../../../ToggleSwitch';
import type {
  AiDiagnosticsSnapshot,
  AiHealthResult,
  AiTestResult,
  AiRuntimeStatus,
  AppSettings,
  LocalModelSettingsStatus,
} from '../../../../../shared/types';
import {
  getAiModelById,
  mergeAiModelCatalog,
  type AiModelCatalogItem,
} from '../../../../../shared/ai/modelRegistry';
import {
  getAiConnectionLabel,
  getAiResponseModeLabel,
  DEFAULT_PERSONA_SLOTS,
} from '../../shared/dashboardUtils';
import {
  SettingsSection,
  SettingRow,
  selectClass,
} from './GeneralSettings';

type ModelPairTemplateId = 'fast_local' | 'balanced_output' | 'high_quality_writing';
type AiSettingsMode = 'basic' | 'expert';

type QuickStrategyMode = 'local_first' | 'balanced' | 'high_quality';
const BASIC_HINT_DISMISSED_KEY = 'pinstack.aiSettings.basicHint.dismissed';
const BASIC_PROGRESS_KEY = 'pinstack.aiSettings.basicProgress';

interface BasicProgressState {
  recommended: boolean;
  health: boolean;
  test: boolean;
}

const MODEL_PAIR_TEMPLATES: Array<{ id: ModelPairTemplateId; label: string; hint: string }> = [
  { id: 'fast_local', label: '极速本地', hint: '轻量本地模型，低延迟优先' },
  { id: 'balanced_output', label: '平衡产出', hint: '本地主力 + 云端备用' },
  { id: 'high_quality_writing', label: '高质量写作', hint: '云端优先，适合正式文稿' },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AiHubSettingsProps {
  localAppSettings: AppSettings;
  updateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
  localModelStatus: LocalModelSettingsStatus | null;
  aiRuntimeStatus: AiRuntimeStatus | null;
  aiHealthResult: AiHealthResult | null;
  aiTestResult: AiTestResult | null;
  aiModelCatalog: AiModelCatalogItem[];
  isLoadingLocalModelStatus: boolean;
  selectedLocalModel: string;
  setSelectedLocalModel: (id: string) => void;
  updateAiHubSettings: (patch: Partial<AppSettings['aiHub']>) => Promise<void>;
  refreshLocalModelStatus: () => Promise<void>;
  runAiHealthCheck: () => Promise<AiHealthResult | null>;
  runAiTest: () => Promise<AiTestResult | null>;
  applyLocalModelSelection: (modelId?: string) => Promise<void>;
  clearAiConversation: () => Promise<void>;
  getAiDiagnostics: () => Promise<AiDiagnosticsSnapshot | null>;
  migrateAiSecrets: () => Promise<boolean>;
  setStatusMessage: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AiHubSettings({
  localAppSettings,
  updateAppSettings,
  localModelStatus,
  aiRuntimeStatus,
  aiHealthResult,
  aiTestResult,
  aiModelCatalog,
  isLoadingLocalModelStatus,
  selectedLocalModel,
  setSelectedLocalModel,
  updateAiHubSettings,
  refreshLocalModelStatus,
  runAiHealthCheck,
  runAiTest,
  applyLocalModelSelection,
  clearAiConversation,
  getAiDiagnostics,
  migrateAiSecrets,
  setStatusMessage,
}: AiHubSettingsProps): JSX.Element {
  /* ---- derived state ---- */
  const vkSettings = localAppSettings.vaultkeeper ?? {
    enabled: false,
    autoStart: true,
    projectRoot: '',
    port: 3210,
    defaultAiEnhance: false,
    enableWhisperX: false,
    webpageMode: 'readable' as const,
  };
  const aiProvider = localAppSettings.aiHub.defaultProvider ?? 'local';
  const aiEntryVisibility = localAppSettings.aiHub.entryVisibility ?? 'enabled_only';
  const aiFirstSearch = localAppSettings.aiHub.aiFirstSearch ?? Boolean(localAppSettings.aiHub.enabled);
  const personaSlots =
    Array.isArray(localAppSettings.aiHub.personaSlots) && localAppSettings.aiHub.personaSlots.length > 0
      ? localAppSettings.aiHub.personaSlots
      : DEFAULT_PERSONA_SLOTS;

  const aiModelOptions = useMemo(
    () =>
      mergeAiModelCatalog(
        aiModelCatalog.map((item) => ({
          id: item.id,
          isInstalled: item.isInstalled,
          isConfigured: item.isConfigured,
          isAvailable: item.isAvailable,
          status: item.status,
          note: item.note,
          checkedAt: item.checkedAt,
        })),
        localAppSettings.aiHub.defaultModelId,
      ),
    [aiModelCatalog, localAppSettings.aiHub.defaultModelId],
  );

  const localModels = useMemo(
    () => aiModelOptions.filter((m) => m.channel === 'local'),
    [aiModelOptions],
  );
  const cloudModels = useMemo(
    () => aiModelOptions.filter((m) => m.channel === 'cloud'),
    [aiModelOptions],
  );
  const preferredLocalModelId =
    localAppSettings.aiHub.preferredLocalModelId ?? localModels[0]?.id ?? selectedLocalModel;
  const preferredCloudModelId =
    localAppSettings.aiHub.preferredCloudModelId ??
    localAppSettings.aiHub.cloudModelId ??
    cloudModels[0]?.id ??
    'cloud:mock';
  const [pairTemplateBusy, setPairTemplateBusy] = useState(false);
  const [settingsMode, setSettingsMode] = useState<AiSettingsMode>('basic');
  const [showBasicAdvanced, setShowBasicAdvanced] = useState(false);
  const [showBasicHint, setShowBasicHint] = useState(false);
  const [basicProgress, setBasicProgress] = useState<BasicProgressState>({
    recommended: false,
    health: false,
    test: false,
  });

  const ollamaConnected = aiRuntimeStatus?.connectionState === 'connected';

  useEffect(() => {
    if (settingsMode !== 'basic') {
      return;
    }
    const dismissed = localStorage.getItem(BASIC_HINT_DISMISSED_KEY) === '1';
    setShowBasicHint(!dismissed);

    try {
      const raw = localStorage.getItem(BASIC_PROGRESS_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<BasicProgressState>;
      setBasicProgress({
        recommended: Boolean(parsed.recommended),
        health: Boolean(parsed.health),
        test: Boolean(parsed.test),
      });
    } catch {
      setBasicProgress({ recommended: false, health: false, test: false });
    }
  }, [settingsMode]);

  useEffect(() => {
    if (aiHealthResult?.ok && !basicProgress.health) {
      const next = { ...basicProgress, health: true };
      setBasicProgress(next);
      localStorage.setItem(BASIC_PROGRESS_KEY, JSON.stringify(next));
    }
  }, [aiHealthResult, basicProgress]);

  useEffect(() => {
    if (aiTestResult?.ok && !basicProgress.test) {
      const next = { ...basicProgress, test: true };
      setBasicProgress(next);
      localStorage.setItem(BASIC_PROGRESS_KEY, JSON.stringify(next));
    }
  }, [aiTestResult, basicProgress]);

  /* ---- cloud form state ---- */
  const [cloudProvider, setCloudProvider] = useState<string>(
    localAppSettings.aiHub.cloudProvider ?? 'openai',
  );
  const [cloudApiKey, setCloudApiKey] = useState<string>(
    localAppSettings.aiHub.cloudApiKey ?? '',
  );
  const [cloudBaseUrl, setCloudBaseUrl] = useState<string>(
    localAppSettings.aiHub.cloudBaseUrl ?? '',
  );
  const [cloudModelId, setCloudModelId] = useState<string>(
    localAppSettings.aiHub.cloudModelId ?? '',
  );
  const [showCloudAdvanced, setShowCloudAdvanced] = useState<boolean>(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudSaved, setCloudSaved] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [aiDiagnostics, setAiDiagnostics] = useState<AiDiagnosticsSnapshot | null>(null);

  const handleSaveCloud = async () => {
    setCloudSaving(true);
    try {
      await updateAiHubSettings({
        cloudProvider,
        cloudApiKey,
        cloudBaseUrl,
        cloudModelId,
      });
      setCloudSaved(true);
      setTimeout(() => setCloudSaved(false), 2000);
    } catch {
      setStatusMessage('云端配置保存失败');
    } finally {
      setCloudSaving(false);
    }
  };

  const refreshDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const snapshot = await getAiDiagnostics();
      setAiDiagnostics(snapshot);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const handleSelectLocalModel = (modelId: string) => {
    setSelectedLocalModel(modelId);
    void applyLocalModelSelection(modelId);
  };

  const applyModelPairTemplate = async (templateId: ModelPairTemplateId) => {
    if (pairTemplateBusy) {
      return;
    }
    setPairTemplateBusy(true);
    try {
      const findLocal = (...keywords: string[]) =>
        localModels.find((model) =>
          keywords.some(
            (keyword) =>
              model.id.toLowerCase().includes(keyword) ||
              model.displayName.toLowerCase().includes(keyword),
          ),
        )?.id;
      const resolvedCloud =
        cloudModels.find((model) => model.isConfigured || model.isAvailable)?.id ??
        cloudModels[0]?.id ??
        preferredCloudModelId;
      const resolvedFastLocal = findLocal('e4b', 'gemma4') ?? preferredLocalModelId;
      const resolvedBalancedLocal =
        findLocal('qwen', 'gemma3:12b', 'gemma 3 12b') ?? preferredLocalModelId;

      if (templateId === 'fast_local') {
        await updateAiHubSettings({
          preferredLocalModelId: resolvedFastLocal,
          preferredCloudModelId: resolvedCloud,
          defaultProvider: 'local',
          defaultModelId: resolvedFastLocal,
          allowFallback: false,
        });
        setSelectedLocalModel(resolvedFastLocal);
        setStatusMessage('已应用模板：极速本地');
        return;
      }

      if (templateId === 'balanced_output') {
        await updateAiHubSettings({
          preferredLocalModelId: resolvedBalancedLocal,
          preferredCloudModelId: resolvedCloud,
          defaultProvider: 'local',
          defaultModelId: resolvedBalancedLocal,
          allowFallback: true,
        });
        setSelectedLocalModel(resolvedBalancedLocal);
        setStatusMessage('已应用模板：平衡产出');
        return;
      }

      await updateAiHubSettings({
        preferredLocalModelId: resolvedBalancedLocal,
        preferredCloudModelId: resolvedCloud,
        defaultProvider: 'cloud',
        defaultModelId: resolvedCloud,
        allowFallback: true,
      });
      setStatusMessage('已应用模板：高质量写作');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `模板应用失败：${error.message}` : '模板应用失败');
    } finally {
      setPairTemplateBusy(false);
    }
  };

  const applyQuickStrategy = async (strategy: QuickStrategyMode) => {
    try {
      if (strategy === 'local_first') {
        await updateAiHubSettings({
          preferredLocalModelId,
          preferredCloudModelId,
          defaultProvider: 'local',
          defaultModelId: preferredLocalModelId,
          allowFallback: false,
        });
        setSelectedLocalModel(preferredLocalModelId);
        setStatusMessage('已应用策略：本地优先');
        return;
      }

      if (strategy === 'balanced') {
        await updateAiHubSettings({
          preferredLocalModelId,
          preferredCloudModelId,
          defaultProvider: 'local',
          defaultModelId: preferredLocalModelId,
          allowFallback: true,
        });
        setSelectedLocalModel(preferredLocalModelId);
        setStatusMessage('已应用策略：平衡模式');
        return;
      }

      await updateAiHubSettings({
        preferredLocalModelId,
        preferredCloudModelId,
        defaultProvider: 'cloud',
        defaultModelId: preferredCloudModelId,
        allowFallback: true,
      });
      setStatusMessage('已应用策略：高质量模式');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `策略应用失败：${error.message}` : '策略应用失败');
    }
  };

  const saveQuickModelPair = async (patch: Partial<AppSettings['aiHub']>) => {
    try {
      await updateAiHubSettings(patch);
      setStatusMessage('模型搭配已保存。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `保存模型搭配失败：${error.message}` : '保存模型搭配失败');
    }
  };

  const dismissBasicHint = () => {
    localStorage.setItem(BASIC_HINT_DISMISSED_KEY, '1');
    setShowBasicHint(false);
  };

  const updateBasicProgress = (patch: Partial<BasicProgressState>) => {
    const next = { ...basicProgress, ...patch };
    setBasicProgress(next);
    localStorage.setItem(BASIC_PROGRESS_KEY, JSON.stringify(next));
  };

  const runBasicHealthCheck = async () => {
    const result = await runAiHealthCheck();
    if (result?.ok) {
      updateBasicProgress({ health: true });
    }
  };

  const runBasicTest = async () => {
    const result = await runAiTest();
    if (result?.ok) {
      updateBasicProgress({ test: true });
    }
  };

  /* ---- render ---- */
  return (
    <>
      <div className="settings-mode-switcher mb-4">
        <div>
          <div className="text-[13px] font-semibold text-[color:var(--ps-text-primary)]">
            {settingsMode === 'basic' ? '基础模式' : '专家模式'}
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--ps-text-tertiary)]">
            {settingsMode === 'basic'
              ? '只保留高频操作，适合日常使用'
              : '显示完整 AI 配置与高级参数'}
          </div>
        </div>
        <div className="pinstack-segmented flex items-center gap-1 p-1">
          <button
            type="button"
            onClick={() => setSettingsMode('basic')}
            className={`pinstack-segmented-item motion-button h-7 px-3 text-[12px] ${settingsMode === 'basic' ? 'is-active' : ''}`}
          >
            基础
          </button>
          <button
            type="button"
            onClick={() => setSettingsMode('expert')}
            className={`pinstack-segmented-item motion-button h-7 px-3 text-[12px] ${settingsMode === 'expert' ? 'is-active' : ''}`}
          >
            专家
          </button>
        </div>
      </div>

      <SettingsSection title="VaultKeeper">
        <SettingRow title="默认 AI 增强" description="新建 VK 任务时默认启用 AI 摘要/重排。">
          <ToggleSwitch
            checked={Boolean(vkSettings.defaultAiEnhance)}
            onChange={(value) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  defaultAiEnhance: value,
                },
              })
            }
          />
        </SettingRow>
        <SettingRow title="启用 WhisperX 增强" description="用于词级时间戳和更细粒度转写（可选增强）。">
          <ToggleSwitch
            checked={Boolean(vkSettings.enableWhisperX)}
            onChange={(value) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  enableWhisperX: value,
                },
              })
            }
          />
        </SettingRow>
        <SettingRow title="网页提取模式" description="readable 为正文优先，fuller 为结构保留优先。">
          <select
            value={vkSettings.webpageMode ?? 'readable'}
            onChange={(event) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  webpageMode: event.target.value as 'readable' | 'fuller',
                },
              })
            }
            className={`${selectClass} pinstack-field-select`}
          >
            <option value="readable">readable</option>
            <option value="fuller">fuller</option>
          </select>
        </SettingRow>
        <SettingRow title="草稿目录" description="VK draft 输出默认路径。">
          <input
            value={vkSettings.draftDir ?? ''}
            placeholder="留空使用默认"
            onChange={(event) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  draftDir: event.target.value,
                },
              })
            }
            className={`${selectClass} min-w-[260px]`}
          />
        </SettingRow>
        <SettingRow title="未归纳目录" description="VK inbox 输出默认路径。">
          <input
            value={vkSettings.inboxDir ?? ''}
            placeholder="留空使用默认"
            onChange={(event) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  inboxDir: event.target.value,
                },
              })
            }
            className={`${selectClass} min-w-[260px]`}
          />
        </SettingRow>
        <SettingRow title="资料库目录" description="VK library 输出默认路径。">
          <input
            value={vkSettings.libraryDir ?? ''}
            placeholder="留空使用默认"
            onChange={(event) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  libraryDir: event.target.value,
                },
              })
            }
            className={`${selectClass} min-w-[260px]`}
          />
        </SettingRow>
        <SettingRow title="附件目录" description="处理过程中生成的附件输出目录。">
          <input
            value={vkSettings.attachmentsDir ?? ''}
            placeholder="留空使用默认"
            onChange={(event) =>
              void updateAppSettings({
                vaultkeeper: {
                  ...vkSettings,
                  attachmentsDir: event.target.value,
                },
              })
            }
            className={`${selectClass} min-w-[260px]`}
          />
        </SettingRow>
      </SettingsSection>

      {settingsMode === 'basic' ? (
        <>
          <SettingsSection title="快速上手">
            <div className="space-y-3">
              <div className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-4 text-[12px] text-[color:var(--ps-text-secondary)] backdrop-blur-sm">
                {([basicProgress.recommended, basicProgress.health, basicProgress.test].filter(Boolean).length === 3) ? (
                  <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                    <div className="text-[12px] font-semibold text-emerald-800">AI 已就绪，可开始处理任务</div>
                    <div className="mt-0.5 text-[11px] text-emerald-700">你可以直接进入 AI 管家中心发起整理、摘要和文稿任务。</div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(new CustomEvent('pinstack-open-ai-hub', { detail: { taskId: 'organize-current' } }))
                        }
                        className="pinstack-btn pinstack-btn-secondary motion-button mr-2 h-7 px-2.5 text-[11px]"
                      >
                        立即整理当前卡片
                      </button>
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('pinstack-open-ai-hub'))}
                        className="pinstack-btn motion-button h-7 px-2.5 text-[11px] bg-emerald-600 text-white"
                      >
                        进入 AI 任务区
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mb-3 rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[color:var(--ps-text-primary)]">上手进度</span>
                    <span>{[basicProgress.recommended, basicProgress.health, basicProgress.test].filter(Boolean).length}/3</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-black/10">
                    <div
                      className="h-1.5 rounded-full bg-[color:var(--ps-brand-primary)] transition-all"
                      style={{
                        width: `${([basicProgress.recommended, basicProgress.health, basicProgress.test].filter(Boolean).length / 3) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-[color:var(--ps-text-tertiary)]">
                    <span className={basicProgress.recommended ? 'text-emerald-700' : ''}>1 推荐配置</span>
                    <span className={basicProgress.health ? 'text-emerald-700' : ''}>2 健康检查</span>
                    <span className={basicProgress.test ? 'text-emerald-700' : ''}>3 测试调用</span>
                  </div>
                </div>
                <div className="text-[14px] font-semibold text-[color:var(--ps-text-primary)]">推荐配置（30 秒）</div>
                <div className="mt-1 text-[11px] text-[color:var(--ps-text-tertiary)]">
                  先用平衡产出模板，通常最稳。后续你再按场景切到本地优先或高质量。
                </div>

                <button
                  type="button"
                  onClick={() => {
                    dismissBasicHint();
                    updateBasicProgress({ recommended: true });
                    void applyModelPairTemplate('balanced_output');
                  }}
                  disabled={pairTemplateBusy}
                  className="pinstack-btn motion-button mt-3 h-9 w-full bg-[color:var(--ps-brand-primary)] text-[12px] font-medium text-white disabled:opacity-55"
                >
                  {pairTemplateBusy ? '应用中...' : '一键应用推荐配置'}
                </button>
                {showBasicHint ? (
                  <div className="mt-2 rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-2.5 py-2 text-[11px] text-[color:var(--ps-text-secondary)]">
                    <div className="font-medium text-[color:var(--ps-text-primary)]">建议先点一次主按钮</div>
                    <div className="mt-0.5">这会自动设置模型搭配与策略，通常就能直接开始用。</div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={dismissBasicHint}
                        className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[11px]"
                      >
                        知道了
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void applyQuickStrategy('local_first')}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2 text-[11px]"
                  >
                    切到本地优先
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyQuickStrategy('high_quality')}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2 text-[11px]"
                  >
                    切到高质量
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-[color:var(--ps-text-secondary)]">
                  当前：{aiProvider === 'local' ? '本地优先' : '云端优先'} · 本地 {preferredLocalModelId} · 云端 {preferredCloudModelId}
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-semibold text-[color:var(--ps-text-primary)]">连通性检查</div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--ps-text-tertiary)]">
                      建议首次配置后运行一次。
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void runBasicHealthCheck()}
                      disabled={isLoadingLocalModelStatus}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px] disabled:opacity-55"
                    >
                      健康检查
                    </button>
                    <button
                      type="button"
                      onClick={() => void runBasicTest()}
                      disabled={isLoadingLocalModelStatus}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px] disabled:opacity-55"
                    >
                      测试调用
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setShowBasicAdvanced((prev) => !prev)}
                  className="pinstack-btn pinstack-btn-secondary motion-button h-8 w-full px-3 text-[11px]"
                >
                  {showBasicAdvanced ? '收起高级快配' : '展开高级快配'}
                </button>

                <AnimatePresence initial={false}>
                  {showBasicAdvanced ? (
                    <motion.div
                      key="basic-advanced"
                      initial={{ opacity: 0, height: 0, y: -4 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3 space-y-3 overflow-hidden"
                    >
                      <div>
                        <div className="text-[11px] font-medium text-[color:var(--ps-text-primary)]">模型模板</div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {MODEL_PAIR_TEMPLATES.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              title={template.hint}
                              onClick={() => void applyModelPairTemplate(template.id)}
                              disabled={pairTemplateBusy}
                              className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2 text-[11px] disabled:opacity-55"
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[color:var(--ps-text-secondary)]">
                            首选本地模型
                          </label>
                          <select
                            value={preferredLocalModelId}
                            onChange={(event) => {
                              const nextModelId = event.target.value;
                              setSelectedLocalModel(nextModelId);
                              void saveQuickModelPair({ preferredLocalModelId: nextModelId, defaultModelId: nextModelId });
                            }}
                            className={`${selectClass} pinstack-field-select`}
                          >
                            {localModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.displayName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[color:var(--ps-text-secondary)]">
                            首选云端模型
                          </label>
                          <select
                            value={preferredCloudModelId}
                            onChange={(event) =>
                              void saveQuickModelPair({ preferredCloudModelId: event.target.value, cloudModelId: event.target.value })
                            }
                            className={`${selectClass} pinstack-field-select`}
                          >
                            {cloudModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.displayName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="运行状态与诊断">
            <div className="pinstack-section-panel space-y-2 px-3 py-3 text-[12px] text-[color:var(--ps-text-secondary)]">
              <div className="grid grid-cols-1 gap-1.5 text-[11px] md:grid-cols-2">
                <div className="flex items-center justify-between gap-2">
                  <span>默认模型</span>
                  <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                    {aiRuntimeStatus?.selectedModelLabel ??
                      getAiModelById(selectedLocalModel)?.displayName ??
                      selectedLocalModel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>连接状态</span>
                  <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                    {getAiConnectionLabel(aiRuntimeStatus)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>响应模式</span>
                  <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                    {getAiResponseModeLabel(aiRuntimeStatus)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>本地连接</span>
                  <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                    {ollamaConnected ? '已连接' : '未连接'}
                  </span>
                </div>
              </div>

              {aiHealthResult ? (
                <div
                  className={`rounded border px-2.5 py-2 text-[11px] ${
                    aiHealthResult.ok
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                      : 'border-amber-200 bg-amber-50/60 text-amber-800'
                  }`}
                >
                  健康检查：{aiHealthResult.ok ? '成功' : '失败'} · {aiHealthResult.message}
                  {typeof aiHealthResult.latencyMs === 'number' ? ` · ${aiHealthResult.latencyMs}ms` : ''}
                </div>
              ) : null}
              {aiTestResult ? (
                <div
                  className={`rounded border px-2.5 py-2 text-[11px] ${
                    aiTestResult.ok
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                      : 'border-amber-200 bg-amber-50/60 text-amber-800'
                  }`}
                >
                  测试调用：{aiTestResult.ok ? '成功' : '失败'}
                  {typeof aiTestResult.latencyMs === 'number' ? ` · ${aiTestResult.latencyMs}ms` : ''}
                  <div className="mt-1">
                    {aiTestResult.ok ? aiTestResult.text : aiTestResult.errorMessage}
                  </div>
                </div>
              ) : null}
            </div>
          </SettingsSection>
        </>
      ) : null}

      {settingsMode === 'expert' ? (
        <>
          <SettingsSection title="AI 助手">
            <div data-ai-hub-section className="space-y-3">
              <SettingRow title="启用 AI 助手" description="关闭后不会触发 AI 整理能力，仅保留已有数据与配置。">
                <ToggleSwitch
                  checked={localAppSettings.aiHub.enabled}
                  onChange={(value) => void updateAiHubSettings({ enabled: value })}
                />
              </SettingRow>
              <SettingRow title="入口显示策略" description="AI 助手入口在控制面板中的显示方式。">
                <select
                  value={aiEntryVisibility}
                  onChange={(event) =>
                    void updateAiHubSettings({
                      entryVisibility: event.target.value as AppSettings['aiHub']['entryVisibility'],
                    })
                  }
                  className={`${selectClass} pinstack-field-select`}
                >
                  <option value="enabled_only">仅启用 AI 时显示</option>
                  <option value="always">始终显示</option>
                  <option value="hidden">隐藏</option>
                </select>
              </SettingRow>
              <SettingRow title="AI处理（需确认）" description="AI 处理前需手动确认，适合隐私敏感场景。">
                <ToggleSwitch
                  checked={localAppSettings.aiHub.suggestionOnly}
                  onChange={(value) => void updateAiHubSettings({ suggestionOnly: value })}
                />
              </SettingRow>
              <SettingRow title="AI 优先搜索" description="搜索优先使用 AI 结果。">
                <ToggleSwitch
                  checked={aiFirstSearch}
                  onChange={(value) => void updateAiHubSettings({ aiFirstSearch: value })}
                />
              </SettingRow>
              <SettingRow title="异常时显示降级提示" description="AI 异常时显示降级提示。">
                <ToggleSwitch
                  checked={localAppSettings.aiHub.allowFallback}
                  onChange={(value) => void updateAiHubSettings({ allowFallback: value })}
                />
              </SettingRow>
              <SettingRow title="仅整理未手改标题" description="仅整理未手改标题的记录。">
                <ToggleSwitch
                  checked={localAppSettings.aiHub.processOnlyUntitled}
                  onChange={(value) => void updateAiHubSettings({ processOnlyUntitled: value })}
                />
              </SettingRow>
              <SettingRow title="允许处理图片收藏" description="允许处理已收藏的图片记录。">
                <ToggleSwitch
                  checked={localAppSettings.aiHub.processImages}
                  onChange={(value) => void updateAiHubSettings({ processImages: value })}
                />
              </SettingRow>
              <SettingRow title="命名模板" description="AI 命名模板，{content} 替换为实际内容。">
                <select
                  value={localAppSettings.aiHub.namingTemplate}
                  onChange={(event) =>
                    void updateAiHubSettings({
                      namingTemplate: event.target.value as AppSettings['aiHub']['namingTemplate'],
                    })
                  }
                  className={`${selectClass} pinstack-field-select`}
                >
                  <option value="category_title_keyword_source">AI 标题</option>
                  <option value="category_source_title">AI 标题 + 来源</option>
                </select>
              </SettingRow>
              <SettingRow title="整理排序策略" description="AI 整理记录的排序策略。">
                <select
                  value={localAppSettings.aiHub.sortStrategy}
                  onChange={(event) =>
                    void updateAiHubSettings({
                      sortStrategy: event.target.value as AppSettings['aiHub']['sortStrategy'],
                    })
                  }
                  className={`${selectClass} pinstack-field-select`}
                >
                  <option value="category_then_time">按分类后时间</option>
                  <option value="source_then_time">按来源后时间</option>
                </select>
              </SettingRow>
              <div className="rounded border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-2.5 py-2">
                <div className="mb-1 text-[11px] font-medium text-[color:var(--ps-text-primary)]">
                  Persona / 规则注入（最多 3 条）
                </div>
                <div className="space-y-2">
                  {personaSlots.slice(0, 3).map((slot, idx) => (
                    <div
                      key={slot.id}
                      className="flex items-start justify-between gap-2 rounded border border-[color:var(--ps-border-subtle)] bg-white/50 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-[color:var(--ps-text-primary)]">
                          规则 {idx + 1}：{slot.title}
                        </div>
                        <div className="text-[10px] text-[color:var(--ps-text-tertiary)]">{slot.templateId}</div>
                      </div>
                      <ToggleSwitch
                        checked={slot.enabled}
                        onChange={(value) => {
                          const nextSlots = personaSlots.map((item) =>
                            item.id === slot.id ? { ...item, enabled: value } : item,
                          );
                          void updateAiHubSettings({ personaSlots: nextSlots });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="本地 AI">
            <div className="space-y-3">
              <div className="pinstack-section-panel px-3 py-3 text-[12px] text-[color:var(--ps-text-secondary)]">
                本地 AI 是当前默认的真实执行路径。你可以在这里查看本地 AI 是否可用、切换默认模型、检查状态，并清空当前对话会话。
              </div>

              <div className="pinstack-section-panel space-y-2 px-3 py-3 text-[12px] text-[color:var(--ps-text-secondary)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-medium text-[color:var(--ps-text-primary)]">本地 AI 状态</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runAiHealthCheck()}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px]"
                      disabled={isLoadingLocalModelStatus}
                    >
                      重新检测
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAiTest()}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px]"
                      disabled={isLoadingLocalModelStatus}
                    >
                      测试调用
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearAiConversation()}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px]"
                    >
                      清空会话
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshLocalModelStatus()}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px]"
                      disabled={isLoadingLocalModelStatus}
                    >
                      {isLoadingLocalModelStatus ? '检查中...' : '检查可用性'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1.5 text-[11px] md:grid-cols-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>本地 AI</span>
                    <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                      {localModelStatus?.enabled ? '已启用' : '未启用'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>默认模型</span>
                    <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                      {aiRuntimeStatus?.selectedModelLabel ??
                        getAiModelById(selectedLocalModel)?.displayName ??
                        selectedLocalModel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>连接状态</span>
                    <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                      {getAiConnectionLabel(aiRuntimeStatus)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>响应模式</span>
                    <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                      {getAiResponseModeLabel(aiRuntimeStatus)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>模型状态</span>
                    <span className="pinstack-badge px-2 py-1 text-[10px] text-black/72">
                      {localModelStatus?.modelStatus === 'installed'
                        ? '已安装'
                        : localModelStatus?.modelStatus === 'missing'
                          ? '未安装'
                          : '待检查'}
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-[11px] text-[color:var(--ps-text-tertiary)]">
                  最近检查：
                  {localModelStatus?.checkedAt
                    ? new Date(localModelStatus.checkedAt).toLocaleString()
                    : '尚未检查'}
                </div>

                {aiRuntimeStatus?.responseMode === 'degraded' ? (
                  <div className="rounded border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] text-amber-800">
                    {aiRuntimeStatus.message}
                  </div>
                ) : null}
                {localModelStatus?.lastError ? (
                  <div className="rounded border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] text-amber-800">
                    最近错误：{aiRuntimeStatus?.message ?? localModelStatus.lastError.message}
                  </div>
                ) : null}
                {aiHealthResult ? (
                  <div
                    className={`rounded border px-2.5 py-2 text-[11px] ${
                      aiHealthResult.ok
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                        : 'border-amber-200 bg-amber-50/60 text-amber-800'
                    }`}
                  >
                    健康检查：{aiHealthResult.ok ? '成功' : '失败'} · {aiHealthResult.message}
                    {typeof aiHealthResult.latencyMs === 'number' ? ` · ${aiHealthResult.latencyMs}ms` : ''}
                  </div>
                ) : null}
                {aiTestResult ? (
                  <div
                    className={`rounded border px-2.5 py-2 text-[11px] ${
                      aiTestResult.ok
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                        : 'border-amber-200 bg-amber-50/60 text-amber-800'
                    }`}
                  >
                    测试调用：{aiTestResult.ok ? '成功' : '失败'}
                    {typeof aiTestResult.latencyMs === 'number' ? ` · ${aiTestResult.latencyMs}ms` : ''}
                    <div className="mt-1">
                      {aiTestResult.ok ? aiTestResult.text : aiTestResult.errorMessage}
                    </div>
                  </div>
                ) : null}

                <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">
                  说明：自动重命名不会覆盖手动标题；去重仅建议；摘要并行执行，不阻塞主流程。
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="模型选择">
            <div className="mb-3 rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3 backdrop-blur-sm">
              <div className="text-[12px] font-semibold text-[color:var(--ps-text-primary)]">模型搭配模板（全局默认）</div>
              <div className="mt-1 text-[11px] text-[color:var(--ps-text-tertiary)]">
                选择模板会同时更新首选本地模型、首选云端模型和默认策略。
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {MODEL_PAIR_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    title={template.hint}
                    onClick={() => void applyModelPairTemplate(template.id)}
                    disabled={pairTemplateBusy}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2 text-[11px] disabled:opacity-55"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-[color:var(--ps-text-secondary)]">
                当前首选：本地 {preferredLocalModelId} · 云端 {preferredCloudModelId}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 backdrop-blur-sm p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[color:var(--ps-text-primary)]">
                    本地模型
                  </span>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      ollamaConnected ? 'bg-emerald-500' : 'bg-red-400'
                    }`}
                    title={ollamaConnected ? 'Ollama 已连接' : 'Ollama 未连接'}
                  />
                </div>

                <div className="space-y-2">
                  {localModels.map((model) => {
                    const selected = model.id === selectedLocalModel;
                    return (
                      <motion.button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelectLocalModel(model.id)}
                        whileHover={{ scale: 1.01, y: -1 }}
                        className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? 'border-black bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]'
                            : 'border-[color:var(--ps-border-subtle)] bg-white/60 hover:border-black/20 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-[color:var(--ps-text-primary)]">
                              {model.displayName}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[color:var(--ps-text-secondary)]">
                              {model.userFacingRoleLabel}
                            </div>
                          </div>
                          {selected ? (
                            <span className="pinstack-badge px-2 py-0.5 text-[10px]">已选中</span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="pinstack-badge px-2 py-0.5 text-[10px]">local</span>
                          <span
                            className={`pinstack-badge px-2 py-0.5 text-[10px] ${
                              model.isAvailable
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : model.status === 'unavailable'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : ''
                            }`}
                          >
                            {model.userFacingStatusLabel}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void refreshLocalModelStatus()}
                    disabled={isLoadingLocalModelStatus}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-8 w-full px-3 text-[11px]"
                  >
                    {isLoadingLocalModelStatus ? '检测中...' : '重新检测'}
                  </button>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 backdrop-blur-sm p-4"
              >
                <div className="mb-1 text-[13px] font-semibold text-[color:var(--ps-text-primary)]">
                  云端大模型
                </div>
                <div className="mb-4 text-[11px] text-[color:var(--ps-text-tertiary)]">
                  本地性能不足时，通过云端 API 补充。默认收纳为高级配置，减少主流程干扰。
                </div>

                <div className="space-y-2">
                  <div className="rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-2.5 py-2 text-[11px] text-[color:var(--ps-text-secondary)]">
                    <div>当前 Provider：{cloudProvider || '未设置'}</div>
                    <div className="mt-0.5">当前 Model：{cloudModelId || '未设置'}</div>
                    <div className="mt-0.5">API Key：{cloudApiKey.trim() ? '已设置' : '未设置'}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCloudAdvanced((value) => !value)}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-8 w-full px-3 text-[11px]"
                  >
                    {showCloudAdvanced ? '收起高级配置' : '展开高级配置'}
                  </button>

                  <AnimatePresence initial={false}>
                    {showCloudAdvanced ? (
                      <motion.div
                        key="cloud-advanced"
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3 overflow-hidden"
                      >
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[color:var(--ps-text-secondary)]">
                            Provider
                          </label>
                          <select
                            value={cloudProvider}
                            onChange={(e) => setCloudProvider(e.target.value)}
                            className="pinstack-field motion-interactive h-9 w-full px-3 text-[12px]"
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="custom">自定义</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[color:var(--ps-text-secondary)]">
                            API Key
                          </label>
                          <input
                            type="password"
                            value={cloudApiKey}
                            onChange={(e) => setCloudApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="pinstack-field motion-interactive h-9 w-full px-3 text-[12px]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[color:var(--ps-text-secondary)]">
                            Base URL
                          </label>
                          <input
                            type="text"
                            value={cloudBaseUrl}
                            onChange={(e) => setCloudBaseUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="pinstack-field motion-interactive h-9 w-full px-3 text-[12px]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[color:var(--ps-text-secondary)]">
                            Model ID
                          </label>
                          <input
                            type="text"
                            value={cloudModelId}
                            onChange={(e) => setCloudModelId(e.target.value)}
                            placeholder="gpt-4.1-mini"
                            className="pinstack-field motion-interactive h-9 w-full px-3 text-[12px]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleSaveCloud()}
                          disabled={cloudSaving}
                          className="pinstack-btn motion-button h-9 w-full bg-[color:var(--ps-brand-primary)] text-white text-[12px] font-medium"
                        >
                          {cloudSaving ? '保存中...' : '保存配置'}
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <AnimatePresence>
                    {cloudSaved ? (
                      <motion.div
                        key="cloud-saved"
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden rounded border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] text-emerald-700"
                      >
                        配置已保存
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void migrateAiSecrets()}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2 text-[11px]"
                    >
                      迁移密钥到钥匙串
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshDiagnostics()}
                      disabled={diagnosticsLoading}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2 text-[11px] disabled:opacity-55"
                    >
                      {diagnosticsLoading ? '读取中...' : '刷新诊断快照'}
                    </button>
                  </div>

                  {aiDiagnostics ? (
                    <div className="rounded border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-2.5 py-2 text-[11px] text-[color:var(--ps-text-secondary)]">
                      <div>Provider：{aiDiagnostics.provider}</div>
                      <div>Model：{aiDiagnostics.model}</div>
                      <div>Timeout：{aiDiagnostics.timeoutMs}ms</div>
                      <div>Fallback：{aiDiagnostics.fallbackReason ?? 'none'}</div>
                      <div>LastErrorCode：{aiDiagnostics.lastErrorCode ?? 'none'}</div>
                      <div>RequestId：{aiDiagnostics.requestId ?? 'n/a'}</div>
                    </div>
                  ) : null}

                  <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">
                    API Key 使用 macOS 钥匙串管理，不会写入设置文件。
                  </div>
                </div>
              </motion.div>
            </div>
          </SettingsSection>
        </>
      ) : null}
    </>
  );
}
