/**
 * Emergency triage: a five-level acuity scale with target times to be seen
 * by a doctor, and a rule-based suggestion from adult vital signs. The
 * suggestion is advisory and explains itself; the triage nurse or doctor
 * always sets the level.
 */

export type TriageLevel = 1 | 2 | 3 | 4 | 5;

export const TRIAGE_LEVELS: Record<
  TriageLevel,
  { label: string; colour: string; targetMinutes: number }
> = {
  1: { label: 'Resuscitation', colour: 'red', targetMinutes: 0 },
  2: { label: 'Emergent', colour: 'orange', targetMinutes: 10 },
  3: { label: 'Urgent', colour: 'yellow', targetMinutes: 30 },
  4: { label: 'Less urgent', colour: 'green', targetMinutes: 60 },
  5: { label: 'Non-urgent', colour: 'blue', targetMinutes: 120 },
};

export interface Vitals {
  hr?: number; // beats/min
  sbp?: number; // mmHg
  dbp?: number;
  rr?: number; // breaths/min
  spo2?: number; // %
  temp?: number; // °C
  gcs?: number; // 3–15
  pain?: number; // 0–10
  glucose?: number; // mg/dL
}

interface Rule {
  level: TriageLevel;
  test: (v: Vitals) => string | null;
}

const has = (n: number | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const RULES: Rule[] = [
  // Level 1 — immediate threat to life
  {
    level: 1,
    test: (v) => (has(v.gcs) && v.gcs <= 8 ? `GCS ${v.gcs} (≤ 8)` : null),
  },
  {
    level: 1,
    test: (v) => (has(v.spo2) && v.spo2 < 85 ? `SpO₂ ${v.spo2}% (< 85)` : null),
  },
  {
    level: 1,
    test: (v) =>
      has(v.sbp) && v.sbp < 80 ? `Systolic BP ${v.sbp} (< 80)` : null,
  },
  {
    level: 1,
    test: (v) =>
      has(v.hr) && (v.hr < 40 || v.hr > 150) ? `Heart rate ${v.hr}` : null,
  },
  {
    level: 1,
    test: (v) =>
      has(v.rr) && (v.rr < 8 || v.rr > 35) ? `Resp. rate ${v.rr}` : null,
  },
  // Level 2 — high risk, could deteriorate quickly
  {
    level: 2,
    test: (v) =>
      has(v.gcs) && v.gcs >= 9 && v.gcs <= 13 ? `GCS ${v.gcs} (9–13)` : null,
  },
  {
    level: 2,
    test: (v) =>
      has(v.spo2) && v.spo2 >= 85 && v.spo2 < 92
        ? `SpO₂ ${v.spo2}% (< 92)`
        : null,
  },
  {
    level: 2,
    test: (v) =>
      has(v.sbp) && v.sbp >= 80 && v.sbp < 90
        ? `Systolic BP ${v.sbp} (< 90)`
        : null,
  },
  {
    level: 2,
    test: (v) =>
      has(v.sbp) && v.sbp >= 220 ? `Systolic BP ${v.sbp} (≥ 220)` : null,
  },
  {
    level: 2,
    test: (v) =>
      has(v.hr) && ((v.hr >= 40 && v.hr < 50) || (v.hr >= 130 && v.hr <= 150))
        ? `Heart rate ${v.hr}`
        : null,
  },
  {
    level: 2,
    test: (v) =>
      has(v.rr) && v.rr >= 30 && v.rr <= 35
        ? `Resp. rate ${v.rr} (≥ 30)`
        : null,
  },
  {
    level: 2,
    test: (v) =>
      has(v.temp) && (v.temp >= 40 || v.temp < 35)
        ? `Temperature ${v.temp} °C`
        : null,
  },
  {
    level: 2,
    test: (v) => (has(v.pain) && v.pain >= 8 ? `Pain ${v.pain}/10` : null),
  },
  {
    level: 2,
    test: (v) =>
      has(v.glucose) && (v.glucose < 54 || v.glucose > 400)
        ? `Glucose ${v.glucose} mg/dL`
        : null,
  },
  // Level 3 — abnormal, needs prompt care
  {
    level: 3,
    test: (v) =>
      has(v.spo2) && v.spo2 >= 92 && v.spo2 < 95
        ? `SpO₂ ${v.spo2}% (< 95)`
        : null,
  },
  {
    level: 3,
    test: (v) =>
      has(v.hr) && v.hr >= 110 && v.hr < 130
        ? `Heart rate ${v.hr} (≥ 110)`
        : null,
  },
  {
    level: 3,
    test: (v) =>
      has(v.rr) && v.rr >= 24 && v.rr < 30 ? `Resp. rate ${v.rr} (≥ 24)` : null,
  },
  {
    level: 3,
    test: (v) =>
      has(v.sbp) &&
      ((v.sbp >= 90 && v.sbp < 100) || (v.sbp >= 180 && v.sbp < 220))
        ? `Systolic BP ${v.sbp}`
        : null,
  },
  {
    level: 3,
    test: (v) =>
      has(v.temp) && v.temp >= 38.5 && v.temp < 40
        ? `Temperature ${v.temp} °C`
        : null,
  },
  {
    level: 3,
    test: (v) =>
      has(v.pain) && v.pain >= 5 && v.pain < 8 ? `Pain ${v.pain}/10` : null,
  },
  {
    level: 3,
    test: (v) =>
      has(v.glucose) &&
      ((v.glucose >= 54 && v.glucose < 70) ||
        (v.glucose > 300 && v.glucose <= 400))
        ? `Glucose ${v.glucose} mg/dL`
        : null,
  },
  // Level 4 — mildly abnormal
  {
    level: 4,
    test: (v) =>
      has(v.hr) && v.hr >= 100 && v.hr < 110
        ? `Heart rate ${v.hr} (≥ 100)`
        : null,
  },
  {
    level: 4,
    test: (v) =>
      has(v.temp) && v.temp >= 37.8 && v.temp < 38.5
        ? `Temperature ${v.temp} °C`
        : null,
  },
  {
    level: 4,
    test: (v) =>
      has(v.pain) && v.pain >= 1 && v.pain < 5 ? `Pain ${v.pain}/10` : null,
  },
];

/**
 * The most urgent level any vital sign calls for, with the reasons at that
 * level. Null when no vital sign triggers — the level then rests on the
 * complaint and the nurse's judgement.
 */
export function suggestLevel(
  v: Vitals,
  flags: { unresponsive?: boolean } = {},
): { level: TriageLevel | null; reasons: string[] } {
  if (flags.unresponsive) return { level: 1, reasons: ['Unresponsive'] };
  const hits = RULES.map((r) => ({ level: r.level, why: r.test(v) })).filter(
    (h): h is { level: TriageLevel; why: string } => !!h.why,
  );
  if (!hits.length) return { level: null, reasons: [] };
  const level = Math.min(...hits.map((h) => h.level)) as TriageLevel;
  return {
    level,
    reasons: hits.filter((h) => h.level === level).map((h) => h.why),
  };
}

/** Minutes past the level's target for a patient not yet seen by a doctor (≤ 0 = within target). */
export function minutesOverTarget(
  level: TriageLevel,
  triagedAt: Date,
  now: Date,
): number {
  const waited = (now.getTime() - triagedAt.getTime()) / 60000;
  return Math.floor(waited - TRIAGE_LEVELS[level].targetMinutes);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
