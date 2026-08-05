import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class CreateUserDto {
  @ApiProperty({ example: 'Amara Okafor' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'amara.o@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Required for email/password sign-up (FR-1.2)',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description: 'Required for Google OAuth sign-up (FR-1.3)',
  })
  @IsOptional()
  @IsString()
  oauthId?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.PATIENT })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
