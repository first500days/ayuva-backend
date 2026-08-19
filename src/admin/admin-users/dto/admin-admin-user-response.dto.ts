import { ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ type: [String] })
  permissions: string[];

  @ApiPropertyOptional({ example: '2026-08-19T08:00:00.000Z' })
  lastLoginAt?: string;

  @ApiPropertyOptional()
  mfaEnabled: boolean;
}
