import { ConfigService } from '@nestjs/config';
import {
  TotpService,
  base32Decode,
  base32Encode,
  currentStep,
  totpCode,
  verifyTotp,
} from './totp.service';

// RFC 6238 appendix B: the SHA-1 seed "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it('round-trips base32', () => {
    const bytes = Buffer.from('any secret bytes!');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC test vector at T=%i', (seconds, code) => {
    expect(totpCode(RFC_SECRET, currentStep(seconds * 1000))).toBe(code);
  });

  it('accepts the current code and one step of clock drift', () => {
    const now = 1234567890 * 1000;
    const step = currentStep(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), undefined, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), undefined, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 3), undefined, now)).toBeNull();
  });

  it('refuses a replayed code', () => {
    const now = 1234567890 * 1000;
    const step = currentStep(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), step, now)).toBeNull();
  });

  it('refuses malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull();
  });
});

describe('TotpService', () => {
  const config = { get: () => '4f8d9a2e1c6b7f3a5d0e8c4b2a9f6d1e3c7b5a8f0d2e4c6b8a1f3d5e7c9b0a2d' };
  const service = new TotpService(config as unknown as ConfigService);

  it('encrypts secrets at rest and decrypts them back', () => {
    const secret = service.generateSecret();
    const sealed = service.encrypt(secret);
    expect(sealed).not.toContain(secret);
    expect(service.decrypt(sealed)).toBe(secret);
  });

  it('builds an otpauth link authenticator apps can scan', () => {
    const url = service.otpauthUrl('JBSWY3DPEHPK3PXP', 'admin@ayuva.health');
    expect(url).toMatch(/^otpauth:\/\/totp\/AYUVA%20Admin%3Aadmin%40ayuva\.health\?/);
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('issuer=AYUVA+Admin');
  });
});
