import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppNotificationResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  trigger: string;
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

export class NotificationPreferencesDto {
  @ApiProperty()
  appointments: boolean;
  @ApiProperty()
  results: boolean;
  @ApiProperty()
  sharing: boolean;
  @ApiProperty()
  medications: boolean;
  @ApiProperty()
  marketing: boolean;
  @ApiProperty({ description: 'When on, lock-screen previews use lockScreenText only' })
  hideSensitiveOnLockScreen: boolean;
}
