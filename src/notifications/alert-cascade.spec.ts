import { CASCADE_STEP_MS, nextStep } from './alert-cascade';

const t0 = new Date('2026-11-14T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('alert cascade', () => {
  it('waits 3 minutes after the push before WhatsApp, then 3 more before SMS', () => {
    const s = { createdAt: t0, read: false, pushDevices: 1 };
    expect(nextStep(s, at(CASCADE_STEP_MS - 1000))).toBeNull();
    expect(nextStep(s, at(CASCADE_STEP_MS))).toBe('whatsapp');
    const afterWa = { ...s, whatsappAt: at(CASCADE_STEP_MS) };
    expect(nextStep(afterWa, at(CASCADE_STEP_MS + 60_000))).toBeNull();
    expect(nextStep(afterWa, at(2 * CASCADE_STEP_MS))).toBe('sms');
    expect(
      nextStep(
        { ...afterWa, smsAt: at(2 * CASCADE_STEP_MS) },
        at(3 * CASCADE_STEP_MS),
      ),
    ).toBeNull();
  });

  it('goes straight to WhatsApp when there is no app to push to', () => {
    expect(
      nextStep({ createdAt: t0, read: false, pushDevices: 0 }, at(1000)),
    ).toBe('whatsapp');
  });

  it('stops as soon as the alert is read', () => {
    expect(
      nextStep(
        { createdAt: t0, read: true, pushDevices: 1 },
        at(10 * CASCADE_STEP_MS),
      ),
    ).toBeNull();
  });
});
