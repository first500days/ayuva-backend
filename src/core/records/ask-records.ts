import { MedicalRecordType } from './schemas/medical-record.schema';

/**
 * "Ask Your Records": turns a patient's question about their own history into
 * a lookup over their vault — rule-based, so every answer points at the
 * documents it came from. An LLM can replace the parsing via the AI gateway.
 */

export interface Marker {
  /** How the answer names it. */
  label: string;
  /** Matches the test's name as printed on a report. */
  pattern: RegExp;
}

export type AskIntent =
  | { kind: 'latest'; type?: MedicalRecordType }
  | { kind: 'earliest'; type?: MedicalRecordType }
  | { kind: 'count'; type?: MedicalRecordType; since?: Date }
  | { kind: 'value'; marker: Marker }
  | { kind: 'search'; words: string[]; type?: MedicalRecordType };

const TYPE_WORDS: Array<[RegExp, MedicalRecordType]> = [
  [
    /\b(blood|lab|labs|pathology|urine|test|tests|report|reports|cbc|lipid|thyroid|sugar)\b/i,
    MedicalRecordType.LAB_REPORT,
  ],
  [
    /\b(scan|scans|x-?rays?|mri|ct|ultrasound|usg|sonography|imaging|echo|mammogram)\b/i,
    MedicalRecordType.SCAN,
  ],
  [/\b(prescriptions?|rx|medicine list)\b/i, MedicalRecordType.PRESCRIPTION],
  [
    /\b(discharge|admitted|admission|hospital stay|hospitali[sz]ed)\b/i,
    MedicalRecordType.DISCHARGE,
  ],
  [
    /\b(vaccines?|vaccinations?|immuni[sz]ations?|jabs?|booster)\b/i,
    MedicalRecordType.VACCINATION,
  ],
  [/\b(insurance|policy|claims?)\b/i, MedicalRecordType.INSURANCE],
  [/\b(certificates?|fitness|sick leave)\b/i, MedicalRecordType.CERTIFICATE],
];

/** Test names patients ask about, and how each is printed on reports. */
export const MARKERS: Array<[RegExp, Marker]> = [
  [
    /\bhba1c\b|\ba1c\b|average sugar/i,
    { label: 'HbA1c', pattern: /\bhba1c\b|glycated|glycosylated/i },
  ],
  [
    /\b(fasting )?(blood )?(sugar|glucose)\b/i,
    { label: 'blood sugar', pattern: /glucose|sugar|\bfbs\b|\bppbs\b/i },
  ],
  [
    /\bh(a)?emoglobin\b|\bhb\b/i,
    { label: 'haemoglobin', pattern: /h(a)?emoglobin|^hb\b/i },
  ],
  [/\bldl\b/i, { label: 'LDL cholesterol', pattern: /\bldl\b/i }],
  [/\bhdl\b/i, { label: 'HDL cholesterol', pattern: /\bhdl\b/i }],
  [
    /\btriglycerides?\b/i,
    { label: 'triglycerides', pattern: /triglycerides?/i },
  ],
  [
    /\bcholesterol\b/i,
    { label: 'cholesterol', pattern: /^(total |serum )?cholesterol/i },
  ],
  [/\btsh\b|\bthyroid\b/i, { label: 'TSH', pattern: /\btsh\b/i }],
  [
    /\bvitamin d\b|\bvit d\b/i,
    { label: 'vitamin D', pattern: /vitamin d|25[- ]?oh/i },
  ],
  [/\b(vitamin )?b12\b/i, { label: 'vitamin B12', pattern: /b12|cobalamin/i }],
  [
    /\bcreatinine\b|\bkidney\b/i,
    { label: 'creatinine', pattern: /creatinine/i },
  ],
  [/\buric acid\b/i, { label: 'uric acid', pattern: /uric acid/i }],
  [/\bplatelets?\b/i, { label: 'platelets', pattern: /platelet/i }],
  [
    /\b(wbc|white (blood )?cells?)\b/i,
    {
      label: 'white blood cells',
      pattern: /\bwbc\b|white blood|leu[ck]ocyte|\btlc\b/i,
    },
  ],
  [
    /\b(sgpt|alt)\b|\bliver\b/i,
    { label: 'ALT (SGPT)', pattern: /\b(alt|sgpt)\b/i },
  ],
  [/\b(sgot|ast)\b/i, { label: 'AST (SGOT)', pattern: /\b(ast|sgot)\b/i }],
  [/\bbilirubin\b/i, { label: 'bilirubin', pattern: /bilirubin/i }],
  [
    /\bferritin\b|\biron\b/i,
    { label: 'ferritin', pattern: /ferritin|\biron\b/i },
  ],
  [/\besr\b/i, { label: 'ESR', pattern: /\besr\b|sedimentation/i }],
  [/\bcrp\b/i, { label: 'CRP', pattern: /\bcrp\b|c-?reactive/i }],
];

const STOP_WORDS = new Set(
  'a an and are am any at be did do does for from get had has have how i in is it last latest me my of on or show the to was were what when where which who with my all find recent first previous'.split(
    ' ',
  ),
);

function sinceFrom(q: string, now: Date): Date | undefined {
  const d = new Date(now);
  const n = /\b(last|past)\s+(\d{1,2})\s+(day|week|month|year)s?\b/i.exec(q);
  if (n) {
    const k = Number(n[2]);
    const unit = n[3].toLowerCase();
    if (unit === 'day') d.setDate(d.getDate() - k);
    if (unit === 'week') d.setDate(d.getDate() - 7 * k);
    if (unit === 'month') d.setMonth(d.getMonth() - k);
    if (unit === 'year') d.setFullYear(d.getFullYear() - k);
    return d;
  }
  if (/\bthis year\b/i.test(q))
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  if (/\b(last|past) year\b/i.test(q)) {
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return undefined;
}

export function parseQuestion(
  question: string,
  now: Date = new Date(),
): AskIntent {
  const q = question.trim();
  const type = TYPE_WORDS.find(([p]) => p.test(q))?.[1];

  // "What was my TSH?", "my last HbA1c value", "how is my cholesterol"
  const asksValue =
    /\b(what|how)\b.*\b(was|is|were|are)\b|\bvalue|\blevel|\breading|\bresult/i.test(
      q,
    );
  const marker = MARKERS.find(([p]) => p.test(q))?.[1];
  if (marker && (asksValue || !/\bwhen\b|\bhow many\b/i.test(q))) {
    return { kind: 'value', marker };
  }
  if (/\bhow many\b|\bcount\b|\bnumber of\b/i.test(q))
    return { kind: 'count', type, since: sinceFrom(q, now) };
  if (/\b(first|earliest|oldest)\b/i.test(q)) return { kind: 'earliest', type };
  if (/\bwhen\b|\blast\b|\blatest\b|\brecent\b|\bprevious\b/i.test(q) && type)
    return { kind: 'latest', type };
  if (type && !/\b(from|at|by)\s+\w/i.test(q)) return { kind: 'latest', type };

  // Anything else: the remaining words, matched against titles, providers and tags.
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .filter((w) => !TYPE_WORDS.some(([p]) => p.test(w)));
  return { kind: 'search', words: words.slice(0, 6), type };
}
