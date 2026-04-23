import { useEffect, useMemo, useRef, useState } from 'react';
import { PinStackIcon } from './design-system/icons';
import type { AiHealthResult, AiRuntimeStatus, AiTestResult } from '../shared/types';
import { getAiConnectionLabel, getAiResponseModeLabel } from './features/dashboard/shared/dashboardUtils';

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  kind?: 'message' | 'error';
}

const QUICK_PROMPTS = [
  '帮我整理当前筛选结果，按优先级给出 3 条行动建议',
  '根据当前内容生成统一命名建议',
  '把当前记录浓缩成一段可直接复用的摘要',
  '把下面内容改写成更专业但简洁的表达'
];

function getConnectionTone(status: AiRuntimeStatus | null): string {
  if (!status) return 'bg-slate-200/70 text-slate-700';
  if (status.connectionState === 'connected') return 'bg-emerald-200/75 text-emerald-800';
  if (status.connectionState === 'model_missing') return 'bg-amber-200/75 text-amber-800';
  if (status.connectionState === 'timeout' || status.connectionState === 'error') return 'bg-rose-200/75 text-rose-800';
  return 'bg-slate-200/70 text-slate-700';
}

export function AiAssistantWindow(): JSX.Element {
  const [aiInput, setAiInput] = useState('');
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<AiRuntimeStatus | null>(null);
  const [aiMessages, setAiMessages] = useState<ChatItem[]>([]);
  const [healthResult, setHealthResult] = useState<AiHealthResult | null>(null);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [streamingReply, setStreamingReply] = useState('');
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = aiMessages.length > 0 || Boolean(streamingReply) || Boolean(streamingError);
  const canSend = aiInput.trim().length > 0 && !isAiBusy;

  const scrollToLatestMessage = (behavior: ScrollBehavior = 'smooth') => {
    if (!hasMessages) {
      return;
    }
    window.requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  };

  const refreshAiRuntime = async () => {
    try {
      const status = await window.pinStack.ai.getRuntimeStatus();
      setAiRuntimeStatus(status);
    } catch {
      setAiRuntimeStatus(null);
    }
  };

  const reloadAiSession = async () => {
    try {
      const session = await window.pinStack.ai.getChatSession();
      const msgs = session.messages
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({ id: item.id, role: item.role as 'user' | 'assistant', text: item.text, kind: item.kind }));
      setAiMessages(msgs);
    } catch {
      setAiMessages([]);
    }
  };

  useEffect(() => {
    void refreshAiRuntime();
    void reloadAiSession();
  }, []);

  useEffect(() => {
    const unsubscribe = window.pinStack.ai.onChatStream((payload) => {
      if (payload.phase === 'start') {
        setStreamingReply('');
        setStreamingError(null);
        return;
      }
      if (payload.phase === 'delta') {
        setStreamingReply((prev) => prev + (payload.delta ?? ''));
        return;
      }
      if (payload.phase === 'error') {
        setStreamingError(payload.errorMessage ?? '本地 AI 请求失败，请稍后重试。');
        return;
      }
      if (payload.phase === 'done') {
        setStreamingReply(payload.text ?? '');
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    scrollToLatestMessage('auto');
  }, [aiMessages.length, streamingReply, streamingError]);

  const sendAiChat = async (textFromQuickPrompt?: string) => {
    const text = (textFromQuickPrompt ?? aiInput).trim();
    if (!text || isAiBusy) {
      return;
    }
    setIsAiBusy(true);
    setStreamingReply('');
    setStreamingError(null);
    try {
      const session = await window.pinStack.ai.sendChat(text);
      setAiInput('');
      const msgs = session.messages
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({ id: item.id, role: item.role as 'user' | 'assistant', text: item.text, kind: item.kind }));
      setAiMessages(msgs);
      setTestResult(null);
      setStreamingReply('');
      setStreamingError(null);
      await refreshAiRuntime();
    } finally {
      setIsAiBusy(false);
    }
  };

  const clearAiSession = async () => {
    if (isAiBusy) {
      return;
    }
    setIsAiBusy(true);
    try {
      const session = await window.pinStack.ai.clearChatSession();
      const msgs = session.messages
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({ id: item.id, role: item.role as 'user' | 'assistant', text: item.text, kind: item.kind }));
      setAiMessages(msgs);
      setTestResult(null);
      setStreamingReply('');
      setStreamingError(null);
    } finally {
      setIsAiBusy(false);
    }
  };

  const runHealthCheck = async () => {
    if (isAiBusy) {
      return;
    }
    setIsAiBusy(true);
    try {
      const result = await window.pinStack.ai.healthCheck();
      setHealthResult(result);
      await refreshAiRuntime();
    } finally {
      setIsAiBusy(false);
    }
  };

  const runAiTest = async () => {
    if (isAiBusy) {
      return;
    }
    setIsAiBusy(true);
    try {
      const result = await window.pinStack.ai.test();
      setTestResult(result);
      await refreshAiRuntime();
    } finally {
      setIsAiBusy(false);
    }
  };

  const statusCards = [
    {
      label: '已选择模型',
      value: aiRuntimeStatus?.selectedModelLabel ?? '未检查',
      accent: 'text-[color:var(--ps-text-primary)]'
    },
    {
      label: '连接状态',
      value: getAiConnectionLabel(aiRuntimeStatus),
      accent: 'text-[color:var(--ps-text-primary)]'
    },
    {
      label: '响应模式',
      value: getAiResponseModeLabel(aiRuntimeStatus),
      accent: 'text-[color:var(--ps-text-primary)]'
    }
  ] as const;

  const runtimeHint = aiRuntimeStatus?.message?.trim() ?? '';

  const emptyState = useMemo(
    () => (
      <div className="mx-auto flex h-full w-full max-w-[780px] flex-col justify-center gap-5 px-4 pb-10">
        <div className="rounded-[16px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-subtle)]/70 px-4 py-4 text-[13px] text-[color:var(--ps-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          输入一个目标，我会基于当前内容给出可直接执行的建议、命名、摘要或改写结果。
        </div>
        <div className="grid grid-cols-1 gap-2.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="pinstack-btn pinstack-btn-secondary motion-button h-9 justify-start px-3 text-left text-[12px]"
              onClick={() => void sendAiChat(prompt)}
              disabled={isAiBusy}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    ),
    [isAiBusy]
  );

  return (
    <main className="pinstack-window-page">
      <section className="pinstack-window-panel flex flex-col overflow-hidden">
        <header className="pinstack-window-header px-4 py-2.5">
          <div className="drag-region flex min-h-9 items-start justify-between gap-3">
            <div className="pl-20 pt-0.5">
              <div className="text-[11px] font-semibold tracking-[0.1em] text-[color:var(--ps-text-tertiary)] uppercase">AI Assistant</div>
              <div className="mt-0.5 text-[13px] font-semibold text-[color:var(--ps-text-primary)]">本地 AI 工作区</div>
              <p className="mt-0.5 text-[11px] text-[color:var(--ps-text-secondary)]">
                本地模型优先。当前窗口只提供本地执行路径与诊断。
              </p>
            </div>

            <div className="no-drag flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${getConnectionTone(aiRuntimeStatus)}`}>
                {getAiConnectionLabel(aiRuntimeStatus)}
              </span>
              <button
                type="button"
                onClick={() => void runHealthCheck()}
                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[10px]"
                disabled={isAiBusy}
              >
                重新检测
              </button>
              <button
                type="button"
                onClick={() => void runAiTest()}
                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[10px]"
                disabled={isAiBusy}
              >
                测试调用
              </button>
              <button
                type="button"
                onClick={() => void clearAiSession()}
                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[10px]"
                disabled={isAiBusy || !hasMessages}
              >
                清空会话
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {statusCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[12px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-subtle)] px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--ps-text-tertiary)]">{card.label}</div>
                <div className={`mt-1 text-[13px] font-medium ${card.accent}`}>{card.value}</div>
              </div>
            ))}
          </div>

          {aiRuntimeStatus?.lastError ? (
            <div className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {aiRuntimeStatus.message}
            </div>
          ) : null}

          {!aiRuntimeStatus?.lastError && runtimeHint ? (
            <div className="mt-2 rounded-[12px] border border-[color:var(--ps-border-subtle)] bg-white/60 px-3 py-2 text-[12px] text-[color:var(--ps-text-secondary)]">
              {runtimeHint}
            </div>
          ) : null}

          {healthResult ? (
            <div
              className={`mt-2 rounded-[12px] border px-3 py-2 text-[12px] ${
                healthResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              健康检查：{healthResult.ok ? '成功' : '失败'} · {healthResult.message}
              {typeof healthResult.latencyMs === 'number' ? ` · ${healthResult.latencyMs}ms` : ''}
            </div>
          ) : null}

          {testResult ? (
            <div
              className={`mt-2 rounded-[12px] border px-3 py-2 text-[12px] ${
                testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              测试调用：{testResult.ok ? '成功' : '失败'}
              {typeof testResult.latencyMs === 'number' ? ` · ${testResult.latencyMs}ms` : ''}
              <div className="mt-1 leading-relaxed">{testResult.ok ? testResult.text : testResult.errorMessage}</div>
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {hasMessages ? (
            <div className="mx-auto flex w-full max-w-[780px] flex-col gap-2.5 pb-2">
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5 px-1">
                {QUICK_PROMPTS.slice(0, 3).map((prompt) => (
                  <button
                    key={`followup-${prompt}`}
                    type="button"
                    className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[10px]"
                    onClick={() => void sendAiChat(prompt)}
                    disabled={isAiBusy}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              {aiMessages.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[14px] border px-3 py-2 text-[12px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${
                    item.role === 'user'
                      ? 'ml-10 border-blue-200 bg-blue-50 text-blue-900'
                      : item.kind === 'error'
                        ? 'mr-10 border-amber-200 bg-amber-50 text-amber-900'
                        : 'mr-10 border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-subtle)] text-[color:var(--ps-text-primary)]'
                  }`}
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">
                    {item.role === 'user' ? '你' : item.kind === 'error' ? '系统错误' : '助手'}
                  </div>
                  <div className="whitespace-pre-wrap">{item.text}</div>
                </div>
              ))}

              {isAiBusy && streamingReply ? (
                <div className="mr-10 rounded-[14px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[color:var(--ps-text-primary)]">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">助手（生成中）</div>
                  <div className="whitespace-pre-wrap">{streamingReply}</div>
                </div>
              ) : null}

              {isAiBusy && !streamingReply && !streamingError ? (
                <div className="mr-10 rounded-[14px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-subtle)] px-3 py-2 text-[12px] text-[color:var(--ps-text-secondary)]">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">助手</div>
                  正在思考...
                </div>
              ) : null}

              {isAiBusy && streamingError ? (
                <div className="mr-10 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">助手（失败）</div>
                  <div className="whitespace-pre-wrap">{streamingError}</div>
                </div>
              ) : null}

              <div ref={messageEndRef} className="h-px w-full" aria-hidden="true" />
            </div>
          ) : (
            emptyState
          )}
        </div>

        <footer className="border-t border-[color:var(--ps-border-subtle)] px-4 py-2.5">
          <div className="mx-auto w-full max-w-[780px]">
            <div className="flex items-center gap-2">
              <label className="pinstack-field flex h-10 min-w-0 flex-1 items-center gap-2 px-3">
                <PinStackIcon name="ai-workspace" size={15} className="text-[color:var(--ps-text-tertiary)]" />
                <input
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendAiChat();
                    }
                  }}
                  placeholder="输入你的问题，例如：帮我整理今天收藏的 AI 资料"
                  className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-[color:var(--ps-text-primary)] outline-none placeholder:text-[color:var(--ps-text-tertiary)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void sendAiChat()}
                className="pinstack-btn pinstack-btn-primary motion-button h-10 min-w-20 px-4 text-[12px]"
                disabled={!canSend}
              >
                {isAiBusy ? '发送中…' : '发送'}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-[color:var(--ps-text-tertiary)]">
              <span>Enter 发送，Shift+Enter 换行</span>
              <span>{aiInput.trim().length} 字</span>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
