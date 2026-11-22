import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * The patient's registration QR: name, time zone and emergency contact,
 * sealed with AES-256-GCM (encrypted and tamper-evident) under a server key,
 * valid for 10 minutes. Only an AYUVA partner signed in to the Partner Portal
 * can open it (the server does, on scan); the QR itself reveals nothing.
 */

export const INTAKE_PREFIX = 'AYV1.';
export const INTAKE_TTL_MS = 10 * 60_000;

export interface IntakePayload {
  uid: string;
  name: string;
  tz: string | null;
  ec: { name: string; phone: string } | null;
  /** Expiry, epoch ms. */
  exp: number;
}

const keyFrom = (secret: string) =>
  createHash('sha256').update(`ayuva-intake-qr:${secret}`).digest();

const b64url = (b: Buffer) => b.toString('base64url');

export function sealIntake(payload: IntakePayload, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return `${INTAKE_PREFIX}${b64url(Buffer.concat([iv, cipher.getAuthTag(), body]))}`;
}

export type OpenResult =
  | { ok: true; payload: IntakePayload }
  | { ok: false; reason: 'malformed' | 'tampered' | 'expired' };

export function openIntake(
  code: string,
  secret: string,
  now = Date.now(),
): OpenResult {
  const raw = (code ?? '').trim();
  if (!raw.startsWith(INTAKE_PREFIX)) return { ok: false, reason: 'malformed' };
  let buf: Buffer;
  try {
    buf = Buffer.from(raw.slice(INTAKE_PREFIX.length), 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (buf.length < 12 + 16 + 2) return { ok: false, reason: 'malformed' };
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFrom(secret),
      buf.subarray(0, 12),
    );
    decipher.setAuthTag(buf.subarray(12, 28));
    const text = Buffer.concat([
      decipher.update(buf.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
    const payload = JSON.parse(text) as IntakePayload;
    if (!payload?.uid || typeof payload.exp !== 'number')
      return { ok: false, reason: 'malformed' };
    if (payload.exp < now) return { ok: false, reason: 'expired' };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'tampered' };
  }
}

/** An IANA zone the runtime knows, or null. */
export function validZone(tz: string | undefined | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}
