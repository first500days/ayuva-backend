import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { HospitalStatus } from '../../../core/hospitals/schemas/hospital.schema';

export class HospitalVerificationDto {
  @ApiPropertyOptional({ enum: HospitalStatus })
  @IsOptional()
  @IsEnum(HospitalStatus)
  status?: HospitalStatus;
}
