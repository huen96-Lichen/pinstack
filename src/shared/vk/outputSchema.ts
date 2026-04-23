import type { VKOutputMode } from './types';

export interface VKOutputStrategy {
  mode: VKOutputMode;
  customDir?: string;
  overwrite?: boolean;
}

export interface VKOutputResolved {
  mode: VKOutputMode;
  dir: string;
  overwrite: boolean;
}
