import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsObject,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';
import { ConsentDto } from './consent.dto';

export class RegisterDto {
  @ApiProperty({ example: 'Amara Okafor' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: 'amara.o@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password123',
    description:
      'Minimum 8 characters, must include letters and numbers (FR-1.4)',
  })
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    type: ConsentDto,
    description:
      'Explicit consent capture (FR-1.5) — required, not just each inner flag',
  })
  @IsDefined({ message: 'consent is required' })
  @IsObject({ message: 'consent must be an object' })
  @ValidateNested()
  @Type(() => ConsentDto)
  consent: ConsentDto;
}
