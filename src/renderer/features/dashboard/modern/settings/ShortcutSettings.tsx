import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../../../shared/types';
import {
  CONFIGURABLE_SHORTCUT_KEYS,
  SHORTCUT_SETTING_LABELS,
  type ConfigurableShortcutKey
} from '../../../../../shared/shortcuts';
import { formatShortcutLabel } from '../../shared/dashboardUtils';
import { SettingsSection, SettingRow, pillButtonClass } from './GeneralSettings';

type ShortcutKey = ConfigurableShortcutKey;

function normalizeShortcut(event: KeyboardEvent): string | null {
  if (event.key === 'Escape') {
    return null;
  }

  const key = event.key;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }

  const normalizedKey = (() => {
    if (/^[a-z0-9]$/i.test(key)) {
      return key.toUpperCase();
    }

    const keyMap: Record<string, string> = {
      ' ': 'Space',
      Enter: 'Enter',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      '-': '-',
      '=': '=',
      ',': ',',
      '.': '.',
      '/': '/',
      ';': ';',
      "'": "'",
      '[': '[',
      ']': ']',
      '\\': '\\'
    };

    if (key in keyMap) {
      return keyMap[key];
    }

    if (/^F\d{1,2}$/i.test(key)) {
      return key.toUpperCase();
    }

    return '';
  })();

  if (!normalizedKey || parts.length === 0) {
    return null;
  }

  return [...parts, normalizedKey].join('+');
}

function formatKeyLabel(key: string): string {
  const map: Record<string, string> = {
    'CommandOrControl': '\u2318',
    'Command': '\u2318',
    'Control': '\u2303',
    'Alt': '\u2325',
    'Shift': '\u21E7',
    'Space': '\u2423',
  };
  return map[key] ?? key;
}

function KeyCap({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="settings-keycap inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-[color:var(--ps-border-default)] bg-[color:var(--ps-bg-elevated)] px-1.5 text-[11px] font-medium text-[color:var(--ps-text-primary)] shadow-[0_1px_0_1px_rgba(0,0,0,0.06)]">
      {children}
    </kbd>
  );
}

function ShortcutDisplay({ shortcut }: { shortcut: string }): JSX.Element {
  if (!shortcut.trim()) {
    return <span className="text-[11px] text-[color:var(--ps-text-tertiary)]">未设置</span>;
  }
  const parts = shortcut.split('+').map(p => p.trim());
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-[color:var(--ps-text-tertiary)]">+</span>}
          <KeyCap>{formatKeyLabel(part)}</KeyCap>
        </span>
      ))}
    </span>
  );
}

function getShortcutConflictMessage(
  targetKey: ShortcutKey,
  nextShortcut: string,
  settings: AppSettings
): string | null {
  for (const key of CONFIGURABLE_SHORTCUT_KEYS) {
    if (key === targetKey) {
      continue;
    }
    if (settings[key] === nextShortcut) {
      return `该组合键已与「${SHORTCUT_SETTING_LABELS[key]}」重复，请换一个组合键。`;
    }
  }

  return null;
}

export interface ShortcutSettingsProps {
  localAppSettings: AppSettings;
  setLocalAppSettings: (settings: AppSettings) => void;
  setStatusMessage: (message: string) => void;
}

export function ShortcutSettings({
  localAppSettings,
  setLocalAppSettings,
  setStatusMessage
}: ShortcutSettingsProps): JSX.Element {
  const [recordingShortcutKey, setRecordingShortcutKey] = useState<ShortcutKey | null>(null);

  useEffect(() => {
    if (!recordingShortcutKey) {
      return;
    }

    const handleKeydown = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecordingShortcutKey(null);
        return;
      }

      const nextShortcut = normalizeShortcut(event);
      if (!nextShortcut) {
        setStatusMessage('请至少按下一个修饰键，再配合主按键。');
        return;
      }

      const conflictMessage = getShortcutConflictMessage(recordingShortcutKey, nextShortcut, localAppSettings);
      if (conflictMessage) {
        setStatusMessage(conflictMessage);
        return;
      }

      if (localAppSettings[recordingShortcutKey] === nextShortcut) {
        setRecordingShortcutKey(null);
        setStatusMessage('快捷键未变更。');
        return;
      }

      setLocalAppSettings({
        ...localAppSettings,
        [recordingShortcutKey]: nextShortcut
      });
      setRecordingShortcutKey(null);
      setStatusMessage('快捷键已暂存，点击“保存设置”后生效。');
    };

    window.addEventListener('keydown', handleKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
    };
  }, [recordingShortcutKey, localAppSettings, setLocalAppSettings, setStatusMessage]);

  return (
    <SettingsSection title="快捷键">
      {[
        ...CONFIGURABLE_SHORTCUT_KEYS.map((key) => ({
          key,
          title: SHORTCUT_SETTING_LABELS[key]
        }))
      ].map((item) => (
        <SettingRow key={item.key} title={item.title} description="保存后生效。">
          <div className="flex items-center gap-2">
            {recordingShortcutKey === item.key ? (
              <span className="text-[11px] text-[color:var(--ps-text-tertiary)] animate-pulse">请按下新快捷键...</span>
            ) : (
              <ShortcutDisplay shortcut={localAppSettings[item.key]} />
            )}
            <button
              type="button"
              onClick={() =>
                setRecordingShortcutKey((prev) => (prev === item.key ? null : item.key))
              }
              className="pinstack-btn pinstack-btn-ghost motion-button h-7 px-2 text-[11px]"
            >
              {recordingShortcutKey === item.key ? '取消' : '修改'}
            </button>
          </div>
        </SettingRow>
      ))}
    </SettingsSection>
  );
}
