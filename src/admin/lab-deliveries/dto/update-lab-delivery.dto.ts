import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabDeliveryStatus, LabDeliveryMethod } from '../../../core/labs/schemas/lab-delivery-order.schema';

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