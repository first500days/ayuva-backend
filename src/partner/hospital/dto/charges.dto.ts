import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CHARGE_CATEGORIES,
  type ChargeCategory,
} from '../schemas/service-price.schema';

export class CreateServicePriceDto {
  @ApiProperty({ example: 'General ward bed (per day)' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: CHARGE_CATEGORIES })
  @IsIn(CHARGE_CATEGORIES)
  category: ChargeCategory;

  @ApiProperty({ example: 1500, description: 'Rupees per unit, before tax' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  price: number;

  @ApiPropertyOptional({ example: 'per day' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ example: 0, description: 'GST %, 0 by default' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(40)
  taxPct?: number;
}

export class UpdateServicePriceDto extends PartialType(CreateServicePriceDto) {
  @ApiPropertyOptional({
    description: 'Hide from the charge picker without losing history',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Either a price-list item (serviceId) or, for billing staff, a one-off line. */
export class AddChargeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'One-off line: name (billing staff only)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: CHARGE_CATEGORIES })
  @IsOptional()
  @IsIn(CHARGE_CATEGORIES)
  category?: ChargeCategory;

  @ApiPropertyOptional({
    description: 'One-off line: rupees per unit, before tax',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(40)
  taxPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000)
  quantity: number;

  @ApiPropertyOptional({ description: 'When it was given; defaults to now' })
  @IsOptional()
  @IsDateString()
  givenAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class VoidChargeDto {
  @ApiProperty({ example: 'Added to the wrong patient' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason: string;
}
