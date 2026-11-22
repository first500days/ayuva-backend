import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeJsonRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Thin wrapper around the Anthropic API. Disabled (isEnabled() === false)
 * when ANTHROPIC_API_KEY is unset, so callers keep their mock fallback.
 * Never throws: any API error/timeout/bad JSON resolves to null.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    this.client = apiKey
      ? new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })
      : null;
    this.model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5';
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /** Asks for a single JSON object; returns the parsed object or null. */
  async completeJson<T>(req: ClaudeJsonRequest): Promise<T | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 600,
        system: `${req.system}\n\nRespond with a single JSON object only. No prose, no code fences.`,
        messages: [{ role: 'user', content: req.user }],
      });
      const text = res.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end < start) return null;
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch (err) {
      this.logger.warn(`Claude call failed: ${(err as Error).message}`);
      return null;
    }
  }
}
