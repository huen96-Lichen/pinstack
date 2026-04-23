/**
 * Knowledge Web URL resolver.
 * Extracted from index.ts to reduce main-process entry size.
 */
import type { AppContext } from './appContext';

export function tryNormalizeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function isKnowledgeWebReachable(url: string, timeoutMs = 900): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });
    return { ok: response.status < 500, detail: `status=${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'unknown error' };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveKnowledgeWebTargetUrl(
  ctx: AppContext,
  isDev: boolean,
  knowledgeWebDevUrl: string,
): Promise<{ targetUrl: string | null; reason: string }> {
  const rawCandidates = [
    { key: 'knowledgeWebUrlRef', value: ctx.knowledgeWebUrl },
    { key: 'knowledgeWebDevUrl', value: isDev ? knowledgeWebDevUrl : '' },
    { key: 'knowledgeApiBaseUrlRef', value: ctx.knowledgeApiBaseUrl }
  ];

  const seen = new Set<string>();
  const candidates = rawCandidates
    .map((candidate) => ({ ...candidate, normalized: tryNormalizeHttpUrl(candidate.value) }))
    .filter((candidate): candidate is { key: string; value: string; normalized: string } => Boolean(candidate.normalized))
    .filter((candidate) => {
      if (seen.has(candidate.normalized)) {
        return false;
      }
      seen.add(candidate.normalized);
      return true;
    });

  if (candidates.length === 0) {
    const compact = rawCandidates
      .map((item) => `${item.key}=${item.value.trim() || '<empty>'}`)
      .join(', ');
    return { targetUrl: null, reason: `no valid candidate (${compact})` };
  }

  const probeDetails: string[] = [];
  for (const candidate of candidates) {
    const probe = await isKnowledgeWebReachable(candidate.normalized);
    probeDetails.push(`${candidate.key}:${candidate.normalized}(${probe.detail})`);
    if (probe.ok) {
      return {
        targetUrl: candidate.normalized,
        reason: `resolved from ${candidate.key}; probes=${probeDetails.join(' -> ')}`
      };
    }
  }

  return {
    targetUrl: null,
    reason: `all candidates unreachable (${probeDetails.join(' -> ') || 'none'})`
  };
}
