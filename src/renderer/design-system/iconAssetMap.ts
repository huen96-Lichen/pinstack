import psCapture from '../../assets/icon/core/ps-capture.svg';
import psClassify from '../../assets/icon/core/ps-classify.svg';
import psDuplicate from '../../assets/icon/core/ps-duplicate.svg';
import psEdit from '../../assets/icon/core/ps-edit.svg';
import psFavorite from '../../assets/icon/core/ps-favorite.svg';
import psPinTop from '../../assets/icon/core/ps-pin-top.svg';
import psRecord from '../../assets/icon/core/ps-record.svg';
import psSettings from '../../assets/icon/core/ps-settings.svg';
import psAiWorkspace from '../../assets/icon/extended/ps-ai-workspace.svg';
import psAll from '../../assets/icon/extended/ps-all.svg';
import psFilter from '../../assets/icon/extended/ps-filter.svg';
import psHelp from '../../assets/icon/extended/ps-help.svg';
import psImage from '../../assets/icon/extended/ps-image.svg';
import psSearch from '../../assets/icon/extended/ps-search.svg';
import psText from '../../assets/icon/extended/ps-text.svg';

export const PINSTACK_ICON_ASSET_MAP = {
  all: psAll,
  'ai-workspace': psAiWorkspace,
  capture: psCapture,
  classify: psClassify,
  duplicate: psDuplicate,
  edit: psEdit,
  favorite: psFavorite,
  filter: psFilter,
  help: psHelp,
  image: psImage,
  'pin-top': psPinTop,
  record: psRecord,
  search: psSearch,
  settings: psSettings,
  text: psText
} as const;

export type PinStackAssetIconName = keyof typeof PINSTACK_ICON_ASSET_MAP;
