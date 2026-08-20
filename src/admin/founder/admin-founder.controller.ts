import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminFounderService } from './admin-founder.service';

@Controller('admin/founder')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFounderController {
  constructor(private readonly founderService: AdminFounderService) {}

  @Get('metrics')
  async getMetrics() {
    return this.founderService.getExecutiveMetrics();
  }

  @Get('documents')
  async getDocuments(@Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Founder';
    return this.founderService.getDocuments(actorId, actorName);
  }

  @Post('documents')
  async createDocument(@Body() body: any, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Founder';
    return this.founderService.createDocument(body, actorId, actorName);
  }

  @Get('roadmap')
  async getRoadmap() {
    return this.founderService.getMilestones();
  }

  @Post('roadmap')
  async createMilestone(@Body() body: any) {
    return this.founderService.createMilestone(body);
  }

  @Patch('roadmap/:id')
  async updateMilestone(@Param('id') id: string, @Body() body: any) {
    return this.founderService.updateMilestone(id, body);
  }

  @Get('risks')
  async getRisks() {
    return this.founderService.getRisks();
  }

  @Post('risks')
  async createRisk(@Body() body: any) {
    return this.founderService.createRisk(body);
  }
}
