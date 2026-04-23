import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { RecordType, RecordUseCase } from '../../../../shared/types';
import { getUseCaseBadgeStyle } from '../shared/useCasePalette';
import { getUseCaseDisplayLabel } from '../shared/useCaseLabel';

interface ModernRecordCardHeaderProps {
  title: ReactNode;
  actions: ReactNode;
  titleClassName?: string;
  className?: string;
}

interface ModernRecordCardMetaProps {
  useCase: RecordUseCase;
  isSystemSuggested: boolean;
  contentBadge: string;
  tags: string[];
  copiedAt?: number;
  showCopiedAt?: boolean;
  className?: string;
}

interface ModernRecordActionBarProps {
  visible: boolean;
  children: ReactNode;
}

interface ModernRecordActionButtonProps {
  children: ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'confirm';
  className?: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}

const ACTION_BUTTON_TONE_CLASS: Record<NonNullable<ModernRecordActionButtonProps['tone']>, string> = {
  default: 'bg-white/45 hover:bg-white/65',
  danger: 'border border-rose-200/70 bg-rose-50/72 text-rose-700 hover:bg-rose-50',
  confirm: 'bg-emerald-100/80 text-emerald-700 hover:bg-emerald-100'
};

export function getRecordContentBadge(recordType: RecordType, contentSubtype?: string): string {
  if (recordType === 'image') {
    return 'IMAGE';
  }

  if (recordType === 'video') {
    return 'VIDEO';
  }

  return (contentSubtype ?? 'plain').toUpperCase();
}

export function ModernRecordCardHeader({
  title,
  actions,
  titleClassName = 'truncate text-center text-xs font-semibold text-black/85',
  className = 'mb-2'
}: ModernRecordCardHeaderProps): JSX.Element {
  return (
    <div className={`${className} relative min-h-[28px]`}>
      <div className="min-w-0 px-10">
        <div className={titleClassName}>{title}</div>
      </div>
      <div className="absolute right-0 top-0">{actions}</div>
    </div>
  );
}

export function ModernRecordCardMeta({
  useCase,
  isSystemSuggested,
  contentBadge,
  tags,
  copiedAt,
  showCopiedAt = false,
  className = 'mb-2'
}: ModernRecordCardMetaProps): JSX.Element {
  const copiedAtLabel = copiedAt ? new Date(copiedAt).toLocaleString('zh-CN', { hour12: false }) : '';

  return (
    <>
      <div className={`${className} flex flex-wrap items-center gap-1.5`}>
        <span
          className="inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={getUseCaseBadgeStyle(useCase)}
        >
          {getUseCaseDisplayLabel(useCase)}
        </span>
        {isSystemSuggested ? (
          <span className="radius-control inline-flex items-center border border-amber-300/45 bg-amber-200/45 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            系统建议
          </span>
        ) : null}
        <span className="inline-flex items-center rounded-full border border-black/15 bg-white/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/70">
          {contentBadge}
        </span>
      </div>
      {tags.length > 0 || (showCopiedAt && copiedAtLabel) ? (
        <div className="mb-2 space-y-0.5">
          {tags.length > 0 ? <p className="truncate text-[10px] text-black/65">#{tags.join(' #')}</p> : null}
          {showCopiedAt && copiedAtLabel ? <p className="truncate text-[10px] text-black/52">复制时间：{copiedAtLabel}</p> : null}
        </div>
      ) : null}
    </>
  );
}

export function ModernRecordActionBar({ visible, children }: ModernRecordActionBarProps): JSX.Element {
  return (
    <div className={`motion-card-actions mt-3 flex flex-wrap items-center gap-1.5 text-[11px] ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {children}
    </div>
  );
}

export function ModernRecordActionButton({
  children,
  disabled = false,
  tone = 'default',
  className = '',
  onClick
}: ModernRecordActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`motion-button radius-control px-2.5 py-1 disabled:opacity-60 ${ACTION_BUTTON_TONE_CLASS[tone]} ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
