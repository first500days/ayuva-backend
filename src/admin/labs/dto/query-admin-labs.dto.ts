import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LabStatus } from '../../../core/labs/schemas/lab.schema';

export class QueryAdminLabsDto {
  @ApiPropertyOptional({ example: 'pathology' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: LabStatus })
  @IsOptional()
  @IsEnum(LabStatus)
  status?: LabStatus;
}
