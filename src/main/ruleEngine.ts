import type { RecordUseCase, RuntimeSettings } from '../shared/types';
import { isFlowSourceApp } from './sourceClassifier';

export type RuleAction = 'pin' | 'save' | 'ignore';

export type RuleContent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
    };

export interface RuleMetadata {
  sourceApp?: string | null;
  length?: number | null;
}

export interface RuleInput {
  content: RuleContent;
  metadata: RuleMetadata;
}

export interface RuleResult {
  action: RuleAction;
  matchedRule: string;
}

export interface Rule {
  name: string;
  evaluate: (input: RuleInput) => RuleAction | undefined;
}

export interface RuleEngineOptions {
  appBlacklist?: string[];
  getRuntimeSettings?: () => RuntimeSettings;
  appRules?: Rule[];
  contentRules?: Rule[];
  fallbackAction?: RuleAction;
}

export type SuggestedUseCase = 'input' | 'result' | 'issue' | 'method' | 'reference' | 'inbox';
export type SuggestionConfidence = 'explicit' | 'fuzzy' | 'default';

export interface ClassificationSuggestion {
  suggestedUseCase: SuggestedUseCase;
  useCase: RecordUseCase;
  tags: string[];
  matchedRule: string;
  confidence: SuggestionConfidence;
}

