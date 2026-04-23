import { useEffect, useRef, useState } from 'react';
import type { RecordUseCase } from '../../../../shared/types';
import { AnchoredLayer } from '../../../components/AnchoredLayer';

interface ModernUseCasePickerProps {
  currentUseCase: RecordUseCase;
  disabled?: boolean;
  onSelect: (useCase: RecordUseCase) => Promise<void>;
}

const USE_CASE_OPTIONS: Array<{ value: RecordUseCase; label: string }> = [
  { value: 'unclassified', label: '待整理' },
  { value: 'prompt', label: '提示词' },
  { value: 'output', label: '生成结果' },
  { value: 'fix', label: '问题修复' },
  { value: 'flow', label: '操作流程' },
  { value: 'reference', label: '参考资料' }
];

export function ModernUseCasePicker({
  currentUseCase,
  disabled = false,
  onSelect
}: ModernUseCasePickerProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    if (!justUpdated) {
      return;
    }

    const timer = window.setTimeout(() => {
      setJustUpdated(false);
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [justUpdated]);

  return (
    <div ref={rootRef} className={`relative isolate ${open ? 'z-[120]' : 'z-10'}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || isSaving}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="motion-button radius-control bg-white/45 px-2 py-1 hover:bg-white/65 disabled:opacity-60"
      >
        {isSaving ? '归类中...' : justUpdated ? '已归类' : '归类'}
      </button>

      <AnchoredLayer
        open={open}
        anchorRef={buttonRef}
        onRequestClose={() => setOpen(false)}
        preferredPlacement="bottom"
        align="start"
        offset={6}
        zIndex={240}
        className="motion-popover pinstack-subpanel w-[176px] overflow-hidden rounded-[16px] px-2 py-2 shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-black/6"
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="px-2 pb-1.5 pt-1">
            <p className="text-[11px] font-semibold tracking-[0.04em] text-[color:var(--ps-text-tertiary)]">
              归类到
            </p>
          </div>
          <div className="space-y-0.5">
            {USE_CASE_OPTIONS.map((option) => {
              const active = option.value === currentUseCase;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    if (active) {
                      setOpen(false);
                      return;
                    }

                    setIsSaving(true);
                    try {
                      await onSelect(option.value);
                      setJustUpdated(true);
                      setOpen(false);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className={`pinstack-dropdown-item motion-button flex h-8 w-full items-center justify-start rounded-[10px] px-3 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-45 ${
                    active ? 'bg-[color:var(--ps-brand-soft)] text-[color:var(--ps-brand-primary)]' : ''
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </AnchoredLayer>
    </div>
  );
}
