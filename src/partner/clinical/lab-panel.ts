/**
 * Turns lab results into the handful of numbers safety rules need: eGFR,
 * potassium, liver enzymes, INR, platelets and inflammation markers, each in
 * one unit and with its date, so a rule can say which value it acted on.
 * Results arrive under many names and units; anything it can't place is left
 * out rather than guessed.
 */

export interface LabPoint {
  parameter: string;
  value: number;
  unit: string | null;
  at: string;
  refHigh?: number | null;
}

export interface Reading {
  value: number;
  unit: string;
  at: string;
  ageDays: number;
  refHigh?: number;
  /** eGFR worked out from creatinine rather than reported by the lab. */
  estimated?: boolean;
}

export type LabKey =
  | 'egfr'
  | 'creatinine'
  | 'potassium'
  | 'alt'
  | 'ast'
  | 'bilirubin'
  | 'inr'
  | 'platelets'
  | 'wbc'
  | 'crp'
  | 'procalcitonin'
  | 'lactate';

export type LabPanel = Partial<Record<LabKey, Reading>>;

const MATCHERS: { key: LabKey; name: RegExp; not?: RegExp }[] = [
  { key: 'egfr', name: /\be\s*-?\s*gfr\b|estimated\s+glomerular/i },
  {
    key: 'creatinine',
    name: /\bcreatinine\b/i,
    not: /urin|ratio|clearance|\bacr\b/i,
  },
  {
    key: 'potassium',
    name: /\bpotassium\b|^\s*(?:serum\s+)?k\+?\s*$/i,
    not: /urin/i,
  },
  { key: 'alt', name: /\balt\b|\bsgpt\b|alanine/i },
  { key: 'ast', name: /\bast\b|\bsgot\b|aspartate/i },
  { key: 'bilirubin', name: /bilirubin/i, not: /direct|indirect|conjugated/i },
  { key: 'inr', name: /\binr\b/i },
  {
    key: 'platelets',
    name: /platelet|\bplt\b/i,
    not: /mean|volume|\bmpv\b|distribution/i,
  },
  {
    key: 'wbc',
    name: /\bwbc\b|\btlc\b|total\s+leu[ck]ocyte|white\s+blood\s+cell/i,
  },
  { key: 'crp', name: /\bcrp\b|c[\s-]?reactive/i },
  { key: 'procalcitonin', name: /procalcitonin|\bpct\b/i },
  {
    key: 'lactate',
    name: /lactate|lactic\s+acid/i,
    not: /dehydrogenase|\bldh\b/i,
  },
];

function keyOf(parameter: string): LabKey | null {
  for (const m of MATCHERS)
    if (m.name.test(parameter) && !m.not?.test(parameter)) return m.key;
  return null;
}

/** A count in thousands per microlitre, from the ways Indian labs print it. */
function perMicrolitreThousands(value: number, unit: string): number | null {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u.includes('lakh')) return value * 100;
  if (/10\^?[39]|10³|10⁹|k\/|thou|\bk\b|g\/l/.test(u)) return value;
  if (/\/(cumm|mm3|mm³|ul|µl|cmm)/.test(u)) return value / 1000;
  // No usable unit: only a value too large to be anything else is safe to read.
  return value > 2000 ? value / 1000 : null;
}

function normalise(
  key: LabKey,
  value: number,
  unit: string | null,
): { value: number; unit: string } | null {
  const u = (unit ?? '').toLowerCase();
  switch (key) {
    case 'creatinine':
      return { value: /mol/.test(u) ? value / 88.4 : value, unit: 'mg/dL' };
    case 'bilirubin':
      return { value: /mol/.test(u) ? value / 17.1 : value, unit: 'mg/dL' };
    case 'lactate':
      return { value: /mg/.test(u) ? value / 9 : value, unit: 'mmol/L' };
    case 'crp':
      return { value: /mg\/dl/.test(u) ? value * 10 : value, unit: 'mg/L' };
    case 'platelets':
    case 'wbc': {
      const v = perMicrolitreThousands(value, unit ?? '');
      return v === null ? null : { value: v, unit: '×10³/µL' };
    }
    case 'egfr':
      return { value, unit: 'mL/min/1.73m²' };
    case 'potassium':
      return { value, unit: 'mmol/L' };
    case 'alt':
    case 'ast':
      return { value, unit: 'U/L' };
    case 'procalcitonin':
      return { value, unit: 'ng/mL' };
    case 'inr':
      return { value, unit: '' };
  }
}

