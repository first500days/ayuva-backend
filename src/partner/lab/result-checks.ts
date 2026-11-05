/**
 * Validation layer on lab results, run every time results are saved:
 *
 * - Delta checks: the change since the patient's previous result for the
 *   same analyte is larger than biology allows in that time (often a
 *   wrong-patient sample, or an analytical error).
 * - Contamination patterns within one sample (EDTA, IV fluid, haemolysis,
 *   delayed separation).
 *
 * Deterministic rules with published-style limits, labelled honestly as
 * rule-based: they flag for a person to review; they never change a value.
 */
import type { ResultRow } from './result-changes';

export type CheckSeverity = 'review' | 'hold';

export interface ResultCheck {
  kind: 'delta' | 'contamination';
  code: string;
  severity: CheckSeverity;
  parameters: string[];
  message: string;
  previous?: { value: number; unit: string | null; at: Date };
}

export interface HistoryPoint {
  name: string;
  unit: string | null;
  value: number;
  at: Date;
}

const DAY = 86_400_000;

/** "Haemoglobin (Hb)" → "haemoglobin". */
const clean = (name: string) =>
  name
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const unitKey = (u: string | null | undefined) =>
  (u ?? '').toLowerCase().replace(/\s+/g, '').replace('meq/l', 'mmol/l');
export const numericValue = (v: string) => {
  const m = /^[<>]?\s*(-?\d+(?:\.\d+)?)$/.exec(v.trim());
  return m ? Number(m[1]) : null;
};

const ANALYTES: Record<string, (n: string) => boolean> = {
  potassium: (n) => /\bpotassium\b|^k\+?$/.test(n),
  sodium: (n) => /\bsodium\b|^na\+?$/.test(n),
  chloride: (n) => /\bchloride\b|^cl-?$/.test(n),
  calcium: (n) => /\bcalcium\b|^ca$/.test(n) && !/ion/.test(n),
  glucose: (n) =>
    /glucose|blood sugar|^(fbs|rbs|ppbs)\b/.test(n) && !/urine/.test(n),
  ldh: (n) => /\bldh\b|lactate dehydrogenase/.test(n),
  ast: (n) => /^ast$|\bsgot\b|aspartate/.test(n),
  haemoglobin: (n) => /^(haemoglobin|hemoglobin|hgb|hb)$/.test(n),
  mcv: (n) => /^mcv$|mean corpuscular volume/.test(n),
  platelets: (n) => /platelet/.test(n),
  creatinine: (n) =>
    /creatinine/.test(n) && !/clearance|urine|ratio|kinase/.test(n),
  hba1c: (n) => /hba1c|glycated|glycosylated/.test(n),
  albumin: (n) => /^(serum )?albumin$/.test(n),
};

export function analyteOf(name: string): string | null {
  const n = clean(name);
  for (const [k, test] of Object.entries(ANALYTES)) if (test(n)) return k;
  return null;
}

interface DeltaRule {
  label: string;
  windowDays: number;
  /** Absolute change limit (same unit), or relative limit as a fraction. */
  absolute?: number;
  relative?: number;
  why: string;
}

const DELTA_RULES: Record<string, DeltaRule> = {
  haemoglobin: {
    label: 'Haemoglobin',
    windowDays: 7,
    relative: 0.2,
    why: 'without bleeding or transfusion this is unusual',
  },
  mcv: {
    label: 'MCV',
    windowDays: 30,
    absolute: 5,
    why: 'MCV barely changes over weeks — check that the sample belongs to this patient',
  },
  platelets: {
    label: 'Platelets',
    windowDays: 7,
    relative: 0.5,
    why: 'check for clumping or a mislabelled sample',
  },
  sodium: {
    label: 'Sodium',
    windowDays: 3,
    absolute: 10,
    why: 'a change this fast is rarely physiological',
  },
  potassium: {
    label: 'Potassium',
    windowDays: 3,
    absolute: 1.5,
    why: 'check for haemolysis or a delayed sample',
  },
  chloride: {
    label: 'Chloride',
    windowDays: 3,
    absolute: 12,
    why: 'a change this fast is rarely physiological',
  },
  calcium: {
    label: 'Calcium',
    windowDays: 7,
    relative: 0.25,
    why: 'check for EDTA contamination or a mislabelled sample',
  },
  creatinine: {
    label: 'Creatinine',
    windowDays: 3,
    relative: 0.6,
    why: 'confirm acute kidney injury clinically or recheck the sample',
  },
  hba1c: {
    label: 'HbA1c',
    windowDays: 60,
    absolute: 2,
    why: 'HbA1c reflects about three months — it cannot move this far this fast',
  },
  albumin: {
    label: 'Albumin',
    windowDays: 3,
    relative: 0.25,
    why: 'check for a dilute sample (drip arm)',
  },
};

const fmt = (n: number) => Number(n.toFixed(2)).toString();
const day = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: process.env.SLOT_TIMEZONE ?? 'Asia/Kolkata',
  });

