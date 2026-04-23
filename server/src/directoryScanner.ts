import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface DirectoryScanOptions {
  dirPath: string;
  extensions?: string[];
  excludePatterns?: string[];
  maxDepth?: number;
}

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  size: number;
  mtime: number;
  contentHash: string;
}

export interface DirectoryScanResult {
  dirPath: string;
  scannedAt: number;
  totalFiles: number;
  newFiles: ScannedFile[];
  modifiedFiles: ScannedFile[];
  unchangedFiles: ScannedFile[];
  skippedFiles: number;
}

// 默认排除的目录
const DEFAULT_EXCLUDE_DIRS = new Set([
  '.git', '.obsidian', '.trash', 'node_modules', '.DS_Store',
  '__pycache__', '.hg', '.svn', 'dist', 'build'
]);

// 简单的 glob 匹配（支持 * 和 **）
function matchesGlob(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const regexStr = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\?/g, '[^/]');
  const regex = new RegExp(`(^|/)${regexStr}$`);
  return regex.test(normalized);
}

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export async function scanDirectory(
  options: DirectoryScanOptions,
  existingHashes: Map<string, string> // filePath -> contentHash
): Promise<DirectoryScanResult> {
  const {
    dirPath,
    extensions = ['.md'],
    excludePatterns = [],
    maxDepth = 20
  } = options;

  const result: DirectoryScanResult = {
    dirPath,
    scannedAt: Date.now(),
    totalFiles: 0,
    newFiles: [],
    modifiedFiles: [],
    unchangedFiles: [],
    skippedFiles: 0
  };

  const extSet = new Set(extensions.map((e) => e.toLowerCase()));

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDE_DIRS.has(entry.name)) continue;
        // 检查排除模式
        const relPath = path.relative(dirPath, fullPath);
        if (excludePatterns.some((p) => matchesGlob(relPath, p))) continue;
        await walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!extSet.has(ext)) {
        result.skippedFiles++;
        continue;
      }

      try {
        const stat = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath, 'utf8');
        const hash = computeContentHash(content);
        const relativePath = path.relative(dirPath, fullPath);

        const scannedFile: ScannedFile = {
          absolutePath: fullPath,
          relativePath,
          fileName: entry.name,
          size: stat.size,
          mtime: stat.mtimeMs,
          contentHash: hash
        };

        result.totalFiles++;
        const existingHash = existingHashes.get(fullPath);
        if (!existingHash) {
          result.newFiles.push(scannedFile);
        } else if (existingHash !== hash) {
          result.modifiedFiles.push(scannedFile);
        } else {
          result.unchangedFiles.push(scannedFile);
        }
      } catch {
        result.skippedFiles++;
      }
    }
  }

  await walk(dirPath, 0);
  return result;
}
