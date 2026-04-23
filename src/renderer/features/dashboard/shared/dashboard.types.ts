import type {
  AiRuntimeStatus,
  AppSettings,
  DashboardRecordTab,
  DashboardSizePreset,
  PermissionStatusSnapshot,
  RecordMetaPatch,
  RecordItem,
  RuntimeMode,
  RuntimeSettings,
  RecordUseCase
} from '../../../../shared/types';
import type { RecommendationItem, RecommendationReason } from './recommendation';
import type { AiModelCatalogItem } from '../../../../shared/ai/modelRegistry';

export type DashboardPrimaryNav = 'all' | 'text' | 'images' | 'favorites' | 'ai' | 'vaultkeeper' | 'cutout' | 'settings';
export type DashboardContentSubtype = 'code' | 'command' | 'error' | 'plain';

export type DashboardRecordItem = RecordItem & {
  contentSubtype?: DashboardContentSubtype;
};

export type DashboardRecommendationItem = RecommendationItem<DashboardRecordItem> & {
  reason: RecommendationReason;
};

export interface DashboardRecordActions {
  onCreateFavoriteTextRecord: (input: { title?: string; text: string; sourceApp?: string | null }) => Promise<RecordItem>;
  onCopyRecord: (recordId: string, mode?: 'normal' | 'optimized') => Promise<void>;
  onTouchRecord: (recordId: string) => Promise<void>;
  onDeleteRecord: (recordId: string) => Promise<void>;
  onRepinRecord: (recordId: string) => Promise<void>;
  onOcrRecord: (recordId: string) => Promise<void>;
  onOpenRecord: (recordId: string) => Promise<void>;
  onRenameRecord: (recordId: string, displayName: string) => Promise<void>;
  onUpdateRecordText: (recordId: string, text: string) => Promise<void>;
  onUpdateRecordMeta: (recordId: string, patch: RecordMetaPatch) => Promise<void>;
  onToggleFavoriteRecord: (recordId: string, favorite: boolean) => Promise<void>;
  onSendToVaultKeeper: (recordId: string) => Promise<unknown>;
}

export interface DashboardTopBarActions {
  onToggleSidebar: () => void;
  onCycleSizePreset: () => Promise<void>;
  onToggleDashboardPinned: () => Promise<void>;
  onMinimizeDashboard: () => Promise<void>;
  onHideDashboard: () => Promise<void>;
}

export interface DashboardSelectionActions {
  onSelectRecord: (recordId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onBulkCreateFlow: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onBulkPin: () => Promise<void>;
  onBulkSetUseCase: (useCase: RecordUseCase) => Promise<void>;
  onBulkAddTags: (tags: string[]) => Promise<void>;
  onBulkRemoveTags: (tags: string[]) => Promise<void>;
}

export interface DashboardFilterActions {
  onSearchChange: (next: string) => void;
  onSourceFilterChange: (next: string) => void;
  onTypeFilterChange: (next: 'all' | 'text' | 'image') => void;
  onTagsFilterChange: (next: string) => void;
  onPrimaryNavChange: (tab: DashboardPrimaryNav) => void;
  onUseCaseTabChange: (tab: DashboardRecordTab) => void;
  onModeChipChange: (next: 'auto' | 'custom' | 'off') => Promise<void>;
  onToggleImagePin: (value: boolean) => Promise<void>;
  onToggleTextPin: (value: boolean) => Promise<void>;
  onToggleFlowPin: (value: boolean) => Promise<void>;
}

export interface DashboardCleanupState {
  rangeStart: string;
  rangeEnd: string;
  confirmText: string;
  busy: boolean;
  open: boolean;
  matchCount: number;
  validationMessage: string | null;
}

export interface DashboardCleanupActions {
  onOpen: () => void;
  onClose: () => void;
  onRangeStartChange: (next: string) => void;
  onRangeEndChange: (next: string) => void;
  onConfirmTextChange: (next: string) => void;
  onExecute: () => Promise<void>;
}

export interface DashboardViewProps {
  records: DashboardRecordItem[];
  filteredRecords: DashboardRecordItem[];
  recommendations: DashboardRecommendationItem[];
  relatedRecommendations: DashboardRecommendationItem[];
  imagePreviewMap: Record<string, string>;
  appSettings: AppSettings;
  runtimeSettings: RuntimeSettings;
  permissionStatus: PermissionStatusSnapshot | null;
  isLoading: boolean;
  keyword: string;
  sourceFilter: string;
  typeFilter: 'all' | 'text' | 'image';
  tagsFilter: string;
  isPinBehaviorCustom: boolean;
  primaryNav: DashboardPrimaryNav;
  activeTab: DashboardRecordTab;
  selectedIds: string[];
  sidebarCollapsed: boolean;
  dashboardPinned: boolean;
  bulkBusy: 'delete' | 'pin' | 'meta' | 'flow' | null;
  sizePresetLabel: 'S' | 'M' | 'L';
  onRefreshPermissionStatus: () => Promise<void>;
  topBar: DashboardTopBarActions;
  filters: DashboardFilterActions;
  cleanup: DashboardCleanupState & DashboardCleanupActions;
  selection: DashboardSelectionActions;
  recordActions: DashboardRecordActions;
  ai: {
    runtimeStatus: AiRuntimeStatus | null;
    modelCatalog: AiModelCatalogItem[];
    switching: boolean;
    onSwitchModel: (provider: 'local' | 'cloud', modelId: string) => Promise<void>;
    onRefreshRuntime: () => Promise<void>;
  };
}

export interface DashboardControllerResult {
  viewProps: DashboardViewProps;
}

export type DashboardTab = DashboardRecordTab;
export type DashboardSize = DashboardSizePreset;
