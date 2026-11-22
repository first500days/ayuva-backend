/**
 * AYUVA Scribe — mock structuring engine (AI_INTEGRATION_CONTRACT pattern:
 * deterministic placeholder logic behind a stable contract, `source: "mock"`,
 * until the AI team's model is dropped in).
 *
 * It only REORGANISES what the doctor typed or dictated: every output
 * fragment comes from the input text. It never adds a diagnosis, never
 * suggests a medicine and never fills a gap — the doctor reviews, edits and
 * signs the result.
 */

export interface ScribeSections {
  chiefComplaint: string;
  history: string;
  examination: string;
  assessment: string;
  plan: string;
  advice: string;
  followUp: string;
}

export interface ScribeVitals {
  bp?: string;
  pulse?: string;
  temperature?: string;
  spo2?: string;
  respiratoryRate?: string;
  weight?: string;
  height?: string;
}

export interface ParsedMedication {
  form?: string;
  medicine: string;
  strength?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  route?: string;
  instructions?: string;
  /** The line exactly as written, so the doctor can compare. */
  raw: string;
}

export interface ScribeResult {
  sections: ScribeSections;
  vitals: ScribeVitals;
  medications: ParsedMedication[];
  investigations: string[];
}

type SectionKey = keyof ScribeSections | 'rx';

const HEADERS: [RegExp, SectionKey][] = [
  [
    /^(?:cc|c\/o|chief\s+complaints?|presenting\s+complaints?|complaints?)$/i,
    'chiefComplaint',
  ],
  [
    /^(?:hpi|history(?:\s+of\s+present(?:ing)?\s+illness)?|h\/o|pmh|past\s+(?:medical\s+)?history|s|subjective)$/i,
    'history',
  ],
  [
    /^(?:o\/e|on\s+examination|exam(?:ination)?|vitals|findings|o|objective)$/i,
    'examination',
  ],
  [
    /^(?:imp(?:ression)?|assessment|dx|diagnosis|provisional\s+diagnosis|a)$/i,
    'assessment',
  ],
  [/^(?:plan|p|management|investigations?|ix)$/i, 'plan'],
  [/^(?:rx|medications?|medicines?|prescription|treatment)$/i, 'rx'],
  [/^(?:advice|adv|instructions?|counsell?ing)$/i, 'advice'],
  [/^(?:follow[\s-]?up|f\/u|review|next\s+visit)$/i, 'followUp'],
];

const FORM =
  /^(tab(?:let)?s?|cap(?:sule)?s?|syp|syr(?:up)?|susp(?:ension)?|inj(?:ection)?|oint(?:ment)?|cream|gel|drops?|e\/d|eye\s+drops?|ear\s+drops?|inh(?:aler)?|neb(?:ulisation|ulization)?|sachet|lotion|spray|powder|patch|supp(?:ository)?)\.?\s+/i;

const CLASSIFIERS: [RegExp, SectionKey][] = [
  [
    /\b(?:follow[\s-]?up|f\/u|review\s+(?:after|in|on)|revisit|come\s+back|next\s+visit)\b/i,
    'followUp',
  ],
  [
    /\b(?:c\/o|complain(?:s|ing|ed)?\s+of|presents?\s+with|came\s+with|reports?\s+(?:of\s+)?(?:pain|fever|cough))\b/i,
    'chiefComplaint',
  ],
  [
    /\b(?:impression|assessment|suggestive\s+of|likely|provisional(?:\s+diagnosis)?|diagnos(?:is|ed)|r\/o|rule\s+out|differentials?)\b/i,
    'assessment',
  ],
  [
    /\b(?:o\/e|on\s+examination|b\.?p\.?\s*[:-]?\s*\d+|pulse|spo2|sp02|temp(?:erature)?\s*[:-]?\s*\d+|chest\s+clear|cvs|rs\s*[:-]|p\/a|s1\s*s2|afebrile|tender(?:ness)?|conscious|oriented|auscultation|palpation)\b/i,
    'examination',
  ],
  [
    /\b(?:advised?\s+(?:rest|diet|to\s+avoid|plenty)|avoid|diet|plenty\s+of\s+(?:fluids|water)|hydrat|steam\s+inhalation|salt\s+water\s+gargles|exercise|walk(?:ing)?\s+daily|bed\s+rest)\b/i,
    'advice',
  ],
  [
    /\b(?:plan|start(?:ed)?|continue|stop|discontinue|taper|refer(?:red)?|admit|investigat\w*|ix\b|get\s+.+\s+done|cbc|lft|kft|rft|hba1c|tsh|lipid|x-?ray|usg|ultrasound|ecg|echo|mri|ct\s+scan|urine\s+r\/?e?)\b/i,
    'plan',
  ],
  [
    /\b(?:since|for\s+(?:the\s+)?(?:past|last)|x\s*\d+\s*(?:days?|weeks?|months?)|history\s+of|h\/o|k\/c\/o|known\s+case|diabetic|hypertensive|allerg\w*|smoker|alcohol|surgery)\b/i,
    'history',
  ],
];

