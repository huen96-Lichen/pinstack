import { useState } from 'react';
import type { DashboardRecordActions, DashboardRecordItem } from '../shared/dashboard.types';
import { useRecordCardState } from '../shared/useRecordCardState';
import {
  ModernRecordActionBar,
  ModernRecordActionButton,
  ModernRecordCardHeader,
  ModernRecordCardMeta
} from './ModernRecordCardParts';
import { ModernRecordQuickActions } from './ModernRecordQuickActions';
import { ModernUseCasePicker } from './ModernUseCasePicker';
import { showAlert, confirmAction } from '../../../shared/dialogUtils';

interface ModernRecordCardVideoProps {
  item: DashboardRecordItem;
  selected: boolean;
  onSelect: (recordId: string, additive: boolean) => void;
  actions: DashboardRecordActions;
}

export function ModernRecordCardVideo({
  item,
  selected,
  onSelect,
  actions
}: ModernRecordCardVideoProps): JSX.Element {
  const {
    hovered, setHovered,
    isEditing, setIsEditing,
    editDisplayName, setEditDisplayName,
    favorite, cardGlowStyle,
    isSystemSuggested, visibleTags,
    title, contentBadge,
    onCardClick
  } = useRecordCardState(item, selected, onSelect, actions);
  const [busy, setBusy] = useState<'copy' | 'open' | 'favorite' | 'delete' | 'save' | 'meta' | 'pin' | 'vaultkeeper' | null>(null);

  const run = async (
    type: 'copy' | 'open' | 'favorite' | 'delete' | 'save' | 'meta' | 'pin' | 'vaultkeeper',
    task: () => Promise<void>
  ) => {
    setBusy(type);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      onClick={onCardClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={cardGlowStyle}
      className={`motion-card glass-surface glass-l1 radius-l2 group relative break-inside-avoid border p-3.5 hover:shadow-[0_12px_28px_rgba(2,6,23,0.2)] ${
        selected ? 'border-[#34C759] shadow-[0_0_0_2px_rgba(52,199,89,0.58)]' : 'border-white/20'
      } ${isEditing ? 'border-cyan-300/70 bg-cyan-100/35' : ''}`}
    >
      <ModernRecordCardHeader
        title={
          isEditing ? (
            <input
              value={editDisplayName}
              onChange={(event) => setEditDisplayName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="输入名称"
              className="radius-control h-8 min-w-0 w-full border border-cyan-300/70 bg-white/80 px-2.5 text-center text-xs font-semibold text-black outline-none focus:border-cyan-400"
            />
          ) : (
            title
          )
        }
        actions={
          <ModernRecordQuickActions
            favorite={favorite}
            favoriteBusy={busy === 'favorite'}
            repinBusy={busy === 'pin'}
            onToggleFavorite={() => run('favorite', () => actions.onToggleFavoriteRecord(item.id, !favorite))}
            onRepin={() => run('pin', () => actions.onRepinRecord(item.id))}
          />
        }
        className="mb-2"
      />

      <ModernRecordCardMeta
        useCase={item.useCase}
        isSystemSuggested={isSystemSuggested}
        contentBadge={contentBadge}
        tags={visibleTags}
        copiedAt={item.createdAt}
        showCopiedAt={selected}
      />

      <div className="radius-l3 flex min-h-[148px] flex-col justify-between border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.08))] p-4">
        <div className="flex items-center justify-between">
          <span className="text-3xl text-cyan-700/80">◉</span>
          <span className="radius-control border border-cyan-400/25 bg-cyan-400/12 px-2 py-1 text-[10px] text-cyan-900/75">
            桌面录屏
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-black/85">已保存的录屏记录</p>
          <p className="mt-1 text-xs text-black/62">
            {item.previewText || '录屏文件已保存，可直接打开查看。'}
          </p>
        </div>
      </div>

      <ModernRecordActionBar visible={hovered || isEditing}>
        {isEditing ? (
          <>
            <ModernRecordActionButton
              disabled={busy !== null}
              tone="confirm"
              className="px-2"
              onClick={(event) => {
                event.stopPropagation();
                const trimmed = editDisplayName.trim();
                if (!trimmed) {
                  showAlert('名称不能为空');
                  return;
                }
                void run('save', async () => {
                  await actions.onRenameRecord(item.id, trimmed);
                  setIsEditing(false);
                });
              }}
            >
              {busy === 'save' ? '保存中...' : '保存'}
            </ModernRecordActionButton>
            <ModernRecordActionButton
              disabled={busy !== null}
              className="px-2"
              onClick={(event) => {
                event.stopPropagation();
                setIsEditing(false);
                setEditDisplayName(item.displayName ?? '');
              }}
            >
              取消
            </ModernRecordActionButton>
          </>
        ) : (
          <>
            <ModernRecordActionButton
              disabled={busy !== null}
              onClick={(event) => {
                event.stopPropagation();
                void run('copy', () => actions.onCopyRecord(item.id, 'normal'));
              }}
            >
              {busy === 'copy' ? '复制中...' : '复制'}
            </ModernRecordActionButton>
            <ModernRecordActionButton
              disabled={busy !== null}
              onClick={(event) => {
                event.stopPropagation();
                setEditDisplayName(item.displayName ?? '');
                setIsEditing(true);
              }}
            >
              编辑
            </ModernRecordActionButton>
            <ModernUseCasePicker
              currentUseCase={item.useCase}
              disabled={busy !== null}
              onSelect={(useCase) => run('meta', () => actions.onUpdateRecordMeta(item.id, { useCase }))}
            />
            <ModernRecordActionButton
              disabled={busy !== null}
              onClick={(event) => {
                event.stopPropagation();
                void run('open', () => actions.onOpenRecord(item.id));
              }}
            >
              {busy === 'open' ? '打开中...' : '外部打开'}
            </ModernRecordActionButton>
            <ModernRecordActionButton
              disabled={busy !== null}
              onClick={(event) => {
                event.stopPropagation();
                void run('vaultkeeper', async () => {
                  try {
                    await actions.onSendToVaultKeeper(item.id);
                    showAlert('已发送到 VaultKeeper');
                  } catch (err) {
                    showAlert(`发送失败: ${err instanceof Error ? err.message : String(err)}`);
                  }
                });
              }}
            >
              {busy === 'vaultkeeper' ? '发送中...' : '发送到 VaultKeeper'}
            </ModernRecordActionButton>
            <ModernRecordActionButton
              disabled={busy !== null}
              tone="danger"
              onClick={(event) => {
                event.stopPropagation();
                void run('delete', async () => {
                  const confirmed = await confirmAction('确认删除这条录屏记录？');
                  if (!confirmed) {
                    return;
                  }
                  await actions.onDeleteRecord(item.id);
                });
              }}
            >
              {busy === 'delete' ? '删除中...' : '删除'}
            </ModernRecordActionButton>
          </>
        )}
      </ModernRecordActionBar>
    </article>
  );
}
