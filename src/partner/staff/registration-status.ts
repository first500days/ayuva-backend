import {
  Provider,
  ProviderStatus,
} from '../../core/providers/schemas/provider.schema';
import {
  PartnerMember,
  RegistrationReview,
} from './schemas/partner-member.schema';

export type RegistrationStatus =
  'missing' | 'pending' | 'verified' | 'rejected';

export interface RegistrationState {
  status: RegistrationStatus;
  number: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  notes: string | null;
  // 'organisation' when a clinic owner's number was checked with the clinic itself.
  verifiedVia: 'review' | 'organisation' | null;
}

const LIVE = [ProviderStatus.ACTIVE, ProviderStatus.VERIFIED];

type MemberLike = Pick<
  PartnerMember,
  'registrationNumber' | 'isOwner' | 'registrationVerification'
>;
type ProviderLike = Pick<
  Provider,
  'registrationNumber' | 'status' | 'verifiedAt'
>;

/** The number a member signs with: their own, or a clinic owner's practice registration. */
export function signingRegistration(
  member: MemberLike,
  provider?: ProviderLike | null,
): string | undefined {
  return (
    member.registrationNumber ||
    (member.isOwner ? provider?.registrationNumber : undefined) ||
    undefined
  );
}

/**
 * Whether Ayuva has verified the registration a member prescribes under. A
 * decision only counts for the number it was made on, and a clinic owner's
 * number is verified by the clinic's own verification (same registration).
 */
export function registrationStateOf(
  member: MemberLike,
  provider?: ProviderLike | null,
): RegistrationState {
  const number = signingRegistration(member, provider);
  const review = member.registrationVerification;
  if (!number) {
    return {
      status: 'missing',
      number: null,
      submittedAt: null,
      decidedAt: null,
      notes: null,
      verifiedVia: null,
    };
  }
  if (review && review.number === number) {
    return {
      status: review.status,
      number,
      submittedAt: review.submittedAt?.toISOString() ?? null,
      decidedAt: review.decidedAt?.toISOString() ?? null,
      notes: review.notes ?? null,
      verifiedVia:
        review.status === RegistrationReview.VERIFIED ? 'review' : null,
    };
  }
  if (
    member.isOwner &&
    provider?.verifiedAt &&
    LIVE.includes(provider.status) &&
    provider.registrationNumber === number
  ) {
    return {
      status: 'verified',
      number,
      submittedAt: null,
      decidedAt: provider.verifiedAt.toISOString(),
      notes: null,
      verifiedVia: 'organisation',
    };
  }
  return {
    status: 'pending',
    number,
    submittedAt: null,
    decidedAt: null,
    notes: null,
    verifiedVia: null,
  };
}
