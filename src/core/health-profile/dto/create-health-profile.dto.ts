import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsBirthDate } from '../../../common/validators/is-birth-date.decorator';

export class CreateHealthProfileDto {
  // Required unless an older app build sends only `age`. The server derives
  // the age from it, so it stays right after every birthday.
  @ApiPropertyOptional({ example: '1984-03-09', description: 'Date of birth (YYYY-MM-DD)' })
  @ValidateIf((dto: CreateHealthProfileDto) => dto.dateOfBirth !== undefined || dto.age === undefined)
  @IsBirthDate({ message: 'Please enter a valid date of birth' })
  dateOfBirth?: string;

  // Older app builds send a typed age instead. An empty field used to be
  // submitted as 0 and showed as "Age 0", so 0 is refused here.
  @ApiPropertyOptional({ example: 42, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Please enter your date of birth' })
  @Max(120)
  age?: number;

  @ApiProperty({ example: 'Female' })
  @IsString()
  gender: string;

  @ApiProperty({ type: [String], example: ['Hypertension', 'Mild Asthma'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  conditions: string[];

  @ApiProperty({ type: [String], example: ['Penicillin', 'Peanuts'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allergies: string[];
}
