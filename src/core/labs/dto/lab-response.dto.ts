import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DiagnosticTestResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty({ type: [String] })
  aliases: string[];
  @ApiProperty()
  category: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  fromPrice: number;
  @ApiPropertyOptional()
  fromPriceMrp?: number;
  @ApiProperty()
  sampleType: string;
  @ApiProperty()
  turnaroundHours: number;
  @ApiProperty()
  fastingRequired: boolean;
  @ApiProperty({ type: [String] })
  preparation: string[];
  @ApiPropertyOptional()
  includesCount?: number;
  @ApiProperty()
  bookedThisWeek: number;
  @ApiProperty()
  homeCollectionAvailable: boolean;
}

export class LabProviderResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  accreditation: string;
  @ApiProperty()
  rating: number;
  @ApiProperty()
  reviewCount: number;
  @ApiPropertyOptional()
  ratingSource?: string;
  @ApiProperty()
  distanceKm: number;
  @ApiProperty()
  address: string;
  @ApiProperty()
  homeCollection: boolean;
  @ApiPropertyOptional()
  homeCollectionFee?: number;
  @ApiProperty()
  openingHours: string;
  @ApiProperty()
  cashless: boolean;
}

export class LabOfferResponseDto {
  @ApiProperty()
  labId: string;
  @ApiProperty()
  labName: string;
  @ApiProperty()
  testId: string;
  @ApiProperty()
  price: number;
  @ApiPropertyOptional()
  priceMrp?: number;
  @ApiProperty()
  turnaroundHours: number;
  @ApiProperty()
  homeCollection: boolean;
  @ApiProperty()
  rating: number;
  @ApiProperty()
  distanceKm: number;
}
