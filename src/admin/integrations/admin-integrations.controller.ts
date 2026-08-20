import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminIntegrationsService } from './admin-integrations.service';

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminIntegrationsController {
  constructor(private readonly integrationsService: AdminIntegrationsService) {}

  @Get()
  async getConnectors() {
    return this.integrationsService.getConnectors();
  }

  @Get('webhooks')
  async getWebhooks() {
    return this.integrationsService.getWebhooks();
  }

  @Post('webhooks/:id/retry')
  async retryWebhook(@Param('id') id: string, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.integrationsService.retryWebhook(id, actorId);
  }

  @Post('sync/:connectorKey')
  async syncConnector(@Param('connectorKey') connectorKey: string, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.integrationsService.syncConnector(connectorKey, actorId);
  }
}
