import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import * as QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
// Accept the previous and next 30s step too, for clock drift between phone and server.
const DRIFT_STEPS = 1;
const SECRET_BYTES = 20;
const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (HMAC-SHA1, 30s, 6 digits) — what Google/Microsoft Authenticator expect. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/**
 * The time step a code matches (within the drift window), or null. Steps at
 * or before `lastUsedStep` are refused so a code can't be replayed.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastUsedStep?: number,
  now = Date.now(),
): number | null {
  const candidate = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(candidate)) return null;
  const step = currentStep(now);
  for (let s = step - DRIFT_STEPS; s <= step + DRIFT_STEPS; s++) {
    if (lastUsedStep !== undefined && s <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secret, s));
    if (timingSafeEqual(expected, Buffer.from(candidate))) return s;
  }
  return null;
}

/** Authenticator secrets for admin sign-in, encrypted at rest. */
@Injectable()
export class TotpService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    // The platform's at-rest key (32 bytes hex), as used for record files.
    this.key = Buffer.from(config.get<string>('storage.encryptionKey')!, 'hex');
  }

  generateSecret(): string {
    return base32Encode(randomBytes(SECRET_BYTES));
  }

  /** otpauth:// link an authenticator app reads from the enrolment QR code. */
  otpauthUrl(secret: string, accountEmail: string): string {
    const issuer = 'AYUVA Admin';
    const label = encodeURIComponent(`${issuer}:${accountEmail}`);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(DIGITS),
      period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /**
   * The enrolment QR code as SVG markup. Rendered here so the secret never
   * goes to a third-party QR service and the admin panel needs no QR library.
   */
  qrSvg(otpauthUrl: string): Promise<string> {
    return QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  }

  encrypt(secret: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv(CIPHER, this.key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + 16));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + 16)),
      decipher.final(),
    ]).toString('utf8');
  }
}
