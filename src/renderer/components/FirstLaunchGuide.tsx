import { useEffect, useMemo, useRef, useState } from 'react';
import { PinStackIcon } from '../design-system/icons';

interface FirstLaunchGuideProps {
  recordCount: number;
}

const ONBOARDING_COMPLETED_KEY = 'pinstack.onboarding.completed';

type OnboardingStep = 1 | 2 | 3;
type TargetKey = 'mode' | 'settings';

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readTargetRect(target: TargetKey): TargetRect | null {
  const node = document.querySelector<HTMLElement>(`[data-onboarding-target="${target}"]`);
  if (!node) {
    return null;
  }

  const rect = node.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

function buildBubbleStyle(rect: TargetRect | null, align: 'left' | 'right') {
  if (!rect) {
    return undefined;
  }

  const top = Math.max(84, rect.top + rect.height + 14);
  if (align === 'left') {
    return {
      top,
      left: Math.max(24, rect.left - 64)
    };
  }

  return {
    top,
    left: Math.max(24, rect.left - 220 + rect.width)
  };
}

function GuideBubble({
  label,
  title,
  description,
  style,
  direction
}: {
  label: string;
  title: string;
  description: string;
  style?: { top: number; left: number };
  direction: 'left' | 'right';
}): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute z-[141] w-[240px] rounded-[16px] border border-[color:var(--ps-border-subtle)] bg-[rgba(255,255,255,0.96)] px-4 py-3 text-left shadow-[0_18px_36px_rgba(22,22,22,0.08)] backdrop-blur-xl"
      style={style}
    >
      <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--ps-text-tertiary)]">{label}</div>
      <div className="mt-1 text-[13px] font-semibold text-[color:var(--ps-text-primary)]">{title}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--ps-text-secondary)]">{description}</p>
      <span
        className={`absolute -top-2 h-4 w-4 rotate-45 border-l border-t border-[color:var(--ps-border-subtle)] bg-[rgba(255,255,255,0.98)] ${
          direction === 'left' ? 'left-8' : 'right-8'
        }`}
      />
    </div>
  );
}

