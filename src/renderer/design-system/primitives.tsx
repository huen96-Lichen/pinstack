import type { ReactNode } from 'react';
import { PinStackIcon, type PinStackIconName } from './icons';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="pinstack-section-eyebrow">{eyebrow}</div> : null}
        <h2 className="pinstack-section-title">{title}</h2>
        {description ? <p className="pinstack-section-description">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface SidebarItemProps {
  icon: PinStackIconName;
  label: string;
  active?: boolean;
  meta?: ReactNode;
  onClick: () => void;
}

export function SidebarItem({ icon, label, active = false, meta, onClick }: SidebarItemProps): JSX.Element {
  return (
    <button type="button" onClick={onClick} className={`pinstack-sidebar-item motion-button ${active ? 'is-active' : ''}`}>
      <span className="flex min-w-0 items-center gap-3">
        <span className={`pinstack-sidebar-icon ${active ? 'is-active' : ''}`}>
          <PinStackIcon name={icon} size={16} />
        </span>
        <span className="truncate text-left">{label}</span>
      </span>
      {meta ? <span className="shrink-0 text-[11px] text-[color:var(--ps-text-tertiary)]">{meta}</span> : null}
    </button>
  );
}

interface FieldShellProps {
  label: string;
  description?: string;
  children: ReactNode;
}

export function FieldShell({ label, description, children }: FieldShellProps): JSX.Element {
  return (
    <label className="block">
      <span className="pinstack-field-label">{label}</span>
      {description ? <span className="pinstack-field-help">{description}</span> : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function CardHeaderActions({ children }: { children: ReactNode }): JSX.Element {
  return <div className="pinstack-card-header-actions">{children}</div>;
}

interface SettingsNavItemProps {
  icon: PinStackIconName;
  label: string;
  active?: boolean;
  badge?: string;
  onClick: () => void;
}

export function SettingsNavItem({ icon, label, active = false, badge, onClick }: SettingsNavItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`settings-nav-item motion-button w-full text-left ${active ? 'is-active' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={`settings-nav-icon ${active ? 'is-active' : ''}`}>
          <PinStackIcon name={icon} size={15} />
        </span>
        <span className="truncate text-[13px]">{label}</span>
      </span>
      {badge ? (
        <span className="settings-nav-badge">{badge}</span>
      ) : null}
    </button>
  );
}

export function BetaBadge(): JSX.Element {
  return (
    <span className="settings-beta-badge">Beta</span>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="settings-empty-state">
      {icon ? <div className="settings-empty-state-icon">{icon}</div> : null}
      <div className="settings-empty-state-title">{title}</div>
      {description ? <div className="settings-empty-state-desc">{description}</div> : null}
      {action ? <div className="settings-empty-state-action">{action}</div> : null}
    </div>
  );
}
