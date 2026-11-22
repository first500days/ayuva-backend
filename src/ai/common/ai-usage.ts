/**
 * Per-interaction usage for the Admin Panel: estimated prompt and output
 * tokens, the safety guardrails the answer touched, and the Gemini model the
 * balancing rule picks. The engine is rule-based today, so token counts are
 * estimates (about four characters per token) and the routing decision is
 * what will apply once a Gemini key is connected.
 */

export const GEMINI_PRO = 'gemini-1.5-pro';
export const GEMINI_FLASH = 'gemini-1.5-flash';
/** Above this many prompt tokens the balancer prefers Pro. */
export const LONG_PROMPT_TOKENS = 1500;

export type Routing = 'fixed' | 'balanced';

export interface GuardrailHit {
  path: string;
  value: string;
}

export function estimateTokens(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil((text?.length ?? 0) / 4);
}

const GUARD_KEY =
  /red_?flags?|escalat|emergency|urgent|urgency|blocked|refus|guardrail|safety|disclaimer|override|critical/i;
const MAX_HITS = 12;

function excerpt(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function meaningful(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return !/^(none|no|false|routine|low)$/i.test(v);
  return true;
}

/** Fields in the answer that show a safety rule fired (red flags, escalation, disclaimers…). */
export function guardrailHits(outcome: unknown): GuardrailHit[] {
  const hits: GuardrailHit[] = [];
  const walk = (v: unknown, path: string, depth: number) => {
    if (
      hits.length >= MAX_HITS ||
      depth > 5 ||
      v === null ||
      typeof v !== 'object'
    )
      return;
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (GUARD_KEY.test(k) && meaningful(child)) {
        hits.push({ path: p, value: excerpt(child) });
        if (hits.length >= MAX_HITS) return;
      } else if (typeof child === 'object') walk(child, p, depth + 1);
    }
  };
  walk(outcome, '', 0);
  return hits;
}

/**
 * Gemini Pro/Flash balancing. "fixed" keeps the surface's chosen model;
 * "balanced" sends routine, short requests to Flash (faster, cheaper) and
 * anything long or safety-relevant to Pro.
 */
export function routeModel(i: {
  routing?: Routing | null;
  model?: string | null;
  promptTokens: number;
  guardrails: number;
}): { model: string; reason: string } {
  const fixed = i.model || GEMINI_PRO;
  if (i.routing !== 'balanced')
    return { model: fixed, reason: 'Fixed by the surface setting' };
  if (i.guardrails > 0)
    return {
      model: GEMINI_PRO,
      reason: 'A safety guardrail was involved, so Pro',
    };
  if (i.promptTokens > LONG_PROMPT_TOKENS)
    return {
      model: GEMINI_PRO,
      reason: `Long input (~${i.promptTokens} tokens), so Pro`,
    };
  return {
    model: GEMINI_FLASH,
    reason: 'Routine, short request, so Flash for speed and cost',
  };
}
