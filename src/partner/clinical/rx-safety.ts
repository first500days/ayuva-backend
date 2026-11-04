/**
 * Prescription safety checks — deterministic rules, no AI. Medicine names
 * (common Indian brands and generics) resolve to ingredients and drug
 * classes; the prescription is checked against the patient's allergies,
 * against itself and against active medicines for a curated list of
 * well-established, clinically serious interactions and duplicate
 * therapy. It is not exhaustive, says so, and never suggests a medicine.
 */

export type Severity = 'contraindicated' | 'major' | 'moderate';

export interface SafetyWarning {
  severity: Severity;
  kind: 'allergy' | 'interaction' | 'duplicate';
  /** Prescription lines involved (0-based). */
  lines: number[];
  /** What it clashes with: an allergy, another line or an active medicine. */
  with: string;
  message: string;
}

/** Ingredient → drug classes. */
const INGREDIENTS: Record<string, string[]> = {
  // Antibiotics
  amoxicillin: ['penicillin', 'beta_lactam'],
  ampicillin: ['penicillin', 'beta_lactam'],
  cloxacillin: ['penicillin', 'beta_lactam'],
  'benzathine penicillin': ['penicillin', 'beta_lactam'],
  'penicillin v': ['penicillin', 'beta_lactam'],
  piperacillin: ['penicillin', 'beta_lactam'],
  'clavulanic acid': [],
  cefalexin: ['cephalosporin', 'beta_lactam'],
  cephalexin: ['cephalosporin', 'beta_lactam'],
  cefadroxil: ['cephalosporin', 'beta_lactam'],
  cefuroxime: ['cephalosporin', 'beta_lactam'],
  cefixime: ['cephalosporin', 'beta_lactam'],
  cefpodoxime: ['cephalosporin', 'beta_lactam'],
  ceftriaxone: ['cephalosporin', 'beta_lactam'],
  cefotaxime: ['cephalosporin', 'beta_lactam'],
  cefoperazone: ['cephalosporin', 'beta_lactam'],
  meropenem: ['carbapenem', 'beta_lactam'],
  imipenem: ['carbapenem', 'beta_lactam'],
  azithromycin: ['macrolide', 'qt'],
  clarithromycin: ['macrolide', 'cyp3a4_inhibitor', 'qt'],
  erythromycin: ['macrolide', 'cyp3a4_inhibitor', 'qt'],
  roxithromycin: ['macrolide'],
  ciprofloxacin: ['fluoroquinolone', 'qt', 'cyp1a2_inhibitor'],
  levofloxacin: ['fluoroquinolone', 'qt'],
  ofloxacin: ['fluoroquinolone', 'qt'],
  norfloxacin: ['fluoroquinolone'],
  moxifloxacin: ['fluoroquinolone', 'qt'],
  sulfamethoxazole: ['sulfonamide', 'inr_raising'],
  trimethoprim: ['trimethoprim'],
  doxycycline: ['tetracycline'],
  metronidazole: ['nitroimidazole', 'inr_raising'],
  tinidazole: ['nitroimidazole'],
  nitrofurantoin: [],
  linezolid: ['serotonergic_maoi'],
  fluconazole: ['azole', 'inr_raising', 'qt'],
  ketoconazole: ['azole', 'cyp3a4_inhibitor'],
  itraconazole: ['azole', 'cyp3a4_inhibitor'],
  // Analgesics / anti-inflammatories
  paracetamol: ['paracetamol'],
  ibuprofen: ['nsaid'],
  diclofenac: ['nsaid'],
  aceclofenac: ['nsaid'],
  naproxen: ['nsaid'],
  'mefenamic acid': ['nsaid'],
  ketorolac: ['nsaid'],
  etoricoxib: ['nsaid'],
  celecoxib: ['nsaid'],
  piroxicam: ['nsaid'],
  nimesulide: ['nsaid'],
  indomethacin: ['nsaid'],
  aspirin: ['nsaid', 'antiplatelet', 'salicylate'],
  tramadol: ['opioid', 'serotonergic'],
  tapentadol: ['opioid'],
  codeine: ['opioid'],
  morphine: ['opioid'],
  fentanyl: ['opioid'],
  // Cardiovascular
  clopidogrel: ['antiplatelet'],
  prasugrel: ['antiplatelet'],
  ticagrelor: ['antiplatelet'],
  warfarin: ['anticoagulant', 'vka'],
  acenocoumarol: ['anticoagulant', 'vka'],
  apixaban: ['anticoagulant'],
  rivaroxaban: ['anticoagulant'],
  dabigatran: ['anticoagulant'],
  enoxaparin: ['anticoagulant'],
  heparin: ['anticoagulant'],
  atorvastatin: ['statin'],
  rosuvastatin: ['statin'],
  simvastatin: ['statin', 'cyp3a4_statin'],
  lovastatin: ['statin', 'cyp3a4_statin'],
  amlodipine: ['ccb_dhp'],
  nifedipine: ['ccb_dhp'],
  cilnidipine: ['ccb_dhp'],
  verapamil: ['ccb_nondhp'],
  diltiazem: ['ccb_nondhp'],
  metoprolol: ['beta_blocker'],
  atenolol: ['beta_blocker'],
  propranolol: ['beta_blocker'],
  bisoprolol: ['beta_blocker'],
  carvedilol: ['beta_blocker'],
  nebivolol: ['beta_blocker'],
  enalapril: ['acei'],
  ramipril: ['acei'],
  lisinopril: ['acei'],
  perindopril: ['acei'],
  captopril: ['acei'],
  telmisartan: ['arb'],
  losartan: ['arb'],
  olmesartan: ['arb'],
  valsartan: ['arb'],
  irbesartan: ['arb'],
  spironolactone: ['k_sparing'],
  eplerenone: ['k_sparing'],
  amiloride: ['k_sparing'],
  'potassium chloride': ['potassium'],
  hydrochlorothiazide: ['thiazide'],
  chlorthalidone: ['thiazide'],
  indapamide: ['thiazide'],
  furosemide: ['loop_diuretic'],
  torsemide: ['loop_diuretic'],
  digoxin: ['digoxin'],
  amiodarone: ['amiodarone', 'qt'],
  'isosorbide mononitrate': ['nitrate'],
  'isosorbide dinitrate': ['nitrate'],
  nitroglycerin: ['nitrate'],
  sildenafil: ['pde5'],
  tadalafil: ['pde5'],
  // Diabetes
  metformin: ['metformin'],
  glimepiride: ['sulfonylurea'],
  gliclazide: ['sulfonylurea'],
  glibenclamide: ['sulfonylurea'],
  glipizide: ['sulfonylurea'],
  sitagliptin: ['dpp4'],
  vildagliptin: ['dpp4'],
  teneligliptin: ['dpp4'],
  insulin: ['insulin'],
  // Gastro
  omeprazole: ['ppi', 'cyp2c19_inhibitor'],
  esomeprazole: ['ppi', 'cyp2c19_inhibitor'],
  pantoprazole: ['ppi'],
  rabeprazole: ['ppi'],
  lansoprazole: ['ppi'],
  ranitidine: ['h2'],
  famotidine: ['h2'],
  ondansetron: ['qt'],
  domperidone: ['qt'],
  // CNS
  sertraline: ['ssri', 'serotonergic'],
  fluoxetine: ['ssri', 'serotonergic'],
  paroxetine: ['ssri', 'serotonergic'],
  escitalopram: ['ssri', 'serotonergic', 'qt'],
  citalopram: ['ssri', 'serotonergic', 'qt'],
  fluvoxamine: ['ssri', 'serotonergic', 'cyp1a2_inhibitor'],
  venlafaxine: ['snri', 'serotonergic'],
  duloxetine: ['snri', 'serotonergic'],
  amitriptyline: ['tca', 'serotonergic', 'qt'],
  nortriptyline: ['tca', 'serotonergic'],
  selegiline: ['maoi'],
  rasagiline: ['maoi'],
  moclobemide: ['maoi'],
  sumatriptan: ['triptan', 'serotonergic'],
  rizatriptan: ['triptan', 'serotonergic'],
  alprazolam: ['benzodiazepine'],
  clonazepam: ['benzodiazepine'],
  diazepam: ['benzodiazepine'],
  lorazepam: ['benzodiazepine'],
  etizolam: ['benzodiazepine'],
  zolpidem: ['sedative'],
  haloperidol: ['qt'],
  lithium: ['lithium'],
  // Others
  methotrexate: ['methotrexate'],
  theophylline: ['theophylline'],
  aminophylline: ['theophylline'],
  allopurinol: ['allopurinol'],
  azathioprine: ['azathioprine'],
  levothyroxine: [],
  prednisolone: ['corticosteroid'],
  methylprednisolone: ['corticosteroid'],
  dexamethasone: ['corticosteroid'],
  cetirizine: ['antihistamine'],
  levocetirizine: ['antihistamine'],
  fexofenadine: ['antihistamine'],
  montelukast: [],
};

