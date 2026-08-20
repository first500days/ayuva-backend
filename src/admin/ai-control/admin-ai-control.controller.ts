import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminAiControlService } from './admin-ai-control.service';

@Controller('admin/ai-control')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAiControlController {
  constructor(private readonly aiControlService: AdminAiControlService) {}

  @Get('surfaces')
  async getSurfaces() {
    return this.aiControlService.getSurfaces();
  }

  @Put('surfaces/:surfaceKey')
  async updateSurface(@Param('surfaceKey') surfaceKey: string, @Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.aiControlService.updateSurface(surfaceKey, body, actorId);
  }

  @Get('tools')
  async getTools() {
    return this.aiControlService.getTools();
  }

  @Patch('tools/:toolName')
  async updateToolPermission(
    @Param('toolName') toolName: string,
    @Body() body: { permissionState: 'allowed' | 'confirmation_required' | 'restricted' | 'disabled' },
    @Req() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.aiControlService.updateToolPermission(toolName, body.permissionState, actorId);
  }

  @Get('releases')
  async getReleases() {
    return this.aiControlService.getReleases();
  }

  @Post('releases')
  async createRelease(@Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const author = req.user?.fullName ?? 'AI Operations';
    return this.aiControlService.createRelease({ ...body, author }, actorId);
  }

  @Post('releases/:id/rollback')
  async rollbackToRelease(@Param('id') id: string, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    return this.aiControlService.rollbackToRelease(id, actorId);
  }

  @Get('knowledge-sources')
  async getKnowledgeSources() {
    return this.aiControlService.getKnowledgeSources();
  }

  @Post('knowledge-sources')
  async addKnowledgeSource(@Body() body: any) {
    return this.aiControlService.addKnowledgeSource(body);
  }
}
