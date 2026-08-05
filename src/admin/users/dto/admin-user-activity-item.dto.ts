import { ApiProperty } from '@nestjs/swagger';

// GET /admin/users/:id/activity — row-level "activity history" action (FR-12.3).
export class AdminUserActivityItemDto {
  @ApiProperty({ enum: ['appointment', 'medicationLog', 'record'] })
  type: 'appointment' | 'medicationLog' | 'record';

  @ApiProperty({ example: 'Appointment with Dr. Menon — confirmed' })
  label: string;

  @ApiProperty({ example: '2026-08-02T10:00:00.000Z' })
  occurredAt: string;
}
