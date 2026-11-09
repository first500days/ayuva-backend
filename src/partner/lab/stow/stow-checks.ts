import * as dicomParser from 'dicom-parser';

/**
 * Checks on images pushed by a scanner's gateway (STOW-RS), and the DICOM JSON
 * answer the gateway expects. Kept apart from the service so they can be
 * tested on their own.
 */

export interface PushedHeader {
  sopClassUid: string | null;
  sopInstanceUid: string | null;
  studyUid: string | null;
  accession: string | null;
  patientName: string | null;
  /** YYYYMMDD */
  birthDate: string | null;
}

const PIXEL_DATA = 'x7fe00010';

/** The identifiers that decide where an image goes; null if the bytes aren't DICOM. */
export function readPushedHeader(buffer: Buffer): PushedHeader | null {
  if (buffer.length < 132 || buffer.subarray(128, 132).toString('latin1') !== 'DICM')
    return null;
  try {
    const ds = dicomParser.parseDicom(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      { untilTag: PIXEL_DATA },
    );
    const s = (tag: string) => ds.string(tag)?.trim() || null;
    return {
      sopClassUid: s('x00080016'),
      sopInstanceUid: s('x00080018'),
      studyUid: s('x0020000d'),
      accession: s('x00080050'),
      patientName: s('x00100010'),
      birthDate: s('x00100030'),
    };
  } catch {
    return null;
  }
}

/** Words of a name, from DICOM "KHAN^FARAH^A" or "Farah A. Khan" alike, any script. */
function nameWords(name: string): string[] {
  // A DICOM name may carry ideographic and phonetic forms after "=".
  const first = name.split('=')[0] ?? '';
  return first
    .toLowerCase()
    .split(/[\^\s,.'’-]+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 1);
}

/** "19680214" from a stored date of birth. */
export function dicomDate(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export type PatientCheck = 'match' | 'mismatch' | 'unknown';

/**
 * Whether the scan is of the order's patient. A typo in an accession number
 * must not put one person's scan on another's order, so a doubtful match is
 * refused, not attached.
 */
export function checkPatient(
  scan: { name: string | null; birthDate: string | null },
  order: { name: string; birthDate: string | null },
): PatientCheck {
  if (scan.birthDate && order.birthDate && scan.birthDate !== order.birthDate)
    return 'mismatch';
  const a = scan.name ? nameWords(scan.name) : [];
  const b = nameWords(order.name);
  if (!a.length || !b.length) return 'unknown';
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const bigSet = new Set(big);
  if (!small.every((w) => bigSet.has(w))) return 'mismatch';
  // One shared word ("Kumar") is only enough when the birth date confirms it.
  const datesAgree = !!scan.birthDate && scan.birthDate === order.birthDate;
  return small.length >= 2 || big.length === 1 || datesAgree ? 'match' : 'unknown';
}

/** DICOM failure reasons (PS3.4 Annex GG). */
export const FAILURE = {
  PROCESSING: 0x0110,
  CANNOT_UNDERSTAND: 0xc000,
  OUT_OF_RESOURCES: 0xa700,
} as const;

export interface StowOutcome {
  stored: { sopClassUid: string | null; sopInstanceUid: string | null }[];
  failed: {
    sopClassUid: string | null;
    sopInstanceUid: string | null;
    reason: number;
  }[];
}

const uid = (v: string | null) => (v ? { vr: 'UI', Value: [v] } : { vr: 'UI' });

/** The STOW-RS reply: what was kept and what wasn't, so the gateway can show failures. */
export function stowResponse(outcome: StowOutcome): {
  status: 200 | 202 | 409;
  body: Record<string, unknown>;
} {
  const body: Record<string, unknown> = {};
  if (outcome.stored.length)
    body['00081199'] = {
      vr: 'SQ',
      Value: outcome.stored.map((s) => ({
        '00081150': uid(s.sopClassUid),
        '00081155': uid(s.sopInstanceUid),
      })),
    };
  if (outcome.failed.length)
    body['00081198'] = {
      vr: 'SQ',
      Value: outcome.failed.map((f) => ({
        '00081150': uid(f.sopClassUid),
        '00081155': uid(f.sopInstanceUid),
        '00081197': { vr: 'US', Value: [f.reason] },
      })),
    };
  const status = !outcome.failed.length ? 200 : outcome.stored.length ? 202 : 409;
  return { status, body };
}
