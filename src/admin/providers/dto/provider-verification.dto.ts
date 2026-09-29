import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

// PATCH /admin/providers/:id/verification (Admin A02 — verification queue).
export class ProviderVerificationDto {
  @ApiProperty({ enum: ['under_review', 'approve', 'reject'] })
  @IsIn(['under_review', 'approve', 'reject'])
  decision: 'under_review' | 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Reviewer notes; shown to the partner on rejection' })
  @IsOptional()
  @IsString()
  notes?: string;
}
