import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FeedbackType } from '../schemas/feedback-item.schema';

export class CreateFeedbackItemDto {
  @ApiProperty({ enum: FeedbackType })
  @IsEnum(FeedbackType)
  type: FeedbackType;

  @ApiProperty({ example: "BP log didn't sync after re-opening the app." })
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({
    example: 4,
    minimum: 1,
    maximum: 5,
    description:
      'Optional patient satisfaction rating for the interaction being reported on (FR-17.2)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  csatScore?: number;
}
