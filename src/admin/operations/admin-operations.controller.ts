import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminOperationsService } from './admin-operations.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { AddTimelineEventDto, QueryIssuesDto, ResolveIssueDto, UpdateIssueDto } from './dto/operations.dto';

@Controller('admin/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOperationsController {
  constructor(private readonly operationsService: AdminOperationsService) {}

  @Get('issues')
  async findAll(@Query() query: QueryIssuesDto) {
    return this.operationsService.findAll(query);
  }

  @Get('issues/:id')
  async findOne(@Param('id') id: string) {
    return this.operationsService.findOne(id);
  }

  @Post('issues')
  async create(@Body() createDto: CreateIssueDto, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Operations Admin';
    return this.operationsService.create(createDto, actorId, actorName);
  }

  @Patch('issues/:id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateIssueDto, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Operations Admin';
    return this.operationsService.update(id, updateDto, actorId, actorName);
  }

  @Post('issues/:id/timeline')
  async addTimelineEvent(@Param('id') id: string, @Body() dto: AddTimelineEventDto, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Operations Admin';
    return this.operationsService.addTimelineEvent(id, dto, actorId, actorName);
  }

  @Post('issues/:id/resolve')
  async resolve(@Param('id') id: string, @Body() dto: ResolveIssueDto, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Operations Admin';
    return this.operationsService.resolve(id, dto, actorId, actorName);
  }

  @Post('issues/:id/quick-action')
  async executeQuickAction(@Param('id') id: string, @Body() body: { action: string }, @Req() req: any) {
    const actorId = req.user?.sub ?? req.user?._id ?? '000000000000000000000000';
    const actorName = req.user?.fullName ?? 'Operations Admin';
    return this.operationsService.executeQuickAction(id, body.action, actorId, actorName);
  }
}
