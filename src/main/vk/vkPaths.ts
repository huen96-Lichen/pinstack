import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';
import type { VKOutputMode } from '../../shared/vk/types';

export interface VKResolvedPaths {
  root: string;
  cache: string;
  logs: string;
  transcripts: string;
  draft: string;
  inbox: string;
  library: string;
  attachments: string;
  wiki: string;
  wikiRaw: string;
}

export function getVKRoot(settings: AppSettings): string {
  return path.join(settings.storageRoot, 'vaultkeeper');
}

export function getVKPaths(settings: AppSettings): VKResolvedPaths {
  const root = getVKRoot(settings);
  const custom = settings.vaultkeeper ?? { enabled: false, autoStart: false, projectRoot: '', port: 3210 };
  const draft = typeof custom.draftDir === 'string' && custom.draftDir.trim() ? custom.draftDir.trim() : path.join(root, 'drafts');
  const inbox = typeof custom.inboxDir === 'string' && custom.inboxDir.trim() ? custom.inboxDir.trim() : path.join(settings.storageRoot, 'inbox');
  const library = typeof custom.libraryDir === 'string' && custom.libraryDir.trim() ? custom.libraryDir.trim() : path.join(settings.storageRoot, 'library');
  const attachments = typeof custom.attachmentsDir === 'string' && custom.attachmentsDir.trim()
    ? custom.attachmentsDir.trim()
    : path.join(root, 'attachments');

  const wiki = settings.vaultkeeper?.wiki?.wikiDir?.trim()
    ? settings.vaultkeeper.wiki.wikiDir.trim()
    : path.join(settings.storageRoot, 'wiki');

  return {
    root,
    cache: path.join(root, 'cache'),
    logs: path.join(root, 'logs'),
    transcripts: path.join(root, 'transcripts'),
    draft,
    inbox,
    library,
    attachments,
    wiki,
    wikiRaw: path.join(wiki, 'raw'),
  };
}

export async function ensureVKDirs(settings: AppSettings): Promise<VKResolvedPaths> {
  const dirs = getVKPaths(settings);
  const allDirs = [
    ...Object.values(dirs),
    // Wiki 子目录
    path.join(dirs.wiki, 'sources'),
    path.join(dirs.wiki, 'entities'),
    path.join(dirs.wiki, 'concepts'),
    path.join(dirs.wiki, 'topics'),
    path.join(dirs.wikiRaw, 'sources'),
  ];
  await Promise.all(allDirs.map((dir) => fs.mkdir(dir, { recursive: true })));

  const indexPath = path.join(dirs.wiki, 'index.md');
  const logPath = path.join(dirs.wiki, 'log.md');
  await Promise.all([
    ensureFileIfMissing(indexPath, '# Wiki Index\n\n'),
    ensureFileIfMissing(logPath, '# Wiki Log\n\n'),
  ]);

  return dirs;
}

async function ensureFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, 'utf8');
  }
}

export function resolveVKOutputDir(settings: AppSettings, mode: VKOutputMode = 'draft', customDir?: string): string {
  const paths = getVKPaths(settings);
  if (mode === 'custom' && customDir?.trim()) {
    return customDir.trim();
  }
  if (mode === 'inbox') {
    return paths.inbox;
  }
  if (mode === 'library') {
    return paths.library;
  }
  return paths.draft;
}