/** Common Indian brand names → ingredients. */
const BRANDS: Record<string, string[]> = {
  dolo: ['paracetamol'],
  crocin: ['paracetamol'],
  calpol: ['paracetamol'],
  pacimol: ['paracetamol'],
  combiflam: ['ibuprofen', 'paracetamol'],
  brufen: ['ibuprofen'],
  voveran: ['diclofenac'],
  'zerodol-p': ['aceclofenac', 'paracetamol'],
  'zerodol-sp': ['aceclofenac', 'paracetamol'],
  zerodol: ['aceclofenac'],
  hifenac: ['aceclofenac'],
  meftal: ['mefenamic acid'],
  'meftal-spas': ['mefenamic acid'],
  naprosyn: ['naproxen'],
  nimulid: ['nimesulide'],
  etoshine: ['etoricoxib'],
  ecosprin: ['aspirin'],
  'ecosprin-av': ['aspirin', 'atorvastatin'],
  disprin: ['aspirin'],
  ultracet: ['tramadol', 'paracetamol'],
  contramal: ['tramadol'],
  augmentin: ['amoxicillin', 'clavulanic acid'],
  clavam: ['amoxicillin', 'clavulanic acid'],
  'moxikind-cv': ['amoxicillin', 'clavulanic acid'],
  novamox: ['amoxicillin'],
  mox: ['amoxicillin'],
  azee: ['azithromycin'],
  azithral: ['azithromycin'],
  zithromax: ['azithromycin'],
  claribid: ['clarithromycin'],
  ciplox: ['ciprofloxacin'],
  cifran: ['ciprofloxacin'],
  levoflox: ['levofloxacin'],
  zenflox: ['ofloxacin'],
  oflox: ['ofloxacin'],
  'taxim-o': ['cefixime'],
  taxim: ['cefotaxime'],
  zifi: ['cefixime'],
  monocef: ['ceftriaxone'],
  ceftum: ['cefuroxime'],
  zinnat: ['cefuroxime'],
  septran: ['sulfamethoxazole', 'trimethoprim'],
  bactrim: ['sulfamethoxazole', 'trimethoprim'],
  flagyl: ['metronidazole'],
  metrogyl: ['metronidazole'],
  forcan: ['fluconazole'],
  zocon: ['fluconazole'],
  lizolid: ['linezolid'],
  'pan-d': ['pantoprazole', 'domperidone'],
  pantocid: ['pantoprazole'],
  pan: ['pantoprazole'],
  omez: ['omeprazole'],
  nexpro: ['esomeprazole'],
  razo: ['rabeprazole'],
  rantac: ['ranitidine'],
  emeset: ['ondansetron'],
  vomikind: ['ondansetron'],
  domstal: ['domperidone'],
  'glycomet-gp': ['metformin', 'glimepiride'],
  glycomet: ['metformin'],
  amaryl: ['glimepiride'],
  janumet: ['sitagliptin', 'metformin'],
  januvia: ['sitagliptin'],
  galvus: ['vildagliptin'],
  'telma-h': ['telmisartan', 'hydrochlorothiazide'],
  'telma-am': ['telmisartan', 'amlodipine'],
  telma: ['telmisartan'],
  amlong: ['amlodipine'],
  stamlo: ['amlodipine'],
  losar: ['losartan'],
  repace: ['losartan'],
  cardace: ['ramipril'],
  envas: ['enalapril'],
  aldactone: ['spironolactone'],
  lasix: ['furosemide'],
  dytor: ['torsemide'],
  metolar: ['metoprolol'],
  'met xl': ['metoprolol'],
  aten: ['atenolol'],
  concor: ['bisoprolol'],
  nebicard: ['nebivolol'],
  atorva: ['atorvastatin'],
  lipitor: ['atorvastatin'],
  rosuvas: ['rosuvastatin'],
  crestor: ['rosuvastatin'],
  clopilet: ['clopidogrel'],
  deplatt: ['clopidogrel'],
  plavix: ['clopidogrel'],
  warf: ['warfarin'],
  acitrom: ['acenocoumarol'],
  eliquis: ['apixaban'],
  xarelto: ['rivaroxaban'],
  lanoxin: ['digoxin'],
  cordarone: ['amiodarone'],
  sorbitrate: ['isosorbide dinitrate'],
  monotrate: ['isosorbide mononitrate'],
  penegra: ['sildenafil'],
  manforce: ['sildenafil'],
  viagra: ['sildenafil'],
  tadacip: ['tadalafil'],
  daxid: ['sertraline'],
  serta: ['sertraline'],
  nexito: ['escitalopram'],
  fludac: ['fluoxetine'],
  venlor: ['venlafaxine'],
  suminat: ['sumatriptan'],
  alprax: ['alprazolam'],
  restyl: ['alprazolam'],
  clonotril: ['clonazepam'],
  rivotril: ['clonazepam'],
  valium: ['diazepam'],
  licab: ['lithium'],
  deriphyllin: ['theophylline'],
  zyloric: ['allopurinol'],
  folitrax: ['methotrexate'],
  thyronorm: ['levothyroxine'],
  eltroxin: ['levothyroxine'],
  wysolone: ['prednisolone'],
  medrol: ['methylprednisolone'],
  dexona: ['dexamethasone'],
  cetzine: ['cetirizine'],
  levocet: ['levocetirizine'],
  allegra: ['fexofenadine'],
  'montair-lc': ['montelukast', 'levocetirizine'],
};

