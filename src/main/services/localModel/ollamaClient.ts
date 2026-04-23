import { LOCAL_MODEL_NAME, type LocalModelName, type LocalModelPreflightResult } from '../../../shared/ai/localModel/types';

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  response?: string;
  done?: boolean;
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  public constructor(config: OllamaClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs =
      typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs)
        ? Math.max(1000, Math.floor(config.timeoutMs))
        : 30_000;
  }

  public async preflight(model: LocalModelName = LOCAL_MODEL_NAME): Promise<LocalModelPreflightResult> {
    const checkedAt = Date.now();
    const names = await this.listModelNames();

    if (!names.includes(model)) {
      return {
        ok: false,
        provider: 'ollama',
        model,
        checkedAt,
        message: `Model ${model} is not available in Ollama.`
      };
    }

    return {
      ok: true,
      provider: 'ollama',
      model,
      checkedAt,
      message: `Ollama reachable and model ${model} found.`
    };
  }

  public async listModelNames(): Promise<string[]> {
    const tags = await this.fetchJson<OllamaTagsResponse>('/api/tags');
    return Array.isArray(tags.models)
      ? tags.models.map((item) => item.name?.trim()).filter((item): item is string => Boolean(item))
      : [];
  }

  public async chat(input: {
    model: LocalModelName;
    messages: OllamaChatMessage[];
    jsonMode?: boolean;
    timeoutMs?: number;
  }): Promise<string> {
    const payload = await this.fetchJson<OllamaChatResponse>('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: input.model,
        stream: false,
        ...(input.jsonMode === false ? {} : { format: 'json' }),
        messages: input.messages
      })
    }, input.timeoutMs);

    const content = payload.message?.content ?? payload.response;
    if (!content || !content.trim()) {
      throw new Error('Ollama response content is empty');
    }

    return content;
  }

  public async chatStream(input: {
    model: LocalModelName;
    messages: OllamaChatMessage[];
    onDelta?: (delta: string) => void;
    timeoutMs?: number;
  }): Promise<string> {
    let text = '';
    await this.fetchStream(
      '/api/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: input.model,
          stream: true,
          messages: input.messages
        })
      },
      (payload) => {
        const delta = payload.message?.content ?? payload.response ?? '';
        if (delta) {
          text += delta;
          input.onDelta?.(delta);
        }
      },
      input.timeoutMs
    );

    if (!text.trim()) {
      throw new Error('Ollama response content is empty');
    }
    return text;
  }

  private async fetchJson<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timeout after ${timeoutMs ?? this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchStream(
    path: string,
    init: RequestInit,
    onChunk: (payload: OllamaChatResponse) => void,
    timeoutMs?: number
  ): Promise<void> {
    const controller = new AbortController();
    const resolvedTimeoutMs = timeoutMs ?? this.timeoutMs;
    let timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);

    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);
    };

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('Ollama response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        resetTimeout();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          onChunk(JSON.parse(trimmed) as OllamaChatResponse);
        }
      }

      const rest = buffer.trim();
      if (rest) {
        onChunk(JSON.parse(rest) as OllamaChatResponse);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timeout after ${resolvedTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
