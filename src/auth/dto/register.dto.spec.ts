import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const VALID_BASE = {
  fullName: 'Amara Okafor',
  email: 'amara.o@example.com',
  password: 'Password123',
};

function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(RegisterDto, payload);
  return validate(dto);
}

/**
 * FR-1.5: registration must fail validation (400), not crash (500), when
 * consent is missing or any individual flag isn't explicitly accepted.
 * AuthService.register dereferences dto.consent.termsAccepted directly, so
 * an undefined consent object must never reach the service layer.
 */
describe('RegisterDto consent validation (FR-1.5)', () => {
  it('rejects when consent is omitted entirely', async () => {
    const errors = await errorsFor({ ...VALID_BASE });
    const consentError = errors.find((e) => e.property === 'consent');
    expect(consentError).toBeDefined();
  });

  it('rejects when consent is present but termsAccepted is false', async () => {
    const errors = await errorsFor({
      ...VALID_BASE,
      consent: {
        termsAccepted: false,
        privacyAccepted: true,
        healthDataProcessingAccepted: true,
      },
    });
    const consentError = errors.find((e) => e.property === 'consent');
    expect(consentError).toBeDefined();
    expect(
      JSON.stringify(consentError?.children ?? consentError),
    ).toContain('termsAccepted');
  });

  it('accepts a fully valid payload with all consent flags explicitly true', async () => {
    const errors = await errorsFor({
      ...VALID_BASE,
      consent: {
        termsAccepted: true,
        privacyAccepted: true,
        healthDataProcessingAccepted: true,
      },
    });
    expect(errors).toHaveLength(0);
  });
});
