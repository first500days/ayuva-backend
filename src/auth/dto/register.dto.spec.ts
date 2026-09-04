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
 * consent is missing or a gating flag isn't explicitly accepted.
 * AuthService.register dereferences dto.consent.termsAccepted directly, so
 * an undefined consent object must never reach the service layer.
 *
 * "Gating" is ToS and Privacy only. Health-data processing must be *present*
 * so the decision is recorded, but either value is valid — see ConsentDto.
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

  // Health-data processing gates AI document processing, not the account, and
  // the mobile consent screen offers it as a real choice. Requiring `true`
  // here previously made "decline AI processing" an unsignupable state.
  it('accepts a payload that declines health-data processing', async () => {
    const errors = await errorsFor({
      ...VALID_BASE,
      consent: {
        termsAccepted: true,
        privacyAccepted: true,
        healthDataProcessingAccepted: false,
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects when healthDataProcessingAccepted is omitted', async () => {
    const errors = await errorsFor({
      ...VALID_BASE,
      consent: { termsAccepted: true, privacyAccepted: true },
    });
    const consentError = errors.find((e) => e.property === 'consent');
    expect(consentError).toBeDefined();
    expect(JSON.stringify(consentError?.children ?? consentError)).toContain(
      'healthDataProcessingAccepted',
    );
  });
});