const DEFAULT_SHORT_TEXT_LENGTH = 3;
const INPUT_KEYWORDS = ['请帮我', '帮我', '生成', '翻译', '优化', 'implement', 'generate', 'translate', 'improve'];
const ISSUE_KEYWORDS = ['error', 'bug', '报错', 'failed', 'exception', '怎么解决', '为什么'];
const METHOD_COMMAND_KEYWORDS = ['npm', 'git', 'cd', 'pnpm', 'yarn'];
const ACTION_HINT_KEYWORDS = ['请', '帮', '生成', '翻译', '优化', '修复', '实现', '做个', '写个'];
const RESULT_STRUCTURE_HINT = /(^|\n)\s*([-*•]|\d+\.)\s+/;
const QUESTION_HINT = /[?？]|为什么|怎么解决|如何解决/;
const CODE_HINT = /```|(^|\n)\s*(npm|pnpm|yarn|git|cd)\s+|[{};]/i;

export class RuleEngine {
  private readonly appRules: Rule[];
  private readonly contentRules: Rule[];
  private readonly fallbackAction: RuleAction;
  private readonly getRuntimeSettings: () => RuntimeSettings;

  public constructor(options: RuleEngineOptions = {}) {
    const blacklist = new Set(
      (options.appBlacklist ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)
    );

    this.appRules = [
      createSourceAppBlacklistRule(blacklist),
      ...(options.appRules ?? [])
    ];

    this.contentRules = [
      createEmptyTextRule(),
      createShortTextRule(DEFAULT_SHORT_TEXT_LENGTH),
      ...(options.contentRules ?? [])
    ];

    this.fallbackAction = options.fallbackAction ?? 'pin';
    this.getRuntimeSettings =
      options.getRuntimeSettings ??
      (() => ({
        mode: 'auto',
        pinBehaviorMode: 'auto',
        dashboardSizePreset: 'medium',
        enableImagePin: true,
        enableTextPin: true,
        enableFlowPin: true,
        uiMode: 'modern',
        dashboardAlwaysOnTop: true,
        enableCaptureLauncher: true,
        rememberCaptureRecentSizes: true,
        defaultCaptureSizePreset: 'recent',
        showStatusHints: true,
        captureRecentSizes: [],
        captureLauncherPosition: undefined,
        capsule: {
          enabled: true,
          surfaceMode: 'glass',
          anchorDisplayPolicy: 'active-display',
          hoverEnabled: true,
          animationPreset: 'smooth',
          expandedAutoCollapseMs: 2200,
          balancedEntryOrder: ['screenshot', 'ai', 'workspace'],
          displayTitle: 'PinStack',
          quickApps: [],
          enabledModules: ['screenshot', 'ai', 'workspace'],
          showMusicContent: true,
          showQuickApps: true
        }
      }));
  }

  public evaluate(input: RuleInput): RuleResult {
    const normalized = normalizeRuleInput(input);
    const runtime = this.getRuntimeSettings();
    const isFlowSource = isFlowSourceApp(normalized.metadata.sourceApp);

    // 防御性检查：pinBehaviorMode 为 off 时，不弹出 Pin
    if (runtime.pinBehaviorMode === 'off') {
      if (normalized.content.type === 'image') {
        return {
          action: 'save',
          matchedRule: 'settings.pinBehaviorMode.off.image.save'
        };
      }

      return {
        action: 'ignore',
        matchedRule: 'settings.pinBehaviorMode.off.ignore'
      };
    }

    if (runtime.mode === 'off') {
      if (normalized.content.type === 'image') {
        return {
          action: 'save',
          matchedRule: 'settings.mode.off.image.save'
        };
      }

      return {
        action: 'ignore',
        matchedRule: 'settings.mode.off.ignore'
      };
    }

    if (runtime.mode === 'silent') {
      return {
        action: 'save',
        matchedRule: 'settings.mode.silent.save'
      };
    }

    for (const rule of this.appRules) {
      const action = rule.evaluate(normalized);
      if (action) {
        return {
          action,
          matchedRule: rule.name
        };
      }
    }

    if (isFlowSource && runtime.enableFlowPin === false) {
      return {
        action: 'save',
        matchedRule: 'settings.flowPinDisabled.save'
      };
    }

    if (!isFlowSource && normalized.content.type === 'image' && runtime.enableImagePin === false) {
      return {
        action: 'save',
        matchedRule: 'settings.imagePinDisabled.save'
      };
    }

    if (!isFlowSource && normalized.content.type === 'text' && runtime.enableTextPin === false) {
      return {
        action: 'save',
        matchedRule: 'settings.textPinDisabled.save'
      };
    }

    for (const rule of this.contentRules) {
      const action = rule.evaluate(normalized);
      if (action) {
        return {
          action,
          matchedRule: rule.name
        };
      }
    }

    return {
      action: this.fallbackAction,
      matchedRule: 'default.fallback'
    };
  }
}

function createSourceAppBlacklistRule(blacklist: ReadonlySet<string>): Rule {
  return {
    name: 'app.blacklist.save',
    evaluate: (input) => {
      const app = (input.metadata.sourceApp ?? '').trim().toLowerCase();
      if (!app) {
        return undefined;
      }

      return blacklist.has(app) ? 'save' : undefined;
    }
  };
}

function createEmptyTextRule(): Rule {
  return {
    name: 'content.emptyText.ignore',
    evaluate: (input) => {
      if (input.content.type !== 'text') {
        return undefined;
      }

      return input.content.text.trim().length === 0 ? 'ignore' : undefined;
    }
  };
}

function createShortTextRule(minLength: number): Rule {
  return {
    name: 'content.shortText.ignore',
    evaluate: (input) => {
      if (input.content.type !== 'text') {
        return undefined;
      }

      const measuredLength =
        typeof input.metadata.length === 'number' && Number.isFinite(input.metadata.length)
          ? Math.max(0, Math.floor(input.metadata.length))
          : input.content.text.trim().length;

      return measuredLength < minLength ? 'ignore' : undefined;
    }
  };
}

function normalizeRuleInput(input: RuleInput): RuleInput {
  return {
    content: input.content,
    metadata: {
      sourceApp: input.metadata.sourceApp ?? null,
      length: input.metadata.length ?? null
    }
  };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function mapSuggestedUseCaseToRecordUseCase(value: SuggestedUseCase): RecordUseCase {
  if (value === 'input') {
    return 'prompt';
  }
  if (value === 'result') {
    return 'output';
  }
  if (value === 'issue') {
    return 'fix';
  }
  if (value === 'method') {
    return 'flow';
  }
  if (value === 'reference') {
    return 'reference';
  }
  return 'unclassified';
}

function inferSourceTag(sourceApp: string | null | undefined): string | null {
  const normalized = normalizeText(sourceApp);
  if (!normalized) {
    return null;
  }
  if (normalized.includes('chatgpt')) {
    return 'chatgpt';
  }
  if (normalized.includes('codex')) {
    return 'codex';
  }
  if (normalized.includes('terminal') || normalized.includes('iterm')) {
    return 'terminal';
  }
  return null;
}

function inferKeywordTags(text: string): string[] {
  const normalized = normalizeText(text);
  const tags: string[] = [];

  if (normalized.includes('react')) {
    tags.push('react');
  }
  if (
    normalized.includes(' ui ') ||
    normalized.startsWith('ui ') ||
    normalized.endsWith(' ui') ||
    normalized.includes('界面') ||
    normalized.includes('页面')
  ) {
    tags.push('ui');
  }
  if (normalized.includes('bug') || normalized.includes('error') || normalized.includes('报错') || normalized.includes('failed')) {
    tags.push('bug');
  }
  if (CODE_HINT.test(text)) {
    tags.push('code');
  }

  return [...new Set(tags)];
}

export function suggestClassification(input: RuleInput): ClassificationSuggestion {
  const sourceTag = inferSourceTag(input.metadata.sourceApp);
  const tags = sourceTag ? [sourceTag] : [];

  if (input.content.type === 'image') {
    return {
      suggestedUseCase: 'inbox',
      useCase: mapSuggestedUseCaseToRecordUseCase('inbox'),
      tags,
      matchedRule: 'default.image.inbox',
      confidence: 'default'
    };
  }

  const rawText = input.content.text ?? '';
  const text = normalizeText(rawText);
  const textLength = input.metadata.length && Number.isFinite(input.metadata.length) ? input.metadata.length : text.length;
  const hasQuestion = QUESTION_HINT.test(rawText);
  const hasStructuredList = RESULT_STRUCTURE_HINT.test(rawText);
  const hasTerminalCommand = includesAny(text, METHOD_COMMAND_KEYWORDS);
  const hasActionHint = includesAny(text, ACTION_HINT_KEYWORDS);

  tags.push(...inferKeywordTags(rawText));
  if (hasTerminalCommand) {
    tags.push('code');
  }

  if (includesAny(text, ISSUE_KEYWORDS) || (hasQuestion && includesAny(text, ['error', 'bug', '失败', '异常', '解决']))) {
    return {
      suggestedUseCase: 'issue',
      useCase: mapSuggestedUseCaseToRecordUseCase('issue'),
      tags: [...new Set(tags)],
      matchedRule: 'explicit.issue.keyword',
      confidence: 'explicit'
    };
  }

  if (includesAny(text, INPUT_KEYWORDS)) {
    return {
      suggestedUseCase: 'input',
      useCase: mapSuggestedUseCaseToRecordUseCase('input'),
      tags: [...new Set(tags)],
      matchedRule: 'explicit.input.keyword',
      confidence: 'explicit'
    };
  }

  if (hasTerminalCommand && (hasStructuredList || text.split('\n').length >= 2)) {
    return {
      suggestedUseCase: 'method',
      useCase: mapSuggestedUseCaseToRecordUseCase('method'),
      tags: [...new Set(tags)],
      matchedRule: 'explicit.method.command',
      confidence: 'explicit'
    };
  }

  if (textLength >= 120 && !hasQuestion && (hasStructuredList || text.split('\n').length >= 3)) {
    return {
      suggestedUseCase: 'result',
      useCase: mapSuggestedUseCaseToRecordUseCase('result'),
      tags: [...new Set(tags)],
      matchedRule: 'explicit.result.structured',
      confidence: 'explicit'
    };
  }

  if (textLength <= 80 && !hasActionHint && !hasQuestion) {
    return {
      suggestedUseCase: 'reference',
      useCase: mapSuggestedUseCaseToRecordUseCase('reference'),
      tags: [...new Set(tags)],
      matchedRule: 'explicit.reference.short',
      confidence: 'explicit'
    };
  }

  if (hasTerminalCommand || hasStructuredList) {
    return {
      suggestedUseCase: 'method',
      useCase: mapSuggestedUseCaseToRecordUseCase('method'),
      tags: [...new Set(tags)],
      matchedRule: 'fuzzy.method.pattern',
      confidence: 'fuzzy'
    };
  }

  if (textLength >= 80 && !hasQuestion) {
    return {
      suggestedUseCase: 'result',
      useCase: mapSuggestedUseCaseToRecordUseCase('result'),
      tags: [...new Set(tags)],
      matchedRule: 'fuzzy.result.longText',
      confidence: 'fuzzy'
    };
  }

  return {
    suggestedUseCase: 'inbox',
    useCase: mapSuggestedUseCaseToRecordUseCase('inbox'),
    tags: [...new Set(tags)],
    matchedRule: 'default.inbox',
    confidence: 'default'
  };
}
