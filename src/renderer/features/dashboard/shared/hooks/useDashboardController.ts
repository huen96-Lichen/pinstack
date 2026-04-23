import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiRuntimeStatus,
  AppSettings,
  DashboardRecordTab,
  RecordItem,
} from '../../../../../shared/types';
import { stripSystemSuggestionTags } from '../../../../../shared/classificationSuggestion';
import type { DashboardControllerResult, DashboardRecordItem } from '../dashboard.types';
import { isFavoriteRecord } from '../favoriteTag';
import { buildRecommendations } from '../recommendation';
import { filterDashboardRecords, getRecordUseCase, getSizePresetLabel } from '../dashboard.selectors';
import { getAiModelById, type AiModelCatalogItem } from '../../../../../shared/ai/modelRegistry';
import { normalizeText } from '../dashboardUtils';
import { useDomClasses } from '../../../../shared/useDomClasses';
import { useDashboardSettings } from './useDashboardSettings';
import { useDashboardPermissions } from './useDashboardPermissions';
import { useDashboardRecords } from './useDashboardRecords';
import { useDashboardSelection } from './useDashboardSelection';
import { useDashboardRecordActions } from './useDashboardRecordActions';
import { useDashboardTopBar } from './useDashboardTopBar';

function parseLocalDateTime(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function useImagePreviewMap(records: RecordItem[]): Record<string, string> {
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const loadedIdsRef = useRef<Set<string>>(new Set());

  const imageRecords = useMemo(() => records.filter((item) => item.type === 'image'), [records]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      for (const item of imageRecords) {
        if (loadedIdsRef.current.has(item.id)) {
          continue;
        }

        loadedIdsRef.current.add(item.id);
        try {
          const content = await window.pinStack.records.getContent(item.id);
          if (!cancelled && content.type === 'image') {
            setPreviewMap((prev) => ({
              ...prev,
              [item.id]: content.dataUrl
            }));
          }
        } catch {
          // Keep card visible even when preview loading fails.
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [imageRecords]);

  useEffect(() => {
    const validIds = new Set(records.map((item) => item.id));
    setPreviewMap((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [id, src] of Object.entries(prev)) {
        if (validIds.has(id)) {
          next[id] = src;
        } else {
          loadedIdsRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [records]);

  return previewMap;
}

export function useDashboardController(): DashboardControllerResult {
  const [searchText, setSearchText] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'text' | 'image'>('all');
  const [tagsFilter, setTagsFilter] = useState('');
  const [isPinBehaviorCustom, setIsPinBehaviorCustom] = useState(false);
  const [primaryNav, setPrimaryNav] = useState<'all' | 'text' | 'images' | 'favorites' | 'ai' | 'vaultkeeper' | 'cutout' | 'settings'>('all');
  const [activeTab, setActiveTab] = useState<DashboardRecordTab>('all');
  const [cleanupRangeStart, setCleanupRangeStart] = useState('');
  const [cleanupRangeEnd, setCleanupRangeEnd] = useState('');
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  useDomClasses();

  const { appSettings, runtimeSettings, syncRuntimeSettings, refreshSettings, isHydrated } = useDashboardSettings();
  const { permissionStatus, loadPermissionStatus } = useDashboardPermissions();
  const { records, isLoading } = useDashboardRecords();
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<AiRuntimeStatus | null>(null);
  const [aiModelCatalog, setAiModelCatalog] = useState<AiModelCatalogItem[]>([]);
  const [aiSwitching, setAiSwitching] = useState(false);
  const selection = useDashboardSelection(records);
  const topBar = useDashboardTopBar(runtimeSettings, syncRuntimeSettings);
  const recordActions = useDashboardRecordActions(selection.setSelectedIds);
  const hasAppliedInitialDefaultViewRef = useRef(false);

  const refreshAiRuntime = useCallback(async () => {
    try {
      const [runtime, catalog] = await Promise.all([window.pinStack.ai.getRuntimeStatus(), window.pinStack.ai.listModels()]);
      setAiRuntimeStatus(runtime);
      setAiModelCatalog(catalog);
    } catch {
      // keep previous runtime snapshot
    }
  }, []);

  useEffect(() => {
    setIsPinBehaviorCustom(runtimeSettings.pinBehaviorMode === 'custom');
  }, [runtimeSettings.pinBehaviorMode]);

  const resetFiltersForNavigation = useCallback(() => {
    setSearchText('');
    setSourceFilter('');
    setTypeFilter('all');
    setTagsFilter('');
  }, []);

  const isAiNavVisible =
    appSettings.aiHub.entryVisibility === 'always' ||
    (appSettings.aiHub.entryVisibility === 'enabled_only' && appSettings.aiHub.enabled);

  const applyDefaultDashboardView = useCallback(
    (defaultView: AppSettings['defaultDashboardView']) => {
      setActiveTab('all');
      resetFiltersForNavigation();
      const nextDefault = defaultView === 'ai' && !isAiNavVisible ? 'all' : defaultView;
      setPrimaryNav(nextDefault === 'ai' ? 'ai' : nextDefault);
    },
    [isAiNavVisible, resetFiltersForNavigation]
  );

  const onPrimaryNavChange = useCallback(
    (tab: 'all' | 'text' | 'images' | 'favorites' | 'ai' | 'vaultkeeper' | 'cutout' | 'settings') => {
      if (tab === 'ai' && !isAiNavVisible) {
        setPrimaryNav('all');
      } else {
        setPrimaryNav(tab);
      }
      setActiveTab('all');
      resetFiltersForNavigation();
    },
    [isAiNavVisible, resetFiltersForNavigation]
  );

  const onUseCaseTabChange = useCallback(
    (tab: DashboardRecordTab) => {
      if (!isAiNavVisible) {
        return;
      }
      setPrimaryNav('ai');
      setActiveTab(tab);
      resetFiltersForNavigation();
    },
    [isAiNavVisible, resetFiltersForNavigation]
  );

  useEffect(() => {
    if (!isHydrated || hasAppliedInitialDefaultViewRef.current) {
      return;
    }

    applyDefaultDashboardView(appSettings.defaultDashboardView);
    hasAppliedInitialDefaultViewRef.current = true;
  }, [appSettings.defaultDashboardView, applyDefaultDashboardView, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    void refreshAiRuntime();
  }, [isHydrated, refreshAiRuntime, appSettings.aiHub.defaultProvider, appSettings.aiHub.defaultModelId, appSettings.aiHub.enabled]);

  const onSwitchAiModel = useCallback(
    async (provider: 'local' | 'cloud', modelId: string) => {
      const model = aiModelCatalog.find((item) => item.id === modelId) ?? getAiModelById(modelId);
      if (!model) {
        throw new Error('未找到可用模型');
      }
      if (model.channel !== provider) {
        throw new Error('所选模型与提供方不匹配');
      }

      setAiSwitching(true);
      try {
        await window.pinStack.settings.set({
          aiHub: {
            ...appSettings.aiHub,
            defaultProvider: provider,
            defaultModelId: modelId
          }
        });

        if (provider === 'local' && model.provider === 'ollama' && model.channel === 'local') {
          await window.pinStack.settings.localModel.setModel(modelId);
        }

        await Promise.all([refreshSettings(), refreshAiRuntime()]);
      } finally {
        setAiSwitching(false);
      }
    },
    [aiModelCatalog, appSettings.aiHub, refreshAiRuntime, refreshSettings]
  );

  useEffect(() => {
    const unsubscribe = window.pinStack.dashboard.onShown(() => {
      applyDefaultDashboardView(appSettings.defaultDashboardView);
    });

    return unsubscribe;
  }, [appSettings.defaultDashboardView, applyDefaultDashboardView]);

  useEffect(() => {
    if (!isAiNavVisible && primaryNav === 'ai') {
      setPrimaryNav('all');
      setActiveTab('all');
    }
  }, [isAiNavVisible, primaryNav]);

  const layeredRecords = useMemo(() => {
    const normalizedSource = normalizeText(sourceFilter);
    const tagTokens = tagsFilter
      .split(',')
      .map((token) => normalizeText(token))
      .filter(Boolean);

    const effectiveTypeFilter: 'all' | 'text' | 'image' =
      primaryNav === 'text' ? 'text' : primaryNav === 'images' ? 'image' : typeFilter;

    return records.filter((item) => {
      if (
        effectiveTypeFilter !== 'all' &&
        !(
          (effectiveTypeFilter === 'image' && (item.type === 'image' || item.type === 'video')) ||
          item.type === effectiveTypeFilter
        )
      ) {
        return false;
      }

      if (primaryNav === 'favorites' && !isFavoriteRecord(item)) {
        return false;
      }

      if (primaryNav === 'ai' && activeTab !== 'all' && getRecordUseCase(item) !== activeTab) {
        return false;
      }

      if (normalizedSource) {
        const sourceText = normalizeText(`${item.sourceApp ?? ''} ${item.source}`);
        if (!sourceText.includes(normalizedSource)) {
          return false;
        }
      }

      if (tagTokens.length > 0) {
        const recordTags = stripSystemSuggestionTags(item.tags).map((tag) => normalizeText(tag));
        const matched = tagTokens.every((token) => recordTags.some((tag) => tag.includes(token)));
        if (!matched) {
          return false;
        }
      }

      return true;
    });
  }, [records, primaryNav, activeTab, sourceFilter, typeFilter, tagsFilter]);

  const filteredRecords = useMemo(
    () => filterDashboardRecords(layeredRecords, 'all', searchText),
    [layeredRecords, searchText]
  );
  const cleanupStartTs = useMemo(() => parseLocalDateTime(cleanupRangeStart), [cleanupRangeStart]);
  const cleanupEndTs = useMemo(() => parseLocalDateTime(cleanupRangeEnd), [cleanupRangeEnd]);
  const cleanupValidationMessage = useMemo(() => {
    if (!cleanupRangeStart.trim() && !cleanupRangeEnd.trim()) {
      return '请至少设置一个时间边界。';
    }

    if (cleanupStartTs !== null && cleanupEndTs !== null && cleanupStartTs > cleanupEndTs) {
      return '开始时间不能晚于结束时间。';
    }

    return null;
  }, [cleanupEndTs, cleanupRangeEnd, cleanupRangeStart, cleanupStartTs]);
  const cleanupCandidateIds = useMemo(() => {
    if (cleanupValidationMessage) {
      return [];
    }

    return filteredRecords
      .filter((item) => {
        if (cleanupStartTs !== null && item.createdAt < cleanupStartTs) {
          return false;
        }
        if (cleanupEndTs !== null && item.createdAt > cleanupEndTs) {
          return false;
        }
        return true;
      })
      .map((item) => item.id);
  }, [cleanupEndTs, cleanupStartTs, cleanupValidationMessage, filteredRecords]);
  const recommendations = useMemo(
    () => buildRecommendations({ records, limit: 10 }),
    [records]
  );
  const relatedRecommendations = useMemo(() => {
    if (!searchText.trim()) {
      return [];
    }
    const related = buildRecommendations({
      records,
      query: searchText,
      limit: 10,
      relatedOnly: true
    });
    if (related.length > 0) {
      return related;
    }
    return buildRecommendations({
      records,
      query: searchText,
      limit: 10
    });
  }, [records, searchText]);

  const imagePreviewMap = useImagePreviewMap(records);

  const onExecuteCleanup = useCallback(async () => {
    if (cleanupBusy || cleanupValidationMessage || cleanupCandidateIds.length === 0) {
      return;
    }
    if (cleanupConfirmText.trim() !== 'DELETE') {
      return;
    }

    setCleanupBusy(true);
    try {
      const result = await window.pinStack.records.bulkDelete(cleanupCandidateIds);
      if (result.failed.length > 0) {
        window.alert(`批量清理完成，失败 ${result.failed.length} 条。`);
      }
      setCleanupConfirmText('');
      setCleanupDialogOpen(false);
    } finally {
      setCleanupBusy(false);
    }
  }, [cleanupBusy, cleanupCandidateIds, cleanupConfirmText, cleanupValidationMessage]);

  const viewProps = {
    records,
    filteredRecords,
    recommendations,
    relatedRecommendations,
    imagePreviewMap,
    appSettings,
    runtimeSettings,
    permissionStatus,
    isLoading,
    keyword: searchText,
    sourceFilter,
    typeFilter,
    tagsFilter,
    isPinBehaviorCustom,
    primaryNav,
    activeTab,
    selectedIds: selection.selectedIds,
    sidebarCollapsed: topBar.sidebarCollapsed,
    dashboardPinned: topBar.dashboardPinned,
    bulkBusy: selection.bulkBusy,
    sizePresetLabel: getSizePresetLabel(runtimeSettings.dashboardSizePreset),
    onRefreshPermissionStatus: loadPermissionStatus,
    topBar: {
      onToggleSidebar: topBar.onToggleSidebar,
      onCycleSizePreset: topBar.onCycleSizePreset,
      onToggleDashboardPinned: topBar.onToggleDashboardPinned,
      onMinimizeDashboard: topBar.onMinimizeDashboard,
      onHideDashboard: topBar.onHideDashboard
    },
    filters: {
      onSearchChange: setSearchText,
      onSourceFilterChange: setSourceFilter,
      onTypeFilterChange: setTypeFilter,
      onTagsFilterChange: setTagsFilter,
      onPrimaryNavChange,
      onUseCaseTabChange,
      onModeChipChange: async (next: 'auto' | 'custom' | 'off') => {
        if (next === 'auto') {
          setIsPinBehaviorCustom(false);
          await syncRuntimeSettings({
            mode: 'auto',
            pinBehaviorMode: 'auto',
            enableImagePin: true,
            enableTextPin: true
          });
          return;
        }

        if (next === 'off') {
          setIsPinBehaviorCustom(false);
          await syncRuntimeSettings({
            mode: 'off',
            pinBehaviorMode: 'off',
            enableImagePin: false,
            enableTextPin: false
          });
          return;
        }

        setIsPinBehaviorCustom(true);
        await syncRuntimeSettings({
          mode: 'auto',
          pinBehaviorMode: 'custom'
        });
      },
      onToggleImagePin: async (value: boolean) => {
        setIsPinBehaviorCustom(true);
        await syncRuntimeSettings({ enableImagePin: value, pinBehaviorMode: 'custom', mode: 'auto' });
      },
      onToggleTextPin: async (value: boolean) => {
        setIsPinBehaviorCustom(true);
        await syncRuntimeSettings({ enableTextPin: value, pinBehaviorMode: 'custom', mode: 'auto' });
      },
      onToggleFlowPin: async (value: boolean) => {
        await syncRuntimeSettings({ enableFlowPin: value });
      }
    },
    cleanup: {
      rangeStart: cleanupRangeStart,
      rangeEnd: cleanupRangeEnd,
      confirmText: cleanupConfirmText,
      busy: cleanupBusy,
      open: cleanupDialogOpen,
      matchCount: cleanupCandidateIds.length,
      validationMessage: cleanupValidationMessage,
      onOpen: () => setCleanupDialogOpen(true),
      onClose: () => {
        setCleanupDialogOpen(false);
        setCleanupConfirmText('');
      },
      onRangeStartChange: setCleanupRangeStart,
      onRangeEndChange: setCleanupRangeEnd,
      onConfirmTextChange: setCleanupConfirmText,
      onExecute: onExecuteCleanup
    },
    selection: {
      onSelectRecord: selection.onSelectRecord,
      onClearSelection: selection.onClearSelection,
      onBulkCreateFlow: selection.onBulkCreateFlow,
      onBulkDelete: selection.onBulkDelete,
      onBulkPin: selection.onBulkPin,
      onBulkSetUseCase: selection.onBulkSetUseCase,
      onBulkAddTags: selection.onBulkAddTags,
      onBulkRemoveTags: selection.onBulkRemoveTags
    },
    recordActions,
    ai: {
      runtimeStatus: aiRuntimeStatus,
      modelCatalog: aiModelCatalog,
      switching: aiSwitching,
      onSwitchModel: onSwitchAiModel,
      onRefreshRuntime: refreshAiRuntime
    }
  };

  return {
    viewProps
  };
}
