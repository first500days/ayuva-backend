import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminMarketplaceService } from './admin-marketplace.service';
import { MapServiceDto } from './dto/map-service.dto';

@Controller('admin/marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('marketplace')
export class AdminMarketplaceController {
  constructor(private readonly marketplaceService: AdminMarketplaceService) {}

  @Get('taxonomies')
  async getTaxonomies() {
    return this.marketplaceService.getTaxonomies();
  }

  @Get('provider-services')
  async searchProviderServices(@Query('q') q = '') {
    return this.marketplaceService.searchProviderServices(q);
  }

  @Post('taxonomies/:id/mapped-services')
  async mapService(
    @Param('id') id: string,
    @Body() dto: MapServiceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marketplaceService.mapService(id, dto, { id: user.sub, email: user.email });
  }

  @Delete('taxonomies/:id/mapped-services/:mappingId')
  async unmapService(
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marketplaceService.unmapService(id, mappingId, user.sub);
  }

  @Post('taxonomies')
  async createTaxonomy(@Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.createTaxonomy(body, actorId);
  }

  @Put('taxonomies/:id')
  async updateTaxonomy(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.updateTaxonomy(id, body, actorId);
  }

  @Delete('taxonomies/:id')
  async deleteTaxonomy(@Param('id') id: string, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.deleteTaxonomy(id, actorId);
  }

  @Post('taxonomies/bulk-import')
  async bulkImportTaxonomies(@Body() body: { items: any[] }, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.bulkImportTaxonomies(body.items, actorId);
  }

  @Post('taxonomies/reorder')
  async reorderTaxonomies(@Body() body: { orderedIds: string[] }, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.reorderTaxonomies(body.orderedIds, actorId);
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

  @Get('quality-rules')
  async getQualityDetectionRules() {
    return this.marketplaceService.getQualityDetectionRules();
  }

  @Put('quality-rules/:ruleId')
  async updateQualityDetectionRule(@Param('ruleId') ruleId: string, @Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.updateQualityDetectionRule(ruleId, body, actorId);
  }

  @Post('quality-checks/run')
  async runQualityChecks(@Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? 'system';
    return this.marketplaceService.runQualityChecks();
  }

  @Get('freshness')
  async getFreshness() {
    return this.marketplaceService.getFreshnessOverview();
  }

  @Post('freshness/sync')
  async triggerFreshnessSync(@Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.triggerFreshnessSync(actorId);
  }

  @Get('config')
  async getConfig() {
    return this.marketplaceService.getConfig();
  }

  @Patch('config')
  async updateConfig(@Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.marketplaceService.updateConfig(body, actorId);
  }

  @Get('config/history')
  async getConfigHistory() {
    return this.marketplaceService.getConfigHistory();
  }
}