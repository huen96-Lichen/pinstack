import { useEffect, useState } from 'react';
import type { WikiSettings } from '../../../shared/vk/wikiTypes';
import type { AppSettings } from '../../../shared/types';

export function WikiSettingsPanel(): JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4');
  const [autoLint, setAutoLint] = useState(false);
  const [autoLintInterval, setAutoLintInterval] = useState(24);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const settings = await window.pinStack.settings.get();
        const wiki = settings.vaultkeeper?.wiki;
        if (wiki) {
          setEnabled(wiki.enabled ?? false);
          setBaseUrl(wiki.baseUrl ?? 'https://api.openai.com/v1');
          setApiKey(wiki.apiKey ?? '');
          setModel(wiki.model ?? 'gpt-4');
          setAutoLint(wiki.autoLint ?? false);
          setAutoLintInterval(wiki.autoLintIntervalHours ?? 24);
        }
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    })();
  }, []);

  const mergeVaultkeeperSettings = (settings: AppSettings, wikiConfig: WikiSettings): NonNullable<AppSettings['vaultkeeper']> => ({
    enabled: settings.vaultkeeper?.enabled ?? false,
    autoStart: settings.vaultkeeper?.autoStart ?? true,
    projectRoot: settings.vaultkeeper?.projectRoot ?? '',
    port: settings.vaultkeeper?.port ?? 3210,
    draftDir: settings.vaultkeeper?.draftDir,
    inboxDir: settings.vaultkeeper?.inboxDir,
    libraryDir: settings.vaultkeeper?.libraryDir,
    attachmentsDir: settings.vaultkeeper?.attachmentsDir,
    defaultAiEnhance: settings.vaultkeeper?.defaultAiEnhance,
    enableWhisperX: settings.vaultkeeper?.enableWhisperX,
    webpageMode: settings.vaultkeeper?.webpageMode,
    namingRule: settings.vaultkeeper?.namingRule,
    autoFrontmatter: settings.vaultkeeper?.autoFrontmatter,
    autoTags: settings.vaultkeeper?.autoTags,
    autoMarkdownlint: settings.vaultkeeper?.autoMarkdownlint,
    wiki: wikiConfig,
  });

  const save = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const settings = await window.pinStack.settings.get();
      const wikiConfig: WikiSettings = {
        enabled,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
        autoLint,
        autoLintIntervalHours: autoLintInterval,
      };
      await window.pinStack.settings.set({
        vaultkeeper: mergeVaultkeeperSettings(settings, wikiConfig),
      });
      setSaveMessage('已保存');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      setSaveMessage('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const status = await window.pinStack.wiki.getStatus();
      if (!status.enabled) {
        setTestResult('fail');
        setSaveMessage('知识库未启用，请先保存设置');
        return;
      }
      if (!status.pythonAvailable) {
        setTestResult('fail');
        setSaveMessage('Python openai 包未安装');
        return;
      }
      await window.pinStack.wiki.lint();
      setTestResult('ok');
      setSaveMessage('连接正常');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setTestResult('fail');
      setSaveMessage(err instanceof Error ? `连接失败：${err.message}` : '连接失败');
    } finally {
      setTesting(false);
    }
  };

  const openInObsidian = async () => {
    try {
      await window.pinStack.wiki.openDir();
    } catch {
      /* ignore */
    }
  };

  if (!loaded) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
        <div className="text-[11px] text-slate-500">加载设置中...</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">WikiAgent 设置</h3>

      <div className="space-y-3">
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[12px]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <div className="font-medium text-slate-900">启用知识库自动构建</div>
            <div className="text-[10px] text-slate-500">VK 任务完成后自动提取实体与概念，并连接到 wiki。</div>
          </div>
        </label>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold text-slate-700">LLM 配置</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-0.5 block text-[11px] text-slate-500">API 地址</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="pinstack-field h-8 w-full px-2 text-[11px]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-slate-500">模型</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4"
                className="pinstack-field h-8 w-full px-2 text-[11px]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-slate-500">自动健康检查间隔</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={autoLintInterval}
                  onChange={(e) => setAutoLintInterval(Number(e.target.value) || 24)}
                  className="pinstack-field h-8 w-20 px-2 text-[11px]"
                />
                <span className="text-[11px] text-slate-500">小时</span>
              </div>
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] text-slate-500">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="pinstack-field h-8 w-full px-2 text-[11px]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-[12px] text-slate-700">
          <input
            type="checkbox"
            checked={autoLint}
            onChange={(e) => setAutoLint(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span>启用自动健康检查</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="pinstack-btn h-8 bg-[color:var(--ps-brand-primary)] px-3 text-[12px] text-white disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>

          {saveMessage && (
            <span className={`text-[11px] ${saveMessage === '已保存' ? 'text-emerald-700' : 'text-red-700'}`}>
              {saveMessage}
            </span>
          )}

          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing}
            className="pinstack-btn pinstack-btn-secondary h-8 px-3 text-[12px] disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
            {testResult === 'ok' && <span className="ml-1 text-emerald-700">✓</span>}
            {testResult === 'fail' && <span className="ml-1 text-red-700">✗</span>}
          </button>

          <button
            type="button"
            onClick={() => void openInObsidian()}
            className="pinstack-btn pinstack-btn-ghost h-8 px-3 text-[12px]"
          >
            在 Obsidian 中打开
          </button>
        </div>
      </div>
    </section>
  );
}
