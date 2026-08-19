import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { HospitalStatus, HospitalType } from '../../../core/hospitals/schemas/hospital.schema';

export class QueryAdminHospitalsDto {
  @ApiPropertyOptional({ example: 'city' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: HospitalType })
  @IsOptional()
  @IsEnum(HospitalType)
  type?: HospitalType;

  @ApiPropertyOptional({ enum: HospitalStatus })
  @IsOptional()
  @IsEnum(HospitalStatus)
  status?: HospitalStatus;
}
