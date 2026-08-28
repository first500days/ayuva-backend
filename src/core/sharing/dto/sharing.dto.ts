import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsString } from 'class-validator';

export class CreateGrantDto {
  @ApiProperty()
  @IsString()
  organisationId: string;

  @ApiProperty({ enum: ['documents', 'summary'] })
  @IsIn(['documents', 'summary'])
  scopeKind: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  recordIds: string[];

  @ApiProperty({ enum: ['upcoming_consultation', 'second_opinion', 'diagnostic_referral', 'insurance_claim', 'other'] })
  @IsString()
  purpose: string;

  @ApiProperty({ enum: ['24h', '7d', '30d', 'until_revoked'] })
  @IsIn(['24h', '7d', '30d', 'until_revoked'])
  duration: string;
}

export class ShareOrganisationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() address: string;
  @ApiProperty() connected: boolean;
}

export class ShareGrantResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organisationId: string;
  @ApiProperty() organisationName: string;
  @ApiProperty() scopeKind: string;
  @ApiProperty({ type: [String] }) recordIds: string[];
  @ApiProperty({ type: [String] }) recordTitles: string[];
  @ApiProperty() purpose: string;
  @ApiProperty() duration: string;
  @ApiProperty() status: string;
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
  @ApiProperty() occurredAt: string;
}
