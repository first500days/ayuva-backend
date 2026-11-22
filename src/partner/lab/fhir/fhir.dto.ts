import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FHIR_AUTH_TYPES } from './fhir-connection.schema';
import type { FhirAuthType } from './fhir-connection.schema';

const URL_OPTIONS = { require_tld: false, require_protocol: true };

export class CreateFhirConnectionDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name: string;

  @ApiProperty({ example: 'https://hospital.example/fhir/r4' })
  @IsUrl(URL_OPTIONS)
  @MaxLength(400)
  baseUrl: string;

  @ApiProperty({ enum: FHIR_AUTH_TYPES })
  @IsIn(FHIR_AUTH_TYPES)
  authType: FhirAuthType;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) username?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(400)
  tokenUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) scope?: string;
}

export class UpdateFhirConnectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class FhirSearchDto {
  @ApiPropertyOptional({ description: "The hospital's FHIR id for the patient" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  patient?: string;

  @ApiPropertyOptional({ description: "The hospital's FHIR id for the encounter" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  encounter?: string;
}
