import { useMemo, useState } from 'react';
import type { DashboardViewProps } from '../../features/dashboard/shared/dashboard.types';
import type { CutoutProcessResult, CutoutSaveResult } from '../../../shared/types';

interface CutoutPageProps {
  view: DashboardViewProps;
}

export function CutoutPage({ view }: CutoutPageProps): JSX.Element {
  const selectedRecord = useMemo(() => {
    const selectedId = view.selectedIds[0];
    if (!selectedId) {
      return null;
    }
    return view.records.find((item) => item.id === selectedId) ?? null;
  }, [view.records, view.selectedIds]);
  const fallbackLatestImage = useMemo(() => {
    return view.records
      .filter((item) => item.type === 'image')
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.createdAt - a.createdAt)[0] ?? null;
  }, [view.records]);
  const targetRecord = selectedRecord?.type === 'image' ? selectedRecord : fallbackLatestImage;

  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string>('请选择一张图片卡片后开始。');
  const [result, setResult] = useState<CutoutProcessResult | null>(null);
  const [saveResult, setSaveResult] = useState<CutoutSaveResult | null>(null);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);

  const canRun = Boolean(targetRecord);

  const runCutout = async () => {
    if (!targetRecord || targetRecord.type !== 'image') {
      setStatusText('当前没有可用图片记录，请先创建或选中一张图片卡片。');
      return;
    }
    setBusy(true);
    setSaveResult(null);
    setSavedRecordId(null);
    setResult(null);
    setStatusText('处理中（本地）...');
    try {
      const next = await window.pinStack.cutout.processFromRecord(targetRecord.id);
      setResult(next);
      if (next.stage === 'cloud') {
        setStatusText('本地失败，已自动回退云端并成功输出透明 PNG。');
      } else {
        setStatusText('本地抠图完成，已生成透明 PNG 预览。');
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '抠图失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const saveCutout = async () => {
    if (!result) {
      return;
    }
    setBusy(true);
    try {
      const saved = await window.pinStack.cutout.saveResult({
        recordId: result.recordId,
        dataUrl: result.dataUrl,
        fileNameSuggestion: result.fileNameSuggestion
      });
      setSaveResult(saved);
      setStatusText(`已保存透明 PNG：${saved.fileName}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const saveAsRecord = async () => {
    if (!result) {
      return;
    }
    setBusy(true);
    try {
      const created = await window.pinStack.cutout.saveAsRecord({
        recordId: result.recordId,
        dataUrl: result.dataUrl,
        fileNameSuggestion: result.fileNameSuggestion
      });
      setSavedRecordId(created.recordId);
      setStatusText(`已回写为新卡片：${created.recordId}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '回写卡片失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[360px_1fr]">
      <section className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/85 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">Image Cutout</div>
        <h2 className="mt-1 text-[20px] font-semibold text-black/86">抠图（透明 PNG）</h2>
        <p className="mt-1 text-[12px] text-black/56">仅支持当前选中图片卡片。本地优先，失败自动回退云端。</p>

        <div className="mt-3 rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-3 py-2 text-[12px] text-black/70">
          {targetRecord ? (
            <>
              <div className="font-medium text-black/80">{targetRecord.displayName ?? targetRecord.id}</div>
              <div className="mt-0.5 text-[11px] text-black/52">recordId: {targetRecord.id}</div>
              <div className="mt-0.5 text-[11px] text-black/52">type: {targetRecord.type}</div>
              <div className="mt-0.5 text-[11px] text-black/52">
                来源：{selectedRecord?.type === 'image' ? '当前选中卡片' : '自动选择最近图片'}
              </div>
            </>
          ) : (
            '未选中任何卡片'
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canRun || busy}
            onClick={() => void runCutout()}
            className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? '处理中...' : '开始抠图'}
          </button>
          <button
            type="button"
            disabled={!result || busy}
            onClick={() => void saveCutout()}
            className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-55"
          >
            保存 transparent PNG
          </button>
          <button
            type="button"
            disabled={!result || busy}
            onClick={() => void saveAsRecord()}
            className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-55"
          >
            保存并回写卡片
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-[color:var(--ps-border-subtle)] bg-white/65 px-3 py-2 text-[11px] text-black/66">
          {statusText}
        </div>

        {saveResult ? (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
            输出路径：{saveResult.outputPath}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void window.pinStack.cutout.openOutput(saveResult.outputPath)}
                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
              >
                打开输出目录
              </button>
            </div>
          </div>
        ) : null}
        {savedRecordId ? (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
            新卡片已创建：{savedRecordId}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void view.recordActions.onOpenRecord(savedRecordId)}
                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
              >
                打开该卡片
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/85 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">Preview</div>
        {result ? (
          <div className="h-full min-h-[320px] rounded-lg border border-[color:var(--ps-border-subtle)] bg-[linear-gradient(45deg,#f2f2f2_25%,transparent_25%),linear-gradient(-45deg,#f2f2f2_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f2f2f2_75%),linear-gradient(-45deg,transparent_75%,#f2f2f2_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-3">
            <img
              src={result.dataUrl}
              alt="transparent cutout preview"
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] text-[12px] text-black/50">
            生成后在这里预览透明 PNG
          </div>
        )}
      </section>
    </div>
  );
}
