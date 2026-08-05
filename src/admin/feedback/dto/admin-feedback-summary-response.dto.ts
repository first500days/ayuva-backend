import { ApiProperty } from '@nestjs/swagger';

// GET /admin/feedback/summary — summary tiles (PRD FR-17.2).
export class AdminFeedbackSummaryResponseDto {
  @ApiProperty({ example: 12 })
  openCount: number;

  @ApiProperty({ example: 3 })
  featureRequestCount: number;

  @ApiProperty({ example: 5 })
  bugReportCount: number;

  @ApiProperty({
    example: 4.2,
    description:
      'Average csatScore across FeedbackItems that have one set; 0 if none have rated yet',
  })
  averageCsat: number;
}