export function deltaChecks(
  rows: ResultRow[],
  history: HistoryPoint[],
  now = new Date(),
): ResultCheck[] {
  const out: ResultCheck[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const value = numericValue(row.value);
    const analyte = analyteOf(row.name);
    if (value === null || !analyte || seen.has(analyte)) continue;
    const rule = DELTA_RULES[analyte];
    if (!rule) continue;
    const prev = history
      .filter(
        (h) =>
          analyteOf(h.name) === analyte &&
          unitKey(h.unit) === unitKey(row.unit) &&
          now.getTime() - h.at.getTime() <= rule.windowDays * DAY &&
          h.at.getTime() <= now.getTime(),
      )
      .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (!prev) continue;
    const change = value - prev.value;
    const tooFar =
      (rule.absolute !== undefined && Math.abs(change) > rule.absolute) ||
      (rule.relative !== undefined &&
        prev.value !== 0 &&
        Math.abs(change) / Math.abs(prev.value) > rule.relative);
    if (!tooFar) continue;
    seen.add(analyte);
    const unit = row.unit ? ` ${row.unit}` : '';
    const pct =
      prev.value !== 0
        ? ` (${change > 0 ? '+' : ''}${Math.round((change / Math.abs(prev.value)) * 100)}%)`
        : '';
    out.push({
      kind: 'delta',
      code: `delta:${analyte}`,
      severity: 'review',
      parameters: [row.name],
      message: `${row.name} ${fmt(prev.value)} → ${fmt(value)}${unit}${pct} since ${day(prev.at)} — ${rule.why}.`,
      previous: { value: prev.value, unit: prev.unit, at: prev.at },
    });
  }
  return out;
}

/** Current value of an analyte in a common unit (mmol/L for electrolytes, mg/dL for calcium and glucose). */
function valueOf(rows: ResultRow[], analyte: string) {
  const row = rows.find(
    (r) => analyteOf(r.name) === analyte && numericValue(r.value) !== null,
  );
  if (!row) return null;
  const v = numericValue(row.value)!;
  const u = unitKey(row.unit);
  if (analyte === 'calcium') return { row, v: u === 'mmol/l' ? v * 4.008 : v };
  if (analyte === 'glucose') return { row, v: u === 'mmol/l' ? v * 18 : v };
  return { row, v };
}
const isHigh = (r: ResultRow | undefined) =>
  !!r && (r.flag === 'high' || r.flag === 'critical_high');
const isLow = (r: ResultRow | undefined) =>
  !!r && (r.flag === 'low' || r.flag === 'critical_low');

export function contaminationChecks(rows: ResultRow[]): ResultCheck[] {
  const out: ResultCheck[] = [];
  const k = valueOf(rows, 'potassium');
  const ca = valueOf(rows, 'calcium');
  const glu = valueOf(rows, 'glucose');
  const na = valueOf(rows, 'sodium');
  const cl = valueOf(rows, 'chloride');
  const ldh = valueOf(rows, 'ldh');
  const ast = valueOf(rows, 'ast');
  const alb = valueOf(rows, 'albumin');

  if (k && ca && k.v >= 6 && ca.v < 7)
    out.push({
      kind: 'contamination',
      code: 'edta',
      severity: 'hold',
      parameters: [k.row.name, ca.row.name],
      message:
        'High potassium with very low calcium — possible EDTA (purple-top) contamination. Recollect before reporting.',
    });
  if (glu && glu.v >= 500 && [na, k, ca, alb].some((x) => x && isLow(x.row)))
    out.push({
      kind: 'contamination',
      code: 'dextrose_drip',
      severity: 'hold',
      parameters: [glu.row.name],
      message:
        'Very high glucose with diluted electrolytes or protein — possible IV dextrose contamination (sample drawn from the drip arm). Recollect from the other arm.',
    });
  if (
    na &&
    cl &&
    na.v >= 150 &&
    cl.v >= 115 &&
    [glu, ca, alb].some((x) => x && isLow(x.row))
  )
    out.push({
      kind: 'contamination',
      code: 'saline_drip',
      severity: 'review',
      parameters: [na.row.name, cl.row.name],
      message:
        'High sodium and chloride with other values diluted — possible saline drip contamination.',
    });
  if (k && isHigh(k.row) && (isHigh(ldh?.row) || isHigh(ast?.row)))
    out.push({
      kind: 'contamination',
      code: 'haemolysis',
      severity: 'review',
      parameters: [
        k.row.name,
        ...[ldh, ast].filter((x) => x && isHigh(x.row)).map((x) => x!.row.name),
      ],
      message:
        'Potassium raised together with LDH/AST — look at the sample for haemolysis before reporting.',
    });
  if (
    k &&
    glu &&
    isHigh(k.row) &&
    glu.v < 50 &&
    !out.some((c) => c.code === 'edta')
  )
    out.push({
      kind: 'contamination',
      code: 'delayed_separation',
      severity: 'review',
      parameters: [k.row.name, glu.row.name],
      message:
        'High potassium with low glucose — typical of a sample left unseparated too long. Check collection time.',
    });
  return out;
}

export function resultChecks(
  rows: ResultRow[],
  history: HistoryPoint[],
  now = new Date(),
): ResultCheck[] {
  return [...contaminationChecks(rows), ...deltaChecks(rows, history, now)];
}
