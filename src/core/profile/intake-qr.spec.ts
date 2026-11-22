import { INTAKE_PREFIX, openIntake, sealIntake, validZone } from './intake-qr';

const payload = {
  uid: '64b000000000000000000001',
  name: 'Asha Rao',
  tz: 'Asia/Kolkata',
  ec: { name: 'Ravi Rao', phone: '+919800000000' },
  exp: Date.now() + 60_000,
};

describe('intake QR', () => {
  it('round-trips and hides the contents', () => {
    const code = sealIntake(payload, 'secret');
    expect(code.startsWith(INTAKE_PREFIX)).toBe(true);
    expect(code).not.toContain('Asha');
    const r = openIntake(code, 'secret');
    expect(r).toEqual({ ok: true, payload });
  });

  it('refuses a code sealed with another key or changed in transit', () => {
    const code = sealIntake(payload, 'secret');
    expect(openIntake(code, 'other')).toEqual({
      ok: false,
      reason: 'tampered',
    });
    const flipped = code.slice(0, -2) + (code.endsWith('A') ? 'BB' : 'AA');
    expect(openIntake(flipped, 'secret').ok).toBe(false);
  });

  it('refuses an expired or foreign code', () => {
    expect(openIntake(sealIntake({ ...payload, exp: 1 }, 'k'), 'k')).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(openIntake('https://example.com', 'k')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('accepts only real time zones', () => {
    expect(validZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(validZone('Mars/Base')).toBeNull();
  });
});
