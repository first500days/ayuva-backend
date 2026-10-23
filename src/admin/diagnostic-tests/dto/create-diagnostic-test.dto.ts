import { ArrayMaxSize, IsMongoId, IsString, IsNumber, IsBoolean, IsOptional, IsArray, MaxLength, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ProviderPricingDto {
  // Cast to an ObjectId when saved — anything else used to crash the save with a 500.
  @ApiProperty()
  @IsMongoId({ message: 'Each provider price needs a valid lab ID' })
  labId: string;

  @ApiProperty()
  @IsString()
  labName: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tatHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  homeCollection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateDiagnosticTestDto {
  @ApiProperty()
  @IsString()
  testCode: string;

  @ApiProperty()
  @IsString()
  testName: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sampleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tatHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  homeCollectionAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fastingRequired?: boolean;

  @ApiPropertyOptional({ type: [ProviderPricingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderPricingDto)
  providerPricing?: ProviderPricingDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Hemogram', 'Blood Test', 'CBC'],
    description: 'Spelling variations partners use for this test; each maps to one master test',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  aliases?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preparationInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceRange?: string;
}