import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../core/users/schemas/user.schema';
import type { AgeSource } from '../../../common/utils/age.util';

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
    description:
      'From the HealthProfile date of birth (or a self-reported age from older app builds); absent when missing',
  })
  age?: number;

  @ApiProperty({
    enum: ['dob', 'self_reported', 'missing'],
    description: 'missing = no valid birth date on file (a saved age of 0 counts as missing)',
  })
  ageSource: AgeSource;

  @ApiPropertyOptional({ example: '1984-03-09' })
  dateOfBirth?: string;

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
