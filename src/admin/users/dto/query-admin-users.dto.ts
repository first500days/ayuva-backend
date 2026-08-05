import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { UserStatus } from '../../../core/users/schemas/user.schema';

export class QueryAdminUsersDto {
  @ApiPropertyOptional({
    example: 'amara',
    description: 'Free-text match against fullName/email (FR-12.1)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Joined on/after this ISO date (FR-12.1)',
  })
  @IsOptional()
  @IsISO8601()
  joinedFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Joined on/before this ISO date (FR-12.1)',
  })
  @IsOptional()
  @IsISO8601()
  joinedTo?: string;
}
