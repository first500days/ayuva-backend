import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsArray, IsOptional, IsNumber, IsEmail } from 'class-validator';
import { HospitalType, HospitalStatus } from '../../../core/hospitals/schemas/hospital.schema';

export class CreateHospitalDto {
  @ApiProperty({ example: 'Ayuva Clinic Indiranagar' })
  @IsString()
  name: string;

  @ApiProperty({ enum: HospitalType })
  @IsEnum(HospitalType)
  type: HospitalType;

  @ApiPropertyOptional({ enum: HospitalStatus })
  @IsOptional()
  @IsEnum(HospitalStatus)
  status?: HospitalStatus;

  @ApiPropertyOptional({ example: 'contact@hospital.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  specialty: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  departments: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  facilities: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  locations: { label: string; address: string; lat?: number; lng?: number }[];

  @ApiPropertyOptional({ example: 4.8 })
  @IsOptional()
  @IsNumber()
  rating?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  avgWaitMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
