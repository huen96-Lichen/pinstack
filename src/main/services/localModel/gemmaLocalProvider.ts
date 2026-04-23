import { buildDedupePrompt } from '../../../shared/ai/localModel/prompts/dedupe.prompt';
import { buildImagePrompt } from '../../../shared/ai/localModel/prompts/image.prompt';
import { buildRenamePrompt } from '../../../shared/ai/localModel/prompts/rename.prompt';
import { buildSummaryPrompt } from '../../../shared/ai/localModel/prompts/summary.prompt';
import { LOCAL_MODEL_SYSTEM_PROMPT } from '../../../shared/ai/localModel/prompts/system.prompt';
import {
  parseJsonObject,
  validateDedupeResult,
  validateImageUnderstandingResult,
  validateRenameResult,
  validateSummaryResult,
} from '../../../shared/ai/localModel/schemas';
import {
  LOCAL_MODEL_NAME,
  type DedupeInput,
  type DedupeResult,
  type ImageUnderstandingInput,
  type ImageUnderstandingResult,
  type LocalModelProvider,
  type LocalModelPreflightResult,
  type RenameInput,
  type RenameResult,
  type SummaryInput,
  type SummaryResult,
} from '../../../shared/ai/localModel/types';
import { OllamaClient } from './ollamaClient';

export class GemmaLocalProvider implements LocalModelProvider {
  public readonly provider = 'ollama' as const;

  private model: string;

  public constructor(private readonly client: OllamaClient, model: string = LOCAL_MODEL_NAME) {
    this.model = model;
  }

  public setModel(model: string): void {
    this.model = model;
  }

  public async preflight(): Promise<LocalModelPreflightResult> {
    return this.client.preflight(this.model);
  }

  public async renameNoteWithLocalModel(input: RenameInput): Promise<RenameResult> {
    const payload = await this.requestJson(buildRenamePrompt(input));
    this.assertKeys(payload, ['category', 'short_title', 'keyword', 'source', 'canonical_title', 'confidence'], 'rename');
    return validateRenameResult(payload);
  }

  public async dedupePairWithLocalModel(input: DedupeInput): Promise<DedupeResult> {
    const payload = await this.requestJson(buildDedupePrompt(input));
    this.assertKeys(payload, ['is_duplicate', 'confidence', 'reason', 'primary_choice'], 'dedupe');
    return validateDedupeResult(payload);
  }

  public async summarizeForKnowledgeBase(input: SummaryInput): Promise<SummaryResult> {
    const payload = await this.requestJson(buildSummaryPrompt(input));
    this.assertKeys(payload, ['summary', 'category', 'keyword', 'confidence', 'source'], 'summary');
    return validateSummaryResult(payload);
  }

  public async understandImageBasic(input: ImageUnderstandingInput): Promise<ImageUnderstandingResult> {
    const payload = await this.requestJson(buildImagePrompt(input));
    this.assertKeys(payload, ['image_summary', 'tags', 'suggested_category', 'confidence'], 'image');
    return validateImageUnderstandingResult(payload);
  }

  private async requestJson(userPrompt: string): Promise<Record<string, unknown>> {
    const text = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: LOCAL_MODEL_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    });
    return parseJsonObject(text);
  }

  private assertKeys(payload: Record<string, unknown>, keys: string[], stage: string): void {
    for (const key of keys) {
      if (!(key in payload)) {
        throw new Error(`schema-missing-key:${stage}:${key}`);
      }
    }
  }
}
