import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nativeImage } from 'electron';
import type { AppSettings, CutoutProcessResult, CutoutSaveInput, CutoutSaveResult } from '../../shared/types';
import { removeBackgroundByCornersRgba } from './cutoutAlgo';

function formatDateToken(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sanitizeName(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function decodeDataUrlToImage(dataUrl: string) {
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) {
    throw new Error('IMAGE_DECODE_FAILED: invalid image data');
  }
  return image;
}

function bgraToRgba(bitmap: Buffer): Uint8Array {
  const rgba = new Uint8Array(bitmap.length);
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i];
    const g = bitmap[i + 1];
    const r = bitmap[i + 2];
    const a = bitmap[i + 3];
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }
  return rgba;
}

function rgbaToBgra(rgba: Uint8Array): Buffer {
  const bgra = Buffer.allocUnsafe(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    bgra[i] = b;
    bgra[i + 1] = g;
    bgra[i + 2] = r;
    bgra[i + 3] = a;
  }
  return bgra;
}

function buildSuggestion(recordId: string, displayName?: string): string {
  const stem = sanitizeName(displayName?.trim() || recordId || 'record');
  return `cutout_${stem}_${formatDateToken()}.png`;
}

async function runLocalCutout(recordId: string, sourceDataUrl: string, displayName?: string): Promise<CutoutProcessResult> {
  const inputImage = decodeDataUrlToImage(sourceDataUrl);
  const size = inputImage.getSize();
  const bitmap = inputImage.toBitmap();
  const rgba = bgraToRgba(bitmap);
  const cutout = removeBackgroundByCornersRgba(rgba, size.width, size.height, 40);
  const resultImage = nativeImage.createFromBitmap(rgbaToBgra(cutout), {
    width: size.width,
    height: size.height,
    scaleFactor: 1
  });
  return {
    recordId,
    stage: 'local',
    dataUrl: resultImage.toDataURL(),
    width: size.width,
    height: size.height,
    fileNameSuggestion: buildSuggestion(recordId, displayName),
    notes: ['local-corner-bg-removal']
  };
}

async function runCloudCutout(recordId: string, sourceDataUrl: string, displayName?: string): Promise<CutoutProcessResult> {
  const apiKey = process.env.REMOVE_BG_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('CLOUD_NOT_CONFIGURED: missing REMOVE_BG_API_KEY');
  }

  const source = decodeDataUrlToImage(sourceDataUrl);
  const sourcePng = source.toPNG();
  const boundary = `----PinStackCutout${Date.now().toString(16)}`;
  const preamble =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="size"\r\n\r\nauto\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image_file"; filename="input.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(preamble, 'utf8'), sourcePng, Buffer.from(epilogue, 'utf8')]);

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`CLOUD_FAILED: ${response.status} ${text}`.trim());
  }

  const outBuffer = Buffer.from(await response.arrayBuffer());
  const resultImage = nativeImage.createFromBuffer(outBuffer);
  if (resultImage.isEmpty()) {
    throw new Error('CLOUD_FAILED: invalid output image');
  }
  const size = resultImage.getSize();
  return {
    recordId,
    stage: 'cloud',
    dataUrl: resultImage.toDataURL(),
    width: size.width,
    height: size.height,
    fileNameSuggestion: buildSuggestion(recordId, displayName),
    notes: ['cloud-removebg']
  };
}

export async function processCutoutFromRecord(options: {
  recordId: string;
  sourceDataUrl: string;
  displayName?: string;
}): Promise<CutoutProcessResult> {
  try {
    return await runLocalCutout(options.recordId, options.sourceDataUrl, options.displayName);
  } catch (localError) {
    try {
      const cloudResult = await runCloudCutout(options.recordId, options.sourceDataUrl, options.displayName);
      return {
        ...cloudResult,
        notes: [`local-failed: ${(localError as Error).message}`, ...(cloudResult.notes ?? [])]
      };
    } catch (cloudError) {
      throw new Error(
        `CUTOUT_FAILED: local=(${(localError as Error).message}) cloud=(${(cloudError as Error).message})`
      );
    }
  }
}

async function ensureUniquePath(targetDir: string, fileName: string): Promise<{ fileName: string; outputPath: string }> {
  const ext = path.extname(fileName) || '.png';
  const base = fileName.slice(0, fileName.length - ext.length) || 'cutout';
  for (let i = 0; i < 500; i += 1) {
    const candidate = i === 0 ? `${base}${ext}` : `${base}-${i + 1}${ext}`;
    const outputPath = path.join(targetDir, candidate);
    try {
      await fs.access(outputPath);
    } catch {
      return { fileName: candidate, outputPath };
    }
  }
  throw new Error('Too many naming conflicts');
}

export async function saveCutoutResult(
  input: CutoutSaveInput,
  appSettings: AppSettings
): Promise<CutoutSaveResult> {
  const rootDir = appSettings.vaultkeeper?.inboxDir?.trim() || path.join(appSettings.storageRoot, 'cutout');
  await fs.mkdir(rootDir, { recursive: true });
  const preferred = sanitizeName(input.fileNameSuggestion?.trim() || buildSuggestion(input.recordId)) || buildSuggestion(input.recordId);
  const withExt = preferred.toLowerCase().endsWith('.png') ? preferred : `${preferred}.png`;
  const unique = await ensureUniquePath(rootDir, withExt);

  const image = decodeDataUrlToImage(input.dataUrl);
  const png = image.toPNG();
  await fs.writeFile(unique.outputPath, png);
  return unique;
}
