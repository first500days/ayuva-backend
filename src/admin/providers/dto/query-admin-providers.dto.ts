import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  ProviderCategory,
  ProviderStatus,
} from '../../../core/providers/schemas/provider.schema';

export class QueryAdminProvidersDto {
  @ApiPropertyOptional({
    example: 'menon',
    description: 'Free-text match against name/specialty (FR-13.1)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProviderCategory })
  @IsOptional()
  @IsEnum(ProviderCategory)
  type?: ProviderCategory;

  @ApiPropertyOptional({ example: 'Cardiologist' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 'London' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: ProviderStatus })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;
}
