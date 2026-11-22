import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PostCaseMessageDto {
  @ApiProperty({ description: 'Message text; @Name mentions a colleague' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Member ids picked from the @ list; each must also appear in the text as @Name',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsMongoId({ each: true })
  mentions?: string[];
}