/** Allergy words → the drug classes they cover. */
const ALLERGY_CLASSES: [RegExp, string, string][] = [
  [
    /penicillin|amoxy?cillin|ampicillin|augmentin|clavam/,
    'penicillin',
    'penicillins',
  ],
  [/beta[\s-]?lactam/, 'beta_lactam', 'beta-lactams'],
  [/cephalosporin|cef|ceph/, 'cephalosporin', 'cephalosporins'],
  [
    /sul(f|ph)a\b|sul(f|ph)onamide|septran|bactrim|cotrimoxazole|co-trimoxazole/,
    'sulfonamide',
    'sulfonamides',
  ],
  [/nsaid|aspirin|ibuprofen|diclofenac|painkiller/, 'nsaid', 'NSAIDs'],
  [/macrolide/, 'macrolide', 'macrolides'],
  [/quinolone/, 'fluoroquinolone', 'fluoroquinolones'],
  [/statin/, 'statin', 'statins'],
  [/opioid|opiate|morphine|codeine/, 'opioid', 'opioids'],
  [/ace inhibitor/, 'acei', 'ACE inhibitors'],
];

interface Rule {
  a: string;
  b: string;
  severity: Severity;
  message: string;
}

/** Selectors are classes or ingredients. Pairs are checked both ways. */
const INTERACTIONS: Rule[] = [
  {
    a: 'nitrate',
    b: 'pde5',
    severity: 'contraindicated',
    message:
      'Nitrate with a PDE-5 inhibitor can cause severe, life-threatening hypotension.',
  },
  {
    a: 'maoi',
    b: 'serotonergic',
    severity: 'contraindicated',
    message:
      'MAO inhibitor with a serotonergic drug — risk of serotonin syndrome and hypertensive crisis.',
  },
  {
    a: 'serotonergic_maoi',
    b: 'ssri',
    severity: 'major',
    message:
      'Linezolid (MAO inhibition) with an SSRI — risk of serotonin syndrome.',
  },
  {
    a: 'serotonergic_maoi',
    b: 'snri',
    severity: 'major',
    message:
      'Linezolid (MAO inhibition) with an SNRI — risk of serotonin syndrome.',
  },
  {
    a: 'anticoagulant',
    b: 'nsaid',
    severity: 'major',
    message: 'Anticoagulant with an NSAID — markedly higher bleeding risk.',
  },
  {
    a: 'anticoagulant',
    b: 'antiplatelet',
    severity: 'major',
    message:
      'Anticoagulant with an antiplatelet — higher bleeding risk; confirm it is intended.',
  },
  {
    a: 'vka',
    b: 'inr_raising',
    severity: 'major',
    message:
      'Raises INR on warfarin/acenocoumarol — bleeding risk; monitor INR or choose another drug.',
  },
  {
    a: 'vka',
    b: 'macrolide',
    severity: 'major',
    message: 'Macrolide raises INR on warfarin/acenocoumarol — bleeding risk.',
  },
  {
    a: 'vka',
    b: 'fluoroquinolone',
    severity: 'moderate',
    message:
      'Fluoroquinolone may raise INR on warfarin/acenocoumarol — monitor.',
  },
  {
    a: 'acei',
    b: 'k_sparing',
    severity: 'major',
    message:
      'ACE inhibitor with a potassium-sparing diuretic — risk of dangerous hyperkalaemia.',
  },
  {
    a: 'arb',
    b: 'k_sparing',
    severity: 'major',
    message:
      'ARB with a potassium-sparing diuretic — risk of dangerous hyperkalaemia.',
  },
  {
    a: 'acei',
    b: 'potassium',
    severity: 'major',
    message:
      'ACE inhibitor with a potassium supplement — risk of hyperkalaemia.',
  },
  {
    a: 'arb',
    b: 'potassium',
    severity: 'major',
    message: 'ARB with a potassium supplement — risk of hyperkalaemia.',
  },
  {
    a: 'k_sparing',
    b: 'potassium',
    severity: 'major',
    message:
      'Potassium-sparing diuretic with a potassium supplement — risk of hyperkalaemia.',
  },
  {
    a: 'acei',
    b: 'arb',
    severity: 'major',
    message:
      'ACE inhibitor with an ARB (dual RAAS blockade) — hyperkalaemia, hypotension and kidney injury.',
  },
  {
    a: 'nsaid',
    b: 'acei',
    severity: 'moderate',
    message:
      'NSAID with an ACE inhibitor — reduced BP control and risk to kidney function.',
  },
  {
    a: 'nsaid',
    b: 'arb',
    severity: 'moderate',
    message:
      'NSAID with an ARB — reduced BP control and risk to kidney function.',
  },
  {
    a: 'ssri',
    b: 'serotonergic',
    severity: 'major',
    message: 'Two serotonergic drugs — risk of serotonin syndrome.',
  },
  {
    a: 'snri',
    b: 'serotonergic',
    severity: 'major',
    message: 'Two serotonergic drugs — risk of serotonin syndrome.',
  },
  {
    a: 'ssri',
    b: 'nsaid',
    severity: 'moderate',
    message: 'SSRI with an NSAID — higher risk of GI bleeding.',
  },
  {
    a: 'cyp3a4_statin',
    b: 'cyp3a4_inhibitor',
    severity: 'major',
    message:
      'Simvastatin/lovastatin with a strong CYP3A4 inhibitor — risk of myopathy and rhabdomyolysis.',
  },
  {
    a: 'statin',
    b: 'clarithromycin',
    severity: 'moderate',
    message: 'Clarithromycin raises statin levels — risk of myopathy.',
  },
  {
    a: 'clopidogrel',
    b: 'cyp2c19_inhibitor',
    severity: 'moderate',
    message:
      'Omeprazole/esomeprazole reduce clopidogrel activation — consider pantoprazole.',
  },
  {
    a: 'methotrexate',
    b: 'nsaid',
    severity: 'major',
    message:
      'NSAID with methotrexate — methotrexate toxicity (marrow, kidney).',
  },
  {
    a: 'methotrexate',
    b: 'trimethoprim',
    severity: 'major',
    message:
      'Trimethoprim with methotrexate — risk of bone-marrow suppression.',
  },
  {
    a: 'lithium',
    b: 'nsaid',
    severity: 'major',
    message: 'NSAID with lithium — raised lithium levels and toxicity.',
  },
  {
    a: 'lithium',
    b: 'acei',
    severity: 'major',
    message: 'ACE inhibitor with lithium — raised lithium levels.',
  },
  {
    a: 'lithium',
    b: 'arb',
    severity: 'major',
    message: 'ARB with lithium — raised lithium levels.',
  },
  {
    a: 'lithium',
    b: 'thiazide',
    severity: 'major',
    message: 'Thiazide with lithium — raised lithium levels.',
  },
  {
    a: 'theophylline',
    b: 'cyp1a2_inhibitor',
    severity: 'major',
    message: 'Raises theophylline levels — risk of seizures and arrhythmia.',
  },
  {
    a: 'theophylline',
    b: 'clarithromycin',
    severity: 'major',
    message: 'Clarithromycin raises theophylline levels.',
  },
  {
    a: 'digoxin',
    b: 'amiodarone',
    severity: 'major',
    message: 'Amiodarone raises digoxin levels — toxicity.',
  },
  {
    a: 'digoxin',
    b: 'ccb_nondhp',
    severity: 'major',
    message: 'Verapamil/diltiazem raise digoxin levels and slow the heart.',
  },
  {
    a: 'digoxin',
    b: 'clarithromycin',
    severity: 'major',
    message: 'Clarithromycin raises digoxin levels.',
  },
  {
    a: 'beta_blocker',
    b: 'ccb_nondhp',
    severity: 'major',
    message:
      'Beta blocker with verapamil/diltiazem — bradycardia and heart block.',
  },
  {
    a: 'opioid',
    b: 'benzodiazepine',
    severity: 'major',
    message:
      'Opioid with a benzodiazepine — risk of profound sedation and respiratory depression.',
  },
  {
    a: 'opioid',
    b: 'sedative',
    severity: 'major',
    message:
      'Opioid with a sedative-hypnotic — risk of respiratory depression.',
  },
  {
    a: 'sulfonylurea',
    b: 'fluconazole',
    severity: 'moderate',
    message: 'Fluconazole raises sulfonylurea levels — hypoglycaemia.',
  },
  {
    a: 'sulfonylurea',
    b: 'sulfamethoxazole',
    severity: 'moderate',
    message: 'Co-trimoxazole raises sulfonylurea levels — hypoglycaemia.',
  },
  {
    a: 'azathioprine',
    b: 'allopurinol',
    severity: 'major',
    message:
      'Allopurinol with azathioprine — severe bone-marrow suppression unless the dose is cut.',
  },
  {
    a: 'qt',
    b: 'qt',
    severity: 'moderate',
    message:
      'Two QT-prolonging drugs — risk of arrhythmia; check ECG and electrolytes.',
  },
  {
    a: 'corticosteroid',
    b: 'nsaid',
    severity: 'moderate',
    message:
      'Corticosteroid with an NSAID — higher risk of GI ulcer and bleeding.',
  },
];