function GuideStepCard({
  icon,
  title,
  description
}: {
  icon: 'capture' | 'all' | 'duplicate' | 'settings';
  title: string;
  description?: string;
}): JSX.Element {
  return (
    <div className="rounded-[12px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-surface)] px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(255,255,255,0.9)] text-[color:var(--ps-text-primary)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]">
          <PinStackIcon name={icon} size={15} />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-[color:var(--ps-text-primary)]">{title}</div>
          {description ? <p className="mt-1 text-[13px] leading-6 text-[color:var(--ps-text-secondary)]">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function FirstLaunchGuide({ recordCount }: FirstLaunchGuideProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<OnboardingStep>(1);
  const [modeRect, setModeRect] = useState<TargetRect | null>(null);
  const [settingsRect, setSettingsRect] = useState<TargetRect | null>(null);
  const screenTwoBaselineRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const completed = window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === '1';
      if (!completed) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible || step !== 2) {
      screenTwoBaselineRef.current = null;
      return;
    }

    if (screenTwoBaselineRef.current === null) {
      screenTwoBaselineRef.current = recordCount;
    }
  }, [recordCount, step, visible]);

  useEffect(() => {
    if (!visible || step !== 2) {
      return;
    }

    const baseline = screenTwoBaselineRef.current;
    if (baseline === null) {
      return;
    }

    if (recordCount > baseline) {
      setStep(3);
    }
  }, [recordCount, step, visible]);

  useEffect(() => {
    if (!visible || step !== 3) {
      return;
    }

    const syncTargets = () => {
      setModeRect(readTargetRect('mode'));
      setSettingsRect(readTargetRect('settings'));
    };

    syncTargets();
    window.addEventListener('resize', syncTargets);
    window.addEventListener('scroll', syncTargets, true);

    const timer = window.setTimeout(syncTargets, 120);

    return () => {
      window.removeEventListener('resize', syncTargets);
      window.removeEventListener('scroll', syncTargets, true);
      window.clearTimeout(timer);
    };
  }, [step, visible]);

  const completeOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
    } catch {
      // Keep non-blocking.
    }
    setVisible(false);
  };

  const skipOnboarding = () => {
    completeOnboarding();
  };

  const nextStep = () => {
    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    completeOnboarding();
  };

  const modeBubbleStyle = useMemo(() => buildBubbleStyle(modeRect, 'left'), [modeRect]);
  const settingsBubbleStyle = useMemo(() => buildBubbleStyle(settingsRect, 'right'), [settingsRect]);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[130] bg-[rgba(245,245,243,0.72)] backdrop-blur-[6px]">
      {step === 3 ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,250,0.08),transparent_42%)]" />
          <GuideBubble
            label="Mode"
            title="运行模式"
            description="模式决定复制或截图后，内容是自动弹出、按自定义处理，还是全部关闭。"
            style={modeBubbleStyle}
            direction="left"
          />
          <GuideBubble
            label="Settings"
            title="设置入口"
            description="你可以在这里调整软件行为，比如快捷键、截图方式、生效范围和高级设置。"
            style={settingsBubbleStyle}
            direction="right"
          />
        </>
      ) : null}

      <div className="flex h-full items-center justify-center p-4">
        <section className="relative w-full max-w-[460px] rounded-[20px] border border-[color:var(--ps-border-subtle)] bg-[rgba(255,255,255,0.98)] p-6 text-[color:var(--ps-text-primary)] shadow-[0_22px_42px_rgba(22,22,22,0.08)] backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[color:var(--ps-text-tertiary)]">PinStack · 首次使用 · {step}/3</p>
            <button
              type="button"
              onClick={skipOnboarding}
              className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[12px]"
            >
              跳过
            </button>
          </div>

          {step === 1 ? (
            <>
              <h3 className="text-[24px] font-semibold tracking-[0.01em] text-[color:var(--ps-text-primary)]">欢迎使用 PinStack</h3>
              <p className="mt-3 max-w-[28ch] text-[14px] leading-7 text-[color:var(--ps-text-secondary)]">
                先做一次 30 秒自检，你就能确定功能是否正常，不用靠猜。
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h3 className="text-[24px] font-semibold tracking-[0.01em] text-[color:var(--ps-text-primary)]">先完成这 3 步</h3>
              <div className="mt-4 space-y-2">
                <GuideStepCard icon="all" title="1. 看顶部系统状态条是否为绿色" description="如果有黄色或红色提示，先点“一键检测”。" />
                <GuideStepCard icon="capture" title="2. 试一次截图（Command + Shift + 1）" description="确认最近截图状态变成“成功”。" />
                <GuideStepCard icon="duplicate" title="3. 回到面板确认内容已出现" description="看到新内容就代表主流程已跑通。" />
              </div>
              <p className="mt-4 rounded-[12px] border border-[rgba(124,92,250,0.18)] bg-[color:var(--ps-brand-soft)] px-3 py-2.5 text-[13px] text-[color:var(--ps-brand-primary)]">
                检测通过后，你就可以放心使用：复制 / 截图 → 自动保存 → 再次使用
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h3 className="text-[24px] font-semibold tracking-[0.01em] text-[color:var(--ps-text-primary)]">关键控制</h3>
              <p className="mt-3 max-w-[28ch] text-[14px] leading-7 text-[color:var(--ps-text-secondary)]">
                不确定时先看状态条；遇到问题优先点“一键检测”和“打开系统设置”。
              </p>
              <div className="mt-4 space-y-3">
                <GuideStepCard
                  icon="all"
                  title="Mode：决定复制或截图后如何处理"
                  description="Auto 自动弹出，Silent 静默保存，Off 完全关闭。"
                />
                <GuideStepCard
                  icon="settings"
                  title="Settings：调整软件行为"
                  description="主要用于快捷键、权限排查和行为细调。"
                />
              </div>
            </>
          ) : null}

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              onClick={nextStep}
              className="pinstack-btn pinstack-btn-primary motion-button h-10 px-4 text-[13px] font-medium"
            >
              {step === 1 ? '开始自检' : step === 2 ? '我去试试截图' : '知道了'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
