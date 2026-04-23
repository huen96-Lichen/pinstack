import { PinStackIconButton } from '../../../design-system/icons';
import { CardHeaderActions } from '../../../design-system/primitives';

interface ModernRecordQuickActionsProps {
  favorite: boolean;
  favoriteBusy?: boolean;
  repinBusy?: boolean;
  onToggleFavorite: () => void | Promise<void>;
  onRepin: () => void | Promise<void>;
}

export function ModernRecordQuickActions({
  favorite,
  favoriteBusy = false,
  repinBusy = false,
  onToggleFavorite,
  onRepin
}: ModernRecordQuickActionsProps): JSX.Element {
  return (
    <CardHeaderActions>
      <div className="flex items-center gap-1 opacity-72 transition-opacity duration-150 ease-out group-hover:opacity-100">
        <PinStackIconButton
          icon="favorite"
          label={favorite ? '取消收藏' : '收藏'}
          size="sm"
          tone={favorite ? 'accent' : 'ghost'}
          disabled={favoriteBusy}
          onClick={(event) => {
            event.stopPropagation();
            void onToggleFavorite();
          }}
        />

        <PinStackIconButton
          icon="pin-top"
          label="重新固定到最前"
          size="sm"
          disabled={repinBusy}
          onClick={(event) => {
            event.stopPropagation();
            void onRepin();
          }}
        />
      </div>
    </CardHeaderActions>
  );
}
