import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * MFA is mandatory for every admin login: "pending_enrollment" means the
 * admin will be made to set up an authenticator app at their next sign-in.
 */
export type AdminMfaStatus = 'enrolled' | 'pending_enrollment' | 'no_login';

export class AdminAdminUserResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: 'admin@ayuva.health' })
  email: string;

  @ApiPropertyOptional({ example: 'Super Admin' })
  fullName: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  status: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  roleId?: string;

  @ApiPropertyOptional({ example: 'Content Admin' })
  roleName?: string;

  @ApiPropertyOptional({ type: [String] })
  permissions: string[];

  @ApiPropertyOptional({ example: '2026-08-19T08:00:00.000Z' })
  lastLoginAt?: string;

  @ApiPropertyOptional({ description: 'True once an authenticator app is enrolled' })
  mfaEnabled: boolean;

  @ApiPropertyOptional({ enum: ['enrolled', 'pending_enrollment', 'no_login'] })
  mfaStatus: AdminMfaStatus;

  @ApiPropertyOptional()
  mfaEnrolledAt?: string;

  @ApiPropertyOptional({
    description: 'Create only: one-time password for a new login. Shown once, never stored in clear.',
  })
  temporaryPassword?: string;
}