const CLASS_LABEL: Record<string, string> = {
  nsaid: 'NSAIDs',
  anticoagulant: 'anticoagulants',
  ppi: 'proton-pump inhibitors',
  ssri: 'SSRIs',
  snri: 'SNRIs',
  statin: 'statins',
  sulfonylurea: 'sulfonylureas',
  benzodiazepine: 'benzodiazepines',
  acei: 'ACE inhibitors',
  arb: 'ARBs',
  beta_blocker: 'beta blockers',
  opioid: 'opioids',
};

/** Same-class duplicates worth flagging, with severity. */
const DUPLICATE_CLASSES: Record<string, Severity> = {
  nsaid: 'major',
  anticoagulant: 'major',
  ppi: 'moderate',
  ssri: 'major',
  snri: 'major',
  statin: 'moderate',
  sulfonylurea: 'moderate',
  benzodiazepine: 'major',
  acei: 'major',
  arb: 'major',
  beta_blocker: 'major',
  opioid: 'major',
};

const STRIP =
  /\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|susp|suspension|inj|injection|oint|ointment|cream|gel|drops?|sachet|inhaler|er|sr|xr|cr|od|ds|mr)\b/g;
const INGREDIENT_KEYS = Object.keys(INGREDIENTS).sort(
  (a, b) => b.length - a.length,
);
const BRAND_KEYS = Object.keys(BRANDS).sort((a, b) => b.length - a.length);

