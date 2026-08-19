import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LabStatus } from '../../../core/labs/schemas/lab.schema';

export class LabVerificationDto {
  @ApiPropertyOptional({ enum: LabStatus })
  @IsOptional()
  @IsEnum(LabStatus)
  status?: LabStatus;
}
