import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ActivityQueryDto {
  @ApiPropertyOptional({ description: 'Staff member id' })
  @IsOptional()
  @IsMongoId()
  memberId?: string;
  @ApiPropertyOptional({
    description: "Only staff in this primary department, e.g. 'Radiology'",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
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

/** Security & Logs "Freeze account": pause a login straight from a suspicious activity row. */
export class FreezeAccountDto {
  @ApiProperty({
    description: 'The login behind the activity row (actorUserId)',
  })
  @IsMongoId()
  userId: string;

  @ApiProperty({ example: 'Downloaded 40 patient files after midnight' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'The activity row that prompted the freeze',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  activityId?: string;
}
