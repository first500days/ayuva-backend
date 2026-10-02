import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MedicalRecordType } from '../../records/schemas/medical-record.schema';
import { ShareDuration, ShareScope } from '../share-scope';

const GRANTABLE_SCOPES = [
  ShareScope.FULL,
  ShareScope.ROLLING_MONTHS,
  ShareScope.TYPES,
  ShareScope.DOCUMENTS,
];

export class CreateGrantDto {
  @ApiProperty({ description: 'A verified partner from GET /sharing/organisations' })
  @IsMongoId()
  organisationId: string;

  @ApiProperty({ enum: GRANTABLE_SCOPES })
  @IsIn(GRANTABLE_SCOPES)
  scopeKind: ShareScope;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required for scopeKind "documents"',
  })
  @ValidateIf((o: CreateGrantDto) => o.scopeKind === ShareScope.DOCUMENTS)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  recordIds?: string[];

  @ApiPropertyOptional({
    enum: MedicalRecordType,
    isArray: true,
    description: 'Required for scopeKind "types"',
  })
  @ValidateIf((o: CreateGrantDto) => o.scopeKind === ShareScope.TYPES)
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(MedicalRecordType, { each: true })
  recordTypes?: MedicalRecordType[];

  @ApiPropertyOptional({
    example: 6,
    description: 'For scopeKind "rolling_months"; defaults to 6',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  rollingMonths?: number;

  @ApiProperty({
    enum: [
      'upcoming_consultation',
      'second_opinion',
      'diagnostic_referral',
      'insurance_claim',
      'other',
    ],
  })
  @IsString()
  purpose: string;

  @ApiProperty({ enum: ShareDuration })
  @IsEnum(ShareDuration)
  duration: ShareDuration;

  @ApiPropertyOptional({
    description:
      'Required for duration "visit": the appointment with this partner the access covers',
  })
  @ValidateIf((o: CreateGrantDto) => o.duration === ShareDuration.VISIT)
  @IsMongoId()
  appointmentId?: string;
}

export class ShareOrganisationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() address: string;
  @ApiProperty() connected: boolean;
  @ApiPropertyOptional({ description: 'Partner Portal provider, when linked' })
  providerId?: string;
}

export class ShareGrantResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organisationId: string;
  @ApiProperty() organisationName: string;
  @ApiProperty() scopeKind: string;
  @ApiProperty({ example: 'Last 6 months' }) scopeLabel: string;
  @ApiProperty({ type: [String] }) recordIds: string[];
  @ApiProperty({ type: [String] }) recordTitles: string[];
  @ApiProperty({ type: [String] }) recordTypes: string[];
  @ApiPropertyOptional() rollingMonths?: number;
  @ApiProperty() purpose: string;
  @ApiProperty() duration: string;
  @ApiPropertyOptional() appointmentId?: string;
  @ApiProperty({ enum: ['active', 'expired', 'revoked'] }) status: string;
  @ApiProperty() grantedAt: string;
  @ApiPropertyOptional() expiresAt?: string;
  @ApiPropertyOptional() revokedAt?: string;
  @ApiProperty() accessCount: number;
  @ApiPropertyOptional() lastAccessedAt?: string;
}

export class AccessLogResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() grantId: string;
  @ApiProperty() organisationName: string;
  @ApiProperty() recordTitle: string;
  @ApiProperty() action: string;
  @ApiPropertyOptional({ description: 'Partner staff member who viewed, when known' })
  viewerName?: string;
  @ApiProperty() occurredAt: string;
}
