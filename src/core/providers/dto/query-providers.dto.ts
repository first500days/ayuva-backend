import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ProviderSortOption {
  RATING = 'rating',
  WAIT = 'wait',
  DISTANCE = 'distance',
}

export class QueryProvidersDto {
  @ApiPropertyOptional({
    example: 'cardio',
    description: 'Free-text match against name/specialty (FR-6.1)',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({
    example: 'Cardiologist',
    description:
      'Category chip (GP/Specialist/Hospital/Diagnostic/Physio) or a finer specialty (FR-6.1)',
  })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 'London' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    enum: ProviderSortOption,
    description:
      'distance requires patient geolocation, not yet captured — falls back to rating (FR-6.2)',
  })
  @IsOptional()
  @IsEnum(ProviderSortOption)
  sort?: ProviderSortOption;
}
