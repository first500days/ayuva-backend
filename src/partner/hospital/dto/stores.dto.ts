import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CENTRAL_CATEGORIES,
  DRUG_SCHEDULES,
} from '../schemas/stock-item.schema';
import { STOCK_REASONS } from '../schemas/stock-move.schema';
import type { StockReason } from '../schemas/stock-move.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class StockItemsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateStockItemDto {
  @ApiProperty({ example: 'Paracetamol 500 mg tablet' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  genericName?: string;
  @ApiPropertyOptional({ example: 'Tablet' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  form?: string;
  @ApiPropertyOptional({ example: '500 mg' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  strength?: string;
  @ApiPropertyOptional({ enum: DRUG_SCHEDULES })
  @IsOptional()
  @IsIn(DRUG_SCHEDULES)
  schedule?: string;
  @ApiPropertyOptional({ enum: CENTRAL_CATEGORIES })
  @IsOptional()
  @IsIn(CENTRAL_CATEGORIES)
  category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() serialised?: boolean;
  @ApiPropertyOptional({ example: 'strips' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  reorderLevel?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  location?: string;
}

export class UpdateStockItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  genericName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  form?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  strength?: string;
  @ApiPropertyOptional({ enum: DRUG_SCHEDULES })
  @IsOptional()
  @IsIn(DRUG_SCHEDULES)
  schedule?: string;
  @ApiPropertyOptional({ enum: CENTRAL_CATEGORIES })
  @IsOptional()
  @IsIn(CENTRAL_CATEGORIES)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  reorderLevel?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class ReceiveStockDto {
  @ApiProperty({ example: 'B24117' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  batchNo: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @ApiProperty() @IsInt() @Min(1) @Max(1_000_000) quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  unitCost?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  mrp?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  supplier?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  invoiceNo?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'One per unit, for serialised items',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  serials?: string[];
}

export const ADJUST_REASONS = [
  'adjusted',
  'expired',
  'damaged',
  'returned',
] as const;

export class AdjustStockDto {
  @ApiProperty() @IsMongoId() batchId: string;

  @ApiProperty({ description: 'Units added (+) or removed (−)' })
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  delta: number;

  @ApiProperty({ enum: ADJUST_REASONS })
  @IsIn(ADJUST_REASONS)
  reason: (typeof ADJUST_REASONS)[number];

  @ApiProperty({ example: 'Physical count on 4 Nov' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serials?: string[];
}

export class StockMovesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() itemId?: string;
  @ApiPropertyOptional({ enum: STOCK_REASONS })
  @IsOptional()
  @IsIn(STOCK_REASONS)
  reason?: StockReason;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

// ── Pharmacy ─────────────────────────────────────────────────────────────────

export const NOT_SUPPLIED_REASONS = [
  'out_of_stock',
  'patient_declined',
  'bought_outside',
  'doctor_stopped',
] as const;

export class PharmacyQueueQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'partial', 'dispensed', 'open', 'all'],
  })
  @IsOptional()
  @IsIn(['pending', 'partial', 'dispensed', 'open', 'all'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class DispenseLineDto {
  @ApiProperty() @IsInt() @Min(0) @Max(99) rxIndex: number;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() itemId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() batchId?: string;
  @ApiPropertyOptional({
    description: 'Nothing more is owed on this line (default true)',
  })
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
  @ApiPropertyOptional({ enum: NOT_SUPPLIED_REASONS })
  @IsOptional()
  @IsIn(NOT_SUPPLIED_REASONS)
  notSupplied?: (typeof NOT_SUPPLIED_REASONS)[number];
}

export class DispenseDto {
  @ApiProperty({ type: [DispenseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DispenseLineDto)
  lines: DispenseLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class StockSearchQueryDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) q: string;
}
