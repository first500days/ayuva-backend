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
import {
  ASSET_CATEGORIES,
  AssetStatus,
  MAINTENANCE_TYPES,
} from '../schemas/asset.schema';
import type { MaintenanceType } from '../schemas/asset.schema';
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

// ── Central supply ───────────────────────────────────────────────────────────

export const ISSUE_TARGETS = ['department', 'ward', 'ot', 'patient'] as const;

export class IssueTargetDto {
  @ApiProperty({ enum: ISSUE_TARGETS })
  @IsIn(ISSUE_TARGETS)
  type: (typeof ISSUE_TARGETS)[number];

  @ApiProperty({ example: 'Ward 3B' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
}

export class IssueStockDto {
  @ApiProperty() @IsInt() @Min(1) @Max(100_000) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() batchId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Serial-tracked items: the units issued',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serials?: string[];

  @ApiProperty({ type: IssueTargetDto })
  @ValidateNested()
  @Type(() => IssueTargetDto)
  to: IssueTargetDto;

  @ApiPropertyOptional({ description: 'Required for implants (traceability)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  patientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateAssetDto {
  @ApiProperty({ example: 'BME-0042' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  tag: string;

  @ApiProperty({ example: 'Defibrillator' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: ASSET_CATEGORIES })
  @IsOptional()
  @IsIn(ASSET_CATEGORIES)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  location?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  make?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  modelNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  serialNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() purchasedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() warrantyUntil?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  amcVendor?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() amcUntil?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  serviceIntervalDays?: number;
  @ApiPropertyOptional({
    description: 'Last preventive service (sets the next due date)',
  })
  @IsOptional()
  @IsISO8601()
  lastServiceAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  calibrationIntervalDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() lastCalibratedAt?: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ enum: ASSET_CATEGORIES })
  @IsOptional()
  @IsIn(ASSET_CATEGORIES)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  location?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  make?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  modelNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  serialNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() purchasedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() warrantyUntil?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  amcVendor?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() amcUntil?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  serviceIntervalDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  calibrationIntervalDays?: number;
  @ApiPropertyOptional({
    enum: [AssetStatus.CONDEMNED, AssetStatus.OPERATIONAL],
  })
  @IsOptional()
  @IsIn([AssetStatus.CONDEMNED, AssetStatus.OPERATIONAL])
  status?: AssetStatus;
}

export class LogMaintenanceDto {
  @ApiProperty({ enum: MAINTENANCE_TYPES })
  @IsIn(MAINTENANCE_TYPES)
  type: MaintenanceType;
  @ApiPropertyOptional({ description: 'When it happened (default now)' })
  @IsOptional()
  @IsISO8601()
  at?: string;

  @ApiProperty({ example: 'Quarterly PM — battery and pads replaced' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  summary: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  vendor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  engineer?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  cost?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000)
  downtimeHours?: number;

  @ApiProperty({
    enum: [
      AssetStatus.OPERATIONAL,
      AssetStatus.MAINTENANCE,
      AssetStatus.OUT_OF_SERVICE,
    ],
  })
  @IsIn([
    AssetStatus.OPERATIONAL,
    AssetStatus.MAINTENANCE,
    AssetStatus.OUT_OF_SERVICE,
  ])
  statusAfter: AssetStatus;
}
