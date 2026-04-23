import { useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardViewProps } from '../shared/dashboard.types';
import { FilterBar } from './topbar/FilterBar';
import { Toolbar } from './topbar/Toolbar';

interface ModernTopBarProps {
  view: DashboardViewProps;
}

type CompactLevel = 'full' | 'compact' | 'dense';
type ModeChipState = 'auto' | 'custom' | 'off';
type StatusChipState = 'normal' | 'permission_required';

type FilterChip = {
  key: 'source' | 'type' | 'tags';
  label: string;
  onRemove: () => void;
};

type PermissionSummaryKey = 'screenCapture' | 'accessibility' | 'automationDependency';

const COMPACT_BREAKPOINT = 980;
const DENSE_BREAKPOINT = 820;

function resolveCompactLevel(width: number): CompactLevel {
  if (width <= DENSE_BREAKPOINT) {
    return 'dense';
  }

  if (width <= COMPACT_BREAKPOINT) {
    return 'compact';
  }

  return 'full';
}

function getTypeLabel(typeFilter: DashboardViewProps['typeFilter']): string {
  return typeFilter === 'text' ? '文本' : '图片 / 录屏';
}

function resolveModeChipState(view: DashboardViewProps): ModeChipState {
  if (view.runtimeSettings.pinBehaviorMode === 'off' || view.runtimeSettings.mode === 'off' || view.runtimeSettings.mode === 'silent') {
    return 'off';
  }
  return view.runtimeSettings.pinBehaviorMode === 'custom' ? 'custom' : 'auto';
}

function resolveStatusChipState(view: DashboardViewProps): StatusChipState {
  if (view.permissionStatus?.hasBlockingIssues) {
    return 'permission_required';
  }

  return 'normal';
}

export function ModernTopBar({ view }: ModernTopBarProps): JSX.Element {
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [topBarWidth, setTopBarWidth] = useState(0);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const aiIntentTimerRef = useRef<number | null>(null);

  const compactLevel = useMemo(() => resolveCompactLevel(topBarWidth), [topBarWidth]);
  const showPinOnTopLabel = topBarWidth > 760;
  const isTypeManagedByPrimary = view.primaryNav === 'text' || view.primaryNav === 'images';
  const modeChipState = useMemo(() => resolveModeChipState(view), [view]);
  const statusChipState = useMemo(() => resolveStatusChipState(view), [view]);
  const pinBehaviorLocked = modeChipState !== 'custom';
  const permissionIssueItems = useMemo(
    () => (view.permissionStatus?.items ?? []).filter((item) => item.blocking),
    [view.permissionStatus]
  );
  const permissionSummaryItems = useMemo(() => {
    const keys: PermissionSummaryKey[] = ['screenCapture', 'accessibility', 'automationDependency'];
    return keys
      .map((key) => view.permissionStatus?.items.find((item) => item.key === key) ?? null)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [view.permissionStatus]);

  useEffect(() => {
    const node = topBarRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setTopBarWidth(entry.contentRect.width);
    });

    observer.observe(node);
    setTopBarWidth(node.getBoundingClientRect().width);

    return () => {
      observer.disconnect();
    };
  }, []);

  const chips = useMemo<FilterChip[]>(() => {
    const ordered: FilterChip[] = [];

    if (view.sourceFilter.trim()) {
      ordered.push({
        key: 'source',
        label: `来源：${view.sourceFilter.trim()}`,
        onRemove: () => view.filters.onSourceFilterChange('')
      });
    }

    if (!isTypeManagedByPrimary && view.typeFilter !== 'all') {
      ordered.push({
        key: 'type',
        label: `类型：${getTypeLabel(view.typeFilter)}`,
        onRemove: () => view.filters.onTypeFilterChange('all')
      });
    }

    if (view.tagsFilter.trim()) {
      ordered.push({
        key: 'tags',
        label: `标签：${view.tagsFilter.trim()}`,
        onRemove: () => view.filters.onTagsFilterChange('')
      });
    }

    return ordered;
  }, [isTypeManagedByPrimary, view.filters, view.sourceFilter, view.tagsFilter, view.typeFilter]);

  const clearAllChips = () => {
    view.filters.onSourceFilterChange('');
    view.filters.onTypeFilterChange('all');
    view.filters.onTagsFilterChange('');
  };

  const handleSearchInput = (value: string) => {
    view.filters.onSearchChange(value);

    if (!view.appSettings.aiHub.enabled || !view.appSettings.aiHub.aiFirstSearch) {
      return;
    }

    if (aiIntentTimerRef.current) {
      window.clearTimeout(aiIntentTimerRef.current);
      aiIntentTimerRef.current = null;
    }

    aiIntentTimerRef.current = window.setTimeout(async () => {
      try {
        const intent = await window.pinStack.ai.inferSearchIntent(value);
        if (intent.suggestedSource) {
          view.filters.onSourceFilterChange(intent.suggestedSource);
        }
        if (intent.suggestedType && intent.suggestedType !== 'all') {
          view.filters.onTypeFilterChange(intent.suggestedType);
        }
        if (intent.suggestedTags && intent.suggestedTags.length > 0) {
          view.filters.onTagsFilterChange(intent.suggestedTags.join(','));
        }
      } catch {
        // keep manual search flow
      }
    }, 280);
  };

  return (
    <header className="relative space-y-2">
      <Toolbar
        view={view}
        topBarWidth={topBarWidth}
        compactLevel={compactLevel}
        showPinOnTopLabel={showPinOnTopLabel}
        modeChipState={modeChipState}
        statusChipState={statusChipState}
        pinBehaviorLocked={pinBehaviorLocked}
        permissionIssueItems={permissionIssueItems}
        permissionSummaryItems={permissionSummaryItems}
        onToggleSidebar={view.topBar.onToggleSidebar}
        onCycleSizePreset={view.topBar.onCycleSizePreset}
        onToggleDashboardPinned={view.topBar.onToggleDashboardPinned}
        onHideDashboard={view.topBar.onHideDashboard}
        onMinimizeDashboard={view.topBar.onMinimizeDashboard}
        onRefreshPermissionStatus={view.onRefreshPermissionStatus}
        onSearchInput={handleSearchInput}
        topBarRef={topBarRef}
      />

      <FilterBar
        view={view}
        isFilterExpanded={isFilterExpanded}
        onToggleFilterExpanded={() => setIsFilterExpanded((prev) => !prev)}
        chips={chips}
        onClearAllChips={clearAllChips}
        isTypeManagedByPrimary={isTypeManagedByPrimary}
      />
    </header>
  );
}
