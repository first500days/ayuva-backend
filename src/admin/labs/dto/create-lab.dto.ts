import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsNumber } from 'class-validator';
import { LabStatus } from '../../../core/labs/schemas/lab.schema';

export class CreateLabDto {
  @ApiProperty({ example: 'Ayuva Diagnostics' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: LabStatus })
  @IsOptional()
  status?: LabStatus;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  specialty: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  locations: { label: string; address: string }[];

  @ApiPropertyOptional({ example: 4.7 })
  @IsOptional()
  @IsNumber()
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
