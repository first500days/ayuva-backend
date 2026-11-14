/**
 * "Simplify": a plain-language guide to the patient's own document, built
 * from its text with rules — a glossary of the medical words it uses, and
 * each lab value placed against the range printed beside it. It explains
 * words and positions only: it never says what a result means for the
 * patient's health. An LLM explanation can replace it via the AI gateway.
 */

export interface PlainTerm {
  term: string;
  plain: string;
  /**
   * A commonly quoted adult range, given only when the document prints no
   * range of its own for this test. Labs differ; the report's range wins.
   */
  typicalRange?: string;
}

export interface ValueReading {
  name: string;
  value: number;
  unit: string;
  low: number;
  high: number;
  /** Where the value sits against the range printed on the same report. */
  position: 'below' | 'within' | 'above';
}

export interface PlainLanguageGuide {
  textRead: boolean;
  terms: PlainTerm[];
  values: ValueReading[];
}

/** [pattern, the word as shown, what it means in everyday words] */
const GLOSSARY: Array<[RegExp, string, string]> = [
  // Blood counts
  [
    /\bh(a)?emoglobin\b|\bhb\b/i,
    'Haemoglobin',
    'The protein in red blood cells that carries oxygen around your body.',
  ],
  [
    /\b(rbc|red blood cell)s?\b/i,
    'Red blood cells (RBC)',
    'Cells that carry oxygen from your lungs to the rest of your body.',
  ],
  [
    /\b(wbc|white blood cell|leu[ck]ocyte)s?\b|\btlc\b/i,
    'White blood cells (WBC)',
    'Cells that help your body fight infections.',
  ],
  [
    /\bplatelets?\b/i,
    'Platelets',
    'Tiny cells that help your blood clot when you get a cut.',
  ],
  [
    /\bh(a)?ematocrit\b|\bpcv\b/i,
    'Haematocrit (PCV)',
    'How much of your blood is made up of red blood cells.',
  ],
  [/\bmcv\b/i, 'MCV', 'The average size of your red blood cells.'],
  [
    /\bneutrophils?\b/i,
    'Neutrophils',
    'The most common type of white blood cell; they respond first to infections.',
  ],
  [
    /\blymphocytes?\b/i,
    'Lymphocytes',
    'White blood cells that help your body remember and fight germs.',
  ],
  [
    /\beosinophils?\b/i,
    'Eosinophils',
    'White blood cells involved in allergies and fighting parasites.',
  ],
  [
    /\besr\b|erythrocyte sedimentation/i,
    'ESR',
    'A general blood test that rises when there is inflammation somewhere in the body.',
  ],
  [
    /\bc-?reactive protein\b|\bcrp\b/i,
    'CRP',
    'A protein made by the liver that rises with inflammation.',
  ],
  // Sugar
  [
    /\bhba1c\b|glycated h(a)?emoglobin|glycosylated/i,
    'HbA1c',
    'Your average blood sugar over roughly the last three months.',
  ],
  [
    /\bfasting (blood )?(glucose|sugar)\b|\bfbs\b/i,
    'Fasting blood sugar',
    'The sugar level in your blood after not eating for 8–12 hours.',
  ],
  [
    /\bpost[- ]?prandial|\bppbs\b/i,
    'Post-meal blood sugar (PP)',
    'Your blood sugar about two hours after a meal.',
  ],
  // Lipids
  [
    /\b(total )?cholesterol\b/i,
    'Cholesterol',
    'A fatty substance in your blood; your body needs some, and the report shows how much there is.',
  ],
  [
    /\bldl\b/i,
    'LDL cholesterol',
    'Often called "bad" cholesterol, because high levels can build up in blood vessels.',
  ],
  [
    /\bhdl\b/i,
    'HDL cholesterol',
    'Often called "good" cholesterol, because it helps clear other cholesterol away.',
  ],
  [
    /\btriglycerides?\b/i,
    'Triglycerides',
    'A type of fat in your blood that comes from food and is stored for energy.',
  ],
  [/\bvldl\b/i, 'VLDL', 'A carrier of triglycerides in the blood.'],
  // Kidney
  [
    /\bcreatinine\b/i,
    'Creatinine',
    'A waste product from muscles that your kidneys filter out; it shows how well kidneys are filtering.',
  ],
  [
    /\begfr\b/i,
    'eGFR',
    'An estimate of how well your kidneys filter your blood.',
  ],
  [
    /\burea\b|\bbun\b/i,
    'Urea / BUN',
    'A waste product from protein that the kidneys remove.',
  ],
  [
    /\buric acid\b/i,
    'Uric acid',
    'A natural waste product; high levels can be linked to gout.',
  ],
  [
    /\b(sodium|potassium|chloride)\b/i,
    'Electrolytes',
    'Salts in your blood (sodium, potassium, chloride) that keep nerves and muscles working.',
  ],
  // Liver
  [
    /\b(alt|sgpt)\b/i,
    'ALT (SGPT)',
    'A liver enzyme; the test shows how much of it is in your blood.',
  ],
  [
    /\b(ast|sgot)\b/i,
    'AST (SGOT)',
    'An enzyme found in the liver and muscles.',
  ],
  [
    /\balkaline phosphatase\b|\balp\b/i,
    'Alkaline phosphatase (ALP)',
    'An enzyme from the liver and bones.',
  ],
  [
    /\bbilirubin\b/i,
    'Bilirubin',
    'A yellow substance made when old red blood cells break down; the liver clears it.',
  ],
  [
    /\balbumin\b/i,
    'Albumin',
    'The main protein in your blood, made by the liver.',
  ],
  [/\bggt\b|gamma[- ]glutamyl/i, 'GGT', 'A liver enzyme.'],
  // Thyroid and vitamins
  [
    /\btsh\b/i,
    'TSH',
    'A hormone from the brain that tells your thyroid gland how hard to work.',
  ],
  [
    /\b(free )?t3\b|triiodothyronine/i,
    'T3',
    'One of the hormones made by the thyroid gland.',
  ],
  [
    /\b(free )?t4\b|thyroxine/i,
    'T4',
    'The main hormone made by the thyroid gland.',
  ],
  [
    /vitamin d|25[- ]?oh/i,
    'Vitamin D',
    'A vitamin your body makes from sunlight; it keeps bones strong.',
  ],
  [
    /vitamin b12|cobalamin/i,
    'Vitamin B12',
    'A vitamin needed for healthy nerves and red blood cells.',
  ],
  [/\bferritin\b/i, 'Ferritin', 'Shows how much iron your body has stored.'],
  // Urine
  [/\bpus cells\b/i, 'Pus cells', 'White blood cells seen in urine.'],
  [
    /\bspecific gravity\b/i,
    'Specific gravity',
    'How concentrated your urine is.',
  ],
  [
    /\bketones?\b/i,
    'Ketones',
    'Substances made when the body burns fat for energy.',
  ],
  // Imaging words
  [
    /\bimpression\b/i,
    'Impression',
    'The radiologist’s summary of the scan — usually the most important part to read.',
  ],
  [
    /\bunremarkable\b/i,
    'Unremarkable',
    'Looks normal; nothing unusual was seen.',
  ],
  [
    /\bno (significant )?abnormality detected\b|\bnad\b/i,
    'No abnormality detected (NAD)',
    'Nothing unusual was found.',
  ],
  [
    /\bwithin normal limits\b|\bwnl\b/i,
    'Within normal limits (WNL)',
    'In the expected range.',
  ],
  [/\bbenign\b/i, 'Benign', 'Not cancer.'],
  [
    /\blesion\b/i,
    'Lesion',
    'A general word for any area that looks different from the tissue around it.',
  ],
  [
    /\bopacit(y|ies)\b/i,
    'Opacity',
    'An area that looks whiter or denser on an X-ray or scan.',
  ],
  [
    /\bconsolidation\b/i,
    'Consolidation',
    'Part of the lung that looks filled with fluid or other material instead of air.',
  ],
  [
    /\beffusion\b/i,
    'Effusion',
    'Extra fluid collected in a space in the body, such as around the lungs or a joint.',
  ],
  [
    /\bcardiomegaly\b/i,
    'Cardiomegaly',
    'The heart looks larger than expected on the image.',
  ],
  [/\bbilateral\b/i, 'Bilateral', 'On both sides.'],
  [/\bunilateral\b/i, 'Unilateral', 'On one side.'],
  [/\banterior\b/i, 'Anterior', 'Towards the front of the body.'],
  [/\bposterior\b/i, 'Posterior', 'Towards the back of the body.'],
  [
    /\bcontrast\b/i,
    'Contrast',
    'A dye given during some scans to make blood vessels and organs show up clearly.',
  ],
  [/\bcyst\b/i, 'Cyst', 'A small sac filled with fluid.'],
  [/\bcalcul(us|i)\b/i, 'Calculus', 'A stone, such as a kidney stone.'],
  [
    /\bhepatomegaly\b/i,
    'Hepatomegaly',
    'The liver looks larger than expected.',
  ],
  [
    /\bfatty liver\b|\bhepatic steatosis\b/i,
    'Fatty liver',
    'Extra fat stored in the liver.',
  ],
  // Conditions and visit words
  [/\bhypertension\b/i, 'Hypertension', 'High blood pressure.'],
  [/\bhypotension\b/i, 'Hypotension', 'Low blood pressure.'],
  [
    /\bdyslipid(a)?emia\b|\bhyperlipid(a)?emia\b/i,
    'Dyslipidaemia',
    'Cholesterol or blood fats outside the usual levels.',
  ],
  [
    /\bdiabetes mellitus\b|\bt2dm\b|\bdm\b/i,
    'Diabetes mellitus',
    'A condition where blood sugar stays higher than usual.',
  ],
  [
    /\banemia\b|\banaemia\b/i,
    'Anaemia',
    'Fewer red blood cells or less haemoglobin than usual.',
  ],
  [/\bhypothyroidism\b/i, 'Hypothyroidism', 'An underactive thyroid gland.'],
  [/\bhyperthyroidism\b/i, 'Hyperthyroidism', 'An overactive thyroid gland.'],
  [/\bacute\b/i, 'Acute', 'Started recently or came on suddenly.'],
  [/\bchronic\b/i, 'Chronic', 'Long-lasting.'],
  [/\bidiopathic\b/i, 'Idiopathic', 'The cause isn’t known.'],
  [/\bprognosis\b/i, 'Prognosis', 'The expected course or outcome.'],
  [
    /\bc\/o\b|complains? of/i,
    'C/O',
    'Short for "complains of" — the symptoms you described.',
  ],
  [
    /\bk\/c\/o\b|known case of/i,
    'K/C/O',
    'Short for "known case of" — a condition already diagnosed.',
  ],
  [/\bh\/o\b/i, 'H/O', 'Short for "history of".'],
  [/\bsos\b/i, 'SOS (on a prescription)', 'Take only if needed.'],
  [/\bbd\b|\bbid\b/i, 'BD', 'Twice a day.'],
  [/\btds\b|\btid\b/i, 'TDS', 'Three times a day.'],
  [/\bod\b/i, 'OD', 'Once a day.'],
  [/\bhs\b/i, 'HS', 'At bedtime.'],
  [/\bqid\b|\bqds\b/i, 'QID', 'Four times a day.'],
  [/\bprn\b/i, 'PRN', 'Only when needed.'],
  [/\bstat\b/i, 'STAT', 'Straight away.'],
  [/\bb\/f\b|\bbefore food\b/i, 'B/F', 'Before food.'],
  [/\ba\/f\b|\bafter food\b/i, 'A/F', 'After food.'],
  [/\bnbm\b|\bnpo\b/i, 'NBM / NPO', 'Nothing to eat or drink.'],
  // Report shorthand
  [/\bwnl\b/i, 'WNL', 'Short for "within normal limits".'],
  [/\bnad\b/i, 'NAD', 'Short for "no abnormality detected".'],
  [
    /\bs\/o\b|suggestive of/i,
    'S/O',
    'Short for "suggestive of": what the findings point towards. Your doctor confirms it.',
  ],
  [
    /\br\/o\b|rule out/i,
    'R/O',
    'Short for "rule out": something the doctor wants to check isn’t there.',
  ],
  [/\bdx\b/i, 'Dx', 'Short for "diagnosis".'],
  [/\bhx\b/i, 'Hx', 'Short for "history".'],
  [/\brx\b/i, 'Rx', 'Short for "prescription" or "treatment".'],
  [/\btx\b/i, 'Tx', 'Short for "treatment".'],
  [/\bsob\b/i, 'SOB', 'Short for "shortness of breath".'],
  [/\bhtn\b/i, 'HTN', 'Short for "hypertension": high blood pressure.'],
  [
    /\bcad\b/i,
    'CAD',
    'Short for "coronary artery disease": narrowing of the blood vessels that feed the heart.',
  ],
  [
    /\bcopd\b/i,
    'COPD',
    'A long-term lung condition that makes breathing out harder.',
  ],
  // Tests and scans by their short names
  [
    /\bcbc\b|\bcbp\b|\bh(a)?emogram\b/i,
    'CBC',
    'Complete blood count: a set of tests on your red cells, white cells and platelets.',
  ],
  [/\blft\b/i, 'LFT', 'Liver function tests: a group of blood tests about the liver.'],
  [/\bkft\b|\brft\b/i, 'KFT / RFT', 'Kidney function tests: a group of blood tests about the kidneys.'],
  [/\btft\b/i, 'TFT', 'Thyroid function tests.'],
  [/\busg\b|\bultrasound\b|\bsonograph/i, 'USG', 'Ultrasound: pictures made with sound waves, no radiation.'],
  [/\bCT\b/, 'CT', 'A scan that uses X-rays to make detailed pictures in slices.'],
  [/\bmri\b/i, 'MRI', 'A scan that makes detailed pictures with magnets and radio waves, no X-rays.'],
  [/\becg\b|\bekg\b/i, 'ECG', 'A recording of the heart’s electrical activity.'],
  [/\b(2d )?echo(cardiogra(m|phy))?\b/i, 'ECHO', 'An ultrasound scan of the heart.'],
  [
    /\blvef\b|\bejection fraction\b/i,
    'LVEF',
    'Ejection fraction: how much blood the heart’s main pumping chamber pushes out with each beat.',
  ],
  [/\bnsr\b|normal sinus rhythm/i, 'NSR', 'Normal sinus rhythm: a regular heartbeat pattern.'],
  [/\bspo2\b|\bsp02\b/i, 'SpO₂', 'How much oxygen your blood is carrying.'],
  [/\bbmi\b/i, 'BMI', 'Body mass index: your weight compared with your height.'],
  [/\bbp\b/i, 'BP', 'Blood pressure.'],
  // Units
  [/\bmg\/dl\b/i, 'mg/dL', 'Milligrams per decilitre: how much of a substance is in a set amount of blood.'],
  [/\bg\/dl\b/i, 'g/dL', 'Grams per decilitre: how much of a substance is in a set amount of blood.'],
  [/\bmmol\/l\b/i, 'mmol/L', 'Millimoles per litre: another way of measuring how much is in your blood.'],
  [/\bu\/l\b|\biu\/l\b/i, 'U/L', 'Units per litre: how active an enzyme is in your blood.'],
  [
    /reference (range|interval)|biological reference|\bref\.? range/i,
    'Reference range',
    'The span of results this lab usually sees in healthy people. Being just outside it isn’t always a problem.',
  ],
];

