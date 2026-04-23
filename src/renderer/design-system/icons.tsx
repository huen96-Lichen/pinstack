import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { PINSTACK_ICON_ASSET_MAP, type PinStackAssetIconName } from './iconAssetMap';

export type PinStackIconName =
  | PinStackAssetIconName
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-down'
  | 'category'
  | 'check'
  | 'close'
  | 'copy'
  | 'launcher'
  | 'maximize'
  | 'minimize'
  | 'panel'
  | 'pin'
  | 'pin-off'
  | 'spark';

interface PinStackIconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  name: PinStackIconName;
  size?: number;
  title?: string;
  strokeWidth?: number;
}

type IconRenderer = () => ReactNode;

const ICON_ALIASES: Partial<Record<PinStackIconName, PinStackAssetIconName>> = {
  category: 'classify',
  copy: 'duplicate',
  pin: 'pin-top',
  spark: 'ai-workspace'
};

const FALLBACK_ICON_RENDERERS: Partial<Record<PinStackIconName, IconRenderer>> = {
  'arrow-left': () => <path d="M10.5 3.5 6 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />,
  'arrow-right': () => <path d="m5.5 3.5 4.5 4.5-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />,
  'arrow-down': () => <path d="M4.5 6.5 8 10l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />,
  check: () => <path d="M3.25 8.25 6.5 11.5l6.25-6.25" strokeLinecap="round" strokeLinejoin="round" />,
  close: () => (
    <>
      <path d="m4.25 4.25 7.5 7.5" strokeLinecap="round" />
      <path d="m11.75 4.25-7.5 7.5" strokeLinecap="round" />
    </>
  ),
  launcher: () => (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v6M5 8h6" strokeLinecap="round" />
    </>
  ),
  maximize: () => (
    <>
      <path d="M8 3.5v9" strokeLinecap="round" />
      <path d="M3.5 8h9" strokeLinecap="round" />
    </>
  ),
  minimize: () => <path d="M3.5 8h9" strokeLinecap="round" />,
  panel: () => (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="2" />
      <path d="M6 3v10" />
    </>
  ),
  'pin-off': () => (
    <>
      <path d="M5.25 2.75h5.5" strokeLinecap="round" />
      <path d="M10.5 2.75v2l1.75 1.75H3.75L5.5 4.75v-2" strokeLinejoin="round" />
      <path d="M8 6.5v6.75" strokeLinecap="round" />
      <path d="m11.9 10.6 1.35 1.35" strokeLinecap="round" />
      <path d="m13.25 10.6-1.35 1.35" strokeLinecap="round" />
    </>
  )
};

function resolveAssetIconName(name: PinStackIconName): PinStackAssetIconName | null {
  if (name in PINSTACK_ICON_ASSET_MAP) {
    return name as PinStackAssetIconName;
  }

  return ICON_ALIASES[name] ?? null;
}

function buildAssetMaskStyle(src: string, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    display: 'inline-block',
    flexShrink: 0,
    backgroundColor: 'currentColor',
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain'
  };
}

export function PinStackIcon({ name, size = 16, className, title, strokeWidth = 1.45, style, ...rest }: PinStackIconProps): JSX.Element {
  const assetName = resolveAssetIconName(name);

  if (assetName) {
    const src = PINSTACK_ICON_ASSET_MAP[assetName];
    return (
      <span
        className={className}
        style={{
          ...buildAssetMaskStyle(src, size),
          ...style
        }}
        title={title}
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        aria-label={title}
        {...rest}
      />
    );
  }

  const renderer = FALLBACK_ICON_RENDERERS[name];
  if (!renderer) {
    return <span className={className} style={{ width: size, height: size, display: 'inline-block', ...style }} aria-hidden="true" />;
  }

  return (
    <span
      className={className}
      style={style}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      {...rest}
    >
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      >
        {title ? <title>{title}</title> : null}
        {renderer()}
      </svg>
    </span>
  );
}

interface PinStackIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: PinStackIconName;
  label: string;
  tone?: 'ghost' | 'soft' | 'accent' | 'danger';
  size?: 'sm' | 'md';
}

export function PinStackIconButton({
  icon,
  label,
  tone = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: PinStackIconButtonProps): JSX.Element {
  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`pinstack-icon-button pinstack-icon-button-${tone} motion-button ${sizeClass} disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
      {...rest}
    >
      <PinStackIcon name={icon} size={size === 'sm' ? 15 : 16} />
    </button>
  );
}
