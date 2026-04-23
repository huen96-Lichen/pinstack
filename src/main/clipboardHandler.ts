/**
 * Clipboard content handler.
 * Extracted from index.ts to reduce main-process entry size.
 */
import type { RecordCategory, RecordItem } from '../shared/types';
import type { ClipboardContent, ClipboardDetectionDebug } from './clipboardWatcher';
import { isFlowSourceApp } from './sourceClassifier';
import type { AppContext } from './appContext';
import { getFrontmostApp } from './sourceApp';
import { isAppWithinScope } from './appScope';
import { suggestClassification } from './ruleEngine';
import { SYSTEM_SUGGESTION_TAG } from '../shared/classificationSuggestion';

export function resolveRecordCategory(
  payloadType: ClipboardContent['type'],
  sourceApp: string | null
): Exclude<RecordCategory, 'video'> {
  if (isFlowSourceApp(sourceApp)) {
    return 'flow';
  }
  return payloadType === 'image' ? 'image' : 'text';
}

export async function handleClipboardContent(
  ctx: AppContext,
  payload: ClipboardContent,
  stabilityProbe: { info: (event: string, payload?: Record<string, unknown>) => void; measure: (label: string, fn: () => Promise<unknown>, options?: { slowMs?: number; meta?: Record<string, unknown> }) => Promise<unknown>; error: (event: string, error: unknown, meta?: Record<string, unknown>) => void },
  notifyRecordsChanged: () => void,
  notifyUiToast: (message: string, level?: 'error' | 'warning' | 'info') => void,
): Promise<ClipboardDetectionDebug> {
  const sourceApp = await getFrontmostApp();
  const contentLength = payload.type === 'text' ? payload.text.trim().length : null;
  const snapshot = ctx.runtimeSettings;
  const inferredCategory = resolveRecordCategory(payload.type, sourceApp);

  if (!isAppWithinScope(ctx.settings, sourceApp)) {
    stabilityProbe.info('clipboard.scope.ignore', {
      sourceApp: sourceApp ?? null,
      scopeMode: ctx.settings.scopeMode
    });
    return {
      sourceApp,
      inferredCategory
    };
  }

  const decision = ctx.ruleEngine.evaluate({
    content: payload.type === 'text' ? { type: 'text', text: payload.text } : { type: 'image' },
    metadata: {
      sourceApp,
      length: contentLength
    }
  });
  const suggestion = suggestClassification({
    content: payload.type === 'text' ? { type: 'text', text: payload.text } : { type: 'image' },
    metadata: {
      sourceApp,
      length: contentLength
    }
  });
  const suggestionTags = [...new Set([SYSTEM_SUGGESTION_TAG, ...suggestion.tags])];
  stabilityProbe.info('clipboard.decision', {
    contentType: payload.type,
    action: decision.action,
    sourceApp: sourceApp ?? null
  });

  if (decision.action === 'ignore') {
    return {
      sourceApp,
      inferredCategory
    };
  }

  let record: RecordItem;
  try {
    record = (await stabilityProbe.measure(
      `storage.save.${payload.type}`,
      async () =>
        ctx.storage.saveNewContent(
          payload.type === 'text'
            ? { type: 'text', text: payload.text }
            : { type: 'image', image: payload.image },
          {
            source: 'clipboard',
            category: inferredCategory,
            sourceApp,
            useCase: suggestion.useCase,
            tags: suggestionTags
          }
        ),
      {
        slowMs: payload.type === 'image' ? 1000 : 700,
        meta: {
          category: inferredCategory,
          sourceApp: sourceApp ?? null
        }
      }
    )) as RecordItem;
  } catch (error) {
    stabilityProbe.error('storage.save.failed', error, {
      contentType: payload.type,
      sourceApp: sourceApp ?? null
    });
    console.error('[handleClipboardContent] Failed to save clipboard content', error);
    notifyUiToast('内容保存失败。下一步：检查 ~/PinStack 写入权限。', 'error');
    return {
      sourceApp,
      inferredCategory
    };
  }

  const allowFlowPin = !(inferredCategory === 'flow' && snapshot.enableFlowPin === false);
  if (decision.action === 'pin' && allowFlowPin) {
    try {
      await stabilityProbe.measure(
        `pin.create.${record.type}`,
        async () => ctx.pinManager.createPinWindow(record),
        {
          slowMs: 800,
          meta: {
            recordId: record.id,
            category: record.category
          }
        }
      );
    } catch (error) {
      stabilityProbe.error('pin.create.failed', error, {
        recordId: record.id,
        category: record.category
      });
      console.error('[handleClipboardContent] Failed to create pin window', error);
      notifyUiToast('内容已保存，但创建悬浮卡片失败。可在面板手动重新固定。', 'warning');
    }
  }

  notifyRecordsChanged();
  return {
    sourceApp,
    inferredCategory
  };
}
