interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled = false }: ToggleSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }
        onChange(!checked);
      }}
      className={`motion-toggle relative h-[31px] w-[51px] rounded-full border border-[color:var(--ps-border-default)] bg-[color:var(--ps-bg-subtle)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <span
        className="motion-toggle-knob pointer-events-none absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full shadow-[0_1px_3px_rgba(22,22,22,0.12)]"
        style={{
          backgroundColor: checked ? 'var(--ps-brand-primary)' : '#FFFFFF',
          transform: `translateX(${checked ? '20px' : '0px'})`
        }}
      />
    </button>
  );
}
