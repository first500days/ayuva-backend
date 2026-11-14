/**
 * Reads a CV or credential's text for the Partner Portal profile: degrees and
 * fellowships, specialties, years of experience, the medical-council
 * registration number and languages. Fixed rules, no guessing beyond what the
 * document says; every value carries the line it came from, and the partner
 * reviews the pre-filled form before saving.
 */

export interface CvField<T> {
  value: T;
  from: string;
}

export interface CvExtraction {
  textRead: boolean;
  qualifications: CvField<string>[];
  specialty: CvField<string>[];
  experienceYears: CvField<number> | null;
  registrationNumber: CvField<string> | null;
  languages: CvField<string>[];
}

const QUALIFICATIONS: Array<[RegExp, string]> = [
  [/\bM\.?\s?B\.?\s?B\.?\s?S\b/i, 'MBBS'],
  // "MD" or "M.D.", not the start of MDS.
  [/\bM\.?D\b\.?(?!S)/, 'MD'],
  [/\bM\.?S\.?\b(?=[\s,(]*(ortho|general|ent|ophth|surg))/i, 'MS'],
  [/\bD\.?N\.?B\b/i, 'DNB'],
  [/\bD\.?M\.?\b(?=[\s,(]*(cardio|neuro|nephro|gastro|endo|onco))/i, 'DM'],
  [/\bM\.?\s?Ch\b/i, 'MCh'],
  [/\bB\.?D\.?S\b/i, 'BDS'],
  [/\bM\.?D\.?S\b/i, 'MDS'],
  [/\bB\.?A\.?M\.?S\b/i, 'BAMS'],
  [/\bB\.?H\.?M\.?S\b/i, 'BHMS'],
  [/\bB\.?P\.?T\b/i, 'BPT'],
  [/\bM\.?P\.?T\b/i, 'MPT'],
  [/\bF\.?R\.?C\.?S\b/i, 'FRCS'],
  [/\bM\.?R\.?C\.?P\b/i, 'MRCP'],
  [/\bM\.?R\.?C\.?O\.?G\b/i, 'MRCOG'],
  [/\bF\.?C\.?P\.?S\b/i, 'FCPS'],
  [/\bD\.?G\.?O\b/i, 'DGO'],
  [/\bD\.?C\.?H\b/i, 'DCH'],
  [/\bPh\.?\s?D\b/i, 'PhD'],
  [/\bB\.?\s?Sc\.?\s*\(?\s*Nursing\)?/i, 'BSc Nursing'],
  [/\bG\.?N\.?M\b/i, 'GNM'],
  [/\bD\.?M\.?L\.?T\b/i, 'DMLT'],
  [/\bB\.?M\.?L\.?T\b/i, 'BMLT'],
];

const SPECIALTIES: Array<[RegExp, string]> = [
  [/\bcardiolog(y|ist)\b/i, 'Cardiology'],
  [/\bdermatolog(y|ist)\b/i, 'Dermatology'],
  [/\b(ENT|otorhinolaryngolog(y|ist))\b/, 'ENT'],
  [/\bgastroenterolog(y|ist)\b/i, 'Gastroenterology'],
  [/\b(general|internal) medicine\b/i, 'General Medicine'],
  [/\bgeneral surge(ry|on)\b/i, 'General Surgery'],
  [/\b(gynaecolog|gynecolog|obstetric)/i, 'Obstetrics & Gynaecology'],
  [/\bnephrolog(y|ist)\b/i, 'Nephrology'],
  [/\bneurolog(y|ist)\b/i, 'Neurology'],
  [/\bneurosurge(ry|on)\b/i, 'Neurosurgery'],
  [/\boncolog(y|ist)\b/i, 'Oncology'],
  [/\bophthalmolog(y|ist)\b/i, 'Ophthalmology'],
  [/\borthop(a)?edic/i, 'Orthopaedics'],
  [/\bp(a)?ediatric/i, 'Paediatrics'],
  [/\bpsychiatr(y|ist)\b/i, 'Psychiatry'],
  [/\b(pulmonolog|respiratory medicine)/i, 'Pulmonology'],
  [/\bradiolog(y|ist)\b/i, 'Radiology'],
  [/\burolog(y|ist)\b/i, 'Urology'],
  [/\bendocrinolog(y|ist)\b/i, 'Endocrinology'],
  [/\ban(a)?esthesi/i, 'Anaesthesiology'],
  [/\bpatholog(y|ist)\b/i, 'Pathology'],
  [/\bphysiotherap(y|ist)\b/i, 'Physiotherapy'],
  [/\brheumatolog(y|ist)\b/i, 'Rheumatology'],
  [/\bemergency medicine\b/i, 'Emergency Medicine'],
  [/\bfamily (medicine|physician)\b/i, 'Family Medicine'],
];

const LANGUAGES = [
  'English',
  'Hindi',
  'Kannada',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
  'Urdu',
  'Odia',
];

const clip = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

export function parseCv(text: string, now = new Date()): CvExtraction {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const textRead = lines.join(' ').length > 30;
  const first = <T>(
    re: RegExp,
    pick: (m: RegExpExecArray, line: string) => T | null,
  ): CvField<T> | null => {
    for (const line of lines) {
      const m = re.exec(line);
      if (m) {
        const v = pick(m, line);
        if (v !== null) return { value: v, from: clip(line) };
      }
    }
    return null;
  };
  const all = (table: Array<[RegExp, string]>): CvField<string>[] => {
    const out = new Map<string, CvField<string>>();
    for (const [re, label] of table) {
      const line = lines.find((l) => re.test(l));
      if (line && !out.has(label))
        out.set(label, { value: label, from: clip(line) });
    }
    return [...out.values()];
  };

  // "12 years of experience" beats a career span read from dates.
  let experienceYears = first(
    /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b[^.]{0,20}?\b(?:experience|exp|practice)/i,
    (m) => {
      const n = Number(m[1]);
      return n > 0 && n <= 60 ? n : null;
    },
  );
  if (!experienceYears) {
    const year = now.getFullYear();
    let earliest: { y: number; line: string } | null = null;
    for (const line of lines) {
      for (const m of line.matchAll(
        /\b(19[6-9]\d|20[0-4]\d)\s*(?:-|–|to)\s*(?:present|current|now|date|(?:19|20)\d\d)\b/gi,
      )) {
        const y = Number(m[1]);
        if (y <= year && (!earliest || y < earliest.y)) earliest = { y, line };
      }
    }
    if (earliest && year - earliest.y > 0 && year - earliest.y <= 60)
      experienceYears = { value: year - earliest.y, from: clip(earliest.line) };
  }

  const registrationNumber = first(
    /\b(?:reg(?:istration)?\.?\s*(?:no|number|#)?\.?|NMC|MCI|[A-Z]MC|medical council)[^A-Za-z0-9]{0,8}((?:[A-Z]{1,5}[-/ ]?)?\d{3,8}(?:[-/]\d{2,4})?)/i,
    (m) => m[1].replace(/\s+/g, ''),
  );

  return {
    textRead,
    qualifications: all(QUALIFICATIONS),
    specialty: all(SPECIALTIES),
    experienceYears,
    registrationNumber,
    languages: LANGUAGES.filter((l) =>
      lines.some((line) => new RegExp(`\\b${l}\\b`, 'i').test(line)),
    ).map((l) => ({
      value: l,
      from: clip(
        lines.find((line) => new RegExp(`\\b${l}\\b`, 'i').test(line))!,
      ),
    })),
  };
}
