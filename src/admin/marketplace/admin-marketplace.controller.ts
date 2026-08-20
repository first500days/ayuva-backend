import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminMarketplaceService } from './admin-marketplace.service';

@Controller('admin/marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMarketplaceController {
  constructor(private readonly marketplaceService: AdminMarketplaceService) {}

  @Get('taxonomies')
  async getTaxonomies() {
    return this.marketplaceService.getTaxonomies();
  }

  @Post('taxonomies')
  async createTaxonomy(@Body() body: any) {
    return this.marketplaceService.createTaxonomy(body);
  }

  @Get('quality-flags')
  async getQualityFlags() {
    return this.marketplaceService.getQualityFlags();
  }

  @Post('quality-flags/:id/resolve')
  async resolveQualityFlag(@Param('id') id: string, @Req() req: any) {
    const actorName = req.user?.fullName ?? 'Network Admin';
    return this.marketplaceService.resolveQualityFlag(id, actorName);
  }

  @Get('freshness')
  async getFreshness() {
    return this.marketplaceService.getFreshnessOverview();
  }

  @Get('config')
  async getConfig() {
    return this.marketplaceService.getConfig();
  }

  @Patch('config')
  async updateConfig(@Body() body: any) {
    return this.marketplaceService.updateConfig(body);
  }
}
