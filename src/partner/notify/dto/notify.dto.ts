import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { StaffRole } from '../../rbac/partner-permissions';
import { PartnerTrigger } from '../partner-triggers';

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

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ type: [NotificationRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => NotificationRuleDto)
  rules?: NotificationRuleDto[];

  @ApiPropertyOptional({ type: WebhookConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigDto)
  webhook?: WebhookConfigDto;
}
