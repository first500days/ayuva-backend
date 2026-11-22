import {
  describe,
  type LabKey,
  type LabPanel,
  type Reading,
} from './lab-panel';
import type { SafetyWarning, Severity } from './rx-safety';

/**
 * Organ-function checks on a prescription against the patient's recent labs:
 * kidney (eGFR), potassium, liver enzymes, INR and platelets. Thresholds come
 * from product labelling and KDIGO/BNF guidance. They are a starter set that
 * still needs review by the client's clinical lead, and they warn; the doctor
 * decides.
 */

/** How old a value may be and still be acted on. */
const MAX_AGE_DAYS: Partial<Record<LabKey, number>> = {
  egfr: 90,
  alt: 90,
  ast: 90,
  bilirubin: 90,
  platelets: 90,
  potassium: 30,
  inr: 30,
};

type Hit = { severity: Severity; key: LabKey; message: string };
type Panel = Partial<Record<LabKey, Reading>>;

interface Rule {
  /** A drug class or ingredient. */
  on: string;
  /** Skip lines whose only matching ingredient is this one (low-dose aspirin isn't an NSAID risk here). */
  except?: string;
  check: (p: Panel) => Hit | null;
}

const egfrBelow =
  (limits: [number, Severity, string][]) =>
  (p: Panel): Hit | null => {
    const e = p.egfr?.value;
    if (e === undefined) return null;
    for (const [limit, severity, message] of limits)
      if (e < limit) return { severity, key: 'egfr', message };
    return null;
  };

/** Above this multiple of the upper normal limit (40 U/L if the lab didn't print one). */
const transaminases =
  (multiple: number, severity: Severity, message: string) =>
  (p: Panel): Hit | null => {
    for (const key of ['alt', 'ast'] as const) {
      const r = p[key];
      if (r && r.value > multiple * (r.refHigh ?? 40))
        return { severity, key, message };
    }
    return null;
  };

const potassiumAtLeast =
  (limits: [number, Severity, string][]) =>
  (p: Panel): Hit | null => {
    const k = p.potassium?.value;
    if (k === undefined) return null;
    for (const [limit, severity, message] of limits)
      if (k >= limit) return { severity, key: 'potassium', message };
    return null;
  };

const potassiumAtMost =
  (limit: number, severity: Severity, message: string) =>
  (p: Panel): Hit | null =>
    p.potassium && p.potassium.value <= limit
      ? { severity, key: 'potassium', message }
      : null;

const plateletsBelow =
  (limit: number, severity: Severity, message: string) =>
  (p: Panel): Hit | null =>
    p.platelets && p.platelets.value < limit
      ? { severity, key: 'platelets', message }
      : null;

const HYPERKALAEMIA = 'hyperkalaemia; hold or review before prescribing.';

