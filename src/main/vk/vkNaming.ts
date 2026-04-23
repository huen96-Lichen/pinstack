import { promises as fs } from 'node:fs';
import path from 'node:path';

function slugify(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/_+/g, '_')
    .slice(0, 48) || 'untitled';
}

export function buildVKFileName(input: { sourceType: string; title?: string; date?: Date }): string {
  const date = input.date ?? new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const source = slugify(input.sourceType || 'source');
  const title = slugify(input.title || 'untitled');
  return `${source}_${title}_${yyyy}-${mm}-${dd}.md`;
}

export async function resolveNameConflict(dir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName) || '.md';
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let idx = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${base}-${idx}${ext}`);
      idx += 1;
    } catch {
      return candidate;
    }
  }
}
