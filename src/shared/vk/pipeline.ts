import type { VKSourceType, VKTaskStage } from './types';

export const VK_PIPELINE_BY_SOURCE: Record<VKSourceType, VKTaskStage[]> = {
  file: ['created', 'preflight', 'converting', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
  folder: ['created', 'preflight', 'extracting', 'converting', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
  url: ['created', 'preflight', 'extracting', 'converting', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
  image_url: ['created', 'preflight', 'extracting', 'converting', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
  audio: ['created', 'preflight', 'transcribing', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
  video: ['created', 'preflight', 'transcribing', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
  record: ['created', 'preflight', 'extracting', 'converting', 'normalizing', 'enhancing', 'exporting', 'wiki_ingesting', 'done'],
};
