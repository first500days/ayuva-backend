import { MedicalRecordType } from './schemas/medical-record.schema';

/**
 * Reads a medical document's folder, clinical date and issuing provider from
 * its text (a PDF's text layer today; OCR text from the AI gateway later) and
 * its file name. Rule-based and deterministic: every guess comes from words in
 * the document, and the patient confirms or corrects it in the app.
 */

export type DetectionSource = 'text' | 'filename';

export interface DetectedField<T> {
  value: T;
  from: DetectionSource;
}

export interface DocumentDetection {
  /** Whether the document had readable text (a scanned photo has none until OCR). */
  textRead: boolean;
  type?: DetectedField<MedicalRecordType>;
  /** YYYY-MM-DD */
  recordDate?: DetectedField<string>;
  providerName?: DetectedField<string>;
}

type Rule = [RegExp, number];

/** Phrases that mark each kind of document, with how strongly they do. */
const TYPE_RULES: Record<MedicalRecordType, Rule[]> = {
  [MedicalRecordType.DISCHARGE]: [
    [/discharge summary/g, 6],
    [/date of discharge|discharge date|discharged on/g, 4],
    [/date of admission|admission date|admitted on/g, 3],
    [
      /course in (the )?hospital|hospital course|condition (at|on) discharge|discharge (advice|medications?)/g,
      3,
    ],
  ],
  [MedicalRecordType.PRESCRIPTION]: [
    [/\bprescription\b|℞/g, 3],
    [/\brx\b/g, 2],
    [
      /\b(tab|tabs|tablet|cap|caps|capsule|syp|syrup|inj|injection|oint|ointment)\b\.?/g,
      1,
    ],
    [/\b[0-2]\s?-\s?[0-2]\s?-\s?[0-2]\b/g, 2],
    [/\b(od|bd|bid|tds|tid|qid|hs|sos|stat)\b/g, 1],
    [/(after|before) (food|meals?)|empty stomach/g, 1],
    [/\bx\s?\d+\s?(days|weeks)\b|for \d+ (days|weeks)/g, 1],
  ],
  [MedicalRecordType.LAB_REPORT]: [
    [
      /biological ref|reference (range|interval|value)|ref\.? (range|interval)|normal range/g,
      4,
    ],
    [
      /\b(specimen|sample (type|collected|received)|collected on|collection date)\b/g,
      2,
    ],
    [
      /h(a)?emoglobin|\bcbc\b|complete blood count|lipid profile|hba1c|thyroid profile|\btsh\b|creatinine|bilirubin|glucose|urine (routine|analysis)|platelet|wbc|rbc/g,
      1,
    ],
    [
      /mg\/dl|g\/dl|mmol\/l|\biu\/l|\bu\/l|ng\/ml|µiu\/ml|uiu\/ml|cells\/cumm|\/hpf|10\^3\/µl|lakhs?\/cumm/g,
      1,
    ],
    [
      /\b(pathology|path ?labs?|laboratory|haematology|hematology|biochemistry)\b/g,
      1,
    ],
  ],
  [MedicalRecordType.SCAN]: [
    [
      /x-?ray|radiograph|ct scan|computed tomography|\bhrct\b|\bmri\b|magnetic resonance|ultrasound|ultrasonography|\busg\b|sonography|mammogra|doppler|echocardiogra|pet[- ]?ct/g,
      3,
    ],
    [/\bimpression\b/g, 2],
    [/radiolog/g, 2],
    [/\bfindings\b|\bcontrast\b|\bviews?\b/g, 1],
  ],
  [MedicalRecordType.VACCINATION]: [
    [
      /vaccin|immuni[sz]ation|booster dose|covishield|covaxin|\bdose (1|2|one|two)\b/g,
      3,
    ],
  ],
  [MedicalRecordType.INSURANCE]: [
    [
      /policy (no|number)|sum insured|\btpa\b|claim (no|number|form)|pre-?authori[sz]ation|cashless|insurance/g,
      3,
    ],
  ],
  [MedicalRecordType.CERTIFICATE]: [
    [
      /medical certificate|fitness certificate|certify that|fit to (resume|join|travel)|unfit|medical leave|sick leave/g,
      3,
    ],
  ],
};

// A folder is chosen only on clear evidence: one strong phrase or several weak ones.
const MIN_TYPE_SCORE = 3;
const MAX_HITS_PER_RULE = 4;

function detectTypeFromText(text: string): MedicalRecordType | undefined {
  const lower = text.toLowerCase();
  let best: { type: MedicalRecordType; score: number } | undefined;
  let second = 0;
  for (const [type, rules] of Object.entries(TYPE_RULES) as [
    MedicalRecordType,
    Rule[],
  ][]) {
    let score = 0;
    for (const [pattern, weight] of rules) {
      const hits = lower.match(pattern)?.length ?? 0;
      score += Math.min(hits, MAX_HITS_PER_RULE) * weight;
    }
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { type, score };
    } else if (score > second) {
      second = score;
    }
  }
  // A discharge summary lists medicines and lab values too; it wins on its own heading.
  if (!best || best.score < MIN_TYPE_SCORE || best.score === second)
    return undefined;
  return best.type;
}

