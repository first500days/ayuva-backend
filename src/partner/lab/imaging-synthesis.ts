/**
 * Imaging + laboratory support alerts for the viewer's sidebar. Rules put a
 * study next to the patient's lab results from around the same time (and the
 * measurements drawn on the images) and point out what a reporting clinician
 * would want to see together: a raised D-dimer beside a chest CT, poor kidney
 * function before a contrast study, a raised tumour marker beside a measured
 * lesion. Supportive cues only: they never state a diagnosis.
 */

export type Region =
  'cardiac' | 'head' | 'chest' | 'abdomen' | 'pelvis' | 'spine_msk' | 'general';

export const REGION_LABEL: Record<Region, string> = {
  cardiac: 'cardiac',
  head: 'head / brain',
  chest: 'chest',
  abdomen: 'abdomen',
  pelvis: 'pelvis',
  spine_msk: 'spine / musculoskeletal',
  general: 'general',
};

/** First match wins, so the more specific regions come first. */
const REGION_WORDS: [Region, RegExp][] = [
  ['cardiac', /cardiac|coronary|heart|echo(cardio)?|calcium scor/i],
  ['head', /brain|head|skull|cranial|orbit|sinus|neuro|\bihc\b/i],
  ['chest', /chest|thora|lung|pulmon|ctpa|hrct|\bcxr\b|mediastin|pleura/i],
  [
    'abdomen',
    /abdom|liver|hepat|kidney|renal|\bkub\b|pancrea|gall|biliar|spleen|mrcp|bowel|appendi/i,
  ],
  ['pelvis', /pelvi|uter|ovar|prostat|obstet|f(o)?etal|bladder|\btvs\b|scrot/i],
  [
    'spine_msk',
    /spine|spinal|lumbar|dorsal|cervical|knee|shoulder|hip|joint|bone|fracture|dexa|wrist|ankle/i,
  ],
];

export function regionOf(texts: (string | null | undefined)[]): Region {
  const text = texts.filter(Boolean).join(' ');
  return REGION_WORDS.find(([, rx]) => rx.test(text))?.[0] ?? 'general';
}

interface PanelRule {
  match: RegExp;
  why: string;
}

const WBC = /\b(wbc|tlc)\b|white (blood )?cell|total leu[ck]ocyte|neutrophil/i;
const CRP = /\bcrp\b|c[\s-]?reactive|procalcitonin|\besr\b/i;
const HB = /h(a)?emoglobin|\bhb\b|\bhgb\b/i;