const ABBREVIATIONS =
  /(?:^|\s)(?:tab|cap|syp|inj|oint|dr|mr|mrs|ms|no|vs|approx|e\.g|i\.e|etc|wt|ht|temp|b\.p|b\.d|t\.d\.s|o\.d|h\.s|s\.o\.s|q\.i\.d)$/i;

const INVESTIGATIONS: [RegExp, string][] = [
  [/\bcbc\b|complete\s+blood\s+count|haemogram|hemogram/i, 'CBC'],
  [/\blft\b|liver\s+function/i, 'LFT'],
  [/\b(?:kft|rft)\b|kidney\s+function|renal\s+function/i, 'KFT'],
  [/lipid\s+profile|\blipids?\b/i, 'Lipid profile'],
  [/\bhba1c\b/i, 'HbA1c'],
  [/\bfbs\b|fasting\s+(?:blood\s+)?(?:sugar|glucose)/i, 'Fasting blood sugar'],
  [/\bppbs\b|post[\s-]?prandial/i, 'Post-prandial blood sugar'],
  [/\btsh\b|thyroid\s+profile|\bt3\b|\bt4\b/i, 'Thyroid profile'],
  [/urine\s+(?:r\/?e|routine|analysis)|\burinalysis\b/i, 'Urine routine'],
  [/\bcrp\b|c[\s-]?reactive/i, 'CRP'],
  [/\besr\b/i, 'ESR'],
  [/vit(?:amin)?\.?\s*d\b/i, 'Vitamin D'],
  [/vit(?:amin)?\.?\s*b12\b/i, 'Vitamin B12'],
  [/dengue|\bns1\b/i, 'Dengue NS1'],
  [/x-?ray\s+(?:of\s+)?chest|\bcxr\b|chest\s+x-?ray/i, 'X-ray chest'],
  [/\bx-?ray\b/i, 'X-ray'],
  [/\b(?:usg|ultrasound)\b/i, 'Ultrasound'],
  [/\becg\b|\bekg\b/i, 'ECG'],
  [/\becho\b|2d\s*echo/i, '2D Echo'],
  [/\bmri\b/i, 'MRI'],
  [/\bct\b(?:\s+scan)?/i, 'CT scan'],
];

const FREQUENCY =
  /\b(\d(?:\/\d)?\s*-\s*\d(?:\/\d)?\s*-\s*\d(?:\/\d)?(?:\s*-\s*\d)?|o\.?d\.?|b\.?d\.?|b\.?i\.?d\.?|t\.?d\.?s\.?|t\.?i\.?d\.?|q\.?i\.?d\.?|q\.?d\.?s\.?|h\.?s\.?|s\.?o\.?s\.?|stat|prn|q\d+h|once\s+(?:a\s+)?daily|twice\s+(?:a\s+)?daily|thrice\s+(?:a\s+)?daily|once\s+a\s+day|twice\s+a\s+day|three\s+times\s+a\s+day|four\s+times\s+a\s+day|at\s+night|at\s+bedtime|every\s+\d+\s+hours?|weekly|once\s+a\s+week)\b/i;
const STRENGTH =
  /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|gm|ml|iu|units?|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|ml|g))?)(?![a-z])/i;
const DURATION =
  /(?:\bx\s*|×\s*|\bfor\s+)?\b(\d+)\s*(days?|d|weeks?|wks?|w|months?|mths?)\b|\b(?:x|for)\s+(\d+)\s*$/i;
const DOSE =
  /\b(\d+(?:\.\d+)?|half|one|two|½)\s*(tabs?|tablets?|caps?|capsules?|ml|puffs?|drops?|units?|sachets?)\b/i;
const INSTRUCTION =
  /\b((?:before|after|with)\s+(?:food|meals?|breakfast|lunch|dinner)|empty\s+stomach|at\s+bedtime|at\s+night|in\s+the\s+morning|apply\s+locally|local\s+application|if\s+(?:needed|required)|for\s+(?:pain|fever))\b/i;
const ROUTE =
  /\b(oral(?:ly)?|p\.?o\.?|i\.?v\.?|i\.?m\.?|s\.?c\.?|topical(?:ly)?|sublingual|inhaled|per\s+rectal)\b/i;

/** Splits dictated/typed text into fragments: lines, then sentences (abbreviation-aware). */
export function splitFragments(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    let start = 0;
    const re = /([.!?;])\s+(?=[A-Z(])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const before = line.slice(start, m.index);
      if (m[1] === '.' && ABBREVIATIONS.test(before)) continue;
      out.push(line.slice(start, m.index + (m[1] === ';' ? 0 : 1)).trim());
      start = m.index + m[0].length;
    }
    out.push(line.slice(start).trim());
  }
  return out.filter(Boolean);
}

