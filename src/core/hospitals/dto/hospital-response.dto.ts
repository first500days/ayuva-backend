import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperationalTagDto {
  @ApiProperty()
  label: string;
  @ApiProperty()
  icon: string;
  @ApiProperty()
  verified: boolean;
}

export class DepartmentDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  icon: string;
  @ApiProperty()
  doctorCount: number;
}

export class SlotPreviewDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  date: string;
  @ApiProperty()
  time: string;
}

export class HospitalResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Apollo Hospital' })
  name: string;

  @ApiProperty({ example: 'multi_speciality' })
  type: string;

  @ApiProperty({ example: 'Multi-speciality' })
  typeLabel: string;

  @ApiProperty({ example: 'Plot 12, Sector 21, Noida' })
  address: string;

  @ApiProperty({ example: 'Sector 21' })
  locality: string;

  @ApiProperty({ example: 2.4 })
  distanceKm: number;

  @ApiProperty({ example: 28.5673 })
  lat: number;

  @ApiProperty({ example: 77.3211 })
  lng: number;

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiProperty({ example: 4.5 })
  rating: number;

  @ApiProperty({ example: 312 })
  reviewCount: number;

  @ApiPropertyOptional()
  ratingSource?: string;

  @ApiProperty({ example: 300 })
  consultationFeeFrom: number;

  @ApiPropertyOptional()
  consultationFeeFromMrp?: number;

  @ApiProperty({ example: 45 })
  doctorCount: number;

  @ApiPropertyOptional()
  bedCount?: number;

  @ApiPropertyOptional()
  establishedYear?: number;

  @ApiProperty({ type: [OperationalTagDto] })
  operationalTags: OperationalTagDto[];

  @ApiProperty({ type: [DepartmentDto] })
  departments: DepartmentDto[];

  @ApiProperty({ type: [String] })
  facilities: string[];

  @ApiProperty({ type: [String] })
  insuranceAccepted: string[];

  @ApiProperty()
  cashless: boolean;

  @ApiProperty({ type: [SlotPreviewDto] })
  nextAvailableSlots: SlotPreviewDto[];

  @ApiProperty()
  about: string;
}
