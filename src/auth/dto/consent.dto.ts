import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/**
 * PRD FR-1.5: explicit consent capture (ToS, Privacy, health-data processing)
 * required before account creation. Each flag must be individually and
 * explicitly accepted — a missing or false flag fails validation.
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
    description: 'Health-data processing consent accepted',
  })
  @Equals(true, {
    message: 'healthDataProcessingAccepted must be explicitly accepted',
  })
  healthDataProcessingAccepted: boolean;
}
