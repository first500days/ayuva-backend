import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AnalyserCodeDto {
  @ApiProperty({ example: 'GLU' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Glucose (Fasting)' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  parameter: string;
}

export class CreateAnalyserDto {
  @ApiProperty({ example: 'Cobas c311' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ enum: ['hl7', 'astm', 'dicomweb'] })
  @IsIn(['hl7', 'astm', 'dicomweb'])
  protocol: string;

  @ApiPropertyOptional({ type: [AnalyserCodeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => AnalyserCodeDto)
  codes?: AnalyserCodeDto[];
}

export class UpdateAnalyserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ type: [AnalyserCodeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => AnalyserCodeDto)
  codes?: AnalyserCodeDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class IngestMessageDto {
  @ApiProperty({ description: 'The message text, transport framing removed' })
  @IsString()
  @MinLength(5)
  @MaxLength(60_000)
  message: string;
}
