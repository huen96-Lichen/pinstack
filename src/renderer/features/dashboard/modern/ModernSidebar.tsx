import { useAppVersion } from '../../../version';
import { SectionHeader, SidebarItem } from '../../../design-system/primitives';
import type { DashboardViewProps } from '../shared/dashboard.types';
import { computeShowAiEntry } from '../shared/dashboardUtils';

interface ModernSidebarProps {
  view: DashboardViewProps;
}

const primaryNavItems: Array<{ id: 'all' | 'text' | 'images' | 'favorites'; label: string; icon: 'all' | 'text' | 'image' | 'favorite' }> = [
  { id: 'all', label: '全部', icon: 'all' },
  { id: 'text', label: '文本', icon: 'text' },
  { id: 'images', label: '图片', icon: 'image' },
  { id: 'favorites', label: '收藏', icon: 'favorite' }
];

export function ModernSidebar({ view }: ModernSidebarProps): JSX.Element {
  const appVersion = useAppVersion();
  const showAiEntry = computeShowAiEntry(view.appSettings.aiHub.entryVisibility, view.appSettings.aiHub.enabled);
  const visiblePrimaryItems = primaryNavItems;
  const isAiHubActive = view.primaryNav === 'ai' && view.activeTab === 'all';
  const isVkActive = view.primaryNav === 'vaultkeeper';
  const isCutoutActive = view.primaryNav === 'cutout';

  return (
    <aside className="no-drag pinstack-panel-soft flex h-full w-[230px] shrink-0 flex-col p-4">
      <SectionHeader eyebrow="Workbench" title="分类导航" />

      <nav className="mt-5 min-h-0 flex-1 space-y-2 overflow-y-auto">
        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/34">内容</div>
        {visiblePrimaryItems.map((item) => {
          const isActive = view.primaryNav === item.id;

          return (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={isActive}
              onClick={() => view.filters.onPrimaryNavChange(item.id)}
            />
          );
        })}

        {showAiEntry ? (
          <div className="pt-2">
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/34">AI</div>
            <SidebarItem
              icon="spark"
              label="AI 助手"
              meta={<span className="text-[10px] text-black/46">整理 / 总结</span>}
              active={isAiHubActive}
              onClick={() => view.filters.onPrimaryNavChange('ai')}
            />
          </div>
        ) : null}

        <div className="pt-2">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/34">工具</div>
          <SidebarItem
            icon="launcher"
            label="VaultKeeper (Beta)"
            meta={<span className="text-[10px] text-black/46">转换 / 下载</span>}
            active={isVkActive}
            onClick={() => view.filters.onPrimaryNavChange('vaultkeeper')}
          />
          <SidebarItem
            icon="image"
            label="抠图"
            meta={<span className="text-[10px] text-black/46">透明 PNG</span>}
            active={isCutoutActive}
            onClick={() => view.filters.onPrimaryNavChange('cutout')}
          />
        </div>
      </nav>

      <div className="shrink-0 pt-3">
        <div className="pinstack-section-panel px-3 py-3 text-[11px] text-black/54">
          <p className="font-medium tracking-[0.04em] text-[color:var(--ps-text-tertiary)]">当前版本</p>
          <p className="mt-2 font-mono text-[13px] text-[color:var(--ps-text-primary)]">v{appVersion}</p>
        </div>
      </div>
    </aside>
  );
}
