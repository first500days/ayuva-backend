import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

export class QueryTestsDto {
  @ApiPropertyOptional({ example: 'CBC' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ enum: ['blood', 'imaging', 'package', 'cardiac', 'hormone', 'All'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: '500' })
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsString()
  homeCollectionOnly?: string;
}
