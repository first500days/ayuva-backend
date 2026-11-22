import { BadRequestException } from '@nestjs/common';

export interface DiagnosisCode {
  // ICD-11 MMS code — the key the portal sends back.
  icd11: string;
  // SNOMED CT International concept id for the same condition.
  snomed: string;
  // ICD-11 title.
  display: string;
  // Words doctors type for it: abbreviations, lay terms, Indian usage.
  synonyms: string[];
}

/**
 * Coded diagnoses for clinical notes and e-prescriptions, so a diagnosis is a
 * standard code rather than free text. A starter set of common outpatient
 * conditions (ICD-11 MMS + SNOMED CT International); check additions against
 * the WHO ICD-11 browser and the NRCeS SNOMED CT browser before go-live.
 */
export const DIAGNOSIS_CODES: DiagnosisCode[] = [
  // Cardiovascular & metabolic
  {
    icd11: 'BA00',
    snomed: '59621000',
    display: 'Essential hypertension',
    synonyms: ['hypertension', 'high blood pressure', 'htn', 'bp'],
  },
  {
    icd11: 'BA40',
    snomed: '194828000',
    display: 'Angina pectoris',
    synonyms: ['angina', 'chest pain', 'ischaemic heart disease'],
  },
  {
    icd11: 'BA41',
    snomed: '57054005',
    display: 'Acute myocardial infarction',
    synonyms: ['heart attack', 'mi', 'stemi', 'nstemi'],
  },
  {
    icd11: 'BC81.3',
    snomed: '49436004',
    display: 'Atrial fibrillation',
    synonyms: ['af', 'afib', 'irregular heartbeat'],
  },
  {
    icd11: 'BD10',
    snomed: '42343007',
    display: 'Congestive heart failure',
    synonyms: ['heart failure', 'chf', 'ccf'],
  },
  {
    icd11: '8B11',
    snomed: '422504002',
    display: 'Cerebral ischaemic stroke',
    synonyms: ['stroke', 'cva', 'ischemic stroke'],
  },
  {
    icd11: '8B10',
    snomed: '266257000',
    display: 'Transient ischaemic attack',
    synonyms: ['tia', 'mini stroke'],
  },
  {
    icd11: '5A11',
    snomed: '44054006',
    display: 'Type 2 diabetes mellitus',
    synonyms: ['diabetes', 't2dm', 'dm2', 'dm', 'sugar', 'niddm'],
  },
  {
    icd11: '5A10',
    snomed: '46635009',
    display: 'Type 1 diabetes mellitus',
    synonyms: ['diabetes', 't1dm', 'dm1', 'iddm', 'juvenile diabetes'],
  },
  {
    icd11: '5A40',
    snomed: '714628002',
    display: 'Intermediate hyperglycaemia',
    synonyms: [
      'prediabetes',
      'impaired fasting glucose',
      'borderline diabetes',
    ],
  },
  {
    icd11: '5A00',
    snomed: '40930008',
    display: 'Hypothyroidism',
    synonyms: ['thyroid', 'underactive thyroid', 'low thyroid'],
  },
  {
    icd11: '5A02',
    snomed: '34486009',
    display: 'Thyrotoxicosis (hyperthyroidism)',
    synonyms: ['thyroid', 'hyperthyroidism', 'overactive thyroid', 'graves'],
  },
  {
    icd11: '5C80.0',
    snomed: '13644009',
    display: 'Hypercholesterolaemia',
    synonyms: [
      'cholesterol',
      'high cholesterol',
      'dyslipidaemia',
      'hyperlipidaemia',
      'lipids',
    ],
  },
  {
    icd11: '5B81',
    snomed: '414916001',
    display: 'Obesity',
    synonyms: ['overweight', 'high bmi'],
  },
  {
    icd11: '5B57',
    snomed: '34713006',
    display: 'Vitamin D deficiency',
    synonyms: ['vit d', 'low vitamin d'],
  },
  {
    icd11: '3A00',
    snomed: '87522002',
    display: 'Iron deficiency anaemia',
    synonyms: ['anemia', 'anaemia', 'low haemoglobin', 'ida'],
  },
  {
    icd11: 'GB61',
    snomed: '709044004',
    display: 'Chronic kidney disease',
    synonyms: ['ckd', 'kidney disease', 'renal failure'],
  },
  {
    icd11: 'FA25',
    snomed: '90560007',
    display: 'Gout',
    synonyms: ['uric acid', 'gouty arthritis'],
  },

  // Respiratory & ENT
  {
    icd11: 'CA00',
    snomed: '82272006',
    display: 'Acute nasopharyngitis',
    synonyms: ['common cold', 'cold', 'coryza', 'uri', 'urti'],
  },
  {
    icd11: 'CA01',
    snomed: '15805002',
    display: 'Acute sinusitis',
    synonyms: ['sinus', 'sinusitis'],
  },
  {
    icd11: 'CA02',
    snomed: '363746003',
    display: 'Acute pharyngitis',
    synonyms: ['sore throat', 'throat infection'],
  },
  {
    icd11: 'CA03',
    snomed: '17741008',
    display: 'Acute tonsillitis',
    synonyms: ['tonsils', 'tonsillitis'],
  },
  {
    icd11: 'CA08.0',
    snomed: '61582004',
    display: 'Allergic rhinitis',
    synonyms: ['hay fever', 'nasal allergy', 'sneezing'],
  },
  {
    icd11: 'CA42',
    snomed: '10509002',
    display: 'Acute bronchitis',
    synonyms: ['bronchitis', 'chest cold'],
  },
  {
    icd11: 'CA40',
    snomed: '233604007',
    display: 'Pneumonia',
    synonyms: ['lung infection', 'chest infection'],
  },
  {
    icd11: 'CA23',
    snomed: '195967001',
    display: 'Asthma',
    synonyms: ['wheeze', 'bronchial asthma'],
  },
  {
    icd11: 'CA22',
    snomed: '13645005',
    display: 'Chronic obstructive pulmonary disease',
    synonyms: ['copd', 'emphysema', 'chronic bronchitis'],
  },
  {
    icd11: 'AB00',
    snomed: '3110003',
    display: 'Acute otitis media',
    synonyms: ['ear infection', 'earache', 'aom'],
  },
  { icd11: 'MD12', snomed: '49727002', display: 'Cough', synonyms: ['cough'] },

  // Infections
  {
    icd11: 'MG26',
    snomed: '386661006',
    display: 'Fever of other or unknown origin',
    synonyms: ['fever', 'pyrexia', 'viral fever'],
  },
  {
    icd11: '1E32',
    snomed: '6142004',
    display: 'Influenza, virus not identified',
    synonyms: ['flu', 'influenza'],
  },
  {
    icd11: 'RA01.0',
    snomed: '840539006',
    display: 'COVID-19, virus identified',
    synonyms: ['covid', 'coronavirus', 'sars-cov-2'],
  },
  {
    icd11: '1D20',
    snomed: '38362002',
    display: 'Dengue without warning signs',
    synonyms: ['dengue', 'dengue fever'],
  },
  {
    icd11: '1A07',
    snomed: '4834000',
    display: 'Typhoid fever',
    synonyms: ['typhoid', 'enteric fever'],
  },
  {
    icd11: '1F40',
    snomed: '62676009',
    display: 'Malaria due to Plasmodium falciparum',
    synonyms: ['malaria', 'falciparum', 'pf malaria'],
  },
  {
    icd11: '1F41',
    snomed: '27052006',
    display: 'Malaria due to Plasmodium vivax',
    synonyms: ['malaria', 'vivax', 'pv malaria'],
  },
  {
    icd11: '1B10',
    snomed: '154283005',
    display: 'Tuberculosis of the respiratory system',
    synonyms: ['tb', 'pulmonary tuberculosis', 'koch'],
  },
  {
    icd11: '1A40',
    snomed: '25374005',
    display:
      'Infectious gastroenteritis or colitis without specification of infectious agent',
    synonyms: [
      'gastroenteritis',
      'loose motions',
      'diarrhoea',
      'diarrhea',
      'stomach flu',
    ],
  },
  {
    icd11: 'GC08',
    snomed: '68566005',
    display: 'Urinary tract infection, site not specified',
    synonyms: ['uti', 'urine infection', 'burning micturition'],
  },
  {
    icd11: '1E91',
    snomed: '4740000',
    display: 'Zoster',
    synonyms: ['shingles', 'herpes zoster'],
  },
  {
    icd11: '1E90',
    snomed: '38907003',
    display: 'Varicella',
    synonyms: ['chickenpox', 'chicken pox'],
  },
  {
    icd11: '1E51.0',
    snomed: '61977001',
    display: 'Chronic hepatitis B',
    synonyms: ['hepatitis b', 'hbv', 'hbsag'],
  },
  {
    icd11: '9A60',
    snomed: '9826008',
    display: 'Conjunctivitis',
    synonyms: ['pink eye', 'eye infection', 'red eye'],
  },

  // Digestive
  {
    icd11: 'DA22',
    snomed: '235595009',
    display: 'Gastro-oesophageal reflux disease',
    synonyms: ['gerd', 'gord', 'reflux', 'acidity', 'heartburn'],
  },
  {
    icd11: 'DA42',
    snomed: '4556007',
    display: 'Gastritis',
    synonyms: ['acidity', 'stomach inflammation'],
  },
  {
    icd11: 'DD90.3',
    snomed: '3696007',
    display: 'Functional dyspepsia',
    synonyms: ['dyspepsia', 'indigestion'],
  },
  {
    icd11: 'DD91.0',
    snomed: '10743008',
    display: 'Irritable bowel syndrome',
    synonyms: ['ibs'],
  },
  {
    icd11: 'ME05.0',
    snomed: '14760008',
    display: 'Constipation',
    synonyms: ['hard stools'],
  },
  {
    icd11: 'DB60',
    snomed: '70153002',
    display: 'Haemorrhoids',
    synonyms: ['piles', 'hemorrhoids'],
  },

  // Women's & men's health
  {
    icd11: '5A80.1',
    snomed: '237055002',
    display: 'Polycystic ovary syndrome',
    synonyms: ['pcos', 'pcod'],
  },
  {
    icd11: 'GA34.3',
    snomed: '266599000',
    display: 'Dysmenorrhoea',
    synonyms: ['period pain', 'painful periods', 'menstrual cramps'],
  },
  {
    icd11: 'GA90',
    snomed: '266569009',
    display: 'Hyperplasia of prostate',
    synonyms: ['bph', 'enlarged prostate', 'prostate'],
  },

  // Nervous system & mental health
  {
    icd11: '8A80',
    snomed: '37796009',
    display: 'Migraine',
    synonyms: ['headache'],
  },
  {
    icd11: '8A81',
    snomed: '398057008',
    display: 'Tension-type headache',
    synonyms: ['headache', 'tension headache'],
  },
  {
    icd11: '8A6Z',
    snomed: '84757009',
    display: 'Epilepsy or seizures, unspecified',
    synonyms: ['epilepsy', 'seizures', 'fits', 'convulsions'],
  },
  {
    icd11: '6A70',
    snomed: '36923009',
    display: 'Single episode depressive disorder',
    synonyms: ['depression', 'low mood'],
  },
  {
    icd11: '6B00',
    snomed: '21897009',
    display: 'Generalised anxiety disorder',
    synonyms: ['anxiety', 'gad', 'worry'],
  },
  {
    icd11: '7A00',
    snomed: '193462001',
    display: 'Chronic insomnia',
    synonyms: ['insomnia', 'sleeplessness', 'sleep problem'],
  },
  {
    icd11: '6A05',
    snomed: '406506008',
    display: 'Attention deficit hyperactivity disorder',
    synonyms: ['adhd', 'add'],
  },
  {
    icd11: '6A02',
    snomed: '35919005',
    display: 'Autism spectrum disorder',
    synonyms: ['autism', 'asd'],
  },
  {
    icd11: '6C40.2',
    snomed: '66590003',
    display: 'Alcohol dependence',
    synonyms: ['alcoholism', 'alcohol use disorder'],
  },
  {
    icd11: '6C4A.2',
    snomed: '56294008',
    display: 'Nicotine dependence',
    synonyms: ['smoking', 'smoker', 'tobacco dependence'],
  },

  // Musculoskeletal & skin
  {
    icd11: 'FA01',
    snomed: '239873007',
    display: 'Osteoarthritis of knee',
    synonyms: ['knee pain', 'knee arthritis', 'oa knee'],
  },
  {
    icd11: 'FA20',
    snomed: '69896004',
    display: 'Rheumatoid arthritis',
    synonyms: ['ra', 'rheumatoid'],
  },
  {
    icd11: 'ME84.2',
    snomed: '279039007',
    display: 'Low back pain',
    synonyms: ['back pain', 'lumbago', 'lbp'],
  },
  {
    icd11: 'EA80',
    snomed: '24079001',
    display: 'Atopic eczema',
    synonyms: ['eczema', 'atopic dermatitis'],
  },
  {
    icd11: 'ED80',
    snomed: '11381005',
    display: 'Acne',
    synonyms: ['pimples', 'acne vulgaris'],
  },
  {
    icd11: 'EA90',
    snomed: '9014002',
    display: 'Psoriasis',
    synonyms: ['psoriasis'],
  },
  {
    icd11: '1F28',
    snomed: '47382004',
    display: 'Dermatophytosis',
    synonyms: ['ringworm', 'tinea', 'fungal infection'],
  },
  {
    icd11: '1G04',
    snomed: '128869009',
    display: 'Scabies',
    synonyms: ['itch mite'],
  },
  {
    icd11: 'EB00',
    snomed: '126485001',
    display: 'Urticaria',
    synonyms: ['hives', 'allergy rash'],
  },
];

