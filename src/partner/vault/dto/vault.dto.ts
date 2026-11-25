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

export class VaultCitationDto {
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) authors?: string;
  @IsOptional() @IsString() @MaxLength(200) journal?: string;
  @IsOptional() @IsString() @MaxLength(10) year?: string;
  @IsOptional() @IsString() @MaxLength(20) volume?: string;
  @IsOptional() @IsString() @MaxLength(20) issue?: string;
  @IsOptional() @IsString() @MaxLength(40) pages?: string;
  @IsOptional() @IsString() @MaxLength(200) doi?: string;
  @IsOptional() @IsString() @MaxLength(20) pmid?: string;
  @IsOptional() @IsString() @MaxLength(20) pmcid?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}

export class SaveVaultNoteDto {
  @ApiProperty({ example: 'Post-MI DAPT duration' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  body?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ type: VaultCitationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VaultCitationDto)
  citation?: VaultCitationDto;
}

export const RESEARCH_FILTERS = [
  'all',
  'pubmed',
  'cochrane',
  'guidelines',
  'reviews',
  'open',
] as const;
export type ResearchFilter = (typeof RESEARCH_FILTERS)[number];

export class ResearchQueryDto {
  @ApiProperty({ example: 'dual antiplatelet therapy duration' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  q: string;

  @ApiPropertyOptional({ enum: RESEARCH_FILTERS })
  @IsOptional()
  @IsIn(RESEARCH_FILTERS)
  filter?: ResearchFilter;

  @ApiPropertyOptional({ description: 'nextCursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
