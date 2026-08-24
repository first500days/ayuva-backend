import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ProviderPricingResponseDto {
  @ApiProperty()
  labId: string;

  @ApiProperty()
  labName: string;

  @ApiProperty()
  price: number;

  @ApiPropertyOptional()
  tatHours?: number;

  @ApiPropertyOptional()
  homeCollection?: boolean;

  @ApiPropertyOptional()
  isActive?: boolean;
}

export class AdminDiagnosticTestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  testCode: string;

  @ApiProperty()
  testName: string;

  @ApiProperty()
  category: string;

  @ApiPropertyOptional()
  sampleType?: string;

  @ApiProperty()
  tatHours: number;

  @ApiProperty()
  standardPrice: number;

  @ApiProperty()
  homeCollectionAvailable: boolean;

  @ApiProperty()
  fastingRequired: boolean;

  @ApiProperty({ type: [ProviderPricingResponseDto] })
  providerPricing: ProviderPricingResponseDto[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  preparationInstructions?: string;

  @ApiPropertyOptional()
  reportFormat?: string;

  @ApiPropertyOptional()
  referenceRange?: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}