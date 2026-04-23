import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { PinStackIcon } from '../../../design-system/icons';
import { useVaultKeeper } from '../shared/hooks/useVaultKeeper';
import type { VkJob, VkJobLogEntry, VkJobStatus, VkToolsInfo, VkExportResult } from '../../../../shared/vaultkeeper';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type VkTool = 'convert' | 'image-download' | 'text-pack' | 'web-collect' | 'video-transcribe';

interface ToolDef {
  id: VkTool;
  label: string;
  desc: string;
  icon: string;
  gradient: string;
}

const TOOLS: ToolDef[] = [
  { id: 'convert', label: '文件转换', desc: '格式互转 · DOCX / PDF / HTML', icon: 'copy', gradient: 'from-violet-500 to-purple-600' },
  { id: 'image-download', label: '图片下载', desc: '批量抓取 · URL / 网页', icon: 'image', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'text-pack', label: '文字打包', desc: '批量导入 · 整理归档', icon: 'text', gradient: 'from-emerald-500 to-teal-500' },
  { id: 'web-collect', label: '目录直读', desc: '直读文件夹 · 自动入库', icon: 'launcher', gradient: 'from-amber-500 to-orange-500' },
  { id: 'video-transcribe', label: '视频转文字', desc: '语音识别 · 字幕生成', icon: 'panel', gradient: 'from-rose-500 to-pink-500' },
];

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */

const pageEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const pageVariants: Variants = {
  enter: (direction: number) => ({ x: direction * 60, opacity: 0, scale: 0.97 }),
  center: { x: 0, opacity: 1, scale: 1, transition: { duration: 0.32, ease: pageEase } },
  exit: (direction: number) => ({ x: direction * -60, opacity: 0, scale: 0.97, transition: { duration: 0.2, ease: 'easeIn' } }),
};

const cardHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -2, transition: { duration: 0.2, ease: 'easeOut' } },
};

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

