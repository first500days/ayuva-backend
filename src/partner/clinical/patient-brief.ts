/**
 * The one-paragraph patient summary at the top of a consultation. Built by
 * rules from structured records only — coded diagnoses, patient-reported
 * conditions, admissions, the last signed note, active prescriptions and
 * flagged lab values — so every phrase can be traced to a record. Nothing
 * is inferred or invented.
 */

export interface TrendLike {
  parameter: string;
  unit: string | null;
  points: { at: string; value: number; flag: string }[];
}

export interface BriefLab {
  parameter: string;
  value: number;
  unit: string | null;
  flag: string;
  at: Date;
}

/** Commonly decisive results, shown before others when nothing is flagged. */
const KEY_LAB =
  /hba1c|glycated|creatinine|egfr|haemoglobin|hemoglobin|\bhb\b|platelet|potassium|sodium|ldl|cholesterol|tsh|\binr\b|glucose|fbs|ppbs|rbs|crp|\balt\b|sgpt|\bast\b|sgot|bilirubin|troponin|urea|wbc|tlc|vitamin/i;

const FLAG_LABEL: Record<string, string> = {
  high: 'high',
  low: 'low',
  critical_high: 'critically high',
  critical_low: 'critically low',
};

/** Latest value of each parameter; flagged first, then key tests, then most recent. */
export function pickLabs(series: TrendLike[], max = 5): BriefLab[] {
  const latest = series
    .filter((s) => s.points.length)
    .map((s) => {
      const p = s.points[s.points.length - 1];
      return {
        parameter: s.parameter,
        value: p.value,
        unit: s.unit,
        flag: p.flag,
        at: new Date(p.at),
      };
    });
  const rank = (l: BriefLab) =>
    FLAG_LABEL[l.flag] ? 0 : KEY_LAB.test(l.parameter) ? 1 : 2;
  return latest
    .sort((a, b) => rank(a) - rank(b) || b.at.getTime() - a.at.getTime())
    .slice(0, max);
}

export interface BriefInput {
  name: string;
  age?: number;
  gender?: string;
  /** Coded diagnoses from signed notes, newest first, and patient-reported conditions. */
  conditions: {
    label: string;
    since?: Date;
    source: 'diagnosed' | 'patient';
  }[];
  admission?: { ward: string; since: Date; reason?: string } | null;
  lastVisit?: { at: Date; by: string; summary: string } | null;
  medications: string[];
  labs: BriefLab[];
}

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: process.env.SLOT_TIMEZONE ?? 'Asia/Kolkata',
  });

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function who(age?: number, gender?: string): string {
  const g = (gender ?? '').toLowerCase();
  const noun = g === 'female' ? 'woman' : g === 'male' ? 'man' : 'patient';
  return age !== undefined
    ? `${age}-year-old ${noun}`
    : g === 'female' || g === 'male'
      ? noun
      : '';
}

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export function composeBrief(b: BriefInput): string {
  const parts: string[] = [];
  const person = who(b.age, b.gender);
  parts.push(`${b.name}${person ? `, ${person}` : ''}.`);

  const seen = new Set<string>();
  const conditions = b.conditions.filter((c) => {
    const k = c.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (conditions.length) {
    const shown = conditions
      .slice(0, 6)
      .map((c) =>
        c.source === 'patient'
          ? `${c.label} (patient-reported)`
          : c.since
            ? `${c.label} (since ${fmt(c.since)})`
            : c.label,
      );
    parts.push(
      `Known conditions: ${listOf(shown)}${conditions.length > 6 ? ` and ${conditions.length - 6} more` : ''}.`,
    );
  } else {
    parts.push('No diagnoses or conditions on record.');
  }
  if (b.admission)
    parts.push(
      `Currently admitted to ${b.admission.ward} since ${fmt(b.admission.since)}${b.admission.reason ? ` (${clip(b.admission.reason, 80)})` : ''}.`,
    );
  if (b.lastVisit)
    parts.push(
      `Last visit ${fmt(b.lastVisit.at)} with ${b.lastVisit.by}: ${clip(b.lastVisit.summary, 140)}.`,
    );
  if (b.medications.length)
    parts.push(
      `Active medicines: ${listOf(b.medications.slice(0, 6))}${b.medications.length > 6 ? ` and ${b.medications.length - 6} more` : ''}.`,
    );
  else parts.push('No active prescriptions from your organisation.');
  if (b.labs.length)
    parts.push(
      `Latest results: ${listOf(
        b.labs.map(
          (l) =>
            `${l.parameter} ${l.value}${l.unit ? ` ${l.unit}` : ''} (${FLAG_LABEL[l.flag] ? `${FLAG_LABEL[l.flag]}, ` : ''}${fmt(l.at)})`,
        ),
      )}.`,
    );
  return parts.join(' ').replace(/\.\./g, '.');
}