const BY_ICD11 = new Map(DIAGNOSIS_CODES.map((d) => [d.icd11, d]));

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Codes matching what the doctor typed: code prefixes first, then names, then synonyms. */
export function searchDiagnosisCodes(
  query: string,
  limit = 15,
): DiagnosisCode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const tokens = words(needle);
  const scored: { d: DiagnosisCode; score: number }[] = [];
  for (const d of DIAGNOSIS_CODES) {
    const icd = d.icd11.toLowerCase();
    let score = 0;
    if (icd === needle || d.snomed === needle) score = 100;
    else if (icd.startsWith(needle) || d.snomed.startsWith(needle)) score = 80;
    else if (tokens.length) {
      const nameWords = words(d.display);
      const allWords = [...nameWords, ...d.synonyms.flatMap(words)];
      // Every typed word must start a word of the name or a synonym.
      if (tokens.every((t) => allWords.some((w) => w.startsWith(t)))) {
        score = tokens.every((t) => nameWords.some((w) => w.startsWith(t)))
          ? 60
          : 40;
        if (d.display.toLowerCase().startsWith(needle)) score += 10;
      }
    }
    if (score) scored.push({ d, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.d.display.localeCompare(b.d.display),
  );
  return scored.slice(0, limit).map((s) => s.d);
}

/**
 * The coded diagnoses for ICD-11 codes chosen in the portal. Anything not in
 * the catalogue is refused, so a diagnosis can't slip in as free text.
 */
export function resolveDiagnosisCodes(
  codes: string[],
): Omit<DiagnosisCode, 'synonyms'>[] {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  return unique.map((code) => {
    const d = BY_ICD11.get(code);
    if (!d) {
      throw new BadRequestException(
        `Unknown diagnosis code ${code} — choose diagnoses from the ICD-11 / SNOMED CT search`,
      );
    }
    return { icd11: d.icd11, snomed: d.snomed, display: d.display };
  });
}
