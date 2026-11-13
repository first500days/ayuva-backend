import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateQcMaterialDto {
  @ApiProperty({ example: 'Glucose' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  analyte: string;

  @ApiPropertyOptional({ example: 'mg/dL' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ example: 'Level 1 (normal)' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  level: string;

  @ApiProperty({ example: '45871' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  lot: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  lotExpiry?: string;

  @ApiPropertyOptional({ example: 'Cobas c311' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  instrument?: string;

  @ApiPropertyOptional({
    example: 'QC-GLU-L1',
    description:
      'The sample ID the analyser sends for this control, so its runs are checked automatically',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  controlId?: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  targetMean: number;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  targetSd: number;
}

export class UpdateQcMaterialDto extends PartialType(CreateQcMaterialDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AddQcRunDto {
  @ApiProperty({ example: 101.5 })
  @Type(() => Number)
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ description: 'When the control was run; default now' })
  @IsOptional()
  @IsISO8601()
  at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ReviewQcRunDto {
  @ApiProperty({
    example: 'Recalibrated, fresh control vial; repeat within range',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note: string;
}

export class QcRunsQueryDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
