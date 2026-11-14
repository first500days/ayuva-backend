/**
 * How long an e-prescription's course runs, read from each line's duration
 * ("5 days", "2 weeks", "1 month", "x 10 days"), and when the patient should
 * be reminded to book a follow-up: at 85 % of the longest line. Open-ended
 * lines ("continue", "SOS", "as needed") don't set a course.
 */

export const REFILL_AT = 0.85;

const UNIT_DAYS: Record<string, number> = {
  d: 1,
  day: 1,
  days: 1,
  w: 7,
  wk: 7,
  wks: 7,
  week: 7,
  weeks: 7,
  m: 30,
  mo: 30,
  month: 30,
  months: 30,
};

/** "2 weeks" → 14; "10 days" → 10; "continue" → null. */
export function durationDays(text: string | undefined | null): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(days?|d|weeks?|wks?|wk|w|months?|mo|m)\b/i.exec(
    text ?? '',
  );
  if (!m) return null;
  const n = Number(m[1]) * (UNIT_DAYS[m[2].toLowerCase()] ?? 0);
  return n > 0 && n <= 365 ? Math.round(n) : null;
}

export function courseDays(
  lines: { duration?: string | null }[],
): number | null {
  const days = lines
    .map((l) => durationDays(l.duration))
    .filter((d): d is number => d !== null);
  return days.length ? Math.max(...days) : null;
}

/** When to prompt for a follow-up or refill; null when the course has no set end. */
export function refillPromptAt(
  signedAt: Date,
  lines: { duration?: string | null }[],
): Date | null {
  const days = courseDays(lines);
  // A course of a day or two ends before a reminder would help.
  if (!days || days < 3) return null;
  return new Date(signedAt.getTime() + days * REFILL_AT * 86_400_000);
}
