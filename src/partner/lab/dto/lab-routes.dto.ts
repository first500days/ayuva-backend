import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class RoutesQueryDto {
  @ApiPropertyOptional({ example: '2026-11-06' })
  @IsOptional()
  @Matches(YMD, { message: 'date: YYYY-MM-DD' })
  date?: string;
}

export class PlanRouteDto {
  @ApiProperty({ example: '2026-11-06' })
  @Matches(YMD, { message: 'date: YYYY-MM-DD' })
  date: string;

  @ApiProperty()
  @IsMongoId()
  collectorMemberId: string;
}

export const VISIT_STATUSES = ['en_route', 'arrived', 'collected', 'not_home'];

export class SetVisitStatusDto {
  @ApiProperty({ enum: VISIT_STATUSES })
  @IsIn(VISIT_STATUSES)
  status: string;

  @ApiPropertyOptional({
    description: 'Required when the patient was not available',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SetVisitPinDto {
  @ApiProperty({
    example: 'https://maps.google.com/?q=12.9352,77.6245',
    description: 'Coordinates or a Google Maps link',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  location: string;
}
