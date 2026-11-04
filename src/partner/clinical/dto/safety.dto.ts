import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ALLERGY_SEVERITIES } from '../schemas/patient-allergy.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AddAllergyDto {
  @ApiProperty({ example: 'Penicillin' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  substance: string;

  @ApiPropertyOptional({ example: 'Urticarial rash' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  reaction?: string;

  @ApiPropertyOptional({ enum: ALLERGY_SEVERITIES })
  @IsOptional()
  @IsIn(ALLERGY_SEVERITIES)
  severity?: string;
}

export class RemoveAllergyDto {
  @ApiProperty({ example: 'Entered in error' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason: string;
}

export class RxCheckItemDto {
  @ApiProperty() @IsString() @MaxLength(120) medicine: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  strength?: string;
}

export class RxCheckDto {
  @ApiProperty() @IsMongoId() patientId: string;

  @ApiProperty({ type: [RxCheckItemDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RxCheckItemDto)
  items: RxCheckItemDto[];
}
