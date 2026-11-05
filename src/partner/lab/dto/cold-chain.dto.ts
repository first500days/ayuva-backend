import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RANGE_PRESETS } from '../cold-chain';

export class CreateColdChainRunDto {
  @ApiProperty({ example: 'Cool box 3' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  boxLabel: string;

  @ApiProperty({ enum: Object.keys(RANGE_PRESETS) })
  @IsIn(Object.keys(RANGE_PRESETS))
  preset: string;
}

export class TransitVialDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,40}$/, {
    message: 'barcode: 3–40 letters, digits, dots, dashes or underscores',
  })
  barcode: string;
}

export class ReadingInputDto {
  @ApiPropertyOptional({ description: 'When it was read; default now' })
  @IsOptional()
  @IsISO8601()
  at?: string;

  @ApiProperty({ example: 4.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(60)
  tempC: number;
}

export class AddReadingsDto {
  @ApiProperty({ type: [ReadingInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReadingInputDto)
  readings: ReadingInputDto[];
}

export class LoggerUploadDto {
  @ApiProperty({
    description:
      'Data-logger CSV export: "timestamp, temperature" per line (local time unless it carries a zone)',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(90_000)
  csv: string;
}

export class ColdChainQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: string;
}