function norm(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(STRIP, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function hasWord(text: string, key: string): boolean {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s])${k}(?=[\\s\\d]|$)`).test(text);
}

/** Ingredients named by a medicine entry (brand or generic, combinations too). */
export function ingredientsOf(medicine: string): string[] {
  const t = norm(medicine);
  const found = new Set<string>();
  for (const b of BRAND_KEYS) {
    if (hasWord(t, b)) {
      BRANDS[b].forEach((i) => found.add(i));
      break;
    }
  }
  for (const i of INGREDIENT_KEYS) if (hasWord(t, i)) found.add(i);
  // "Paracetamol" also spelt "acetaminophen".
  if (hasWord(t, 'acetaminophen')) found.add('paracetamol');
  return [...found];
}

function classesOf(ingredients: string[]): Set<string> {
  const out = new Set<string>();
  for (const i of ingredients) {
    out.add(i);
    for (const c of INGREDIENTS[i] ?? []) out.add(c);
  }
  return out;
}

const SEVERITY_RANK: Record<Severity, number> = {
  contraindicated: 0,
  major: 1,
  moderate: 2,
};

export interface SafetyInput {
  items: { medicine: string; strength?: string | null }[];
  allergies: string[];
  activeMedicines: { medicine: string; source: string }[];
}

export interface SafetyResult {
  warnings: SafetyWarning[];
  /** Lines whose medicine the checker doesn't know — check those yourself. */
  unrecognised: number[];
}

export function checkPrescription(input: SafetyInput): SafetyResult {
  const lines = input.items.map((it) => {
    const ingredients = ingredientsOf(it.medicine);
    return {
      name: it.medicine.trim(),
      ingredients,
      classes: classesOf(ingredients),
    };
  });
  const active = input.activeMedicines
    .map((m) => {
      const ingredients = ingredientsOf(m.medicine);
      return {
        name: m.medicine,
        source: m.source,
        ingredients,
        classes: classesOf(ingredients),
      };
    })
    .filter((m) => m.ingredients.length);
  const warnings: SafetyWarning[] = [];
  const seen = new Set<string>();
  const push = (w: SafetyWarning) => {
    const key = `${w.kind}|${w.lines.join(',')}|${w.with}|${w.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(w);
  };

  // Allergies
  for (const allergy of input.allergies) {
    const a = allergy.toLowerCase();
    const allergyIngredients = ingredientsOf(allergy);
    const allergyClasses = ALLERGY_CLASSES.filter(([rx]) => rx.test(a));
    // An allergy to one penicillin (etc.) covers the whole family.
    for (const i of allergyIngredients)
      for (const [, cls, label] of ALLERGY_CLASSES.filter(
        // The specific family (penicillins, sulfonamides…), not the broad beta-lactam group.
        ([, cls]) =>
          cls !== 'beta_lactam' && (INGREDIENTS[i] ?? []).includes(cls),
      ))
        if (!allergyClasses.some(([, c]) => c === cls))
          allergyClasses.push([/$^/, cls, label]);
    lines.forEach((l, idx) => {
      const direct = l.ingredients.filter((i) =>
        allergyIngredients.includes(i),
      );
      if (direct.length) {
        push({
          severity: 'contraindicated',
          kind: 'allergy',
          lines: [idx],
          with: allergy,
          message: `Recorded allergy to ${allergy}: ${l.name} contains ${direct.join(', ')}.`,
        });
        return;
      }
      for (const [, cls, label] of allergyClasses) {
        if (cls === 'nsaid' && l.classes.has('nsaid')) {
          push({
            severity: 'major',
            kind: 'allergy',
            lines: [idx],
            with: allergy,
            message: `Recorded allergy to ${allergy}: ${l.name} is an NSAID — cross-reactivity is common.`,
          });
        } else if (l.classes.has(cls)) {
          push({
            severity: 'contraindicated',
            kind: 'allergy',
            lines: [idx],
            with: allergy,
            message: `Recorded allergy to ${allergy}: ${l.name} belongs to the ${label}.`,
          });
        } else if (
          cls === 'penicillin' &&
          (l.classes.has('cephalosporin') || l.classes.has('carbapenem'))
        ) {
          push({
            severity: 'major',
            kind: 'allergy',
            lines: [idx],
            with: allergy,
            message: `Recorded penicillin allergy: ${l.name} is a beta-lactam — cross-reactivity is low but real; avoid if the reaction was anaphylaxis.`,
          });
        }
      }
    });
  }

  // Interactions and duplicates
  const pairs: {
    a: number;
    b: number | null;
    other: { name: string; ingredients: string[]; classes: Set<string> };
    label: string;
  }[] = [];
  lines.forEach((_, i) => {
    for (let j = i + 1; j < lines.length; j++)
      pairs.push({
        a: i,
        b: j,
        other: lines[j],
        label: `line ${j + 1} (${lines[j].name})`,
      });
    for (const m of active)
      pairs.push({ a: i, b: null, other: m, label: `${m.name} (${m.source})` });
  });
  for (const p of pairs) {
    const x = lines[p.a];
    const y = p.other;
    if (!x.ingredients.length || !y.ingredients.length) continue;
    const involved = p.b === null ? [p.a] : [p.a, p.b];
    const shared = x.ingredients.filter((i) => y.ingredients.includes(i));
    if (shared.length) {
      const what = listOf(shared);
      const tail = shared.includes('paracetamol')
        ? ' — watch the total daily paracetamol dose'
        : '';
      push({
        severity: 'major',
        kind: 'duplicate',
        lines: involved,
        with: p.label,
        message:
          p.b === null
            ? `${x.name} repeats ${what} from an active prescription: ${p.label}${tail}.`
            : `${what} ${shared.length === 1 ? 'is' : 'are'} on two lines — ${x.name} and ${y.name}${tail}.`,
      });
      continue;
    }
    let sameClass = false;
    for (const [cls, severity] of Object.entries(DUPLICATE_CLASSES)) {
      if (x.classes.has(cls) && y.classes.has(cls)) {
        sameClass = true;
        push({
          severity,
          kind: 'duplicate',
          lines: involved,
          with: p.label,
          message: `Two ${CLASS_LABEL[cls] ?? cls} together — ${x.name} and ${y.name}.`,
        });
      }
    }
    // A same-class duplicate already says it; don't repeat it as an interaction.
    if (sameClass) continue;
    for (const r of INTERACTIONS) {
      const hit =
        (x.classes.has(r.a) && y.classes.has(r.b)) ||
        (x.classes.has(r.b) && y.classes.has(r.a));
      if (hit)
        push({
          severity: r.severity,
          kind: 'interaction',
          lines: involved,
          with: p.label,
          message: `${x.name} + ${y.name}: ${r.message}`,
        });
    }
  }

  warnings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.lines[0] - b.lines[0],
  );
  return {
    warnings,
    unrecognised: lines
      .map((l, i) => (l.name && !l.ingredients.length ? i : -1))
      .filter((i) => i >= 0),
  };
}

function listOf(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Warnings that must be acknowledged before signing. */
export const blocksSigning = (w: SafetyWarning) =>
  w.severity === 'contraindicated' || w.severity === 'major';
