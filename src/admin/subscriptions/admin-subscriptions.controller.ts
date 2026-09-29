import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import {
  AssignSubscriptionDto,
  CreatePlanDto,
  QuerySubscriptionsDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
} from './dto/subscriptions.dto';

@ApiTags('Admin - Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly service: AdminSubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Free / Premium / Enterprise plans with subscriber counts (A03)' })
  listPlans() {
    return this.service.listPlans();
  }

  @Post('plans')
  @AuditEvent(AuditAction.ADMIN_PLAN_CREATE, 'Plan')
  @UseInterceptors(AuditLogInterceptor)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch('plans/:id')
  @AuditEvent(AuditAction.ADMIN_PLAN_UPDATE, 'Plan')
  @UseInterceptors(AuditLogInterceptor)
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Subscriptions, filterable by tier/status (A03)' })
  list(@Query() query: QuerySubscriptionsDto) {
    return this.service.listSubscriptions(query);
  }

  @Post()
  @ApiOperation({ summary: 'Assign a plan to a user' })
  @AuditEvent(AuditAction.ADMIN_SUBSCRIPTION_UPDATE, 'Subscription')
  @UseInterceptors(AuditLogInterceptor)
  assign(@Body() dto: AssignSubscriptionDto) {
    return this.service.assign(dto);
  }

  @Patch(':id')
  @AuditEvent(AuditAction.ADMIN_SUBSCRIPTION_UPDATE, 'Subscription')
  @UseInterceptors(AuditLogInterceptor)
  setStatus(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.service.setStatus(id, dto.action);
  }
}
