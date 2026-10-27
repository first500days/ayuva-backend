import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { StaffRole } from '../../rbac/partner-permissions';
import { CAPACITY_SCOPES, PartnerTrigger } from '../partner-triggers';

export class NotificationRuleDto {
  @ApiProperty({ enum: PartnerTrigger })
  @IsEnum(PartnerTrigger)
  trigger: PartnerTrigger;
  @ApiProperty() @IsBoolean() inApp: boolean;
  @ApiProperty() @IsBoolean() email: boolean;
  @ApiProperty() @IsBoolean() sms: boolean;
  @ApiProperty() @IsBoolean() desktop: boolean;
  @ApiProperty() @IsBoolean() webhook: boolean;

  @ApiProperty({ enum: StaffRole, isArray: true })
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(StaffRole, { each: true })
  roles: StaffRole[];
}

export class WebhookConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;

  @ApiPropertyOptional({
    example: 'https://hooks.example-hospital.in/ayuva',
    description: 'Empty string removes it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

/** "Alert when ICU occupancy reaches 95%" — who hears and how follows the capacity_warning rule. */
export class CapacityRuleDto {
  @ApiProperty({ example: 'icu' })
  @Matches(/^[a-z0-9-]{1,40}$/, {
    message: 'id must be lowercase letters, digits or dashes',
  })
  id: string;

  @ApiProperty({ enum: CAPACITY_SCOPES })
  @IsIn(CAPACITY_SCOPES)
  scope: string;

  @ApiProperty({ minimum: 50, maximum: 100, example: 95 })
  @IsInt()
  @Min(50)
  @Max(100)
  thresholdPercent: number;

  @ApiProperty() @IsBoolean() enabled: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ type: [NotificationRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => NotificationRuleDto)
  rules?: NotificationRuleDto[];

  @ApiPropertyOptional({ type: [CapacityRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CapacityRuleDto)
  capacityRules?: CapacityRuleDto[];

  @ApiPropertyOptional({
    description:
      'Diagnostic centres: send an immediate high-priority alert when a result falls in the critical (panic) range',
  })
  @IsOptional()
  @IsBoolean()
  criticalOnEntry?: boolean;

  @ApiPropertyOptional({ type: WebhookConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigDto)
  webhook?: WebhookConfigDto;
}
