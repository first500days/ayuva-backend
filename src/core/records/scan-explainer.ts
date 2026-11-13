/**
 * "Explain My Scan": a plain-language companion to an imaging report, built
 * by fixed rules from the report's own words and the doctor's signed note.
 * It quotes the radiologist's conclusion rather than rewording it, explains
 * the technical terms it uses, lists the sizes it mentions, and suggests
 * questions for the doctor. It never says whether a scan is normal or what a
 * finding means for the person: that is the doctor's call.
 */

export const SCAN_EXPLANATION_DISCLAIMER =
  'Ayuva AI insights are strictly supportive. Final clinical validations and treatment definitions must be confirmed by your authorized healthcare professional.';

export interface ScanNote {
  doctor: string;
  signedAt: Date;
  assessment?: string;
  plan?: string;
  advice?: string;
}

export interface ScanExplainInput {
  procedureType?: string;
  providerName?: string;
  date?: Date;
  reportText: string;
  note?: ScanNote | null;
}

export interface ScanExplanation {
  title: string;
  textRead: boolean;
  sections: { heading: string; body: string; quoted?: boolean }[];
  terms: { term: string; meaning: string }[];
  measurements: string[];
  questions: string[];
  sources: {
    report: boolean;
    doctorNote: { doctor: string; date: string } | null;
  };
  generatedBy: 'rules';
  disclaimer: string;
}

/** [pattern, the word as shown, what it means in everyday words] */
const IMAGING_TERMS: Array<[RegExp, string, string]> = [
  [
    /\bunremarkable\b/i,
    'Unremarkable',
    'A word radiologists use when a part looks as expected on the images.',
  ],
  [
    /\bno (acute|significant) abnormalit/i,
    'No acute abnormality',
    'The radiologist did not see a sudden or urgent problem on the images.',
  ],
  [
    /\bimpression\b/i,
    'Impression',
    'The radiologist’s summary or conclusion, usually at the end of the report.',
  ],
  [
    /\bfindings?\b/i,
    'Findings',
    'What the radiologist saw on the images, described part by part.',
  ],
  [
    /\blesions?\b/i,
    'Lesion',
    'A general word for an area that looks different from the tissue around it. It does not by itself say what the area is.',
  ],
  [
    /\bnodules?\b/i,
    'Nodule',
    'A small rounded spot. Most are measured and compared over time.',
  ],
  [
    /\bmass\b/i,
    'Mass',
    'A larger area of tissue that stands out on the images; further tests usually explain what it is.',
  ],
  [/\bcysts?\b/i, 'Cyst', 'A small pocket that is usually filled with fluid.'],
  [
    /\bopacit(y|ies)\b/i,
    'Opacity',
    'An area that looks lighter (whiter) on an X-ray or CT than expected.',
  ],
  [
    /\bconsolidation\b/i,
    'Consolidation',
    'Part of the lung that looks filled in rather than filled with air.',
  ],
  [
    /\beffusion\b/i,
    'Effusion',
    'A collection of fluid, for example around the lungs or in a joint.',
  ],
  [
    /\bedema\b|\boedema\b/i,
    'Oedema',
    'Swelling caused by extra fluid in the tissue.',
  ],
  [
    /\bcalcifi(ed|cation)\b/i,
    'Calcification',
    'A small deposit of calcium, which shows up bright on X-ray and CT.',
  ],
  [
    /\bdegenerative\b/i,
    'Degenerative changes',
    'Wear-and-tear changes, often seen with age.',
  ],
  [
    /\bosteophytes?\b/i,
    'Osteophyte',
    'A bony growth at the edge of a joint, also called a bone spur.',
  ],
  [/\bfracture\b/i, 'Fracture', 'A break or crack in a bone.'],
  [
    /\bstenosis\b/i,
    'Stenosis',
    'A narrowing, for example of a blood vessel or the space around the spinal cord.',
  ],
  [
    /\bherniat(ed|ion)\b|\bdisc bulge\b/i,
    'Disc bulge / herniation',
    'Part of the cushion between spine bones pushing out from its usual place.',
  ],
  [
    /\bhyperintens/i,
    'Hyperintense',
    'Brighter than the surrounding tissue on an MRI image.',
  ],
  [
    /\bhypointens/i,
    'Hypointense',
    'Darker than the surrounding tissue on an MRI image.',
  ],
  [
    /\bhypoechoic\b/i,
    'Hypoechoic',
    'Darker than the surrounding tissue on an ultrasound.',
  ],
  [
    /\bhyperechoic\b/i,
    'Hyperechoic',
    'Brighter than the surrounding tissue on an ultrasound.',
  ],
  [
    /\benhanc(ing|ement)\b/i,
    'Enhancement',
    'An area that brightens after contrast dye is given.',
  ],
  [
    /\bcontrast\b/i,
    'Contrast',
    'A dye given during some scans so certain tissues show up more clearly.',
  ],
  [/\bbilateral\b/i, 'Bilateral', 'On both sides of the body.'],
  [
    /\bbenign\b/i,
    'Benign',
    'Not cancer. The radiologist uses it about a specific area, not your whole health.',
  ],
  [
    /\bincidental\b/i,
    'Incidental',
    'Found by chance while looking at something else.',
  ],
  [
    /\bcorrelat(e|ion)\b/i,
    'Clinical correlation',
    'The radiologist is asking your doctor to compare the images with your symptoms and examination.',
  ],
  [
    /\bfollow[- ]?up\b/i,
    'Follow-up imaging',
    'Another scan later on, usually to see whether anything has changed.',
  ],
  [
    /\bcardiomegaly\b/i,
    'Cardiomegaly',
    'The heart looks larger than usual on the image.',
  ],
  [
    /\batelecta/i,
    'Atelectasis',
    'Part of the lung that has partly collapsed or isn’t fully filled with air.',
  ],
  [/\bhepatomegaly\b/i, 'Hepatomegaly', 'The liver looks larger than usual.'],
  [/\bsplenomegaly\b/i, 'Splenomegaly', 'The spleen looks larger than usual.'],
  [
    /\bfatty (liver|infiltration)\b|\bsteatosis\b/i,
    'Fatty liver',
    'Extra fat in the liver, seen on the images.',
  ],
];