/**
 * Commonly quoted adult ranges, shown only when the document prints none for
 * that test. Rough guides: labs, methods, age and sex all shift them.
 */
const TYPICAL_RANGES: Record<string, string> = {
  Haemoglobin: 'about 12–15.5 g/dL for women, 13.5–17.5 g/dL for men',
  'White blood cells (WBC)': 'about 4,000–11,000 per µL',
  Platelets: 'about 1.5–4.5 lakh per µL',
  ESR: 'about 0–20 mm in the first hour',
  CRP: 'usually below 6 mg/L',
  HbA1c: 'below 5.7%',
  'Fasting blood sugar': 'about 70–99 mg/dL',
  'Post-meal blood sugar (PP)': 'below 140 mg/dL',
  Cholesterol: 'below 200 mg/dL',
  'LDL cholesterol': 'below 100 mg/dL',
  'HDL cholesterol': '40 mg/dL or more for men, 50 mg/dL or more for women',
  Triglycerides: 'below 150 mg/dL',
  Creatinine: 'about 0.6–1.2 mg/dL',
  eGFR: '90 or more',
  'Urea / BUN': 'urea about 15–40 mg/dL (BUN about 7–20 mg/dL)',
  'Uric acid': 'about 3.5–7.2 mg/dL',
  'ALT (SGPT)': 'about 7–56 U/L',
  'AST (SGOT)': 'about 10–40 U/L',
  'Alkaline phosphatase (ALP)': 'about 44–147 U/L',
  Bilirubin: 'total about 0.1–1.2 mg/dL',
  Albumin: 'about 3.5–5.0 g/dL',
  TSH: 'about 0.4–4.0 mIU/L',
  T3: 'about 80–200 ng/dL',
  T4: 'about 5–12 µg/dL',
  'Vitamin D': 'about 30–100 ng/mL',
  'Vitamin B12': 'about 200–900 pg/mL',
  Ferritin: 'about 20–250 ng/mL, lower for women',
};

