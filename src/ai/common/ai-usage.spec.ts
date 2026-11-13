import {
  GEMINI_FLASH,
  GEMINI_PRO,
  estimateTokens,
  guardrailHits,
  routeModel,
} from './ai-usage';

describe('ai usage', () => {
  it('estimates tokens at about four characters each', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens({ a: 1 })).toBe(2);
    expect(estimateTokens(null)).toBe(0);
  });

  it('finds the safety fields an answer tripped, ignoring empty ones', () => {
    const hits = guardrailHits({
      summary: 'x',
      redFlags: ['chest pain'],
      triage: { urgency: 'emergency', escalated: true },
      disclaimer: '',
      critical: false,
    });
    expect(hits.map((h) => h.path)).toEqual([
      'redFlags',
      'triage.urgency',
      'triage.escalated',
    ]);
  });

  it('balances Flash for routine requests and Pro for long or safety-relevant ones', () => {
    expect(
      routeModel({
        routing: 'balanced',
        model: GEMINI_PRO,
        promptTokens: 200,
        guardrails: 0,
      }).model,
    ).toBe(GEMINI_FLASH);
    expect(
      routeModel({
        routing: 'balanced',
        model: GEMINI_FLASH,
        promptTokens: 200,
        guardrails: 1,
      }).model,
    ).toBe(GEMINI_PRO);
    expect(
      routeModel({
        routing: 'balanced',
        model: GEMINI_FLASH,
        promptTokens: 4000,
        guardrails: 0,
      }).model,
    ).toBe(GEMINI_PRO);
    expect(
      routeModel({
        routing: 'fixed',
        model: GEMINI_FLASH,
        promptTokens: 4000,
        guardrails: 3,
      }).model,
    ).toBe(GEMINI_FLASH);
  });
});
