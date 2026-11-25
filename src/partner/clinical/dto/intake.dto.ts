import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class IntakeScanDto {
  @ApiProperty({
    description: 'The text of the QR the patient shows (starts AYV1.)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  code: string;
}

/** A patient registered at the desk without the app (walk-in, phone booking, no smartphone). */
export class DeskRegisterDto {
  @ApiProperty({ example: 'Rohit Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '+919800000000', description: 'Mobile number (India 10 digits or +country code)' })
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'Enter a valid phone number' })
  phone: string;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  @IsIn(['male', 'female', 'other'])
  gender: string;

  @ApiPropertyOptional({ example: '1984-05-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Age in years when the date of birth is not known', example: 42 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  age?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'Enter a valid emergency phone number' })
  emergencyPhone?: string;

  @ApiPropertyOptional({ description: 'Register even though this phone already has a patient here' })
  @IsOptional()
  @IsBoolean()
  allowSamePhone?: boolean;
}
