import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProviderCategory } from '../schemas/provider.schema';

export class ProviderLocationDto {
  @ApiProperty({ example: 'Meadow Health Centre' })
  @IsString()
  label: string;

  @ApiProperty({ example: '221B Meadow Lane, London' })
  @IsString()
  address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class CreateProviderDto {
  @ApiProperty({ example: 'Dr. Priya Menon' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ProviderCategory })
  @IsEnum(ProviderCategory)
  type: ProviderCategory;

  @ApiProperty({
    type: [String],
    example: ['Cardiologist', 'Heart & Vascular'],
  })
  @IsArray()
  @IsString({ each: true })
  specialty: string[];

  @ApiProperty({ type: [ProviderLocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProviderLocationDto)
  locations: ProviderLocationDto[];

  @ApiProperty({ type: [String], example: ['EN', 'HI', 'TA'] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 5, example: 4.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avgWaitMinutes?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  consultationFee?: number;
}
