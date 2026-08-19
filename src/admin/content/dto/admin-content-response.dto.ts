import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminContentResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: 'How to book an appointment' })
  title: string;

  @ApiPropertyOptional({ example: 'how-to-book' })
  slug: string;

  @ApiPropertyOptional({ enum: ['FAQ', 'HELP_ARTICLE', 'POLICY', 'DISCLAIMER', 'HEALTH_EDUCATION'] })
  type: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'UNPUBLISHED'] })
  status: string;

  @ApiPropertyOptional({ example: '2026-08-19T08:00:00.000Z' })
  publishedAt?: string;

  @ApiPropertyOptional({ example: 1 })
  version: number;
}
