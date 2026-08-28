import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

export class QueryHospitalsDto {
  @ApiPropertyOptional({ example: 'Apollo' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ enum: ['multi_speciality', 'general', 'children', 'maternity', 'day_care', 'All'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: '500' })
  @IsOptional()
  @IsNumberString()
  maxFee?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsString()
  emergencyOnly?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsString()
  cashlessOnly?: string;

  @ApiPropertyOptional({ enum: ['distance', 'rating', 'fee'] })
  @IsOptional()
  @IsIn(['distance', 'rating', 'fee'])
  sort?: 'distance' | 'rating' | 'fee';
}
