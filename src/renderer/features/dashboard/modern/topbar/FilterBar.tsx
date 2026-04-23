import type { CSSProperties } from 'react';
import { ToggleSwitch } from '../../../../ToggleSwitch';
import { PinStackIcon } from '../../../../design-system/icons';
import type { DashboardViewProps } from '../../shared/dashboard.types';

interface FilterBarProps {
  view: DashboardViewProps;
  isFilterExpanded: boolean;
  onToggleFilterExpanded: () => void;
  chips: Array<{
    key: 'source' | 'type' | 'tags';
    label: string;
    onRemove: () => void;
  }>;
  onClearAllChips: () => void;
  isTypeManagedByPrimary: boolean;
}

const topBarStyle: CSSProperties = {
  background: 'var(--ps-bg-elevated)',
  border: '1px solid color-mix(in srgb, var(--ps-border-default) 64%, transparent)',
  borderRadius: 'var(--radius-l2)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  boxShadow: 'var(--ps-shadow-card)'
};

export function FilterBar({
  view,
  isFilterExpanded,
  onToggleFilterExpanded,
  chips,
  onClearAllChips,
  isTypeManagedByPrimary
}: FilterBarProps): JSX.Element {
  // Only render if there are active chips or filter is expanded
  if (chips.length === 0 && !isFilterExpanded) {
    return <></>;
  }

  return (
    <div className="radius-l2 relative z-40 overflow-visible">
      <div className="pinstack-toolbar-surface flex h-9 min-w-0 items-center gap-2.5 px-4" style={topBarStyle}>
        <div className="no-drag flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className="pinstack-badge inline-flex items-center gap-1 px-2 py-1 text-[11px] text-black/66"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="motion-button rounded-[8px] px-1 text-black/38 hover:bg-white/78 hover:text-black/74"
                    aria-label={`移除${chip.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}

              {chips.length > 1 ? (
                <button
                  type="button"
                  onClick={onClearAllChips}
                  className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
                >
                  清空全部
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleFilterExpanded}
          className={`pinstack-btn pinstack-btn-secondary motion-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] text-black/68 ${
            isFilterExpanded ? 'bg-black/12' : ''
          }`}
          aria-label={isFilterExpanded ? '收起筛选' : '展开筛选'}
          title={isFilterExpanded ? '收起筛选' : '展开筛选'}
        >
          <PinStackIcon name="filter" size={14} />
          <span>筛选</span>
        </button>
      </div>

      <div
        className={`motion-filter-expand no-drag overflow-hidden bg-[color:var(--ps-bg-subtle)] px-4 ${
          isFilterExpanded ? 'motion-filter-expand--open max-h-24 py-2 opacity-100' : 'motion-filter-expand--closed max-h-0 py-0 opacity-0'
        }`}
      >
        <div className="pinstack-section-panel grid grid-cols-1 gap-2 px-3 py-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] text-black/46">来源</label>
            <input
              value={view.sourceFilter}
              onChange={(event) => view.filters.onSourceFilterChange(event.target.value)}
              placeholder="如 ChatGPT/Codex"
              className="pinstack-field h-9 w-full px-2.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-black/46">类型</label>
            <select
              value={view.typeFilter}
              onChange={(event) => view.filters.onTypeFilterChange(event.target.value as 'all' | 'text' | 'image')}
              disabled={isTypeManagedByPrimary}
              title={isTypeManagedByPrimary ? '由一级导航控制：当前类型筛选已禁用' : '类型'}
              className={`pinstack-field h-9 w-full px-2.5 text-xs ${
                isTypeManagedByPrimary ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <option value="all">全部</option>
              <option value="text">文本</option>
              <option value="image">图片 / 录屏</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-black/46">标签</label>
            <input
              value={view.tagsFilter}
              onChange={(event) => view.filters.onTagsFilterChange(event.target.value)}
              placeholder="如 bug, prompt"
              className="pinstack-field h-9 w-full px-2.5 text-xs"
            />
          </div>
          <div className="md:col-span-3">
            <div className="pinstack-section-panel flex items-center justify-between px-2.5 py-2">
              <div className="text-[11px] text-black/60">AI 优先搜索（跟随 AI 总开关，可手动覆盖）</div>
              <ToggleSwitch
                checked={view.appSettings.aiHub.aiFirstSearch}
                onChange={(value: boolean) => {
                  void window.pinStack.settings.set({
                    aiHub: {
                      ...view.appSettings.aiHub,
                      aiFirstSearch: value
                    }
                  });
                  window.dispatchEvent(new CustomEvent('pinstack-settings-updated'));
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