function headerOf(
  fragment: string,
): { section: SectionKey; rest: string } | null {
  // "Label: text", or "Label - text" with a spaced dash (so "Follow-up" stays one word).
  const m =
    fragment.match(/^([A-Za-z][A-Za-z/ .-]{0,40}?)\s*:\s*(.*)$/) ??
    fragment.match(/^([A-Za-z][A-Za-z/ .-]{0,40}?)\s+[-–]\s+(.*)$/);
  if (!m) {
    // A bare heading on its own line, e.g. "Plan" or "Rx".
    const bare = HEADERS.find(([re]) =>
      re.test(fragment.replace(/[:.]$/, '').trim()),
    );
    return bare ? { section: bare[1], rest: '' } : null;
  }
  const label = m[1].replace(/\.$/, '').trim();
  const hit = HEADERS.find(([re]) => re.test(label));
  return hit ? { section: hit[1], rest: m[2].trim() } : null;
}

function classify(fragment: string): SectionKey | null {
  if (FORM.test(fragment)) return 'rx';
  for (const [re, key] of CLASSIFIERS) if (re.test(fragment)) return key;
  return null;
}

/**
 * Parses one prescription line exactly as written — nothing is inferred or
 * completed. With `requireForm` false (lines inside an explicit "Rx:" block)
 * a dosage form prefix such as "Tab" is optional.
 */
export function parseMedication(
  line: string,
  requireForm = true,
): ParsedMedication | null {
  const raw = line.trim().replace(/[.;,]$/, '');
  const formMatch = raw.match(FORM);
  if (!formMatch && requireForm) return null;
  let rest = formMatch ? raw.slice(formMatch[0].length) : raw;
  const take = (re: RegExp): string | undefined => {
    const m = rest.match(re);
    if (!m) return undefined;
    rest = (
      rest.slice(0, m.index) +
      ' ' +
      rest.slice(m.index! + m[0].length)
    ).replace(/\s+/g, ' ');
    return m[0].trim();
  };
  const instructions = take(INSTRUCTION);
  const durationMatch = rest.match(DURATION);
  let duration: string | undefined;
  if (durationMatch) {
    duration = durationMatch[1]
      ? `${durationMatch[1]} ${normaliseUnit(durationMatch[2], Number(durationMatch[1]))}`
      : `${durationMatch[3]} days`;
    rest = (
      rest.slice(0, durationMatch.index) +
      ' ' +
      rest.slice(durationMatch.index! + durationMatch[0].length)
    ).replace(/\s+/g, ' ');
  }
  const frequency = take(FREQUENCY);
  const strength = take(STRENGTH);
  const dose = take(DOSE);
  const route = take(ROUTE);
  const medicine = rest
    .replace(/[()]/g, ' ')
    .replace(/\b(?:x|for)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '');
  if (!medicine) return null;
  return {
    ...(formMatch && { form: formLabel(formMatch[1]) }),
    medicine,
    ...(strength && { strength: strength.replace(/\s+/g, ' ') }),
    ...(dose && { dose }),
    // "1 - 0 - 1" → "1-0-1"; word frequencies ("twice daily") keep their spaces.
    ...(frequency && {
      frequency: /^\d/.test(frequency)
        ? frequency.replace(/\s+/g, '')
        : frequency.toLowerCase(),
    }),
    ...(duration && { duration }),
    ...(route && { route }),
    ...(instructions && { instructions }),
    raw,
  };
}

function normaliseUnit(unit: string, count: number): string {
  const u = unit.toLowerCase();
  const base = u.startsWith('d') ? 'day' : u.startsWith('w') ? 'week' : 'month';
  return count === 1 ? base : `${base}s`;
}

function formLabel(form: string): string {
  const f = form.toLowerCase();
  if (f.startsWith('tab')) return 'Tablet';
  if (f.startsWith('cap')) return 'Capsule';
  if (f.startsWith('sy')) return 'Syrup';
  if (f.startsWith('susp')) return 'Suspension';
  if (f.startsWith('inj')) return 'Injection';
  if (f.startsWith('oint')) return 'Ointment';
  if (f.startsWith('inh')) return 'Inhaler';
  if (f.startsWith('neb')) return 'Nebulisation';
  if (f.includes('drop') || f === 'e/d') return 'Drops';
  if (f.startsWith('supp')) return 'Suppository';
  return form.charAt(0).toUpperCase() + form.slice(1).toLowerCase();
}