/** CKD-EPI 2021 creatinine equation (no race coefficient). */
export function estimateEgfr(
  creatinineMgDl: number,
  age: number,
  sex: 'female' | 'male',
): number {
  const female = sex === 'female';
  const kappa = female ? 0.7 : 0.9;
  const ratio = creatinineMgDl / kappa;
  return Math.round(
    142 *
      Math.min(ratio, 1) ** (female ? -0.241 : -0.302) *
      Math.max(ratio, 1) ** -1.2 *
      0.9938 ** age *
      (female ? 1.012 : 1),
  );
}

/** The newest value of each parameter; eGFR is worked out from creatinine if not reported. */
export function buildPanel(
  points: LabPoint[],
  patient: { age?: number; gender?: string | null } = {},
  now: Date = new Date(),
): LabPanel {
  const panel: LabPanel = {};
  for (const p of points) {
    const key = keyOf(p.parameter);
    if (!key || !Number.isFinite(p.value)) continue;
    const at = Date.parse(p.at);
    if (Number.isNaN(at) || at > now.getTime() + 86_400_000) continue;
    if (panel[key] && Date.parse(panel[key].at) >= at) continue;
    const n = normalise(key, p.value, p.unit);
    if (!n) continue;
    panel[key] = {
      ...n,
      at: p.at,
      ageDays: Math.max(0, (now.getTime() - at) / 86_400_000),
      ...(p.refHigh ? { refHigh: p.refHigh } : {}),
    };
  }
  const sex =
    patient.gender?.toLowerCase() === 'female'
      ? 'female'
      : patient.gender?.toLowerCase() === 'male'
        ? 'male'
        : null;
  if (
    !panel.egfr &&
    panel.creatinine &&
    panel.creatinine.value > 0 &&
    patient.age &&
    patient.age >= 18 &&
    sex
  ) {
    panel.egfr = {
      value: estimateEgfr(panel.creatinine.value, patient.age, sex),
      unit: 'mL/min/1.73m²',
      at: panel.creatinine.at,
      ageDays: panel.creatinine.ageDays,
      estimated: true,
    };
  }
  return panel;
}

const IN_TEXT =
  /(creatinine|e\s*-?\s*gfr|potassium|\bk\+|\bsgpt\b|\balt\b|\bsgot\b|\bast\b|(?:total\s+)?bilirubin(?:\s+total)?|\binr\b|platelets?(?:\s+count)?|\bplt\b|\bwbc\b|\btlc\b|\bcrp\b|procalcitonin|\bpct\b|lactate)\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*((?:mg|g|ng|µg|mcg|u|iu|mmol|umol|µmol|meq|lakh|thou|cells|x?10|\/)[^\s,;.]*)?/gi;

/** Values written in a hospital lab's free-text result, e.g. "Creatinine: 2.4 mg/dL, K+ 5.8". */
export function pointsFromText(text: string, at: string): LabPoint[] {
  const points: LabPoint[] = [];
  for (const m of text.matchAll(IN_TEXT))
    points.push({
      parameter: m[1],
      value: Number(m[2]),
      unit: m[3] ?? null,
      at,
    });
  return points;
}

const SHORT: Partial<Record<LabKey, string>> = {
  egfr: 'eGFR',
  potassium: 'Potassium',
  alt: 'ALT',
  ast: 'AST',
  bilirubin: 'Bilirubin',
  inr: 'INR',
  platelets: 'Platelets',
  wbc: 'WBC',
  crp: 'CRP',
  procalcitonin: 'Procalcitonin',
  lactate: 'Lactate',
  creatinine: 'Creatinine',
};

const round = (v: number) => Math.round(v * 10) / 10;
const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/** "eGFR 24 on 3 Nov", naming how it was arrived at when it was calculated. */
export function describe(key: LabKey, r: Reading): string {
  return `${SHORT[key] ?? key}${r.estimated ? ' (calculated from creatinine)' : ''} ${round(r.value)}${r.unit && key !== 'egfr' ? ` ${r.unit}` : ''} on ${dayMonth(r.at)}`;
}