const MAX_TERMS = 40;

function termsIn(text: string, values: ValueReading[]): PlainTerm[] {
  const found: PlainTerm[] = [];
  for (const [pattern, term, plain] of GLOSSARY) {
    if (found.length >= MAX_TERMS) break;
    if (!pattern.test(text) || found.some((t) => t.term === term)) continue;
    const typical = TYPICAL_RANGES[term];
    // The report's own range, when it prints one, is the one that counts.
    const printed = values.some((v) => pattern.test(v.name));
    found.push(
      typical && !printed
        ? { term, plain, typicalRange: `Typical adult range: ${typical}` }
        : { term, plain },
    );
  }
  return found;
}

const NUM = '(\\d{1,5}(?:\\.\\d{1,3})?)';
// "Haemoglobin  12.4  g/dL  12.0 - 15.0" and "TSH 3.1 H uIU/mL Ref. 0.4-4.5": name,
// value (optional H/L flag), unit, then the low–high range later on the line.
const VALUE_LINE = new RegExp(
  `^\\s*([A-Za-z][A-Za-z0-9 ().,/'+-]{1,48}?)\\s*[:\\-]?\\s+${NUM}\\s*(?:[HL*]\\s+)?([A-Za-zµμ%][A-Za-z0-9µμ%/^.]{0,14})?\\s+.*?${NUM}\\s*(?:-|–|to)\\s*${NUM}\\b`,
  'i',
);
const NOT_A_TEST =
  /\b(date|age|dob|page|ph(one)?|mobile|time|years?|id|no\.?|bill|amount|rs\.?)\b/i;

function valuesIn(text: string): ValueReading[] {
  const readings: ValueReading[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = VALUE_LINE.exec(line);
    if (!m) continue;
    const name = m[1].replace(/\s+/g, ' ').trim();
    const [value, low, high] = [Number(m[2]), Number(m[4]), Number(m[5])];
    if (NOT_A_TEST.test(name) || !(low < high)) continue;
    const position = value < low ? 'below' : value > high ? 'above' : 'within';
    readings.push({
      name,
      value,
      unit: (m[3] ?? '').trim(),
      low,
      high,
      position,
    });
    if (readings.length >= 60) break;
  }
  return readings;
}

export function simplifyDocument(text: string): PlainLanguageGuide {
  const clean = text.split(String.fromCharCode(0)).join('');
  const textRead = clean.replace(/\s/g, '').length >= 20;
  if (!textRead) return { textRead, terms: [], values: [] };
  const values = valuesIn(clean);
  return { textRead, terms: termsIn(clean, values), values };
}
