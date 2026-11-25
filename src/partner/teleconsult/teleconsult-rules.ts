/**
 * Telemedicine Practice Guidelines (India, 2020), "Prohibited List": a
 * prescription from a video consultation may not include medicines in
 * Schedule X of the Drugs and Cosmetics Rules, or narcotic / psychotropic
 * substances under the NDPS Act, 1985.
 *
 * A starter list of generic names, matched as whole words in the medicine
 * line. It needs review by the client's clinical lead before go-live.
 */
export const TELECONSULT_PROHIBITED: readonly string[] = [
  // Schedule X
  'amobarbital',
  'amphetamine',
  'barbital',
  'cyclobarbital',
  'dexamphetamine',
  'dextroamphetamine',
  'ethchlorvynol',
  'glutethimide',
  'meprobamate',
  'methamphetamine',
  'methylphenidate',
  'methylphenobarbital',
  'pentobarbital',
  'phencyclidine',
  'phenmetrazine',
  'secobarbital',
  // NDPS: opioids
  'morphine',
  'codeine',
  'fentanyl',
  'pethidine',
  'meperidine',
  'tramadol',
  'tapentadol',
  'buprenorphine',
  'methadone',
  'oxycodone',
  'hydrocodone',
  'hydromorphone',
  'pentazocine',
  'dextropropoxyphene',
  'opium',
  // NDPS: psychotropics
  'alprazolam',
  'diazepam',
  'lorazepam',
  'clonazepam',
  'chlordiazepoxide',
  'nitrazepam',
  'midazolam',
  'clobazam',
  'temazepam',
  'triazolam',
  'flunitrazepam',
  'phenobarbital',
  'ketamine',
  'dronabinol',
  'cannabis',
  'cocaine',
];

/** The medicine lines (by index) that a video consultation can't prescribe. */
export function prohibitedForTeleconsult(
  items: { medicine: string }[],
): { line: number; medicine: string; matched: string }[] {
  const out: { line: number; medicine: string; matched: string }[] = [];
  items.forEach((it, line) => {
    const text = it.medicine.toLowerCase();
    const matched = TELECONSULT_PROHIBITED.find((name) =>
      new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(text),
    );
    if (matched) out.push({ line, medicine: it.medicine, matched });
  });
  return out;
}
