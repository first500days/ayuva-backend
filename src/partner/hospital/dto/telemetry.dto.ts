import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMonitorDto {
  @ApiProperty({ example: 'ICU bedside monitor 3' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() wardId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() bedId?: string;
}

export class UpdateMonitorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() wardId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() bedId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

/** What a nurse or doctor charts. At least one value is needed. */
export class RecordVitalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(350)
  hr?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  spo2?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  rr?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(320)
  systolic?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(220)
  diastolic?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  tempC?: number;
  @ApiPropertyOptional({ enum: ['A', 'C', 'V', 'P', 'U'] })
  @IsOptional()
  @IsIn(['A', 'C', 'V', 'P', 'U'])
  avpu?: 'A' | 'C' | 'V' | 'P' | 'U';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onOxygen?: boolean;
  @ApiPropertyOptional({
    description:
      'When the readings were taken, for entries saved on the device while offline (within 12 hours)',
  })
  @IsOptional()
  @IsISO8601()
  takenAt?: string;
}
