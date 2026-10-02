import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../auth/guards/consent.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AppNotificationsService } from './app-notifications.service';
import {
  AppNotificationResponseDto,
  ListNotificationsQueryDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('notifications')
export class AppNotificationsController {
  constructor(private readonly appNotificationsService: AppNotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List user's in-app notifications (FR-37)" })
  @ApiOkResponse({ type: [AppNotificationResponseDto] })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<AppNotificationResponseDto[]> {
    return this.appNotificationsService.list(user.sub, query.category);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiCreatedResponse({ type: AppNotificationResponseDto })
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<AppNotificationResponseDto> {
    return this.appNotificationsService.markRead(user.sub, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiCreatedResponse({ type: [AppNotificationResponseDto] })
  markAllRead(@CurrentUser() user: JwtPayload): Promise<AppNotificationResponseDto[]> {
    return this.appNotificationsService.markAllRead(user.sub);
  }

  @Get('preferences')
  @ApiOperation({
    summary: "Get user's channel (push/email/SMS) and category preferences (FR-37, U11)",
  })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  getPreferences(@CurrentUser() user: JwtPayload): Promise<NotificationPreferencesDto> {
    return this.appNotificationsService.getPreferences(user.sub);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Update notification preferences — only the switches sent change (FR-37, U11)',
  })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() prefs: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.appNotificationsService.updatePreferences(user.sub, prefs);
  }
}
