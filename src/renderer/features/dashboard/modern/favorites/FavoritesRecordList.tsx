import type { DashboardRecordItem, DashboardViewProps } from '../../shared/dashboard.types';
import { AiOrganizePanel } from './AiOrganizePanel';

export interface FavoritesRecordListProps {
  view: DashboardViewProps;
  favoriteRecords: DashboardRecordItem[];
  feedback: { tone: 'neutral' | 'success' | 'error'; text: string } | null;
  onPreviewAiOrganize: () => Promise<void>;
  aiOrganizeButtonDisabled: boolean;
  aiOrganizeBlockedReason: string | null;
  organizeState: 'idle' | 'previewing' | 'applying';
  organizeOpen: boolean;
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

export function FavoritesRecordList({
  view,
  feedback,
  onPreviewAiOrganize,
  aiOrganizeButtonDisabled,
  aiOrganizeBlockedReason,
  organizeState,
  organizeOpen,
  organizeSuggestions,
  onApplyAiOrganize,
  setOrganizeOpen
}: FavoritesRecordListProps): JSX.Element {
  const feedbackToneClassName =
    feedback?.tone === 'success'
      ? 'border-emerald-300/70 bg-emerald-100/80 text-emerald-700'
      : feedback?.tone === 'error'
        ? 'border-rose-300/70 bg-rose-100/80 text-rose-700'
        : 'border-slate-300/70 bg-slate-100/80 text-slate-600';

  return (
    <aside className="rounded-[24px] border border-black/8 bg-white/70 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-black">收藏总览</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              void onPreviewAiOrganize();
            }}
            disabled={aiOrganizeButtonDisabled}
            className="pinstack-btn pinstack-btn-primary motion-button h-7 px-2.5 text-[11px] disabled:opacity-60"
          >
            {organizeState === 'previewing' ? '生成中...' : 'AI处理素材库'}
          </button>
        </div>
      </div>
      {aiOrganizeBlockedReason ? (
        <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-100/75 px-2 py-1.5 text-[10px] text-amber-800">
          {aiOrganizeBlockedReason}
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-emerald-300/70 bg-emerald-100/70 px-2 py-1.5 text-[10px] text-emerald-700">
          AI 已就绪：可生成收藏重分类预览并人工确认后应用。
        </div>
      )}

      {feedback ? (
        <div className={`mt-2 rounded-lg border px-2 py-1.5 text-[10px] ${feedbackToneClassName}`}>{feedback.text}</div>
      ) : null}

      <AiOrganizePanel
        organizeOpen={organizeOpen}
        organizeState={organizeState}
        organizeSuggestions={organizeSuggestions}
        onApplyAiOrganize={onApplyAiOrganize}
        setOrganizeOpen={setOrganizeOpen}
      />
    </aside>
  );
}
