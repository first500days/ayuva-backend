import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../core/users/schemas/user.schema';

export type ActivityLevel = 'high' | 'medium' | 'low';

export class AdminUserResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Amara Okafor' })
  fullName: string;

  @ApiProperty({ example: 'amara.o@example.com' })
  email: string;

  @ApiPropertyOptional({
    example: 42,
    description: 'From HealthProfile, if completed',
  })
  age?: number;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  joinedAt: string;

  @ApiProperty({
    enum: ['high', 'medium', 'low'],
    example: 'medium',
    description:
      'Heuristic: combined Appointment + MedicationLog document count in the last 30 days (FR-12.1)',
  })
  activityLevel: ActivityLevel;
}