const RULES: Rule[] = [
  // Kidney
  {
    on: 'metformin',
    check: egfrBelow([
      [
        30,
        'contraindicated',
        'contraindicated below eGFR 30 (lactic acidosis).',
      ],
      [
        45,
        'major',
        'do not start below eGFR 45; review the dose if already taking it.',
      ],
    ]),
  },
  {
    on: 'nsaid',
    except: 'aspirin',
    check: egfrBelow([
      [30, 'major', 'avoid NSAIDs below eGFR 30 (further kidney injury).'],
      [60, 'moderate', 'prolonged NSAID use is not advised below eGFR 60.'],
    ]),
  },
  {
    on: 'k_sparing',
    check: egfrBelow([[30, 'major', 'avoid below eGFR 30 (hyperkalaemia).']]),
  },
  {
    on: 'nitrofurantoin',
    check: egfrBelow([
      [30, 'major', 'avoid below eGFR 30: ineffective, with more toxicity.'],
      [45, 'moderate', 'use with caution below eGFR 45.'],
    ]),
  },
  {
    on: 'dabigatran',
    check: egfrBelow([
      [30, 'major', 'avoid below eGFR 30 (accumulation, bleeding).'],
    ]),
  },
  {
    on: 'rivaroxaban',
    check: egfrBelow([
      [15, 'major', 'avoid below eGFR 15 (bleeding).'],
      [30, 'moderate', 'use with caution below eGFR 30.'],
    ]),
  },
  {
    on: 'apixaban',
    check: egfrBelow([
      [15, 'major', 'not recommended below eGFR 15 (bleeding).'],
    ]),
  },
  {
    on: 'enoxaparin',
    check: egfrBelow([[30, 'moderate', 'needs a reduced dose below eGFR 30.']]),
  },
  {
    on: 'digoxin',
    check: egfrBelow([
      [
        30,
        'moderate',
        'accumulates below eGFR 30; reduce the dose and monitor.',
      ],
    ]),
  },
  {
    on: 'lithium',
    check: egfrBelow([
      [30, 'major', 'avoid below eGFR 30 (toxicity).'],
      [60, 'moderate', 'reduce the dose and monitor levels below eGFR 60.'],
    ]),
  },
  {
    on: 'methotrexate',
    check: egfrBelow([
      [
        30,
        'contraindicated',
        'contraindicated below eGFR 30 (marrow and kidney toxicity).',
      ],
      [60, 'moderate', 'reduce the dose below eGFR 60.'],
    ]),
  },
  {
    on: 'allopurinol',
    check: egfrBelow([[30, 'moderate', 'reduce the dose below eGFR 30.']]),
  },
  {
    on: 'glibenclamide',
    check: egfrBelow([
      [30, 'major', 'avoid below eGFR 30 (prolonged hypoglycaemia).'],
    ]),
  },
  {
    on: 'sulfonylurea',
    except: 'glibenclamide',
    check: egfrBelow([
      [30, 'moderate', 'hypoglycaemia risk below eGFR 30; reduce the dose.'],
    ]),
  },
  {
    on: 'acei',
    check: egfrBelow([
      [
        30,
        'moderate',
        'monitor creatinine and potassium closely below eGFR 30.',
      ],
    ]),
  },
  {
    on: 'arb',
    check: egfrBelow([
      [
        30,
        'moderate',
        'monitor creatinine and potassium closely below eGFR 30.',
      ],
    ]),
  },
  // Potassium
  {
    on: 'k_sparing',
    check: potassiumAtLeast([
      [5.5, 'contraindicated', `contraindicated in ${HYPERKALAEMIA}`],
      [5, 'major', `risk of worsening ${HYPERKALAEMIA}`],
    ]),
  },
  {
    on: 'potassium',
    check: potassiumAtLeast([
      [5.5, 'contraindicated', `contraindicated in ${HYPERKALAEMIA}`],
      [5, 'major', `risk of worsening ${HYPERKALAEMIA}`],
    ]),
  },
  {
    on: 'acei',
    check: potassiumAtLeast([
      [5.5, 'major', `risk of worsening ${HYPERKALAEMIA}`],
    ]),
  },
  {
    on: 'arb',
    check: potassiumAtLeast([
      [5.5, 'major', `risk of worsening ${HYPERKALAEMIA}`],
    ]),
  },
  {
    on: 'digoxin',
    check: potassiumAtMost(
      3.5,
      'major',
      'low potassium raises the risk of digoxin toxicity.',
    ),
  },
  {
    on: 'qt',
    check: potassiumAtMost(
      3.5,
      'moderate',
      'low potassium adds to QT-prolongation risk; check ECG.',
    ),
  },
  // Liver
  {
    on: 'statin',
    check: transaminases(
      3,
      'major',
      'hold statins with liver enzymes above 3× the normal limit.',
    ),
  },
  {
    on: 'methotrexate',
    check: transaminases(
      3,
      'major',
      'hold methotrexate with liver enzymes above 3× the normal limit.',
    ),
  },
  {
    on: 'ketoconazole',
    check: transaminases(
      3,
      'major',
      'avoid with liver enzymes above 3× the normal limit (hepatotoxic).',
    ),
  },
  {
    on: 'amiodarone',
    check: transaminases(
      3,
      'moderate',
      'review with liver enzymes above 3× the normal limit.',
    ),
  },
  {
    on: 'paracetamol',
    check: transaminases(
      5,
      'major',
      'reduce or avoid with liver enzymes above 5× the normal limit.',
    ),
  },
  // Blood
  {
    on: 'vka',
    check: (p) =>
      p.inr && p.inr.value >= 4
        ? {
            severity: 'major',
            key: 'inr',
            message:
              'INR is above range; bleeding risk. Review before continuing.',
          }
        : null,
  },
  {
    on: 'anticoagulant',
    check: plateletsBelow(
      50,
      'major',
      'platelets below 50 — bleeding risk with anticoagulation.',
    ),
  },
  {
    on: 'antiplatelet',
    check: plateletsBelow(
      50,
      'major',
      'platelets below 50 — bleeding risk with antiplatelets.',
    ),
  },
  {
    on: 'nsaid',
    check: plateletsBelow(
      50,
      'major',
      'platelets below 50 — bleeding risk with NSAIDs.',
    ),
  },
];

/** Only values recent enough to act on. */
export function current(panel: LabPanel): Panel {
  const out: Panel = {};
  for (const [key, r] of Object.entries(panel) as [LabKey, Reading][]) {
    const max = MAX_AGE_DAYS[key];
    if (max !== undefined && r.ageDays <= max) out[key] = r;
  }
  return out;
}

export interface OrganLine {
  name: string;
  ingredients: string[];
  classes: Set<string>;
}

export function organWarnings(
  lines: OrganLine[],
  panel: LabPanel,
): SafetyWarning[] {
  const labs = current(panel);
  const warnings: SafetyWarning[] = [];
  lines.forEach((line, idx) => {
    // One warning per organ measure for a line: the most severe rule that fires.
    const best = new Map<LabKey, Hit>();
    for (const rule of RULES) {
      if (!line.classes.has(rule.on)) continue;
      if (rule.except && line.ingredients.every((i) => i === rule.except))
        continue;
      const hit = rule.check(labs);
      if (!hit) continue;
      const prior = best.get(hit.key);
      if (!prior || rank(hit.severity) < rank(prior.severity))
        best.set(hit.key, hit);
    }
    for (const hit of best.values()) {
      const reading = describe(hit.key, labs[hit.key]!);
      warnings.push({
        severity: hit.severity,
        kind: 'organ',
        lines: [idx],
        with: reading,
        message: `${line.name} — ${reading}: ${hit.message}`,
      });
    }
  });
  return warnings;
}

const rank = (s: Severity) =>
  s === 'contraindicated' ? 0 : s === 'major' ? 1 : 2;
