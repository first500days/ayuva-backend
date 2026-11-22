import { DIAGNOSIS_CODES } from '../clinical/diagnosis-codes';

/**
 * The rule-based drafter behind insurance pre-authorisation: it reads the
 * referral and the clinicians' notes, finds the conditions (ICD-11 / SNOMED CT
 * from the portal's diagnosis catalogue) and procedures they name, and says
 * which words it matched where. It never decides anything: the draft stays
 * provisional until a person on the hospital's insurance desk reviews it,
 * fixes it and approves it for sending.
 */

export interface TextSource {
  /** Where the words came from, shown next to each match. */
  label: string;
  text: string;
}

export interface DraftDiagnosis {
  icd11: string;
  snomed: string;
  display: string;
  /** "chest pain" in Referral reason */
  evidence: string;
}

export interface DraftProcedure {
  name: string;
  /** Typical inpatient stay in days; 0 for day care. */
  stayDays: number;
  evidence: string;
}

export interface PriorAuthDraft {
  diagnoses: DraftDiagnosis[];
  procedures: DraftProcedure[];
  /** The longest typical stay of the procedures found, or 1 for an admission without one. */
  suggestedStayDays: number | null;
  /** What the desk still has to supply before it can go. */
  missing: string[];
}

/**
 * Common planned procedures behind Indian cashless pre-authorisations. Package
 * codes differ by insurer and scheme, so the desk fills those in; stays are
 * typical figures to start from, not limits.
 */
