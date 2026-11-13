/**
 * The patient's lab values over time, for the app's Health Passport gauges:
 * each test's readings in order, where the latest sits against the lab's own
 * reference range, which way it is moving, and one plain sentence saying so.
 * Rule-based and descriptive only: it never says what a value means for the
 * person's health; that is for their doctor.
 */

export interface TrendSourceValue {
  name: string;
  value: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
}

export interface TrendSource {
  at: Date;
  labName?: string;
  values: TrendSourceValue[];
}

export type RangePosition = 'below' | 'within' | 'above' | 'unknown';
export type Direction = 'up' | 'down' | 'steady' | 'single';

export interface LabTrend {
  key: string;
  name: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  points: { at: string; value: number }[];
  latest: number;
  position: RangePosition;
  direction: Direction;
  /** Whether the latest move went towards (true) or away from (false) the range; null when not applicable. */
  towardsRange: boolean | null;
  explanation: string;
  lastLab: string | null;
}

const MAX_METRICS = 30;
const MAX_POINTS = 12;
/** A change smaller than this share of the previous value reads as "about the same". */
const STEADY = 0.05;

export function parseNumber(raw: string): number | null {
  const m = /^\s*[<>≤≥]?\s*(-?\d+(?:\.\d+)?)/.exec(raw ?? '');
  return m ? Number(m[1]) : null;
}

const keyOf = (name: string, unit?: string) =>
  `${name.trim().toLowerCase()}|${(unit ?? '').trim().toLowerCase()}`;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function positionOf(
  v: number,
  low: number | null,
  high: number | null,
): RangePosition {
  if (low === null && high === null) return 'unknown';
  if (low !== null && v < low) return 'below';
  if (high !== null && v > high) return 'above';
  return 'within';
}

function distance(v: number, low: number | null, high: number | null): number {
  if (low !== null && v < low) return low - v;
  if (high !== null && v > high) return v - high;
  return 0;
}

export function explain(
  t: Omit<LabTrend, 'explanation'>,
  prevAt?: Date,
): string {
  const unit = t.unit ? ` ${t.unit}` : '';
  const range =
    t.refLow !== null && t.refHigh !== null
      ? ` (${fmt(t.refLow)}–${fmt(t.refHigh)}${unit})`
      : '';
  const where =
    t.position === 'within'
      ? `within the lab’s usual range${range}`
      : t.position === 'above'
        ? `above the lab’s usual range${range}`
        : t.position === 'below'
          ? `below the lab’s usual range${range}`
          : 'reported without a reference range';
  let s = `Your latest ${t.name} is ${fmt(t.latest)}${unit}, ${where}.`;
  if (t.direction !== 'single' && t.points.length >= 2) {
    const prev = t.points[t.points.length - 2].value;
    const since = prevAt ? ` since ${fmtDate(prevAt)}` : '';
    s +=
      t.direction === 'steady'
        ? ` It has stayed about the same${since}.`
        : ` It has gone ${t.direction} from ${fmt(prev)}${since}`;
    if (t.direction !== 'steady')
      s +=
        t.towardsRange === true
          ? ', towards the usual range.'
          : t.towardsRange === false
            ? ', further from the usual range.'
            : '.';
  }
  if (t.position === 'above' || t.position === 'below')
    s += ' Your doctor can tell you what this means for you.';
  return s;
}

export function buildLabTrends(sources: TrendSource[]): LabTrend[] {
  const groups = new Map<
    string,
    {
      name: string;
      unit?: string;
      rows: {
        at: Date;
        v: number;
        low?: number;
        high?: number;
        lab?: string;
      }[];
    }
  >();
  for (const src of [...sources].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  )) {
    for (const val of src.values) {
      const v = parseNumber(val.value);
      if (v === null || !val.name?.trim()) continue;
      const key = keyOf(val.name, val.unit);
      const g = groups.get(key) ?? {
        name: val.name.trim(),
        unit: val.unit?.trim() || undefined,
        rows: [],
      };
      g.rows.push({
        at: src.at,
        v,
        low: val.refLow,
        high: val.refHigh,
        lab: src.labName,
      });
      groups.set(key, g);
    }
  }

  const out: LabTrend[] = [];
  for (const [key, g] of groups) {
    const rows = g.rows.slice(-MAX_POINTS);
    const last = rows[rows.length - 1];
    const prev = rows.length >= 2 ? rows[rows.length - 2] : undefined;
    const low = last.low ?? null;
    const high = last.high ?? null;
    let direction: Direction = 'single';
    if (prev) {
      const change = last.v - prev.v;
      const base = Math.abs(prev.v) || 1;
      direction =
        Math.abs(change) / base < STEADY
          ? 'steady'
          : change > 0
            ? 'up'
            : 'down';
    }
    const position = positionOf(last.v, low, high);
    const towardsRange =
      prev && direction !== 'steady' && (low !== null || high !== null)
        ? distance(last.v, low, high) < distance(prev.v, low, high)
          ? true
          : distance(last.v, low, high) > distance(prev.v, low, high)
            ? false
            : null
        : null;
    const base: Omit<LabTrend, 'explanation'> = {
      key,
      name: g.name,
      unit: g.unit ?? null,
      refLow: low,
      refHigh: high,
      points: rows.map((r) => ({ at: r.at.toISOString(), value: r.v })),
      latest: last.v,
      position,
      direction,
      towardsRange,
      lastLab: last.lab ?? null,
    };
    out.push({ ...base, explanation: explain(base, prev?.at) });
  }

  const rank = (t: LabTrend) =>
    t.position === 'above' || t.position === 'below' ? 0 : 1;
  return out
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Date.parse(b.points[b.points.length - 1].at) -
          Date.parse(a.points[a.points.length - 1].at),
    )
    .slice(0, MAX_METRICS);
}
