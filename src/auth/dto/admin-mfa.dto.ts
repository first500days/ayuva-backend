import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsJWT, Matches } from 'class-validator';

export class AdminMfaEnrollmentDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXP', description: 'Base32 secret for manual entry' })
  secret: string;

  @ApiProperty({ example: 'otpauth://totp/AYUVA%20Admin%3Aadmin%40ayuva.health?secret=…' })
  otpauthUrl: string;

  @ApiProperty({ description: 'QR code of otpauthUrl as SVG markup, for the authenticator app to scan' })
  qrSvg: string;
}

/**
 * POST /auth/login answer for an admin: no tokens until the second factor is
 * checked. `enrollment` is present the first time, when the admin must add
 * AYUVA to an authenticator app before they can sign in.
 */
export class AdminMfaChallengeDto {
  @ApiProperty({ example: true })
  mfaRequired: true;

  @ApiProperty({ description: 'Short-lived (10 min) token for POST /auth/mfa/verify' })
  mfaToken: string;

  @ApiPropertyOptional({ type: AdminMfaEnrollmentDto })
  enrollment?: AdminMfaEnrollmentDto;
}

export class VerifyMfaDto {
  @ApiProperty()
  @IsJWT()
  mfaToken: string;

  @ApiProperty({ example: '492039', description: '6-digit code from the authenticator app' })
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code: string;
}
