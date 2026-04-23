import { useMemo, useState } from 'react';
import type { DashboardRecordItem, DashboardViewProps } from '../shared/dashboard.types';
import { isFavoriteRecord } from '../shared/favoriteTag';
import { FavoritesRecordList } from './favorites/FavoritesRecordList';

interface ModernFavoritesWorkspaceProps {
  view: DashboardViewProps;
}

type AiOrganizeSuggestion = {
  id: string;
  fromTitle: string;
  toTitle: string;
  keyword: string;
  summary: string;
  categoryTag: string;
  sourceTag: string;
};

function buildAiTitleBase(record: DashboardRecordItem): string {
  const localTitle =
    record.localModel?.systemGeneratedTitle ||
    record.localModel?.userEditedTitle ||
    record.displayName ||
    record.previewText ||
    '未命名收藏';

  return localTitle
    .replace(/[_\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36);
}

function buildAiKeyword(record: DashboardRecordItem): string {
  return (
    record.localModel?.summary?.keyword?.trim() ||
    record.tags.find((item) => item.trim().length > 0) ||
    '待提炼'
  );
}

function buildAiSummary(record: DashboardRecordItem): string {
  return (
    record.localModel?.summary?.summary?.trim() ||
    record.previewText?.trim() ||
    record.ocrText?.trim() ||
    '待生成概述'
  ).replace(/\s+/g, ' ').slice(0, 96);
}

function pickCategory(record: DashboardRecordItem, categories: string[]): string {
  const fromLocal = record.localModel?.summary?.category ?? record.localModel?.imageUnderstanding?.suggested_category;
  if (fromLocal && categories.includes(fromLocal)) {
    return fromLocal;
  }
  return categories[0] ?? '待处理';
}

function pickSource(record: DashboardRecordItem, sources: string[]): string {
  const fromLocal = record.localModel?.summary?.source;
  if (fromLocal && sources.includes(fromLocal)) {
    return fromLocal;
  }
  const sourceText = record.sourceApp?.trim() || record.source;
  const matched = sources.find((item) => sourceText.includes(item));
  return matched ?? sources[0] ?? 'PinStack';
}

function buildOrganizedTitle(
  record: DashboardRecordItem,
  source: string,
  namingTemplate: DashboardViewProps['appSettings']['aiHub']['namingTemplate']
): string {
  const titleBase = buildAiTitleBase(record);
  if (namingTemplate === 'category_source_title') {
    return `${titleBase}_${source}`;
  }
  return titleBase;
}

export function ModernFavoritesWorkspace({ view }: ModernFavoritesWorkspaceProps): JSX.Element {
  const [organizeState, setOrganizeState] = useState<'idle' | 'previewing' | 'applying'>('idle');
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [organizeSuggestions, setOrganizeSuggestions] = useState<AiOrganizeSuggestion[]>([]);
  const [feedback, setFeedback] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSourceApp, setCreateSourceApp] = useState('');
  const [createText, setCreateText] = useState('');
  const [createState, setCreateState] = useState<'idle' | 'saving'>('idle');
  const [createError, setCreateError] = useState<string | null>(null);

  const favoriteRecords = useMemo(() => view.records.filter((record) => isFavoriteRecord(record)), [view.records]);
  const aiOrganizeEligibleRecords = useMemo(() => {
    return favoriteRecords.filter((record) => {
      if (record.type === 'image' && !view.appSettings.aiHub.processImages) {
        return false;
      }
      if (view.appSettings.aiHub.processOnlyUntitled && record.localModel?.titleLockedByUser) {
        return false;
      }
      return true;
    });
  }, [favoriteRecords, view.appSettings.aiHub.processImages, view.appSettings.aiHub.processOnlyUntitled]);
  const aiOrganizeBlockedReason = useMemo(() => {
    if (!view.appSettings.aiHub.enabled) {
      return 'AI 已关闭，请到「设置 > AI Hub」启用后再处理收藏。';
    }
    if (organizeState !== 'idle') {
      return organizeState === 'applying' ? 'AI 处理结果应用中，请稍候。' : 'AI 处理预览生成中，请稍候。';
    }
    if (aiOrganizeEligibleRecords.length === 0) {
      if (favoriteRecords.length === 0) {
        return '当前没有收藏记录可处理。';
      }
      return '当前无可处理项，可能被「仅整理未手改标题」或「允许处理图片收藏」过滤。';
    }
    return null;
  }, [aiOrganizeEligibleRecords.length, favoriteRecords.length, organizeState, view.appSettings.aiHub.enabled]);
  const aiOrganizeButtonDisabled = Boolean(aiOrganizeBlockedReason);

  const previewAiOrganize = async (): Promise<void> => {
    setOrganizeState('previewing');
    setFeedback(null);
    try {
      const categories = view.appSettings.aiHub.categoryDictionary;
      const sources = view.appSettings.aiHub.sourceDictionary;
      const next = aiOrganizeEligibleRecords.slice(0, 80).map((record) => {
        const category = pickCategory(record, categories);
        const source = pickSource(record, sources);
        const keyword = buildAiKeyword(record);
        const summary = buildAiSummary(record);
        return {
          id: record.id,
          fromTitle: record.displayName ?? '未命名',
          toTitle: buildOrganizedTitle(record, source, view.appSettings.aiHub.namingTemplate),
          keyword,
          summary,
          categoryTag: `分类:${category}`,
          sourceTag: `来源:${source}`
        } satisfies AiOrganizeSuggestion;
      });
      setOrganizeSuggestions(next);
      setOrganizeOpen(true);
      setFeedback({
        tone: 'success',
        text: `已生成 ${next.length} 条 AI 处理预览，请人工确认后再应用。`
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'AI 处理预览生成失败。'
      });
    } finally {
      setOrganizeState('idle');
    }
  };

  const applyAiOrganize = async (): Promise<void> => {
    if (organizeSuggestions.length === 0) {
      setFeedback({ tone: 'neutral', text: '没有可确认应用的 AI 处理结果。' });
      return;
    }

    const confirmed = window.confirm(
      `将应用 ${organizeSuggestions.length} 条 AI 处理结果，包括重命名、关键词标签补充与概述整理预览。确认后才会真正写入，是否继续？`
    );
    if (!confirmed) {
      setFeedback({ tone: 'neutral', text: '已取消，本次 AI 处理结果未应用。' });
      return;
    }

    setOrganizeState('applying');
    setFeedback(null);
    try {
      for (const item of organizeSuggestions) {
        await view.recordActions.onRenameRecord(item.id, item.toTitle);
        const record = favoriteRecords.find((entry) => entry.id === item.id);
        const currentTags = record?.tags ?? [];
        const nextTags = [...new Set([...currentTags, item.categoryTag, item.sourceTag, `关键词:${item.keyword}`, 'ai-处理'])];
        await view.recordActions.onUpdateRecordMeta(item.id, { tags: nextTags });
      }
      setFeedback({ tone: 'success', text: `已确认并应用 ${organizeSuggestions.length} 条 AI 处理结果。` });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : '应用 AI 处理结果失败。'
      });
    } finally {
      setOrganizeState('idle');
    }
  };

  const openCreateModal = () => {
    setCreateTitle('');
    setCreateSourceApp('');
    setCreateText('');
    setCreateError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (createState === 'saving') {
      return;
    }
    if (!createText.trim()) {
      setCreateError('请输入正文内容');
      return;
    }
    setCreateState('saving');
    setCreateError(null);
    try {
      await view.recordActions.onCreateFavoriteTextRecord({
        title: createTitle.trim() || undefined,
        text: createText,
        sourceApp: createSourceApp.trim() || undefined
      });
      setCreateOpen(false);
      setFeedback({ tone: 'success', text: '已新建收藏记录。' });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '新建收藏失败，请稍后重试。');
    } finally {
      setCreateState('idle');
    }
  };

  return (
    <section className="pinstack-section-panel mb-4 flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40">收藏工作台</div>
          <h2 className="mt-1 text-xl font-semibold text-black">收藏工作台</h2>
          <p className="mt-1 text-sm text-black/55">管理收藏记录，快速处理素材整理。</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="pinstack-btn pinstack-btn-primary motion-button h-9 px-3 text-sm"
          >
            新建收藏
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]">
        <div className="rounded-[24px] border border-black/8 bg-white/70 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-black">收藏管理</h3>
              <p className="mt-1 text-xs text-black/50">
                在此管理你的收藏记录，使用 AI 整理素材库。
              </p>
            </div>
          </div>
        </div>

        <FavoritesRecordList
          view={view}
          favoriteRecords={favoriteRecords}
          feedback={feedback}
          onPreviewAiOrganize={previewAiOrganize}
          aiOrganizeButtonDisabled={aiOrganizeButtonDisabled}
          aiOrganizeBlockedReason={aiOrganizeBlockedReason}
          organizeState={organizeState}
          organizeOpen={organizeOpen}
          organizeSuggestions={organizeSuggestions}
          onApplyAiOrganize={applyAiOrganize}
          setOrganizeOpen={setOrganizeOpen}
        />
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40">New Favorite</div>
                <h3 className="mt-1 text-lg font-semibold text-black">新建收藏</h3>
                <p className="mt-1 text-xs text-black/55">手动录入一条收藏文本，保存后会自动进入收藏列表。</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="pinstack-btn pinstack-btn-ghost motion-button h-9 px-3 text-xs"
              >
                关闭
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-black/70">标题（可选）</span>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder="填写标题用于更易识别"
                  className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm text-black outline-none transition focus:border-black/25"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-black/70">来源（可选）</span>
                <input
                  type="text"
                  value={createSourceApp}
                  onChange={(event) => setCreateSourceApp(event.target.value)}
                  placeholder="例如：Manual / Meeting / External"
                  className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm text-black outline-none transition focus:border-black/25"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-black/70">正文</span>
                <textarea
                  value={createText}
                  onChange={(event) => setCreateText(event.target.value)}
                  placeholder="输入要收藏的内容..."
                  rows={8}
                  className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black/25"
                />
              </label>
            </div>

            {createError ? (
              <div className="mt-3 rounded-xl border border-rose-300/70 bg-rose-100/80 px-3 py-2 text-xs text-rose-700">
                {createError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={submitCreate}
                disabled={createState === 'saving'}
                className="pinstack-btn pinstack-btn-primary motion-button h-10 px-4 text-sm disabled:opacity-60"
              >
                {createState === 'saving' ? '保存中...' : '保存并收藏'}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="pinstack-btn pinstack-btn-secondary motion-button h-10 px-4 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