/** Which tests matter for which region, and why a clinician reading the images would want them. */
export const PANELS: Record<Region, PanelRule[]> = {
  cardiac: [
    { match: /troponin|ck[\s-]?mb/i, why: 'a cardiac injury marker' },
    {
      match: /\bbnp\b|nt[\s-]?pro[\s-]?bnp/i,
      why: 'a heart-failure marker — compare with chamber size and effusions',
    },
    {
      match: /cholesterol|\bldl\b|triglycer/i,
      why: 'part of the cardiovascular risk picture',
    },
    { match: HB, why: 'anaemia can worsen cardiac symptoms' },
  ],
  head: [
    {
      match: /sodium|\bna\b/i,
      why: 'sodium imbalance can cause neurological signs',
    },
    {
      match: /glucose|\brbs\b|\bfbs\b/i,
      why: 'glucose extremes can mimic or worsen neurological findings',
    },
    {
      match: /\binr\b|prothrombin|\bpt\b|platelet/i,
      why: 'clotting and platelets matter where bleeding is a question',
    },
    { match: HB, why: 'anaemia' },
  ],
  chest: [
    {
      match: /d[\s-]?dimer/i,
      why: 'a raised D-dimer keeps pulmonary embolism in the question',
    },
    { match: /troponin|ck[\s-]?mb/i, why: 'a cardiac injury marker' },
    {
      match: /\bbnp\b|nt[\s-]?pro[\s-]?bnp/i,
      why: 'a heart-failure marker — compare with cardiac size and pleural fluid',
    },
    { match: WBC, why: 'points to infection or inflammation' },
    { match: CRP, why: 'points to infection or inflammation' },
    { match: HB, why: 'anaemia' },
  ],
  abdomen: [
    {
      match: /\b(alt|ast|sgpt|sgot|alp|ggt)\b|bilirubin|alkaline phosph/i,
      why: 'liver and biliary tests',
    },
    { match: /lipase|amylase/i, why: 'pancreatic enzymes' },
    { match: WBC, why: 'points to infection or inflammation' },
    { match: CRP, why: 'points to infection or inflammation' },
    { match: HB, why: 'anaemia or bleeding' },
  ],
  pelvis: [
    {
      match: /hcg/i,
      why: 'pregnancy status matters for imaging and treatment choices',
    },
    {
      match: /ca[\s-]?125/i,
      why: 'a marker sometimes raised with ovarian disease',
    },
    { match: /\bpsa\b|prostate specific/i, why: 'a prostate marker' },
    { match: WBC, why: 'points to infection or inflammation' },
    { match: HB, why: 'anaemia or bleeding' },
  ],
  spine_msk: [
    { match: CRP, why: 'inflammation or infection near bone or joints' },
    { match: WBC, why: 'points to infection' },
    {
      match: /calcium|vitamin d|25[\s-]?oh|alkaline phosph|\balp\b/i,
      why: 'bone metabolism',
    },
    { match: /uric acid|urate/i, why: 'relevant to joint findings' },
  ],
  general: [
    { match: WBC, why: 'points to infection or inflammation' },
    { match: CRP, why: 'points to infection or inflammation' },
    { match: HB, why: 'anaemia' },
  ],
};

const KIDNEY = /creatinine|egfr|\burea\b|\bbun\b/i;
const TUMOUR_MARKER =
  /\bcea\b|ca[\s-]?125|ca[\s-]?19[\s-]?9|\bpsa\b|\bafp\b|alpha[\s-]?feto/i;
const ABNORMAL = new Set([
  'low',
  'high',
  'critical_low',
  'critical_high',
  'abnormal',
]);
const FLAG_LABEL: Record<string, string> = {
  low: 'below range',
  high: 'above range',
  critical_low: 'critically low',
  critical_high: 'critically high',
  abnormal: 'abnormal',
};

export interface LabPoint {
  test: string;
  name: string;
  value: string;
  unit?: string | null;
  flag: string;
  at: Date;
}

export interface Measurement {
  tool: string;
  value: string;
}

export interface SynthesisAlert {
  level: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  sources: string[];
}

export interface Synthesis {
  region: Region;
  regionLabel: string;
  alerts: SynthesisAlert[];
  /** The related results that were looked at, newest first. */
  related: (LabPoint & { why: string; daysFromStudy: number })[];
  windowDays: number;
}

const DAY = 24 * 60 * 60 * 1000;

