import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class ActivityQueryDto {
  @ApiPropertyOptional({ description: 'Staff member id' })
  @IsOptional()
  @IsMongoId()
  memberId?: string;
  @ApiPropertyOptional({ description: 'Only events about this patient' })
  @IsOptional()
  @IsMongoId()
  patientId?: string;

  @ApiPropertyOptional({
    enum: ['record_access', 'clinical', 'operations', 'admin', 'login'],
  })
  @IsOptional()
  @IsIn(['record_access', 'clinical', 'operations', 'admin', 'login'])
  category?: 'record_access' | 'clinical' | 'operations' | 'admin' | 'login';

  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;

  @ApiPropertyOptional({ default: 300, maximum: 1000 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
