import { ApiProperty } from '@nestjs/swagger';

export class AiInteractionsKpiDto {
  @ApiProperty({
    example: 0,
    description:
      'Real count from AIInteractionLog — zero/flat until Phase 3 AI services are built (TRD §5.1 step 4)',
  })
  total: number;

  @ApiProperty({
    example: 0,
    description:
      'Period-over-period trend delta (FR-11.1) — flat until Phase 3 has data',
  })
  trendPercent: number;
}

export class AppointmentsKpiDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 12 })
  upcoming: number;

  @ApiProperty({ example: 25 })
  completed: number;

  @ApiProperty({ example: 5 })
  cancelled: number;

  @ApiProperty({
    example: 8,
    description:
      'Trend on `total`: appointments created in the last 7 days vs. the 7 days before that (FR-11.1)',
  })
  trendPercent: number;
}

export class ProviderUtilisationKpiDto {
  @ApiProperty({ example: 30, description: 'Booked AppointmentSlot count' })
  bookedSlots: number;

  @ApiProperty({ example: 70, description: 'Open AppointmentSlot count' })
  openSlots: number;

  @ApiProperty({
    example: 30,
    description: 'booked / (booked + open) as a percentage (FR-11.4)',
  })
  utilisationPercent: number;

  @ApiProperty({
    example: 5,
    description:
      'Trend on booked-slot count: created in the last 7 days vs. the 7 days before that (FR-11.1)',
  })
  trendPercent: number;
}

export class UsageByModuleDto {
  @ApiProperty({ example: 'appointments' })
  module: string;

  @ApiProperty({
    example: 62,
    description:
      'Distinct patients with at least one document in this module, as a % of totalUsers (FR-11.3)',
  })
  adoptionPercent: number;
}

export class AdminAnalyticsOverviewResponseDto {
  @ApiProperty({ example: 128 })
  totalUsers: number;

  @ApiProperty({
    example: 10,
    description:
      'Trend on totalUsers: patients created in the last 7 days vs. the 7 days before that (FR-11.1)',
  })
  totalUsersTrendPercent: number;

  @ApiProperty({ example: 96 })
  activeUsers: number;

  @ApiProperty({
    example: 6,
    description:
      'Trend on activeUsers: active patients created in the last 7 days vs. the 7 days before that (FR-11.1)',
  })
  activeUsersTrendPercent: number;

  @ApiProperty({ type: AiInteractionsKpiDto })
  aiInteractions: AiInteractionsKpiDto;

  @ApiProperty({ type: AppointmentsKpiDto })
  appointments: AppointmentsKpiDto;

  @ApiProperty({ type: ProviderUtilisationKpiDto })
  providerUtilisation: ProviderUtilisationKpiDto;

  @ApiProperty({
    example: 0,
    description:
      'Count of interpreted ReportInterpretation docs — honest zero until Phase 3 (FR-11.1 "Reports read")',
  })
  reportsRead: number;

  @ApiProperty({
    example: 4,
    description:
      'Trend on reportsRead: interpreted in the last 7 days vs. the 7 days before that (FR-11.1)',
  })
  reportsReadTrendPercent: number;

  @ApiProperty({
    type: [UsageByModuleDto],
    description: 'Adoption percentage per module (FR-11.3)',
  })
  usageByModule: UsageByModuleDto[];
}

export class AiInteractionsOverTimePointDto {
  @ApiProperty({ example: '2026-07-20T00:00:00.000Z' })
  periodStart: string;

  @ApiProperty({ example: 14 })
  count: number;
}
