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
  Matches,
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

/** Empty (to clear), or a beacon MAC / iBeacon id / RFID EPC. */
export const TRACKER_TAG = /^$|^[A-Za-z0-9:_.-]{4,64}$/;
export const TRACKER_TAG_MESSAGE =
  'The tracker tag is the beacon MAC or RFID code: 4–64 letters, digits or : . _ -';

/** Empty (to clear), or a phone number: +country code, or 10 Indian digits; spaces and dashes allowed. */
export const SUPPLIER_PHONE = /^$|^\+?[\d\s-]{10,18}$/;
export const SUPPLIER_PHONE_MESSAGE =
  "Enter the supplier's WhatsApp number with country code, e.g. +91 98123 45678";

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
  @ApiPropertyOptional({ example: 'Medline Distributors' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  supplierName?: string;
  @ApiPropertyOptional({ example: '+919812345678' })
  @IsOptional()
  @Transform(trim)
  @Matches(SUPPLIER_PHONE, { message: SUPPLIER_PHONE_MESSAGE })
  supplierWhatsapp?: string;
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
  @ApiPropertyOptional({ description: '"" clears it' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  supplierName?: string;
  @ApiPropertyOptional({ description: '"" clears it' })
  @IsOptional()
  @Transform(trim)
  @Matches(SUPPLIER_PHONE, { message: SUPPLIER_PHONE_MESSAGE })
  supplierWhatsapp?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

/** One click on a low-stock row: quantity defaults to bringing stock back to twice the reorder level. */
export class ReorderStockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;
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
  @ApiPropertyOptional({
    description: 'BLE beacon id / MAC or RFID EPC on the machine',
    example: 'AC:23:3F:A1:02:9B',
  })
  @IsOptional()
  @Transform(trim)
  @Matches(TRACKER_TAG, { message: TRACKER_TAG_MESSAGE })
  trackerTag?: string;
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
  @ApiPropertyOptional({ description: '"" removes the tracker tag' })
  @IsOptional()
  @Transform(trim)
  @Matches(TRACKER_TAG, { message: TRACKER_TAG_MESSAGE })
  trackerTag?: string;
}

/** A BLE / RFID reader fixed in a room or area. */
export class CreateTrackingGatewayDto {
  @ApiProperty({ example: 'ICU reader 1' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
  @ApiProperty({
    example: 'ICU bay 2',
    description: 'The room or area it covers',
  })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  zone: string;
}

export class UpdateTrackingGatewayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  zone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class AssetPingDto {
  @ApiProperty({ example: 'AC:23:3F:A1:02:9B' })
  @IsString()
  @MaxLength(64)
  tag: string;
  @ApiPropertyOptional({ example: -61, description: 'Signal strength, dBm' })
  @IsOptional()
  @IsNumber()
  @Min(-127)
  @Max(20)
  rssi?: number;
  @ApiPropertyOptional({ description: 'When it was heard (defaults to now)' })
  @IsOptional()
  @IsISO8601()
  at?: string;
}

/** What one gateway heard since its last post. */
export class AssetPingsDto {
  @ApiProperty({ type: [AssetPingDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AssetPingDto)
  pings: AssetPingDto[];
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
