import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ColdChainStatus, LabDeliveryStatus, LabDeliveryMethod } from '../../../core/labs/schemas/lab-delivery-order.schema';

export class UpdateLabDeliveryDto {
  @ApiPropertyOptional({ enum: LabDeliveryStatus })
  @IsOptional()
  @IsEnum(LabDeliveryStatus)
  status?: LabDeliveryStatus;

  @ApiPropertyOptional({ enum: LabDeliveryMethod })
  @IsOptional()
  @IsEnum(LabDeliveryMethod)
  deliveryMethod?: LabDeliveryMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportFileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportFileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['normal', 'urgent', 'stat'])
  priority?: 'normal' | 'urgent' | 'stat';

  // Courier log and sample custody. An empty string / null clears the value.
  @ApiPropertyOptional({ example: 'Dunzo Health' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  courierName?: string | null;

  @ApiPropertyOptional({ example: 'RIDER-4471' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  courierId?: string | null;

  @ApiPropertyOptional({ example: '2026-10-23T07:45:00.000Z' })
  @IsOptional()
  @IsDateString()
  pickedUpAt?: string | null;

  @ApiPropertyOptional({ example: 3.1, description: 'Lowest transit temperature (°C)' })
  @IsOptional()
  @IsNumber()
  @Min(-80)
  @Max(60)
  transitTempMinC?: number | null;

  @ApiPropertyOptional({ example: 6.4, description: 'Highest transit temperature (°C)' })
  @IsOptional()
  @IsNumber()
  @Min(-80)
  @Max(60)
  transitTempMaxC?: number | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(-80)
  @Max(60)
  requiredTempMinC?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(-80)
  @Max(60)
  requiredTempMaxC?: number;

  @ApiPropertyOptional({
    enum: ColdChainStatus,
    description: 'Manual status; ignored while transit readings decide it',
  })
  @IsOptional()
  @IsEnum(ColdChainStatus)
  coldChainStatus?: ColdChainStatus;
}

export class RetryDeliveryDto {
  @ApiProperty()
  @IsString()
  deliveryMethod: LabDeliveryMethod;
}

export class ManualDeliveryDto {
  @ApiProperty()
  @IsString()
  reportFileUrl: string;

  @ApiProperty()
  @IsString()
  reportFileName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryMethod?: LabDeliveryMethod;
}