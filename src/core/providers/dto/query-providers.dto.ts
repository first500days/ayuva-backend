import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { INSURERS } from '../insurance-estimate';

export enum ProviderSortOption {
  RATING = 'rating',
  WAIT = 'wait',
  DISTANCE = 'distance',
  FEE = 'fee',
}

/** Query strings carry "true" / "1"; the app may also send a real boolean. */
const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

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

  @ApiPropertyOptional({
    enum: INSURERS,
    description:
      "Only providers on this insurer's panel, each with an estimated out-of-pocket cost",
  })
  @IsOptional()
  @IsIn(INSURERS as unknown as string[])
  insurer?: string;

  // Filters the patient app sends from its filter sheet.

  @ApiPropertyOptional({ description: 'Only providers whose consultation fee is at most this (INR)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxFee?: number;

  @ApiPropertyOptional({ enum: ['today', 'tomorrow', 'this_week'], description: 'Has an open slot in this window' })
  @IsOptional()
  @IsIn(['today', 'tomorrow', 'this_week'])
  availability?: 'today' | 'tomorrow' | 'this_week';

  @ApiPropertyOptional({ description: 'Only providers that offer video consultations' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onlineConsultation?: boolean;

  @ApiPropertyOptional({ description: "Only providers whose bookings don't need approval" })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  instantConfirmation?: boolean;

  @ApiPropertyOptional({
    description: 'Accepted for the app, but providers have no recorded gender yet, so it does not filter',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  femaleOnly?: boolean;
}