export const PROCEDURES: {
  name: string;
  keywords: string[];
  stayDays: number;
}[] = [
  {
    name: 'Coronary angiography',
    keywords: ['angiography', 'angiogram', 'cag'],
    stayDays: 1,
  },
  {
    name: 'Coronary angioplasty (PTCA) with stent',
    keywords: ['angioplasty', 'ptca', 'stent', 'pci'],
    stayDays: 3,
  },
  {
    name: 'Coronary artery bypass grafting (CABG)',
    keywords: ['cabg', 'bypass surgery', 'bypass grafting'],
    stayDays: 7,
  },
  {
    name: 'Total knee replacement',
    keywords: ['knee replacement', 'tkr', 'knee arthroplasty'],
    stayDays: 5,
  },
  {
    name: 'Total hip replacement',
    keywords: ['hip replacement', 'thr', 'hip arthroplasty'],
    stayDays: 5,
  },
  {
    name: 'Cataract surgery (phacoemulsification)',
    keywords: ['cataract', 'phaco', 'iol implant'],
    stayDays: 0,
  },
  {
    name: 'Appendicectomy',
    keywords: ['appendicectomy', 'appendectomy'],
    stayDays: 2,
  },
  {
    name: 'Laparoscopic cholecystectomy',
    keywords: [
      'cholecystectomy',
      'gall bladder removal',
      'gallbladder removal',
    ],
    stayDays: 2,
  },
  {
    name: 'Hernia repair',
    keywords: ['hernia repair', 'hernioplasty', 'herniorrhaphy'],
    stayDays: 2,
  },
  {
    name: 'Caesarean section',
    keywords: ['caesarean', 'cesarean', 'lscs', 'c-section'],
    stayDays: 4,
  },
  {
    name: 'Normal delivery',
    keywords: ['normal delivery', 'vaginal delivery'],
    stayDays: 2,
  },
  { name: 'Hysterectomy', keywords: ['hysterectomy'], stayDays: 3 },
  {
    name: 'Haemodialysis',
    keywords: ['dialysis', 'haemodialysis', 'hemodialysis'],
    stayDays: 0,
  },
  {
    name: 'Chemotherapy cycle',
    keywords: ['chemotherapy', 'chemo'],
    stayDays: 0,
  },
  {
    name: 'Radiotherapy',
    keywords: ['radiotherapy', 'radiation therapy'],
    stayDays: 0,
  },
  {
    name: 'Upper GI endoscopy',
    keywords: ['endoscopy', 'ogd', 'upper gi scopy'],
    stayDays: 0,
  },
  { name: 'Colonoscopy', keywords: ['colonoscopy'], stayDays: 0 },
  {
    name: 'Transurethral resection of prostate (TURP)',
    keywords: ['turp', 'prostate resection'],
    stayDays: 3,
  },
  {
    name: 'Lithotripsy / ureteroscopy for stones',
    keywords: ['lithotripsy', 'urs', 'ureteroscopy', 'pcnl'],
    stayDays: 2,
  },
  { name: 'Tonsillectomy', keywords: ['tonsillectomy'], stayDays: 1 },
  {
    name: 'Spine surgery (discectomy / fusion)',
    keywords: ['discectomy', 'laminectomy', 'spinal fusion', 'spine surgery'],
    stayDays: 5,
  },
  { name: 'MRI scan', keywords: ['mri'], stayDays: 0 },
  { name: 'CT scan', keywords: ['ct scan', 'cect', 'ncct'], stayDays: 0 },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole words only, so "bp" doesn't match inside "bpm" and "af" not in "after". */
const phrase = (p: string) =>
  new RegExp(`(^|[^a-z0-9])${escape(p.toLowerCase())}(?=$|[^a-z0-9])`);

/** Two- and three-letter abbreviations match too eagerly in prose; they only count in upper case. */
function found(term: string, lower: string, original: string): boolean {
  if (term.length <= 3 && /^[a-z]+$/.test(term))
    return new RegExp(
      `(^|[^A-Za-z0-9])${escape(term.toUpperCase())}(?=$|[^A-Za-z0-9])`,
    ).test(original);
  return phrase(term).test(lower);
}

/**
 * ICD-11 / SNOMED CT codes the text itself names (a condition or one of its
 * synonyms, whole words only), each with the words matched and where. Used by
 * the pre-auth drafter and the consultation note's coding assistant; the
 * clinician accepts or rejects every suggestion.
 */
export function suggestDiagnosisCodes(sources: TextSource[]): DraftDiagnosis[] {
  const out = new Map<string, DraftDiagnosis>();
  for (const s of sources) {
    const original = s.text ?? '';
    const lower = original.toLowerCase();
    if (!lower.trim()) continue;
    for (const d of DIAGNOSIS_CODES) {
      if (out.has(d.icd11)) continue;
      const term = [d.display, ...d.synonyms].find((t) =>
        found(t.toLowerCase(), lower, original),
      );
      if (term)
        out.set(d.icd11, {
          icd11: d.icd11,
          snomed: d.snomed,
          display: d.display,
          evidence: `"${term}" in ${s.label}`,
        });
    }
  }
  return [...out.values()];
}

export function draftPriorAuth(
  sources: TextSource[],
  context: {
    admission: boolean;
    payer?: string | null;
    policyNumber?: string | null;
    estimatedAmount?: number | null;
  },
): PriorAuthDraft {
  const diagnoses = new Map(
    suggestDiagnosisCodes(sources).map((d) => [d.icd11, d]),
  );
  const procedures = new Map<string, DraftProcedure>();
  for (const s of sources) {
    const original = s.text ?? '';
    const lower = original.toLowerCase();
    if (!lower.trim()) continue;
    for (const p of PROCEDURES) {
      if (procedures.has(p.name)) continue;
      const term = p.keywords.find((k) => found(k, lower, original));
      if (term)
        procedures.set(p.name, {
          name: p.name,
          stayDays: p.stayDays,
          evidence: `"${term}" in ${s.label}`,
        });
    }
  }
  const procs = [...procedures.values()];
  const suggestedStayDays = procs.length
    ? Math.max(...procs.map((p) => p.stayDays))
    : context.admission
      ? 1
      : null;
  const missing: string[] = [];
  if (!diagnoses.size)
    missing.push('A coded diagnosis (none was found in the notes)');
  if (!context.payer) missing.push('Insurer / TPA');
  if (!context.policyNumber) missing.push('Policy or member ID');
  if (!context.estimatedAmount) missing.push('Estimated cost');
  return {
    diagnoses: [...diagnoses.values()],
    procedures: procs,
    suggestedStayDays,
    missing,
  };
}
