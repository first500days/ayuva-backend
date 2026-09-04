import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

/**
 * PRD FR-1.5: explicit consent capture (ToS, Privacy, health-data processing)
 * required before account creation. Every flag must be present — a missing one
 * fails validation, so a decision is always recorded rather than left
 * undefined.
 *
 * ToS and Privacy gate the account itself, so both must be explicitly `true`.
 * Health-data processing is a genuinely optional decision: it gates AI
 * processing of uploaded documents, not access to the product, and the mobile
 * consent screen offers it as a real choice ("the other two are yours to
 * choose"). Requiring `true` here meant declining AI processing made the
 * account impossible to create at all — registration and Google OAuth both
 * failed with "healthDataProcessingAccepted must be explicitly accepted" — so
 * it is recorded as given instead of forced.
 */
export class ConsentDto {
  @ApiProperty({ example: true, description: 'Terms of Service accepted' })
  @Equals(true, { message: 'termsAccepted must be explicitly accepted' })
  termsAccepted: boolean;

  @ApiProperty({ example: true, description: 'Privacy Policy accepted' })
  @Equals(true, { message: 'privacyAccepted must be explicitly accepted' })
  privacyAccepted: boolean;

  @ApiProperty({
    example: true,
    description:
      'Health-data processing consent. Required in the payload, but may be false — the account is created either way.',
  })
  @IsBoolean({
    message: 'healthDataProcessingAccepted must be explicitly set to true or false',
  })
  healthDataProcessingAccepted: boolean;
}
