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

interface ModernRecordCardFlowProps {
  item: DashboardRecordItem;
  selected: boolean;
  onSelect: (recordId: string, additive: boolean) => void;
  actions: DashboardRecordActions;
}

export function ModernRecordCardFlow({
  item,
  selected,
  onSelect,
  actions
}: ModernRecordCardFlowProps): JSX.Element {
  const {
    hovered, setHovered,
    isEditing, setIsEditing,
    editDisplayName, setEditDisplayName,
    favorite, cardGlowStyle,
    isSystemSuggested, visibleTags,
    title, contentBadge,
    onCardClick
  } = useRecordCardState(item, selected, onSelect, actions);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState<'copy' | 'open' | 'delete' | 'pin' | 'meta' | 'edit' | 'save' | 'favorite' | 'rename' | null>(null);

  const run = async (
    type: 'copy' | 'open' | 'delete' | 'pin' | 'meta' | 'edit' | 'save' | 'favorite' | 'rename',
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
      className={`motion-card glass-surface glass-l1 radius-l2 group relative break-inside-avoid border p-4 hover:shadow-[0_12px_28px_rgba(14,116,144,0.25)] ${
        selected ? 'border-cyan-400 shadow-[0_0_0_2px_rgba(34,211,238,0.55)]' : 'border-white/20'
      } ${isEditing ? 'bg-cyan-100/35 border-cyan-300/70' : ''}`}
    >
      <ModernRecordCardHeader
        title={
          isTitleEditing ? (
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
        titleClassName="truncate text-center text-xs font-semibold text-cyan-950"
        actions={
          <ModernRecordQuickActions
            favorite={favorite}
            favoriteBusy={busy === 'favorite'}
            repinBusy={busy === 'pin'}
            onToggleFavorite={() => run('favorite', () => actions.onToggleFavoriteRecord(item.id, !favorite))}
            onRepin={() => run('pin', () => actions.onRepinRecord(item.id))}
          />
        }
      />
      <ModernRecordCardMeta
        useCase={item.useCase}
        isSystemSuggested={isSystemSuggested}
        contentBadge={contentBadge}
        tags={visibleTags}
        copiedAt={item.createdAt}
        showCopiedAt={selected}
      />

      {isEditing ? (
        <textarea
          value={editText}
          onChange={(event) => setEditText(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          className="radius-control mt-1 min-h-[130px] w-full border border-cyan-300/70 bg-white/85 px-3 py-2 font-mono text-sm leading-6 text-black outline-none focus:border-cyan-400"
        />
      ) : (
        <p
          className="font-mono text-sm leading-6 text-black"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 6,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {item.previewText || '(empty flow text)'}
        </p>
      )}

      <ModernRecordActionBar visible={hovered || isEditing || isTitleEditing}>
        {isTitleEditing ? (
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
                void run('rename', async () => {
                  await actions.onRenameRecord(item.id, trimmed);
                  setIsTitleEditing(false);
                });
              }}
            >
              {busy === 'rename' ? '保存中...' : '保存名称'}
            </ModernRecordActionButton>
            <ModernRecordActionButton
              disabled={busy !== null}
              className="px-2"
              onClick={(event) => {
                event.stopPropagation();
                setIsTitleEditing(false);
                setEditDisplayName(item.displayName ?? '');
              }}
            >
              取消
            </ModernRecordActionButton>
          </>
        ) : isEditing ? (
          <>
            <ModernRecordActionButton
              disabled={busy !== null}
              tone="confirm"
              className="px-2"
              onClick={(event) => {
                event.stopPropagation();
                void run('save', async () => {
                  await actions.onUpdateRecordText(item.id, editText);
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
                setEditText(item.previewText || '');
              }}
            >
              取消
            </ModernRecordActionButton>
          </>
        ) : null}
        {!isEditing ? (
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
                setIsTitleEditing(true);
              }}
            >
              改名
            </ModernRecordActionButton>
            <ModernRecordActionButton
              disabled={busy !== null}
              onClick={(event) => {
                event.stopPropagation();
                setIsTitleEditing(false);
                void run('edit', async () => {
                  const content = await window.pinStack.records.getContent(item.id);
                  setEditText(content.type === 'text' ? content.text : item.previewText || '');
                  setIsEditing(true);
                });
              }}
            >
              {busy === 'edit' ? '加载中...' : '编辑'}
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
              tone="danger"
              onClick={(event) => {
                event.stopPropagation();
                void run('delete', async () => {
                  const confirmed = await confirmAction('确认删除这条记录？');
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
        ) : null}
      </ModernRecordActionBar>
    </article>
  );
}
