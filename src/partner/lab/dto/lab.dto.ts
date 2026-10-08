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
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateNested,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === undefined
    ? undefined
    : value === true || value === 'true' || value === '1';

export class LabParameterDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() refLow?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() refHigh?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  refText?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() criticalLow?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() criticalHigh?: number;
}

export class CreateCatalogItemDto {
  @ApiProperty({ example: 'CBC' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{0,23}$/, {
    message: 'code: letters, digits and dashes (max 24)',
  })
  code: string;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiProperty({ example: 'Haematology' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  category: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sampleType?: string;
  @ApiProperty() @IsNumber() @Min(0) price: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) tatHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeCollection?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fastingRequired?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  preparation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPackage?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Catalogue item ids bundled in a package',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsMongoId({ each: true })
  includes?: string[];

  @ApiPropertyOptional({ type: [LabParameterDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LabParameterDto)
  parameters?: LabParameterDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sampleType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) tatHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeCollection?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fastingRequired?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  preparation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPackage?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsMongoId({ each: true })
  includes?: string[];

  @ApiPropertyOptional({ type: [LabParameterDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LabParameterDto)
  parameters?: LabParameterDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class CatalogQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

export class CreateInventoryItemDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) sku?: string;

  @ApiProperty({ enum: ['reagent', 'consumable', 'kit', 'equipment'] })
  @IsIn(['reagent', 'consumable', 'kit', 'equipment'])
  category: string;

  @ApiProperty({ example: 'vials' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() expiryDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lotNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  location?: string;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) sku?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['reagent', 'consumable', 'kit', 'equipment'])
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() expiryDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lotNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  location?: string;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'Positive to add stock, negative to consume' })
  @IsNumber()
  @NotEquals(0)
  delta: number;

  @ApiProperty({ enum: ['received', 'used', 'expired', 'adjustment'] })
  @IsIn(['received', 'used', 'expired', 'adjustment'])
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateLabOrderDto {
  @ApiProperty() @IsMongoId() patientId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsMongoId({ each: true })
  testIds: string[];

  @ApiPropertyOptional({ enum: ['lab', 'home'] })
  @IsOptional()
  @IsIn(['lab', 'home'])
  collectionType?: 'lab' | 'home';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() scheduledAt?: string;
  @ApiPropertyOptional({ enum: ['routine', 'urgent', 'stat'] })
  @IsOptional()
  @IsIn(['routine', 'urgent', 'stat'])
  priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() appointmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() technicianMemberId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() collectorMemberId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateLabOrderDto {
  @ApiPropertyOptional({ nullable: true, description: 'null to unassign' })
  @IsOptional()
  @IsMongoId()
  technicianMemberId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null to unassign' })
  @IsOptional()
  @IsMongoId()
  collectorMemberId?: string | null;

  @ApiPropertyOptional({ enum: ['routine', 'urgent', 'stat'] })
  @IsOptional()
  @IsIn(['routine', 'urgent', 'stat'])
  priority?: string;
  @ApiPropertyOptional({ enum: ['lab', 'home'] })
  @IsOptional()
  @IsIn(['lab', 'home'])
  collectionType?: 'lab' | 'home';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() scheduledAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Link to the study in an external PACS viewer',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  pacsUrl?: string;

  @ApiPropertyOptional({ enum: ['unpaid', 'paid', 'waived'] })
  @IsOptional()
  @IsIn(['unpaid', 'paid', 'waived'])
  paymentStatus?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;
}

export class AdvanceLabOrderDto {
  @ApiProperty({
    enum: ['sample_collected', 'processing', 'report_ready', 'cancelled'],
  })
  @IsIn(['sample_collected', 'processing', 'report_ready', 'cancelled'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class LabOrdersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
  @ApiPropertyOptional({ description: "'me' or a member id" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  assigned?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() patientId?: string;
}

export class ResultValueDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name: string;
  @ApiProperty() @IsString() @MaxLength(4000) value: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() refLow?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() refHigh?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  refText?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() criticalLow?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() criticalHigh?: number;

  @ApiPropertyOptional({
    description:
      'Ignored — flags are always recomputed from the ranges on save',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  flag?: string;
}

export class ResultTestDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() testId?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name: string;

  @ApiProperty({ type: [ResultValueDto] })
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => ResultValueDto)
  values: ResultValueDto[];
}

export class SaveResultDto {
  @ApiProperty({ type: [ResultTestDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ResultTestDto)
  tests: ResultTestDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;
}

/** Multipart fields sent with an uploaded report file. */
export class UploadReportDto {
  @ApiPropertyOptional({
    description: 'Mark the report as containing a critical value',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  critical?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}