const HEADINGS =
  /^(?:\s*)(findings|impression|conclusion|opinion|summary|comments?)\s*[:\-]?\s*$/i;
const INLINE_HEADING =
  /^(?:\s*)(findings|impression|conclusion|opinion)\s*[:\-]\s*(.+)$/i;

/** The report's sections by heading (FINDINGS, IMPRESSION…), in their own words. */
export function reportSections(text: string): Record<string, string> {
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const inline = INLINE_HEADING.exec(line);
    const heading = HEADINGS.exec(line);
    if (heading) {
      current = heading[1].toLowerCase();
      out[current] ??= [];
      continue;
    }
    if (inline) {
      current = inline[1].toLowerCase();
      (out[current] ??= []).push(inline[2]);
      continue;
    }
    if (current) out[current].push(line);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [
      k,
      v.join(' ').replace(/\s+/g, ' ').trim(),
    ]),
  );
}

export function measurementsIn(text: string): string[] {
  const seen = new Set<string>();
  const re =
    /(\d+(?:\.\d+)?)\s?(?:x|×)\s?(\d+(?:\.\d+)?)\s?(mm|cm)\b|(\d+(?:\.\d+)?)\s?(mm|cm)\b/gi;
  for (const m of text.matchAll(re)) {
    const s = m[1]
      ? `${m[1]} × ${m[2]} ${m[3].toLowerCase()}`
      : `${m[4]} ${m[5].toLowerCase()}`;
    seen.add(s);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export function explainScan(i: ScanExplainInput): ScanExplanation {
  const text = i.reportText ?? '';
  const textRead = text.trim().length > 20;
  const name = i.procedureType?.trim() || 'scan';
  const when = i.date
    ? i.date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const sections: ScanExplanation['sections'] = [];

  sections.push({
    heading: 'What this is',
    body: `Your ${name}${i.providerName ? ` from ${i.providerName}` : ''}${when ? `, dated ${when}` : ''}. A radiologist looked at the images and wrote this report for your doctor.`,
  });

  const parts = textRead ? reportSections(text) : {};
  const conclusion =
    parts.impression || parts.conclusion || parts.opinion || parts.summary;
  if (conclusion) {
    sections.push({
      heading: 'The radiologist’s conclusion, in their words',
      body: clip(conclusion, 900),
      quoted: true,
    });
  } else if (textRead) {
    sections.push({
      heading: 'The radiologist’s conclusion',
      body: 'This report has no section headed “Impression” or “Conclusion”. The whole report is in your vault; your doctor can take you through it.',
    });
  } else {
    sections.push({
      heading: 'We couldn’t read this report',
      body: 'The file is a photo or scanned image without readable text yet, so there is nothing to explain from it. Open the report itself, or ask your doctor to go through it with you.',
    });
  }

  if (i.note) {
    const lines = [
      i.note.assessment && `Assessment: ${clip(i.note.assessment.trim(), 400)}`,
      i.note.plan && `Plan: ${clip(i.note.plan.trim(), 400)}`,
      i.note.advice && `Advice: ${clip(i.note.advice.trim(), 400)}`,
    ].filter(Boolean);
    if (lines.length)
      sections.push({
        heading: `What ${i.note.doctor} wrote after it`,
        body: lines.join('\n'),
        quoted: true,
      });
  }

  const terms = textRead
    ? IMAGING_TERMS.filter(([re]) => re.test(text))
        .map(([, term, meaning]) => ({ term, meaning }))
        .slice(0, 12)
    : [];
  const measurements = textRead ? measurementsIn(text) : [];
  if (measurements.length)
    sections.push({
      heading: 'Sizes mentioned',
      body: `The report gives these measurements: ${measurements.join(', ')}. Sizes are measured on the images and are most useful when your doctor compares them over time.`,
    });

  const questions = [
    `What does the ${name} show for me, and does it change anything?`,
    measurements.length
      ? 'Do any of these sizes need checking again later?'
      : null,
    terms.some((t) => /correlation|follow-up/i.test(t.term))
      ? 'The report mentions correlation or follow-up: what is the next step?'
      : null,
    'Is there anything I should watch for or do differently?',
  ].filter((q): q is string => !!q);

  return {
    title: `Explain my ${name}`,
    textRead,
    sections,
    terms,
    measurements,
    questions,
    sources: {
      report: textRead,
      doctorNote: i.note
        ? { doctor: i.note.doctor, date: i.note.signedAt.toISOString() }
        : null,
    },
    generatedBy: 'rules',
    disclaimer: SCAN_EXPLANATION_DISCLAIMER,
  };
}
