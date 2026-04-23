import { useMemo, useState } from 'react';
import { PinStackIconButton, type PinStackIconName } from '../../../design-system/icons';
import { SectionHeader, SidebarItem } from '../../../design-system/primitives';
import type { AppSettings } from '../../../../shared/types';
import { formatShortcutLabel } from '../shared/dashboardUtils';

interface HelpPanelProps {
  appSettings: AppSettings;
  onClose: () => void;
}

type HelpSectionId = 'about' | 'start' | 'concepts' | 'faq' | 'shortcuts';
type HelpExtendedSectionId = 'favorites';
type HelpSectionKey = HelpSectionId | HelpExtendedSectionId;

type HelpSection = {
  id: HelpSectionKey;
  icon: PinStackIconName;
  label: string;
  title: string;
  content: JSX.Element;
};

function HelpCard({
  title,
  description
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="pinstack-section-panel max-w-[480px] px-4 py-3.5">
      <div className="text-[14px] font-medium text-[color:var(--ps-text-primary)]">{title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--ps-text-secondary)]">{description}</p>
    </div>
  );
}

export function HelpPanel({ appSettings, onClose }: HelpPanelProps): JSX.Element {
  const [activeSection, setActiveSection] = useState<HelpSectionKey>('start');

  const sections = useMemo<HelpSection[]>(
    () => [
      {
        id: 'about',
        icon: 'help',
        label: '这是什么',
        title: '这是什么',
        content: (
          <div className="space-y-3">
            <HelpCard
              title="PinStack 是什么"
              description="PinStack 是一个把复制内容和截图，变成可再次使用工作素材的桌面工具。它会帮你把刚刚出现的重要内容留住，并在你需要的时候更快找回来。"
            />
            <HelpCard
              title="它最适合谁"
              description="适合经常在 ChatGPT、Codex、终端、浏览器和项目之间来回切换的人。尤其适合那些经常复制内容、截图、再回头复用的人。"
            />
          </div>
        )
      },
      {
        id: 'start',
        icon: 'capture',
        label: '怎么开始',
        title: '怎么开始',
        content: (
          <div className="space-y-3">
            {[
              {
                title: '第 1 步：复制或截图',
                description: '你可以直接复制一段文字，或者通过截图面板发起截图。'
              },
              {
                title: '第 2 步：自动保存',
                description: 'PinStack 会把内容保存进本地记录库，并根据当前模式决定是否自动弹出卡片。'
              },
              {
                title: '第 3 步：再次使用',
                description: '之后你可以在面板里搜索、整理、复制、改写，或者把它再次固定出来继续使用。'
              }
            ].map((item) => (
              <HelpCard key={item.title} title={item.title} description={item.description} />
            ))}
          </div>
        )
      },
      {
        id: 'concepts',
        icon: 'classify',
        label: '核心概念',
        title: '核心概念',
        content: (
          <div className="space-y-3">
            <HelpCard title="记录" description="每一条保存下来的内容都叫一条记录。它可以是文本、图片，或录屏结果。" />
            <HelpCard title="用途" description="用途用来说明这条记录更像什么，比如提示词、生成结果、问题修复、操作流程或参考资料。" />
            <HelpCard title="标签" description="标签是辅助分类。你可以用它标记主题、来源或个人习惯，方便以后快速筛选。" />
            <HelpCard title="模式" description="模式决定内容进入 PinStack 后怎么处理：全部弹出、自定义，或者全部关闭。" />
            <HelpCard title="状态" description="状态主要告诉你权限和运行情况是否正常。如果有需要处理的问题，会在顶部状态区提醒你。" />
          </div>
        )
      },
      {
        id: 'faq',
        icon: 'help',
        label: '常见问题',
        title: '常见问题',
        content: (
          <div className="space-y-3">
            <HelpCard
              title="为什么没有自动弹出"
              description="先看当前是不是“全部关闭”或“静默/自定义”模式；再看图片自动弹出、文本自动弹出是否被关闭；最后确认当前应用是否在生效范围之外。"
            />
            <HelpCard
              title="为什么找不到内容"
              description="先检查当前导航是否切到了文本、图片或 AI 工作区；再看顶部搜索和筛选条件有没有限制结果。必要时切回“全部”试试。"
            />
            <HelpCard
              title="为什么截图没保存"
              description="通常和屏幕录制权限有关。请在 macOS 的“隐私与安全性”里确认 PinStack 已被允许进行屏幕录制。"
            />
            <HelpCard
              title="什么是自定义模式"
              description="自定义模式表示你想自己决定“图片自动弹出”和“文本自动弹出”。只有在这个模式下，这两个开关才可以单独改。"
            />
            <HelpCard
              title="为什么需要权限"
              description="PinStack 需要读取剪贴板、截图，或使用全局快捷键。相关权限没开时，软件就可能无法自动记录、截图或响应快捷键。"
            />
          </div>
        )
      },
      {
        id: 'favorites',
        icon: 'favorite',
        label: '收藏功能',
        title: '收藏功能',
        content: (
          <div className="space-y-3">
            <HelpCard
              title="如何收藏"
              description="在记录卡片上点击收藏按钮，即可把当前记录加入收藏区。收藏后可在左侧「收藏」中集中查看。"
            />
            <HelpCard
              title="如何使用收藏区"
              description="收藏区适合沉淀高频素材：可继续搜索、筛选、复制、再 Pin，也可统一管理需要长期复用的提示词与参考资料。"
            />
            <HelpCard
              title="取消收藏"
              description="再次点击收藏按钮可取消收藏。取消后记录仍保留在原始记录库，只是从收藏视图移除。"
            />
          </div>
        )
      },
      {
        id: 'shortcuts',
        icon: 'settings',
        label: '快捷操作',
        title: '快捷操作',
        content: (
          <div className="space-y-3">
            <HelpCard title="打开 / 关闭面板" description={formatShortcutLabel(appSettings.dashboardShortcut)} />
            <HelpCard title="快速截图" description={formatShortcutLabel(appSettings.screenshotShortcut)} />
            <HelpCard title="打开截图面板" description={formatShortcutLabel(appSettings.captureHubShortcut)} />
            <HelpCard title="切换运行模式" description={formatShortcutLabel(appSettings.modeToggleShortcut)} />
            <HelpCard title="托盘：打开工作台" description={formatShortcutLabel(appSettings.trayOpenDashboardShortcut)} />
            <HelpCard title="托盘：切换模式" description={formatShortcutLabel(appSettings.trayCycleModeShortcut)} />
            <HelpCard title="托盘：退出 PinStack" description={formatShortcutLabel(appSettings.trayQuitShortcut)} />
          </div>
        )
      }
    ],
    [
      appSettings.captureHubShortcut,
      appSettings.dashboardShortcut,
      appSettings.modeToggleShortcut,
      appSettings.screenshotShortcut,
      appSettings.trayOpenDashboardShortcut,
      appSettings.trayCycleModeShortcut,
      appSettings.trayQuitShortcut
    ]
  );

  const currentSection = sections.find((section) => section.id === activeSection) ?? sections[1];

  return (
    <div className="motion-popover pinstack-subpanel w-[760px] max-w-[min(760px,calc(100vw-48px))] overflow-hidden">
      <div className="border-b border-[color:var(--ps-border-subtle)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <SectionHeader eyebrow="PinStack" title="帮助" description="开始使用与常见问题。" />
          <PinStackIconButton icon="close" label="关闭帮助" size="sm" tone="soft" onClick={onClose} />
        </div>
      </div>

      <div className="flex h-[460px] min-h-[460px]">
        <aside className="w-[188px] shrink-0 overflow-y-auto border-r border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-muted)] px-3 py-4">
          <div className="space-y-1">
            {sections.map((section) => {
              const active = section.id === currentSection.id;
              return (
                <SidebarItem
                  key={section.id}
                  icon={section.icon}
                  label={section.label}
                  active={active}
                  onClick={() => setActiveSection(section.id)}
                />
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-none">
            <div className="mb-4">
              <h3 className="text-[20px] font-semibold text-[color:var(--ps-text-primary)]">{currentSection.title}</h3>
            </div>
            <div>{currentSection.content}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
