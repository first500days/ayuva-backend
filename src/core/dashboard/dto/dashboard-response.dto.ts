import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardProfileDto {
  @ApiProperty({ example: 'Amara Okafor' })
  fullName: string;

  @ApiProperty({ example: 'AO' })
  initials: string;
}

export class DashboardActiveJourneyDto {
  @ApiProperty({ example: 'Chest pain review' })
  title: string;

  @ApiProperty({ example: 'Step 3 of 6' })
  step: string;

  @ApiProperty({ example: 'Cardiologist visit' })
  nextLabel: string;

  @ApiProperty({ example: 48 })
  progressPercent: number;
}

export class DashboardNextVisitDto {
  @ApiProperty({ example: 'Dr. Priya Menon' })
  provider: string;

  @ApiProperty({ example: 'Cardiologist' })
  specialty: string;

  @ApiProperty({ example: '2026-08-14' })
  date: string;

  @ApiProperty({ example: '10:30' })
  time: string;
}

export class DashboardMedicationDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Amlodipine' })
  name: string;

  @ApiProperty({ example: '5 mg' })
  dosage: string;

  @ApiProperty({ example: '08:00' })
  nextDue: string;

  @ApiProperty({ example: true })
  taken: boolean;
}

export class DashboardReportDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Lipid panel — full.pdf' })
  name: string;

  @ApiProperty({ example: 'blood' })
  type: string;

  @ApiProperty({ example: '2026-08-02T00:00:00.000Z' })
  date: string;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardProfileDto })
  profile: DashboardProfileDto;

  @ApiPropertyOptional({
    type: DashboardActiveJourneyDto,
    nullable: true,
    description: 'null until AI Care Journey (Phase 3) creates one',
  })
  activeJourney: DashboardActiveJourneyDto | null;

  @ApiPropertyOptional({ type: DashboardNextVisitDto, nullable: true })
  nextVisit: DashboardNextVisitDto | null;

  @ApiProperty({ type: [DashboardMedicationDto] })
  medications: DashboardMedicationDto[];

  @ApiProperty({ type: [DashboardReportDto] })
  recentReports: DashboardReportDto[];
}
