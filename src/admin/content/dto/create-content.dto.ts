import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ContentType, ContentStatus } from '../../../core/content/schemas/content.schema';

export class CreateContentDto {
  @ApiProperty({ example: 'How to book an appointment' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'how-to-book' })
  @IsString()
  slug: string;

  @ApiProperty({ enum: ContentType })
  @IsEnum(ContentType)
  type: ContentType;

  @ApiPropertyOptional({ example: '<p>Step by step guide...</p>' })
  @IsOptional()
  @IsString()
  body?: string;
}
