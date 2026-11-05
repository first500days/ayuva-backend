/**
 * Cold-chain transit for home-collected samples: temperature readings from
 * a transport box (typed at pickup/handover, or a data-logger export) are
 * checked against the box's allowed range.
 */

export const RANGE_PRESETS = {
  refrigerated: { label: 'Refrigerated 2–8 °C', minC: 2, maxC: 8 },
  ambient: { label: 'Ambient 15–25 °C', minC: 15, maxC: 25 },
  frozen: { label: 'Frozen ≤ −20 °C', minC: -90, maxC: -20 },
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export interface Reading {
  at: Date;
  tempC: number;
}

export interface TransitSummary {
  readings: number;
  minC: number | null;
  maxC: number | null;
  /** Readings outside the range. */
  outOfRange: number;
  /** Time spent outside the range, counting each out-of-range reading until the next reading (or the end). */
  minutesOut: number;
  firstOutAt: Date | null;
  verdict: 'no_data' | 'ok' | 'excursion';
}

export function summarize(
  readings: Reading[],
  minC: number,
  maxC: number,
  endAt?: Date | null,
): TransitSummary {
  const rs = [...readings].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!rs.length)
    return {
      readings: 0,
      minC: null,
      maxC: null,
      outOfRange: 0,
      minutesOut: 0,
      firstOutAt: null,
      verdict: 'no_data',
    };
  const out = (r: Reading) => r.tempC < minC || r.tempC > maxC;
  let ms = 0;
  rs.forEach((r, i) => {
    if (!out(r)) return;
    const next = rs[i + 1]?.at ?? endAt ?? r.at;
    ms += Math.max(0, next.getTime() - r.at.getTime());
  });
  const outs = rs.filter(out);
  return {
    readings: rs.length,
    minC: Math.min(...rs.map((r) => r.tempC)),
    maxC: Math.max(...rs.map((r) => r.tempC)),
    outOfRange: outs.length,
    minutesOut: Math.round(ms / 60_000),
    firstOutAt: outs[0]?.at ?? null,
    verdict: outs.length ? 'excursion' : 'ok',
  };
}

/**
 * Reads a data-logger CSV export: one reading per line as
 * "timestamp, temperature" (ISO or "YYYY-MM-DD HH:mm[:ss]", local time),
 * with or without a header. Lines that don't parse are skipped and counted.
 */
export function parseLoggerCsv(
  text: string,
  tzOffsetMinutes = 330,
): { readings: Reading[]; skipped: number } {
  const readings: Reading[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line
      .split(/[,;\t]/)
      .map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 2) {
      skipped++;
      continue;
    }
    const temp = Number.parseFloat(cells[cells.length - 1]);
    const at = parseTime(cells[0], tzOffsetMinutes);
    if (!Number.isFinite(temp) || !at) {
      skipped++;
      continue;
    }
    readings.push({ at, tempC: temp });
  }
  return { readings, skipped };
}

function parseTime(s: string, tzOffsetMinutes: number): Date | null {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return new Date(utc - tzOffsetMinutes * 60_000);
}
