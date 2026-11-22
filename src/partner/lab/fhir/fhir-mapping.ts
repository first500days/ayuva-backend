/**
 * Reads FHIR R4 search results (DiagnosticReport and Observation) into the
 * plain shape the Report Builder works with. Hospital systems vary a lot, so
 * every field is optional here and anything unusable is simply left out.
 */

type Json = Record<string, unknown>;

export interface FhirValue {
  /** LOINC or the hospital's own code. */
  code: string | null;
  name: string;
  value: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: string | null;
  effectiveAt: string | null;
}

export interface FhirReport {
  id: string;
  status: string | null;
  name: string;
  issuedAt: string | null;
  effectiveAt: string | null;
  conclusion: string | null;
  performer: string | null;
  values: FhirValue[];
}

const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;
const list = (v: unknown): Json[] =>
  Array.isArray(v) ? (v.map(obj).filter(Boolean) as Json[]) : [];
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function concept(v: unknown): { code: string | null; name: string | null } {
  const c = obj(v);
  const coding = list(c?.coding)[0];
  return {
    code: text(coding?.code),
    name: text(c?.text) ?? text(coding?.display) ?? text(coding?.code),
  };
}

function quantity(v: unknown): { value: string; unit: string | null } | null {
  const q = obj(v);
  const n = num(q?.value);
  if (n === null) return null;
  return {
    value: `${text(q?.comparator) ?? ''}${n}`,
    unit: text(q?.unit) ?? text(q?.code),
  };
}

function valueOf(r: Json): { value: string; unit: string | null } | null {
  const q = quantity(r.valueQuantity);
  if (q) return q;
  const plain =
    text(r.valueString) ??
    concept(r.valueCodeableConcept).name ??
    text(r.valueDateTime) ??
    text(r.valueTime);
  if (plain) return { value: plain, unit: null };
  const n = num(r.valueInteger);
  if (n !== null) return { value: String(n), unit: null };
  if (typeof r.valueBoolean === 'boolean')
    return { value: r.valueBoolean ? 'Yes' : 'No', unit: null };
  return null;
}

function refRange(r: Json) {
  const range = list(r.referenceRange)[0];
  return {
    refLow: num(obj(range?.low)?.value),
    refHigh: num(obj(range?.high)?.value),
    refText: text(range?.text),
  };
}

const flagOf = (r: Json) => {
  const c = concept(list(r.interpretation)[0]);
  return c.code ?? c.name;
};

/** One observation gives one value, or several when it has components (blood pressure, panels). */
export function mapObservation(obs: Json): FhirValue[] {
  const when = text(obs.effectiveDateTime) ?? text(obs.issued);
  const base = concept(obs.code);
  const parts: FhirValue[] = [];
  const own = valueOf(obs);
  if (own && base.name) {
    parts.push({
      code: base.code,
      name: base.name,
      ...own,
      ...refRange(obs),
      flag: flagOf(obs),
      effectiveAt: when,
    });
  }
  for (const c of list(obs.component)) {
    const label = concept(c.code);
    const v = valueOf(c);
    if (!v || !label.name) continue;
    parts.push({
      code: label.code,
      name: label.name,
      ...v,
      ...refRange(c),
      flag: flagOf(c),
      effectiveAt: when,
    });
  }
  return parts;
}

/** Every resource in a search Bundle, keyed so that references can find them. */
export function indexBundle(bundle: unknown): {
  resources: Json[];
  byReference: Map<string, Json>;
} {
  const resources: Json[] = [];
  const byReference = new Map<string, Json>();
  for (const entry of list(obj(bundle)?.entry)) {
    const res = obj(entry.resource);
    if (!res) continue;
    resources.push(res);
    const key = `${String(res.resourceType)}/${String(res.id)}`;
    byReference.set(key, res);
    const full = text(entry.fullUrl);
    if (full) byReference.set(full, res);
  }
  return { resources, byReference };
}

/** "Observation/1", ".../fhir/Observation/1", or "#c1" for a resource contained in the report. */
function resolve(
  reference: string,
  owner: Json,
  byReference: Map<string, Json>,
): Json | undefined {
  if (reference.startsWith('#'))
    return list(owner.contained).find((c) => `#${String(c.id)}` === reference);
  const direct = byReference.get(reference);
  if (direct) return direct;
  const tail = /([A-Za-z]+\/[^/]+)$/.exec(reference.split('?')[0])?.[1];
  return tail ? byReference.get(tail) : undefined;
}

function plainTextForm(report: Json): string | null {
  for (const form of list(report.presentedForm)) {
    const type = text(form.contentType) ?? '';
    const data = text(form.data);
    if (data && type.startsWith('text/plain'))
      return Buffer.from(data, 'base64').toString('utf8').trim() || null;
  }
  return null;
}

export function mapReports(bundle: unknown): FhirReport[] {
  const { resources, byReference } = indexBundle(bundle);
  return resources
    .filter((r) => r.resourceType === 'DiagnosticReport')
    .map((r): FhirReport => {
      const values = list(r.result).flatMap((ref) => {
        const target = text(ref.reference);
        const obs = target ? resolve(target, r, byReference) : undefined;
        return obs?.resourceType === 'Observation' ? mapObservation(obs) : [];
      });
      return {
        id: String(r.id ?? ''),
        status: text(r.status),
        name: concept(r.code).name ?? 'Diagnostic report',
        issuedAt: text(r.issued),
        effectiveAt: text(r.effectiveDateTime),
        conclusion: text(r.conclusion) ?? plainTextForm(r),
        performer: text(list(r.performer)[0]?.display),
        values,
      };
    });
}

export function mapObservations(bundle: unknown): FhirValue[] {
  return indexBundle(bundle)
    .resources.filter((r) => r.resourceType === 'Observation')
    .flatMap(mapObservation);
}

/** The next page of a search, if the server has one. */
export function nextPage(bundle: unknown): string | null {
  const link = list(obj(bundle)?.link).find((l) => l.relation === 'next');
  return text(link?.url);
}
