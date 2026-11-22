import { ProviderStatus } from '../../core/providers/schemas/provider.schema';
import { RegistrationReview } from './schemas/partner-member.schema';
import { registrationStateOf } from './registration-status';

const verifiedClinic = {
  registrationNumber: 'KMC-12345',
  status: ProviderStatus.ACTIVE,
  verifiedAt: new Date('2026-09-01T00:00:00Z'),
};

describe('registrationStateOf', () => {
  it('is missing without a registration number', () => {
    expect(registrationStateOf({ isOwner: false }).status).toBe('missing');
  });

  it('is pending for a number Ayuva has not reviewed', () => {
    const s = registrationStateOf({
      isOwner: false,
      registrationNumber: 'DMC-1',
    });
    expect(s).toMatchObject({ status: 'pending', number: 'DMC-1' });
  });

  it('applies a decision only to the number it was made on', () => {
    const review = {
      status: RegistrationReview.VERIFIED,
      number: 'DMC-1',
      submittedAt: new Date(),
      decidedAt: new Date(),
    };
    expect(
      registrationStateOf({
        isOwner: false,
        registrationNumber: 'DMC-1',
        registrationVerification: review,
      }).status,
    ).toBe('verified');
    // The doctor changed the number after it was verified.
    expect(
      registrationStateOf({
        isOwner: false,
        registrationNumber: 'DMC-2',
        registrationVerification: review,
      }).status,
    ).toBe('pending');
  });

  it('carries the reviewer notes on a rejection', () => {
    const s = registrationStateOf({
      isOwner: false,
      registrationNumber: 'DMC-1',
      registrationVerification: {
        status: RegistrationReview.REJECTED,
        number: 'DMC-1',
        submittedAt: new Date(),
        notes: 'Not found on the state register',
      },
    });
    expect(s).toMatchObject({
      status: 'rejected',
      notes: 'Not found on the state register',
    });
  });

  it("treats a verified clinic's own registration as verified for its owner", () => {
    expect(
      registrationStateOf(
        { isOwner: true, registrationNumber: 'KMC-12345' },
        verifiedClinic,
      ),
    ).toMatchObject({ status: 'verified', verifiedVia: 'organisation' });
    // Falls back to the practice's registration when the owner has none of their own.
    expect(registrationStateOf({ isOwner: true }, verifiedClinic).status).toBe(
      'verified',
    );
  });

  it('does not extend the clinic verification to staff or to a different number', () => {
    expect(
      registrationStateOf(
        { isOwner: false, registrationNumber: 'KMC-12345' },
        verifiedClinic,
      ).status,
    ).toBe('pending');
    expect(
      registrationStateOf(
        { isOwner: true, registrationNumber: 'KMC-99999' },
        verifiedClinic,
      ).status,
    ).toBe('pending');
    expect(
      registrationStateOf(
        { isOwner: true, registrationNumber: 'KMC-12345' },
        { ...verifiedClinic, status: ProviderStatus.SUSPENDED },
      ).status,
    ).toBe('pending');
  });
});
