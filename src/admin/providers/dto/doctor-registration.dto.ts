import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const STATUSES = ['pending', 'verified', 'rejected', 'all'] as const;

export class DoctorRegistrationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, default: 'pending' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** PATCH /admin/doctor-registrations/:memberId */
export class DoctorRegistrationDecisionDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional({
    example: 'Not found on the Karnataka Medical Council register',
    description: 'Required when rejecting — shown to the doctor',
  })
  @ValidateIf(
    (dto: DoctorRegistrationDecisionDto) =>
      dto.decision === 'reject' || dto.notes !== undefined,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  notes?: string;
}

export class DoctorRegistrationOrgDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'Hospital' }) type: string;
  @ApiProperty({ example: 'active' }) status: string;
}

/** A doctor's medical council registration awaiting (or after) Ayuva's check. */
export class DoctorRegistrationResponseDto {
  @ApiProperty({ description: 'PartnerMember id' }) memberId: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty({ example: 'Doctor' }) roleLabel: string;
  @ApiProperty() isOwner: boolean;
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() department?: string;
  @ApiProperty({ example: 'KMC-123456' }) registrationNumber: string;
  @ApiProperty({ enum: ['pending', 'verified', 'rejected'] }) status: string;
  @ApiPropertyOptional() submittedAt?: string;
  @ApiPropertyOptional() decidedAt?: string;
  @ApiPropertyOptional() decidedBy?: string;
  @ApiPropertyOptional() notes?: string;
  @ApiPropertyOptional({ enum: ['review', 'organisation'] })
  verifiedVia?: string;
  @ApiProperty({ type: DoctorRegistrationOrgDto })
  organisation: DoctorRegistrationOrgDto;
}