const JOB_STATUS_MAP: Record<VkJobStatus, { label: string; cls: string }> = {
  created: { label: '已创建', cls: 'border-gray-200 bg-gray-50 text-gray-600' },
  extracting: { label: '提取中', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  normalizing: { label: '标准化', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  enhancing: { label: '增强中', cls: 'border-violet-200 bg-violet-50 text-violet-700' },
  packaging: { label: '打包中', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  done: { label: '完成', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'border-red-200 bg-red-50 text-red-700' },
};

function isActiveJob(job: VkJob): boolean {
  return ['created', 'extracting', 'normalizing', 'enhancing', 'packaging'].includes(job.status);
}

function fmtDuration(ms: number | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function dotColor(state: string): string {
  if (state === 'running') return 'bg-emerald-500';
  if (state === 'starting' || state === 'stopping') return 'bg-amber-400';
  if (state === 'error') return 'bg-red-500';
  return 'bg-gray-400';
}

function stateLabel(state: string): string {
  if (state === 'running') return '运行中';
  if (state === 'starting') return '启动中';
  if (state === 'stopping') return '停止中';
  if (state === 'error') return '异常';
  return '已停止';
}

/* ------------------------------------------------------------------ */
/*  Status Bar (top)                                                   */
/* ------------------------------------------------------------------ */

function StatusBar(): JSX.Element {
  const { status, loading, start, stop, getTools } = useVaultKeeper();
  const [tools, setTools] = useState<VkToolsInfo | null>(null);

  useEffect(() => {
    if (status?.state === 'running') {
      getTools().then((r) => { if (r?.success && r.data) setTools(r.data); });
    } else {
      setTools(null);
    }
  }, [status?.state, getTools]);

  const isRunning = status?.state === 'running';
  const transitioning = status?.state === 'starting' || status?.state === 'stopping';

  return (
    <div className="flex items-center justify-between rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor(status?.state ?? 'stopped')} ${isRunning ? 'animate-pulse' : ''}`} />
        <div>
          <span className="text-[13px] font-semibold text-[color:var(--ps-text-primary)]">VaultKeeper</span>
          <span className="ml-2 text-[11px] text-[color:var(--ps-text-tertiary)]">
            {stateLabel(status?.state ?? 'stopped')}{status?.port ? ` · :${status.port}` : ''}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isRunning && (
          <div className="flex items-center gap-3 text-[10px] text-[color:var(--ps-text-tertiary)]">
            {(['MarkItDown', 'Pandoc'] as const).map((name) => {
              const ok = name === 'MarkItDown' ? tools?.markitdown : tools?.pandoc;
              return (
                <span key={name} className="inline-flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  {name}
                </span>
              );
            })}
          </div>
        )}
        <button
          type="button"
          disabled={loading || transitioning}
          onClick={() => { if (isRunning) void stop(); else void start(); }}
          className={`motion-button inline-flex h-7 items-center justify-center rounded-lg px-3 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isRunning ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          {loading ? (isRunning ? '停止中...' : '启动中...') : isRunning ? '停止' : '启动'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool Grid (home)                                                   */
/* ------------------------------------------------------------------ */

function ToolGrid({ onNavigate }: { onNavigate: (tool: VkTool) => void }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map((tool) => (
        <motion.button
          key={tool.id}
          type="button"
          variants={cardHover}
          initial="rest"
          whileHover="hover"
          onClick={() => onNavigate(tool.id)}
          className="group flex items-start gap-4 rounded-2xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-5 text-left backdrop-blur-sm transition-shadow hover:shadow-lg"
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} shadow-sm`}>
            <PinStackIcon name={tool.icon as any} size={20} className="text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-[color:var(--ps-text-primary)]">{tool.label}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-[color:var(--ps-text-tertiary)]">{tool.desc}</div>
          </div>
          <PinStackIcon name="arrow-right" size={14} className="mt-1 shrink-0 text-[color:var(--ps-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
        </motion.button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: 文件转换                                                      */
/* ------------------------------------------------------------------ */

type ExportFmt = 'docx' | 'pdf' | 'html';

function ConvertView(): JSX.Element {
  const { status: vkStatus } = useVaultKeeper();
  const [inputPath, setInputPath] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [formats, setFormats] = useState<Set<ExportFmt>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<VkExportResult[]>([]);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const toggle = (f: ExportFmt) => setFormats((p) => { const n = new Set(p); n.has(f) ? n.delete(f) : n.add(f); return n; });

  const run = async () => {
    if (!inputPath.trim() || formats.size === 0) return;
    if (vkStatus?.state !== 'running') { setMsg({ type: 'err', text: '请先启动 VaultKeeper' }); return; }
    setBusy(true); setMsg(null); setResults([]);
    try {
      const fmts = Array.from(formats);
      if (fmts.length === 1) {
        const r = await window.pinStack.vaultkeeper.exportFile({ inputPath: inputPath.trim(), outputDir: outputDir.trim() || undefined, format: fmts[0] });
        if (r.success) { setResults([r.data]); setMsg({ type: 'ok', text: '转换完成' }); } else setMsg({ type: 'err', text: r.message ?? '失败' });
      } else {
        const r = await window.pinStack.vaultkeeper.exportBatch({ inputPath: inputPath.trim(), outputDir: outputDir.trim() || undefined, formats: fmts });
        if (r.success && r.data) { setResults(r.data.results); setMsg({ type: 'ok', text: `完成：${r.data.succeeded} 成功 / ${r.data.failed} 失败` }); } else setMsg({ type: 'err', text: r.message ?? '失败' });
      }
    } catch (e) { setMsg({ type: 'err', text: e instanceof Error ? e.message : '失败' }); }
    finally { setBusy(false); }
  };

  const fmtOpts: Array<{ v: ExportFmt; l: string }> = [
    { v: 'docx', l: 'DOCX' }, { v: 'pdf', l: 'PDF' }, { v: 'html', l: 'HTML' },
  ];

  return (
    <ToolPanel title="文件转换" desc="将文档在不同格式之间转换" gradient="from-violet-500 to-purple-600">
      <Field label="输入文件" value={inputPath} onChange={setInputPath} placeholder="/path/to/document.md" />
      <Field label="输出目录" value={outputDir} onChange={setOutputDir} placeholder="默认与输入同目录" />
      <div>
        <label className="mb-2 block text-[11px] font-medium text-[color:var(--ps-text-primary)]">目标格式</label>
        <div className="flex gap-2">
          {fmtOpts.map((o) => (
            <button key={o.v} type="button" onClick={() => toggle(o.v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] transition-colors ${formats.has(o.v) ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-[color:var(--ps-border-subtle)] text-[color:var(--ps-text-secondary)] hover:bg-gray-50'}`}>
              {formats.has(o.v) && <PinStackIcon name="check" size={11} strokeWidth={2.5} />}
              {o.l}
            </button>
          ))}
        </div>
      </div>
      <ActionBtn onClick={run} disabled={busy || !inputPath.trim() || formats.size === 0 || vkStatus?.state !== 'running'} busy={busy} label="开始转换" />
      {results.length > 0 && <ResultList results={results} />}
      {msg && <Msg type={msg.type} text={msg.text} />}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: 图片下载                                                      */
/* ------------------------------------------------------------------ */

function ImageDownloadView(): JSX.Element {
  const { status: vkStatus } = useVaultKeeper();
  const [url, setUrl] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const run = async () => {
    if (!url.trim()) return;
    if (vkStatus?.state !== 'running') { setMsg({ type: 'err', text: '请先启动 VaultKeeper' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await window.pinStack.vaultkeeper.batchImport({
        sourceDir: url.trim(), recursive: false, preserveStructure: false, aiEnhance: false, concurrency: 3,
        extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'],
        excludePatterns: [],
      });
      setMsg(r.success ? { type: 'ok', text: `已启动下载：${r.message ?? ''}` } : { type: 'err', text: r.message ?? '失败' });
    } catch (e) { setMsg({ type: 'err', text: e instanceof Error ? e.message : '失败' }); }
    finally { setBusy(false); }
  };

  return (
    <ToolPanel title="图片下载" desc="从 URL 或网页批量下载图片" gradient="from-blue-500 to-cyan-500">
      <Field label="图片 URL 或网页地址" value={url} onChange={setUrl} placeholder="https://example.com/page" />
      <Field label="保存目录" value={outputDir} onChange={setOutputDir} placeholder="/path/to/save" />
      <ActionBtn onClick={run} disabled={busy || !url.trim() || vkStatus?.state !== 'running'} busy={busy} label="开始下载" />
      {msg && <Msg type={msg.type} text={msg.text} />}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: 文字打包                                                      */
/* ------------------------------------------------------------------ */

function TextPackView(): JSX.Element {
  const { status: vkStatus } = useVaultKeeper();
  const [sourceDir, setSourceDir] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [aiEnhance, setAiEnhance] = useState(false);
  const [preview, setPreview] = useState<{ files: Array<{ name: string; size: number }>; totalSize: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const doPreview = async () => {
    if (!sourceDir.trim()) return;
    if (vkStatus?.state !== 'running') { setMsg({ type: 'err', text: '请先启动 VaultKeeper' }); return; }
    setBusy(true); setPreview(null); setMsg(null);
    try {
      const r = await window.pinStack.vaultkeeper.batchImportPreview({
        sourceDir: sourceDir.trim(), recursive, extensions: ['.md', '.txt', '.html', '.htm', '.docx', '.pdf', '.json', '.csv'],
        excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      });
      if (r.success && r.data) setPreview(r.data as typeof preview);
      else setMsg({ type: 'err', text: r.message ?? '预览失败' });
    } catch (e) { setMsg({ type: 'err', text: e instanceof Error ? e.message : '失败' }); }
    finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!sourceDir.trim()) return;
    if (vkStatus?.state !== 'running') { setMsg({ type: 'err', text: '请先启动 VaultKeeper' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await window.pinStack.vaultkeeper.batchImport({
        sourceDir: sourceDir.trim(), recursive, preserveStructure: true, aiEnhance, concurrency: 3,
        extensions: ['.md', '.txt', '.html', '.htm', '.docx', '.pdf', '.json', '.csv'],
        excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      });
      setMsg(r.success ? { type: 'ok', text: `导入已启动：${r.message ?? ''}` } : { type: 'err', text: r.message ?? '失败' });
      if (r.success) setPreview(null);
    } catch (e) { setMsg({ type: 'err', text: e instanceof Error ? e.message : '失败' }); }
    finally { setBusy(false); }
  };

  return (
    <ToolPanel title="文字打包" desc="批量导入文档并整理归档" gradient="from-emerald-500 to-teal-500">
      <Field label="源文件夹" value={sourceDir} onChange={setSourceDir} placeholder="/path/to/documents" />
      <div className="flex gap-3">
        <Toggle label="递归扫描" sub="子文件夹" checked={recursive} onChange={setRecursive} />
        <Toggle label="AI 增强" sub="优化内容" checked={aiEnhance} onChange={setAiEnhance} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={doPreview} disabled={busy || !sourceDir.trim()} className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px] disabled:opacity-50">{busy && !msg ? '预览中...' : '预览文件'}</button>
        <ActionBtn onClick={doImport} disabled={busy || !sourceDir.trim() || vkStatus?.state !== 'running'} busy={busy && !!msg} label="开始导入" />
      </div>
      {preview && (
        <div className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3 space-y-1.5 text-[12px]">
          <div className="font-semibold text-[color:var(--ps-text-primary)]">预览结果</div>
          <div className="flex justify-between text-[color:var(--ps-text-secondary)]"><span>文件数量</span><span className="font-medium">{preview.files.length} 个</span></div>
          <div className="flex justify-between text-[color:var(--ps-text-secondary)]"><span>总大小</span><span className="font-medium">{fmtSize(preview.totalSize)}</span></div>
        </div>
      )}
      {msg && <Msg type={msg.type} text={msg.text} />}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: 目录直读                                                      */
/* ------------------------------------------------------------------ */

function DirectoryReadView(): JSX.Element {
  const [dirPath, setDirPath] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ totalFiles: number; newFiles: number; modifiedFiles: number; unchangedFiles: number; skippedFiles: number } | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const run = async () => {
    if (!dirPath.trim()) return;
    setBusy(true); setMsg(null); setResult(null);
    try {
      const r = await window.pinStack.knowledge.scanDirectory({
        dirPath: dirPath.trim(),
        extensions: ['.md', '.txt', '.markdown'],
        excludePatterns: ['.obsidian/**', '.trash/**', 'node_modules/**', '.git/**']
      });
      if (r.success) {
        setResult({ totalFiles: r.totalFiles, newFiles: r.newFiles, modifiedFiles: r.modifiedFiles, unchangedFiles: r.unchangedFiles, skippedFiles: r.skippedFiles });
        setMsg({ type: 'ok', text: `扫描完成：${r.newFiles} 新增，${r.modifiedFiles} 变更，${r.unchangedFiles} 未变` });
      } else {
        setMsg({ type: 'err', text: r.message ?? '扫描失败' });
      }
    } catch (e) { setMsg({ type: 'err', text: e instanceof Error ? e.message : '扫描失败' }); }
    finally { setBusy(false); }
  };

  return (
    <ToolPanel title="目录直读" desc="直接读取文件夹中的文档并自动入库" gradient="from-amber-500 to-orange-500">
      <Field label="文件夹路径" value={dirPath} onChange={setDirPath} placeholder="/path/to/obsidian-vault" />
      <div className="flex gap-3">
        <Toggle label="递归扫描" sub="包含子文件夹" checked={recursive} onChange={setRecursive} />
      </div>
      <ActionBtn onClick={run} disabled={busy || !dirPath.trim()} busy={busy} label="开始扫描" />
      {result && (
        <div className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3 space-y-1.5 text-[12px]">
          <div className="font-semibold text-[color:var(--ps-text-primary)]">扫描结果</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-center">
              <div className="text-[16px] font-bold text-amber-700">{result.newFiles}</div>
              <div className="text-[10px] text-amber-600">新增</div>
            </div>
            <div className="rounded-lg bg-blue-50 px-2.5 py-2 text-center">
              <div className="text-[16px] font-bold text-blue-700">{result.modifiedFiles}</div>
              <div className="text-[10px] text-blue-600">变更</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-2.5 py-2 text-center">
              <div className="text-[16px] font-bold text-gray-600">{result.unchangedFiles}</div>
              <div className="text-[10px] text-gray-500">未变</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-2.5 py-2 text-center">
              <div className="text-[16px] font-bold text-gray-600">{result.skippedFiles}</div>
              <div className="text-[10px] text-gray-500">跳过</div>
            </div>
          </div>
          <div className="text-[10px] text-[color:var(--ps-text-tertiary)]">共扫描 {result.totalFiles} 个文件</div>
        </div>
      )}
      {msg && <Msg type={msg.type} text={msg.text} />}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: 视频转文字                                                    */
/* ------------------------------------------------------------------ */

function VideoTranscribeView(): JSX.Element {
  const { status: vkStatus } = useVaultKeeper();
  const [filePath, setFilePath] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const run = async () => {
    if (!filePath.trim()) return;
    if (vkStatus?.state !== 'running') { setMsg({ type: 'err', text: '请先启动 VaultKeeper' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await window.pinStack.vaultkeeper.exportFile({ inputPath: filePath.trim(), outputDir: outputDir.trim() || undefined, format: 'docx' });
      setMsg(r.success ? { type: 'ok', text: '转写任务已提交' } : { type: 'err', text: r.message ?? '失败' });
    } catch (e) { setMsg({ type: 'err', text: e instanceof Error ? e.message : '失败' }); }
    finally { setBusy(false); }
  };

  return (
    <ToolPanel title="视频转文字" desc="从视频/音频中提取文字内容" gradient="from-rose-500 to-pink-500">
      <Field label="视频/音频文件" value={filePath} onChange={setFilePath} placeholder="/path/to/video.mp4" />
      <Field label="输出目录" value={outputDir} onChange={setOutputDir} placeholder="默认与输入同目录" />
      <ActionBtn onClick={run} disabled={busy || !filePath.trim() || vkStatus?.state !== 'running'} busy={busy} label="开始转写" />
      {msg && <Msg type={msg.type} text={msg.text} />}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Jobs Panel (slide-over)                                             */
/* ------------------------------------------------------------------ */

function JobsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const { getJob, status: vkStatus } = useVaultKeeper();
  const [jobs, setJobs] = useState<Map<string, VkJob>>(new Map());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const updated = new Map<string, VkJob>();
      for (const [id] of jobs) {
        try { const r = await getJob(id); if (r.success) updated.set(id, r.data); } catch { /* skip */ }
      }
      setJobs(updated);
    } finally { setLoading(false); }
  }, [jobs, getJob]);

  useEffect(() => {
    const hasActive = Array.from(jobs.values()).some(isActiveJob);
    if (!hasActive) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [jobs, refresh]);

  const sorted = Array.from(jobs.values()).sort((a, b) => {
    const rank = (j: VkJob) => isActiveJob(j) ? 0 : j.status === 'done' ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
      exit={{ x: 40, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
      className="absolute inset-0 z-10 flex flex-col bg-white/95 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-[color:var(--ps-border-subtle)] px-5 py-3">
        <div className="flex items-center gap-2">
          <PinStackIcon name="panel" size={16} className="text-[color:var(--ps-text-secondary)]" />
          <span className="text-[14px] font-semibold text-[color:var(--ps-text-primary)]">任务队列</span>
          <span className="text-[11px] text-[color:var(--ps-text-tertiary)]">{sorted.length} 个任务</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refresh} disabled={loading} className="pinstack-btn pinstack-btn-ghost motion-button h-7 px-2 text-[11px] disabled:opacity-50">{loading ? '刷新中...' : '刷新'}</button>
          <button type="button" onClick={onClose} className="pinstack-btn pinstack-btn-ghost motion-button h-7 w-7 !px-0"><PinStackIcon name="close" size={14} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {vkStatus?.state !== 'running' && <Msg type="err" text="VaultKeeper 未运行" />}
        {sorted.length === 0 && vkStatus?.state === 'running' && <div className="py-12 text-center text-[13px] text-[color:var(--ps-text-tertiary)]">暂无任务</div>}
        {sorted.map((job) => {
          const cfg = JOB_STATUS_MAP[job.status];
          const active = isActiveJob(job);
          return (
            <div key={job.jobId} className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[color:var(--ps-text-tertiary)]">{job.jobId.slice(0, 8)}...</span>
                <span className={`rounded-full border px-1.5 py-px text-[9px] font-medium ${cfg.cls}`}>{cfg.label}</span>
                {active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />}
              </div>
              {job.result?.title && <p className="mt-1 truncate text-[12px] font-medium text-[color:var(--ps-text-primary)]">{job.result.title}</p>}
              {job.result && (
                <div className="mt-1 flex gap-3 text-[10px] text-[color:var(--ps-text-secondary)]">
                  {job.result.wordCount != null && <span>{job.result.wordCount.toLocaleString()} 字</span>}
                  {job.result.duration != null && <span>{fmtDuration(job.result.duration)}</span>}
                </div>
              )}
              {job.error && <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700">{job.error}</div>}
              {job.logs.length > 0 && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[10px] text-[color:var(--ps-text-tertiary)]">日志 ({job.logs.length})</summary>
                  <div className="mt-1 max-h-[80px] space-y-0.5 overflow-y-auto rounded-lg bg-gray-50 px-2 py-1">
                    {job.logs.slice(-15).map((e: VkJobLogEntry, i: number) => (
                      <div key={i} className={`font-mono text-[9px] leading-3.5 ${e.level === 'error' ? 'text-red-600' : e.level === 'warn' ? 'text-amber-600' : 'text-[color:var(--ps-text-tertiary)]'}`}>
                        <span className="opacity-60">{e.timestamp}</span> {e.message}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared UI primitives                                               */
/* ------------------------------------------------------------------ */

function ToolPanel({ title, desc, gradient, children }: { title: string; desc: string; gradient: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-sm`}>
          <PinStackIcon name="spark" size={16} className="text-white" />
        </span>
        <div>
          <h3 className="text-[16px] font-semibold text-[color:var(--ps-text-primary)]">{title}</h3>
          <p className="text-[12px] text-[color:var(--ps-text-tertiary)]">{desc}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-5 backdrop-blur-sm space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }): JSX.Element {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[color:var(--ps-text-primary)]">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="pinstack-field motion-interactive h-9 w-full px-3 text-[12px]" />
    </div>
  );
}

function ActionBtn({ onClick, disabled, busy, label }: { onClick: () => void; disabled: boolean; busy: boolean; label: string }): JSX.Element {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="pinstack-btn motion-button inline-flex h-9 w-full items-center justify-center rounded-xl bg-[color:var(--ps-brand-primary)] px-4 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? '处理中...' : label}
    </button>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--ps-surface-hover)]">
      <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      <div>
        <div className="text-[11px] font-medium text-[color:var(--ps-text-primary)]">{label}</div>
        <div className="text-[9px] text-[color:var(--ps-text-tertiary)]">{sub}</div>
      </div>
    </button>
  );
}

function ResultList({ results }: { results: VkExportResult[] }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-[color:var(--ps-text-primary)]">导出结果</div>
      {results.map((r, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[10px] text-[color:var(--ps-text-primary)]">{r.outputPath}</div>
            <div className="mt-0.5 text-[9px] text-[color:var(--ps-text-tertiary)]">{r.format.toUpperCase()} / {fmtDuration(r.duration)}</div>
          </div>
          <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[9px] font-medium text-emerald-700">完成</span>
        </div>
      ))}
    </div>
  );
}

function Msg({ type, text }: { type: 'ok' | 'err'; text: string }): JSX.Element {
  return (
    <div className={`rounded-xl border px-3 py-2 text-[11px] ${type === 'err' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main View                                                          */
/* ------------------------------------------------------------------ */

export function VaultKeeperView(): JSX.Element {
  const [activeTool, setActiveTool] = useState<VkTool | null>(null);
  const [showJobs, setShowJobs] = useState(false);
  const [prevTool, setPrevTool] = useState<VkTool | null>(null);

  const handleNavigate = (tool: VkTool) => {
    setPrevTool(activeTool);
    setActiveTool(tool);
  };

  const handleBack = () => {
    setPrevTool(activeTool);
    setActiveTool(null);
  };

  const direction = (() => {
    if (activeTool === null && prevTool !== null) return -1;
    if (activeTool !== null && prevTool === null) return 1;
    const ai = TOOLS.findIndex((t) => t.id === activeTool);
    const pi = TOOLS.findIndex((t) => t.id === prevTool);
    return ai > pi ? 1 : -1;
  })();

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Status bar */}
      <div className="shrink-0 pb-3">
        <StatusBar />
      </div>

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <AnimatePresence mode="wait">
          {activeTool ? (
            <motion.button
              key="back"
              type="button"
              onClick={handleBack}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, x: -10, transition: { duration: 0.12 } }}
              className="motion-button flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-[color:var(--ps-text-secondary)] transition-colors hover:bg-[color:var(--ps-surface-hover)]"
            >
              <PinStackIcon name="arrow-left" size={14} />
              返回工具箱
            </motion.button>
          ) : (
            <motion.div
              key="header"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h2 className="text-[18px] font-bold text-[color:var(--ps-text-primary)]">工具箱</h2>
              <p className="mt-0.5 text-[12px] text-[color:var(--ps-text-tertiary)]">选择一个工具开始处理</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setShowJobs(true)}
          className="motion-button flex items-center gap-1.5 rounded-lg border border-[color:var(--ps-border-subtle)] px-2.5 py-1.5 text-[11px] text-[color:var(--ps-text-secondary)] transition-colors hover:bg-[color:var(--ps-surface-hover)]"
        >
          <PinStackIcon name="panel" size={13} />
          任务队列
        </button>
      </div>

      {/* Content area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeTool ?? 'home'}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 overflow-y-auto pr-1 scroll-smooth-y"
          >
            {activeTool === null && <ToolGrid onNavigate={handleNavigate} />}
            {activeTool === 'convert' && <ConvertView />}
            {activeTool === 'image-download' && <ImageDownloadView />}
            {activeTool === 'text-pack' && <TextPackView />}
            {activeTool === 'web-collect' && <DirectoryReadView />}
            {activeTool === 'video-transcribe' && <VideoTranscribeView />}
          </motion.div>
        </AnimatePresence>

        {/* Jobs overlay */}
        <AnimatePresence>
          {showJobs && <JobsPanel onClose={() => setShowJobs(false)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
