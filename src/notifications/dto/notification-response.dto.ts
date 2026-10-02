import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '../schemas/app-notification.schema';

export class AppNotificationResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  trigger: string;
  @ApiProperty({ enum: NOTIFICATION_CATEGORIES })
  category: NotificationCategory;
  @ApiProperty()
  title: string;
  @ApiProperty()
  message: string;
  @ApiProperty()
  lockScreenText: string;
  @ApiProperty()
  actionLabel: string;
  @ApiProperty()
  actionRoute: string;
  @ApiPropertyOptional()
  actionParams?: Record<string, string>;
  @ApiProperty()
  occurredAt: string;
  @ApiProperty()
  read: boolean;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    enum: NOTIFICATION_CATEGORIES,
    description: 'U11 filter tab; omit for All',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category?: NotificationCategory;
}

/** U11 channel settings plus per-category switches. */
export class NotificationPreferencesDto {
  @ApiProperty({ description: 'Push channel' })
  @IsBoolean()
  push: boolean;
  @ApiProperty({ description: 'Email channel' })
  @IsBoolean()
  email: boolean;
  @ApiProperty({ description: 'SMS channel — appointment reminders only' })
  @IsBoolean()
  sms: boolean;

  @ApiProperty()
  @IsBoolean()
  appointments: boolean;
  @ApiProperty()
  @IsBoolean()
  results: boolean;
  @ApiProperty()
  @IsBoolean()
  sharing: boolean;
  @ApiProperty()
  @IsBoolean()
  medications: boolean;
  @ApiProperty()
  @IsBoolean()
  family: boolean;
  @ApiProperty()
  @IsBoolean()
  marketing: boolean;
  @ApiProperty({ description: 'When on, lock-screen previews use lockScreenText only' })
  @IsBoolean()
  hideSensitiveOnLockScreen: boolean;
}

/** PUT body: every field optional so older app builds (no channel switches) keep working. */
export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() push?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() email?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() appointments?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() results?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sharing?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() medications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() family?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketing?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hideSensitiveOnLockScreen?: boolean;
}
