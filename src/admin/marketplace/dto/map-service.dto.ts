import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ServiceSourceType } from '../schemas/marketplace-taxonomy.schema';

/** POST /admin/marketplace/taxonomies/:id/mapped-services */
export class MapServiceDto {
  @ApiProperty({ example: 'Heart Scan', description: "The partner's own wording" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  serviceText: string;

  @ApiPropertyOptional({ enum: ServiceSourceType, default: ServiceSourceType.CUSTOM })
  @IsOptional()
  @IsEnum(ServiceSourceType)
  sourceType?: ServiceSourceType;

  @ApiPropertyOptional({ description: 'Provider / hospital / lab offering the service' })
  @IsOptional()
  @IsMongoId()
  entityId?: string;

  @ApiPropertyOptional({ example: 'Meadow Health Centre' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  entityName?: string;
}
