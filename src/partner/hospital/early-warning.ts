import type { LabKey, LabPanel, Reading } from '../clinical/lab-panel';

/**
 * Early-warning scoring for inpatients: the published NEWS2 chart, SIRS
 * criteria, and recent inflammation markers from the lab. A fixed protocol,
 * not a prediction: it says which criteria are met and asks a clinician to
 * review. Its thresholds need sign-off from the hospital's clinical lead
 * before anyone relies on them.
 */

export interface Observations {
  rr?: number;
  spo2?: number;
  onOxygen?: boolean;
  tempC?: number;
  systolic?: number;
  hr?: number;
  /** ACVPU: anything other than A scores as new confusion or worse. */
  avpu?: 'A' | 'C' | 'V' | 'P' | 'U';
}

export type News2Param =
  'rr' | 'spo2' | 'oxygen' | 'systolic' | 'hr' | 'consciousness' | 'tempC';

export type News2Band = 'low' | 'low-medium' | 'medium' | 'high';

export interface News2 {
  total: number;
  band: News2Band;
  parts: Partial<Record<News2Param, number>>;
  /** Parameters with no reading: the total can only be too low, never too high. */
  missing: News2Param[];
}

const ALL_PARAMS: News2Param[] = [
  'rr',
  'spo2',
  'oxygen',
  'systolic',
  'hr',
  'consciousness',
  'tempC',
];

function rrScore(v: number): number {
  if (v <= 8) return 3;
  if (v <= 11) return 1;
  if (v <= 20) return 0;
  return v <= 24 ? 2 : 3;
}

/** SpO2 scale 1. Scale 2 (hypercapnic respiratory failure) needs a clinician's choice. */
function spo2Score(v: number): number {
  if (v <= 91) return 3;
  if (v <= 93) return 2;
  return v <= 95 ? 1 : 0;
}

function systolicScore(v: number): number {
  if (v <= 90) return 3;
  if (v <= 100) return 2;
  if (v <= 110) return 1;
  return v <= 219 ? 0 : 3;
}

function hrScore(v: number): number {
  if (v <= 40) return 3;
  if (v <= 50) return 1;
  if (v <= 90) return 0;
  if (v <= 110) return 1;
  return v <= 130 ? 2 : 3;
}

function tempScore(v: number): number {
  if (v <= 35) return 3;
  if (v <= 36) return 1;
  if (v <= 38) return 0;
  return v <= 39 ? 1 : 2;
}

export function news2(o: Observations): News2 {
  const parts: News2['parts'] = {};
  if (o.rr !== undefined) parts.rr = rrScore(o.rr);
  if (o.spo2 !== undefined) parts.spo2 = spo2Score(o.spo2);
  if (o.onOxygen !== undefined) parts.oxygen = o.onOxygen ? 2 : 0;
  if (o.systolic !== undefined) parts.systolic = systolicScore(o.systolic);
  if (o.hr !== undefined) parts.hr = hrScore(o.hr);
  if (o.avpu !== undefined) parts.consciousness = o.avpu === 'A' ? 0 : 3;
  if (o.tempC !== undefined) parts.tempC = tempScore(o.tempC);
  const scores = Object.values(parts);
  const total = scores.reduce((a, b) => a + b, 0);
  const band: News2Band =
    total >= 7
      ? 'high'
      : total >= 5
        ? 'medium'
        : scores.includes(3)
          ? 'low-medium'
          : 'low';
  return {
    total,
    band,
    parts,
    missing: ALL_PARAMS.filter((p) => parts[p] === undefined),
  };
}

export interface Sirs {
  met: number;
  criteria: string[];
}

export function sirs(o: Observations, wbc?: Reading): Sirs {
  const criteria: string[] = [];
  if (o.tempC !== undefined && (o.tempC > 38 || o.tempC < 36))
    criteria.push(`Temperature ${o.tempC} °C`);
  if (o.hr !== undefined && o.hr > 90) criteria.push(`Heart rate ${o.hr}`);
  if (o.rr !== undefined && o.rr > 20)
    criteria.push(`Respiratory rate ${o.rr}`);
  if (wbc && (wbc.value > 12 || wbc.value < 4))
    criteria.push(`WBC ${wbc.value} ×10³/µL`);
  return { met: criteria.length, criteria };
}