const when = (days: number) =>
  days === 0
    ? 'the same day as'
    : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days < 0 ? 'before' : 'after'}`;

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** Longest length drawn on the images, in mm ("23.4 mm", "2.1 cm"). */
export function longestLengthMm(measurements: Measurement[]): number | null {
  let best: number | null = null;
  for (const m of measurements) {
    const hit = /(\d+(?:\.\d+)?)\s*(mm|cm)\b/i.exec(m.value);
    if (!hit) continue;
    const mm = Number(hit[1]) * (hit[2].toLowerCase() === 'cm' ? 10 : 1);
    if (best === null || mm > best) best = mm;
  }
  return best;
}

export function synthesise(input: {
  region: Region;
  modality: string | null;
  studyAt: Date;
  studyLabel: string;
  labs: LabPoint[];
  measurements: Measurement[];
  windowDays?: number;
}): Synthesis {
  const windowDays = input.windowDays ?? 30;
  const rules = PANELS[input.region];
  const contrast = /^(CT|MR)$/i.test(input.modality ?? '');
  const days = (l: LabPoint) =>
    Math.round((l.at.getTime() - input.studyAt.getTime()) / DAY);
  const near = input.labs.filter((l) => Math.abs(days(l)) <= windowDays);
  const why = (l: LabPoint): string | null => {
    const label = `${l.test} ${l.name}`;
    const rule = rules.find((r) => r.match.test(label));
    if (rule) return rule.why;
    if (contrast && KIDNEY.test(label))
      return 'kidney function, which matters for contrast';
    if (TUMOUR_MARKER.test(label)) return 'a tumour marker';
    return null;
  };
  const related = near
    .map((l) => ({ ...l, why: why(l), daysFromStudy: days(l) }))
    .filter(
      (l): l is LabPoint & { why: string; daysFromStudy: number } =>
        l.why !== null,
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const alerts: SynthesisAlert[] = [];
  const seen = new Set<string>();
  for (const l of related) {
    if (!ABNORMAL.has(l.flag)) continue;
    const key = `${l.name.toLowerCase()}`;
    if (seen.has(key)) continue; // newest result per test only
    seen.add(key);
    alerts.push({
      level: l.flag.startsWith('critical') ? 'critical' : 'warning',
      title: `${l.name} ${l.value}${l.unit ? ` ${l.unit}` : ''} — ${FLAG_LABEL[l.flag] ?? l.flag}`,
      detail: `${capital(l.why)}. Taken ${when(l.daysFromStudy)} this ${input.modality ?? 'imaging'} ${REGION_LABEL[input.region]} study.`,
      sources: [`${l.test} · ${fmt(l.at)}`, input.studyLabel],
    });
  }

  if (contrast) {
    const kidney = related.find(
      (l) => KIDNEY.test(`${l.test} ${l.name}`) && ABNORMAL.has(l.flag),
    );
    if (kidney)
      alerts.unshift({
        level: 'warning',
        title: 'Kidney function is outside range — check contrast safety',
        detail: `${kidney.name} ${kidney.value}${kidney.unit ? ` ${kidney.unit}` : ''} (${fmt(kidney.at)}). Review before any ${/^MR$/i.test(input.modality ?? '') ? 'gadolinium' : 'iodinated'} contrast.`,
        sources: [`${kidney.test} · ${fmt(kidney.at)}`],
      });
  }

  const lesion = longestLengthMm(input.measurements);
  const marker = related.find(
    (l) => TUMOUR_MARKER.test(`${l.test} ${l.name}`) && ABNORMAL.has(l.flag),
  );
  if (lesion !== null && lesion >= 10 && marker)
    alerts.unshift({
      level: 'warning',
      title: `Measured ${round(lesion)} mm on the images with a raised ${marker.name}`,
      detail: `${marker.name} ${marker.value}${marker.unit ? ` ${marker.unit}` : ''} (${fmt(marker.at)}). Worth reading the measurement and the marker together in the report.`,
      sources: [
        'Measurement on this study',
        `${marker.test} · ${fmt(marker.at)}`,
      ],
    });

  // A critical value of any kind close to the study is always worth showing.
  for (const l of near) {
    if (!l.flag.startsWith('critical') || Math.abs(days(l)) > 7) continue;
    if (seen.has(l.name.toLowerCase())) continue;
    seen.add(l.name.toLowerCase());
    alerts.unshift({
      level: 'critical',
      title: `Critical value: ${l.name} ${l.value}${l.unit ? ` ${l.unit}` : ''}`,
      detail: `Reported ${when(days(l))} this study.`,
      sources: [`${l.test} · ${fmt(l.at)}`],
    });
  }

  if (!alerts.length)
    alerts.push({
      level: 'info',
      title: related.length
        ? 'No out-of-range results among the related tests'
        : near.length
          ? 'None of the nearby results relate to this study'
          : `No lab results within ${windowDays} days of this study`,
      detail: related.length
        ? `Checked ${[...new Set(related.map((l) => l.name))].slice(0, 8).join(', ')} within ${windowDays} days of the study.`
        : 'Only results from orders your organisation can see are included.',
      sources: [input.studyLabel],
    });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return {
    region: input.region,
    regionLabel: REGION_LABEL[input.region],
    alerts,
    related,
    windowDays,
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round = (n: number) => Math.round(n * 10) / 10;
