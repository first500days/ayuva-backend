import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminGrowthService } from './admin-growth.service';
import { CampaignStatus } from './schemas/growth-campaign.schema';

@Controller('admin/growth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminGrowthController {
  constructor(private readonly growthService: AdminGrowthService) {}

  @Get('overview')
  async getOverview() {
    return this.growthService.getOverview();
  }

  @Get('campaigns')
  async findAll(@Query('status') status?: CampaignStatus) {
    return this.growthService.findAll(status);
  }

  @Get('campaigns/:id')
  async findOne(@Param('id') id: string) {
    return this.growthService.findOne(id);
  }

  @Post('campaigns')
  async create(@Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.growthService.create(body, actorId);
  }

  @Patch('campaigns/:id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.growthService.update(id, body, actorId);
  }

  @Patch('campaigns/:id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: CampaignStatus, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Growth Admin';
    return this.growthService.updateStatus(id, status, actorId, actorName);
  }
}