/** Markers older than this say nothing about how the patient is now. */
const INFLAMMATION_MAX_AGE_DAYS = 2;

const INFLAMMATION: {
  key: LabKey;
  label: string;
  unit: string;
  raised: (v: number) => boolean;
}[] = [
  { key: 'crp', label: 'CRP', unit: 'mg/L', raised: (v) => v >= 50 },
  {
    key: 'procalcitonin',
    label: 'Procalcitonin',
    unit: 'ng/mL',
    raised: (v) => v >= 0.5,
  },
  { key: 'lactate', label: 'Lactate', unit: 'mmol/L', raised: (v) => v > 2 },
  {
    key: 'wbc',
    label: 'WBC',
    unit: '×10³/µL',
    raised: (v) => v > 12 || v < 4,
  },
];

/** Recent lab results that point to systemic inflammation. */
export function inflammationAlerts(labs: LabPanel): string[] {
  const out: string[] = [];
  for (const m of INFLAMMATION) {
    const r = labs[m.key];
    if (r && r.ageDays <= INFLAMMATION_MAX_AGE_DAYS && m.raised(r.value))
      out.push(`${m.label} ${Math.round(r.value * 10) / 10} ${m.unit}`);
  }
  return out;
}

export type WarningLevel = 'none' | 'watch' | 'high' | 'sepsis_screen';

export interface EarlyWarning {
  level: WarningLevel;
  title: string;
  /** Exactly which readings and results led here. */
  factors: string[];
  news2: News2;
  sirs: Sirs;
  inflammation: string[];
}

export const EARLY_WARNING_NOTE =
  'Rule-based screen using NEWS2, SIRS criteria and recent lab results. It is not a diagnosis. A clinician must assess the patient and decide what to do.';

const NEWS_LABEL: Record<News2Param, (o: Observations) => string> = {
  rr: (o) => `Respiratory rate ${o.rr}`,
  spo2: (o) => `SpO₂ ${o.spo2}%`,
  oxygen: () => 'On supplemental oxygen',
  systolic: (o) => `Systolic BP ${o.systolic}`,
  hr: (o) => `Heart rate ${o.hr}`,
  consciousness: (o) => `Consciousness ${o.avpu}`,
  tempC: (o) => `Temperature ${o.tempC} °C`,
};

/**
 * Combines the bedside numbers with the lab. The sepsis screen needs both
 * deranged physiology and laboratory evidence, so a fast heart rate alone
 * never raises it.
 */
export function assess(o: Observations, labs: LabPanel): EarlyWarning {
  const score = news2(o);
  const screen = sirs(o, labs.wbc);
  const inflammation = inflammationAlerts(labs);
  const abnormal = (Object.entries(score.parts) as [News2Param, number][])
    .filter(([, points]) => points > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => NEWS_LABEL[p](o));
  const physiology = score.total >= 5 || screen.met >= 2;

  let level: WarningLevel = 'none';
  let title = 'No early-warning criteria met';
  if (inflammation.length && physiology) {
    level = 'sepsis_screen';
    title = 'Sepsis screening criteria met — needs clinical review';
  } else if (score.total >= 7) {
    level = 'high';
    title = `High early-warning score (NEWS2 ${score.total})`;
  } else if (score.band === 'medium' || score.band === 'low-medium') {
    level = 'watch';
    title = `Raised early-warning score (NEWS2 ${score.total})`;
  }
  return {
    level,
    title,
    factors: [...abnormal, ...inflammation],
    news2: score,
    sirs: screen,
    inflammation,
  };
}

/** Middle of the recent readings: one bad sample from a loose lead shouldn't raise an alarm. */
export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
