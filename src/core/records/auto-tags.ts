/**
 * Tags filled in automatically when a document is filed, from what was read
 * off it (facility, doctor, what the document is, the year), so the vault can
 * be searched and grouped without the patient typing anything. Tags are
 * lower-case, short and unique; the patient can still edit them.
 */

const MAX_TAGS = 8;
const MAX_LEN = 40;

function clean(s: string | undefined | null): string | null {
  const t = (s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} .&'/-]/gu, '')
    .trim()
    .toLowerCase();
  return t && t.length <= MAX_LEN ? t : t ? t.slice(0, MAX_LEN).trim() : null;
}

export function autoTags(input: {
  existing?: string[];
  providerName?: string;
  attendingPhysician?: string;
  procedureType?: string;
  recordDate?: Date;
}): string[] {
  const doctor = clean(input.attendingPhysician);
  const tags = [
    ...(input.existing ?? []),
    clean(input.providerName),
    doctor ? (doctor.startsWith('dr') ? doctor : `dr ${doctor}`) : null,
    clean(input.procedureType),
    input.recordDate && !Number.isNaN(input.recordDate.getTime())
      ? String(input.recordDate.getUTCFullYear())
      : null,
  ].filter((t): t is string => !!t);
  return [...new Set(tags.map((t) => t.toLowerCase()))].slice(0, MAX_TAGS);
}
