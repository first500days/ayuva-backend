import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PlanUpdatesService } from './plan-updates.service';

@ApiTags('Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/plan')
export class MyPlanController {
  constructor(private readonly plans: PlanUpdatesService) {}

  @Get()
  @ApiOperation({
    summary:
      'The signed-in account holder plan (Free without a subscription); the app re-reads it when a plan_changed push arrives',
  })
  get(@CurrentUser() user: JwtPayload) {
    // A guardian viewing a family member still sees their own (account) plan.
    return this.plans.myPlan(user.guardian ?? user.sub);
  }
}
