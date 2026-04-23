import { useRef, useState } from 'react';
import { AnchoredLayer } from '../../../components/AnchoredLayer';

export interface ModernRecordActionMenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

interface ModernRecordActionMenuProps {
  label: string;
  items: ModernRecordActionMenuItem[];
  variant?: 'default' | 'compact';
}

export function ModernRecordActionMenu({ label, items, variant = 'default' }: ModernRecordActionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isCompact = variant === 'compact';

  return (
    <div ref={rootRef} className={`relative isolate ${open ? 'z-[120]' : 'z-10'}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="pinstack-btn pinstack-btn-ghost motion-button h-8 px-2.5 text-[11px]"
      >
        {label}
      </button>

      <AnchoredLayer
        open={open}
        anchorRef={rootRef}
        onRequestClose={() => setOpen(false)}
        preferredPlacement="bottom"
        align="end"
        offset={6}
        zIndex={240}
        className={`motion-popover pinstack-dropdown-shell ${isCompact ? 'min-w-[150px]' : 'min-w-[184px]'} p-1.5`}
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className={isCompact ? 'space-y-0.5' : 'space-y-1'}>
            {items.map((item, index) => (
              <div key={item.label} className={item.danger && index > 0 ? 'border-t border-[color:var(--ps-border-subtle)] pt-1' : ''}>
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={async () => {
                    await item.onSelect();
                    setOpen(false);
                  }}
                  className={`pinstack-dropdown-item motion-button flex ${isCompact ? 'h-8' : 'h-9'} w-full items-center justify-start px-3 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-45 ${
                    item.danger
                      ? 'text-rose-600 hover:bg-rose-50/88'
                      : ''
                  }`}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      </AnchoredLayer>
    </div>
  );
}
