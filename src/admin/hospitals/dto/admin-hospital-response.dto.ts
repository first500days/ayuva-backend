import { ApiPropertyOptional } from '@nestjs/swagger';
import { HospitalType, HospitalStatus } from '../../../core/hospitals/schemas/hospital.schema';

export class AdminHospitalLocationResponseDto {
  @ApiPropertyOptional({ example: 'Bengaluru' })
  label?: string;

  @ApiPropertyOptional({ example: '123 MG Road' })
  address?: string;

  @ApiPropertyOptional({ example: 12.9716 })
  lat?: number;

  @ApiPropertyOptional({ example: 77.5946 })
  lng?: number;
}

export class AdminHospitalResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: 'Ayuva Clinic Indiranagar' })
  name: string;

  @ApiPropertyOptional({ enum: HospitalType })
  type: HospitalType;

  @ApiPropertyOptional({ type: [String] })
  specialty: string[];

  @ApiPropertyOptional({ type: [AdminHospitalLocationResponseDto] })
  locations: AdminHospitalLocationResponseDto[];

  @ApiPropertyOptional({ type: [String] })
  languages: string[];

  @ApiPropertyOptional({ example: 4.8 })
  rating: number;

  @ApiPropertyOptional({ example: 15 })
  avgWaitMinutes: number;

  @ApiPropertyOptional({ enum: HospitalStatus })
  status: HospitalStatus;

  @ApiPropertyOptional({ example: 'https://cdn.ayuva.health/hospitals/h1.jpg' })
  profileImageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  departments: string[];

  @ApiPropertyOptional({ type: [String] })
  facilities: string[];
}
