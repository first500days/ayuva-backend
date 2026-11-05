import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const FAMILY_RELATIONS = [
  'child',
  'parent',
  'spouse',
  'sibling',
  'grandparent',
  'other',
];

export class CreateFamilyMemberDto {
  @ApiProperty({ example: 'Aarav Sharma' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName: string;

  @ApiProperty({ enum: FAMILY_RELATIONS })
  @IsIn(FAMILY_RELATIONS)
  relation: string;

  @ApiProperty({ example: '2018-04-12' })
  @IsISO8601()
  dateOfBirth: string;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  @IsIn(['male', 'female', 'other'])
  gender: string;
}

export class UpdateFamilyMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string;

  @ApiPropertyOptional({ enum: FAMILY_RELATIONS })
  @IsOptional()
  @IsIn(FAMILY_RELATIONS)
  relation?: string;
}