/** The file-name hints the vault has always used for its folder guess. */
export const FILENAME_TYPE_PATTERNS: Array<[RegExp, MedicalRecordType]> = [
  [/discharge|summary/i, MedicalRecordType.DISCHARGE],
  [
    /\b(rx|prescription|medication|pharmacy)\b/i,
    MedicalRecordType.PRESCRIPTION,
  ],
  [/vaccin|immuni[sz]ation|booster/i, MedicalRecordType.VACCINATION],
  [/insurance|policy|claim|tpa/i, MedicalRecordType.INSURANCE],
  [/certificate|fitness|sick[-_ ]?leave/i, MedicalRecordType.CERTIFICATE],
  [
    /blood|cbc|lipid|glucose|hba1c|panel|h(a)?ematology|ecg|ekg/i,
    MedicalRecordType.LAB_REPORT,
  ],
  [
    /x-?ray|mri|ct[-_ ]?scan|ultrasound|echo|scan|imaging|radiology/i,
    MedicalRecordType.SCAN,
  ],
];

export function detectTypeFromFileName(
  fileName: string,
): MedicalRecordType | undefined {
  return FILENAME_TYPE_PATTERNS.find(([pattern]) =>
    pattern.test(fileName),
  )?.[1];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const MONTH_NAME =
  '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
// Indian documents write dates day first.
const DATE_PATTERNS: Array<
  [RegExp, (m: RegExpExecArray) => [number, number, number]]
> = [
  [/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, (m) => [+m[1], +m[2], +m[3]]],
  [/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g, (m) => [+m[3], +m[2], +m[1]]],
  [
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b(?![-/.]\d)/g,
    (m) => [2000 + +m[3], +m[2], +m[1]],
  ],
  [
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?[-\\s/.,]*${MONTH_NAME}[-\\s/.,]*(\\d{4}|\\d{2})\\b`,
      'gi',
    ),
    (m) => [year(m[3]), MONTHS[m[2].toLowerCase()], +m[1]],
  ],
  [
    new RegExp(
      `\\b${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      'gi',
    ),
    (m) => [+m[3], MONTHS[m[1].toLowerCase()], +m[2]],
  ],
];

function year(y: string): number {
  return y.length === 2 ? 2000 + +y : +y;
}

/** What a date next to these words is — the clinical date, or one to skip. */
const DATE_LABELS: Array<[RegExp, number]> = [
  [/(date of discharge|discharge date|discharged on)\W*$/i, 6],
  [/(report(ed)?( date| on)?|date of report|reporting date)\W*$/i, 5],
  [
    /(date of (scan|study|exam(ination)?|test)|(study|exam|scan|test) date)\W*$/i,
    5,
  ],
  [
    /(collected( on| date)?|collection date|sample (date|collected( on)?)|received( on)?|registered( on)?)\W*$/i,
    4,
  ],
  [
    /(date of (visit|consultation|issue)|visit date|issued on|date of vaccination)\W*$/i,
    4,
  ],
  [/\bdate\W*$/i, 2],
];
const NOT_CLINICAL =
  /(d\.?o\.?b\.?|date of birth|birth ?date|born( on)?|valid (till|upto|until)|expir\w*|next (dose|visit|review|due)|follow[- ]?up( on)?|due( on)?)\W*$/i;

function toIso(y: number, mo: number, d: number): string | undefined {
  if (!y || !mo || !d || mo > 12 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return undefined;
  return date.toISOString().slice(0, 10);
}

interface DateHit {
  iso: string;
  weight: number;
}

function datesIn(text: string, now: Date): DateHit[] {
  const latest = new Date(now.getTime() + 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const hits: DateHit[] = [];
  for (const [pattern, parts] of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const iso = toIso(...parts(m));
      if (!iso || iso > latest || iso < '1950-01-01') continue;
      // The words just before the date say what it is.
      const before = text.slice(Math.max(0, m.index - 32), m.index);
      if (NOT_CLINICAL.test(before)) continue;
      const label = DATE_LABELS.find(([l]) => l.test(before));
      hits.push({ iso, weight: label ? label[1] : 1 });
    }
  }
  return hits;
}

/** The labelled clinical date if there is one, else the latest date in the document. */
function detectDateFromText(text: string, now: Date): string | undefined {
  const hits = datesIn(text, now);
  if (!hits.length) return undefined;
  hits.sort((a, b) => b.weight - a.weight || b.iso.localeCompare(a.iso));
  return hits[0].iso;
}

function detectDateFromFileName(
  fileName: string,
  now: Date,
): string | undefined {
  const compact = /(?:^|\D)(20\d{2})(\d{2})(\d{2})(?:\D|$)/.exec(fileName);
  if (compact) {
    const iso = toIso(+compact[1], +compact[2], +compact[3]);
    if (iso && iso <= now.toISOString().slice(0, 10)) return iso;
  }
  return detectDateFromText(fileName.replace(/[_]/g, ' '), now);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Chains Indian patients upload most, matched anywhere in the document. */
const KNOWN_PROVIDERS: Array<[RegExp, string]> = [
  [/\bthyrocare\b/i, 'Thyrocare'],
  [/\bdr\.? ?lal ?path ?labs?\b/i, 'Dr Lal PathLabs'],
  [/\bmetropolis\b/i, 'Metropolis Healthcare'],
  [/\bsrl (diagnostics|limited|ltd)\b|\bagilus\b/i, 'Agilus (SRL) Diagnostics'],
  [/\borange health\b/i, 'Orange Health Labs'],
  [/\bredcliffe\b/i, 'Redcliffe Labs'],
  [/\bhealthians\b/i, 'Healthians'],
  [/\b(tata )?1mg labs\b/i, 'Tata 1mg Labs'],
  [/\bneuberg\b/i, 'Neuberg Diagnostics'],
  [/\bvijaya diagnostic\b/i, 'Vijaya Diagnostic Centre'],
  [/\bsuburban diagnostics\b/i, 'Suburban Diagnostics'],
  [/\bmahajan imaging\b/i, 'Mahajan Imaging'],
  [/\baarthi scans\b/i, 'Aarthi Scans & Labs'],
  [/\bapollo (hospitals?|diagnostics|clinic|health)\b/i, 'Apollo'],
  [/\bfortis\b/i, 'Fortis'],
  [/\bmanipal hospitals?\b/i, 'Manipal Hospitals'],
  [/\bnarayana (health|hrudayalaya)\b/i, 'Narayana Health'],
  [/\bmax (super speciality |healthcare|hospital)/i, 'Max Healthcare'],
  [/\bmedanta\b/i, 'Medanta'],
  [/\baster (cmi|rv|dm|hospitals?)\b/i, 'Aster'],
  [/\bkokilaben\b/i, 'Kokilaben Dhirubhai Ambani Hospital'],
  [/\b(aiims|all india institute of medical sciences)\b/i, 'AIIMS'],
];

const ORG_WORDS =
  /\b(hospitals?|diagnostics?|labs?|laborator(y|ies)|path ?labs?|pathology|clinic|polyclinic|nursing home|medical (centre|center|college)|health ?care|imaging|scans?( centre| center)?|institute)\b/i;
const NOT_ORG =
  /\b(patient|name\s*:|age\b|sex\b|gender|ref(erred)?\.? ?by|consultant|doctor|dr\.|sample|report|test|page \d|phone|mobile|email|no|id|number|department|dept|ward|bed|unit)\b/i;

function cleanOrgLine(line: string): string | undefined {
  // Cut the address, phone and registration details that share the header line.
  const name = line
    .split(
      /\s[|•·–—-]\s|,|\(|\b(ph|tel|phone|mob|cin|nabl|regd?|address|www)\b/i,
    )[0]
    .replace(/[^\p{L}\p{N}&.' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = name.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 8 || name.length > 64)
    return undefined;
  if (!ORG_WORDS.test(name) || NOT_ORG.test(name)) return undefined;
  // Headers are often in capitals; show them the way the rest of the app writes names.
  return name === name.toUpperCase()
    ? name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    : name;
}

function detectProviderFromText(text: string): string | undefined {
  for (const [pattern, name] of KNOWN_PROVIDERS)
    if (pattern.test(text)) return name;
  // Otherwise the letterhead: an organisation name near the top of the first page.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 15);
  for (const line of lines) {
    const name = cleanOrgLine(line);
    if (name) return name;
  }
  return undefined;
}

// ---------------------------------------------------------------------------

export function detectDocument(input: {
  text?: string;
  fileName: string;
  now?: Date;
}): DocumentDetection {
  const now = input.now ?? new Date();
  const text = (input.text ?? '').split(String.fromCharCode(0)).join('').trim();
  const textRead = text.replace(/\s/g, '').length >= 20;
  const result: DocumentDetection = { textRead };

  const typeFromText = textRead ? detectTypeFromText(text) : undefined;
  const typeFromName = detectTypeFromFileName(input.fileName);
  if (typeFromText) result.type = { value: typeFromText, from: 'text' };
  else if (typeFromName)
    result.type = { value: typeFromName, from: 'filename' };

  const dateFromText = textRead ? detectDateFromText(text, now) : undefined;
  const dateFromName = dateFromText
    ? undefined
    : detectDateFromFileName(input.fileName, now);
  if (dateFromText) result.recordDate = { value: dateFromText, from: 'text' };
  else if (dateFromName)
    result.recordDate = { value: dateFromName, from: 'filename' };

  const provider = textRead ? detectProviderFromText(text) : undefined;
  if (provider) result.providerName = { value: provider, from: 'text' };

  return result;
}
