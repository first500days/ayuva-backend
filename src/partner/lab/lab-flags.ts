import type { ResultFlag } from './schemas/lab-result.schema';

export interface FlagInput {
  value?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Flags one reported value against the lab's own reference/critical limits.
 * Numeric values compare against the interval (critical limits win);
 * text results compare against the expected text (e.g. "Negative"). This
 * is arithmetic on the lab's configured ranges, not interpretation.
 */
export function computeFlag(v: FlagInput): ResultFlag {
  const raw = (v.value ?? '').trim();
  if (!raw) return 'none';
  const numeric = /^[<>]?\s*-?\d[\d,]*(\.\d+)?\s*$/.test(raw);
  if (numeric) {
    const n = Number.parseFloat(raw.replace(/[<>\s,]/g, ''));
    if (isNum(v.criticalLow) && n < v.criticalLow) return 'critical_low';
    if (isNum(v.criticalHigh) && n > v.criticalHigh) return 'critical_high';
    if (isNum(v.refLow) && n < v.refLow) return 'low';
    if (isNum(v.refHigh) && n > v.refHigh) return 'high';
    return isNum(v.refLow) || isNum(v.refHigh) ? 'normal' : 'none';
  }
  if (v.refText && v.refText.trim()) {
    return raw.toLowerCase() === v.refText.trim().toLowerCase()
      ? 'normal'
      : 'abnormal';
  }
  return 'none';
}

export const isCriticalFlag = (flag: string) =>
  flag === 'critical_low' || flag === 'critical_high';
