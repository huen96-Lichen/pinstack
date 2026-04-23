const FLOW_SOURCE_APP_KEYWORDS = ['chatgpt', 'codex', 'terminal', 'iterm'];

export function isFlowSourceApp(sourceApp: string | null | undefined): boolean {
  const normalized = (sourceApp ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return FLOW_SOURCE_APP_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