export function extractVitals(text: string): ScribeVitals {
  const v: ScribeVitals = {};
  const bp = text.match(
    /\b(?:b\.?p\.?|blood\s+pressure)\s*[:-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i,
  );
  if (bp) v.bp = `${bp[1]}/${bp[2]} mmHg`;
  const pulse = text.match(
    /\b(?:pulse|p\.?r\.?|h\.?r\.?|heart\s+rate)\s*[:-]?\s*(\d{2,3})\b/i,
  );
  if (pulse) v.pulse = `${pulse[1]} /min`;
  const temp = text.match(
    /\b(?:temp(?:erature)?)\s*[:-]?\s*(\d{2,3}(?:\.\d)?)\s*°?\s*([fc])?\b/i,
  );
  if (temp)
    v.temperature = `${temp[1]}${temp[2] ? ` °${temp[2].toUpperCase()}` : Number(temp[1]) > 50 ? ' °F' : ' °C'}`;
  const spo2 = text.match(
    /\b(?:spo2|sp02|o2\s+sat(?:uration)?|saturation)\s*[:-]?\s*(\d{2,3})\s*%?/i,
  );
  if (spo2) v.spo2 = `${spo2[1]}%`;
  const rr = text.match(
    /\b(?:r\.?r\.?|resp(?:iratory)?\s+rate)\s*[:-]?\s*(\d{1,2})\b/i,
  );
  if (rr) v.respiratoryRate = `${rr[1]} /min`;
  const wt = text.match(
    /\b(?:wt|weight)\.?\s*[:-]?\s*(\d{1,3}(?:\.\d)?)\s*(?:kg|kgs)?\b/i,
  );
  if (wt) v.weight = `${wt[1]} kg`;
  const ht = text.match(
    /\b(?:ht|height)\.?\s*[:-]?\s*(\d{2,3}(?:\.\d)?)\s*(?:cm)?\b/i,
  );
  if (ht) v.height = `${ht[1]} cm`;
  return v;
}

export function extractInvestigations(text: string): string[] {
  const found: string[] = [];
  for (const [re, name] of INVESTIGATIONS) {
    if (re.test(text) && !found.includes(name)) {
      // "X-ray chest" already covers a bare "X-ray".
      if (name === 'X-ray' && found.includes('X-ray chest')) continue;
      found.push(name);
    }
  }
  return found;
}

export function structureConsultation(text: string): ScribeResult {
  const buckets: Record<SectionKey, string[]> = {
    chiefComplaint: [],
    history: [],
    examination: [],
    assessment: [],
    plan: [],
    advice: [],
    followUp: [],
    rx: [],
  };
  let current: SectionKey | null = null;
  const fragments = splitFragments(text);

  fragments.forEach((fragment, index) => {
    const header = headerOf(fragment);
    if (header) {
      current = header.section;
      if (header.rest) {
        // A heading's own text still counts as a medicine line when it is one ("Rx: Tab ...").
        const target: SectionKey = FORM.test(header.rest)
          ? 'rx'
          : header.section;
        buckets[target].push(header.rest);
      }
      return;
    }
    const detected = classify(fragment);
    // Inside an explicit Rx block, dosage-looking lines are medicines even without "Tab"/"Cap".
    if (
      current === 'rx' &&
      detected !== 'followUp' &&
      detected !== 'advice' &&
      (FORM.test(fragment) ||
        STRENGTH.test(fragment) ||
        FREQUENCY.test(fragment))
    ) {
      buckets.rx.push(fragment);
      return;
    }
    let target: SectionKey =
      detected ?? current ?? (index === 0 ? 'chiefComplaint' : 'history');
    // The opening line of a note is the presenting complaint unless it is clearly something else.
    if (
      index === 0 &&
      current === null &&
      (detected === null || detected === 'history')
    ) {
      target = 'chiefComplaint';
    }
    buckets[target].push(fragment);
    // Unlabelled lines that follow stay with the most recent section.
    if (detected && detected !== 'rx') current = detected;
  });

  const medications = buckets.rx
    .flatMap((line) =>
      line.split(
        /\s*[;,]\s*(?=(?:tab|cap|syp|syr|inj|oint|cream|gel|drops?|inh|neb|sachet|lotion|spray)\b)/i,
      ),
    )
    .map((line) => parseMedication(line, false))
    .filter((m): m is ParsedMedication => !!m);

  const join = (k: keyof ScribeSections) => buckets[k].join('\n');
  return {
    sections: {
      chiefComplaint: join('chiefComplaint'),
      history: join('history'),
      examination: join('examination'),
      assessment: join('assessment'),
      plan: join('plan'),
      advice: join('advice'),
      followUp: join('followUp'),
    },
    vitals: extractVitals(text),
    medications,
    investigations: extractInvestigations(
      [buckets.plan.join(' '), buckets.assessment.join(' ')].join(' '),
    ),
  };
}
