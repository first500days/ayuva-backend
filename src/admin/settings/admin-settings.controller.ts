import { Body, Controller, Get, Param, Patch, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminSettingsService } from './admin-settings.service';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get()
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  async updateSettings(@Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.settingsService.updateSettings(body, actorId);
  }

  @Patch('feature-flags/:key')
  async updateFeatureFlag(
    @Param('key') key: string,
    @Body('enabled') enabled: boolean,
    @Req() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.settingsService.updateFeatureFlag(key, enabled, actorId);
  }

  @Put('notification-templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: { subject: string; body: string },
    @Req() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.settingsService.updateTemplate(id, body, actorId);
  }
}
