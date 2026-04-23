export interface AiOrganizePanelProps {
  organizeOpen: boolean;
  organizeState: 'idle' | 'previewing' | 'applying';
  organizeSuggestions: Array<{
    id: string;
    fromTitle: string;
    toTitle: string;
    keyword: string;
    summary: string;
    categoryTag: string;
    sourceTag: string;
  }>;
  onApplyAiOrganize: () => Promise<void>;
  setOrganizeOpen: (open: boolean) => void;
}

export function AiOrganizePanel({
  organizeOpen,
  organizeState,
  organizeSuggestions,
  onApplyAiOrganize,
  setOrganizeOpen
}: AiOrganizePanelProps): JSX.Element | null {
  if (!organizeOpen) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-black/8 bg-white/85 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-black/75">AI处理预览（前 {organizeSuggestions.length} 条）</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              void onApplyAiOrganize();
            }}
            disabled={organizeState !== 'idle'}
            className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[11px] disabled:opacity-60"
          >
            {organizeState === 'applying' ? '确认中...' : '确认应用 AI处理'}
          </button>
          <button
            type="button"
            onClick={() => setOrganizeOpen(false)}
            className="pinstack-btn pinstack-btn-ghost motion-button h-7 px-2.5 text-[11px]"
          >
            收起
          </button>
        </div>
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {organizeSuggestions.slice(0, 20).map((item) => (
          <div key={item.id} className="rounded-md border border-black/8 bg-black/[0.02] px-2 py-1.5 text-[10px] text-black/65">
            <div className="truncate">原名：{item.fromTitle}</div>
            <div className="truncate">AI 重命名：{item.toTitle}</div>
            <div className="truncate">关键词：{item.keyword}</div>
            <div className="truncate">概述：{item.summary}</div>
            <div className="truncate text-black/45">{item.categoryTag} &middot; {item.sourceTag}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
