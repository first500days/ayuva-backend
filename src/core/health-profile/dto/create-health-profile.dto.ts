import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateHealthProfileDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(0)
  @Max(120)
  age: number;

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
