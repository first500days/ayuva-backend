import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../rbac/partner-perm.guard';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { PartnerLabRoutesService } from './partner-lab-routes.service';
import {
  PlanRouteDto,
  RoutesQueryDto,
  SetVisitPinDto,
  SetVisitStatusDto,
} from './dto/lab-routes.dto';

/** Home-collection routes and pickup status. */
@ApiTags('Partner - Lab home collection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lab/routes')
export class PartnerLabRoutesController {
  constructor(private readonly routes: PartnerLabRoutesService) {}

  @Get()
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  @ApiOperation({
    summary:
      "The day's home visits per field collector, with planned order and ETAs",
  })
  day(@PartnerCtx() a: PartnerActor, @Query() q: RoutesQueryDto) {
    return this.routes.day(a, q.date);
  }

  @Post('plan')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  plan(@PartnerCtx() a: PartnerActor, @Body() dto: PlanRouteDto) {
    return this.routes.plan(a, dto);
  }

  @Post('visits/:orderId/status')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  setVisit(
    @PartnerCtx() a: PartnerActor,
    @Param('orderId') orderId: string,
    @Body() dto: SetVisitStatusDto,
  ) {
    return this.routes.setVisit(a, orderId, dto);
  }

  @Post('visits/:orderId/pin')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  setPin(
    @PartnerCtx() a: PartnerActor,
    @Param('orderId') orderId: string,
    @Body() dto: SetVisitPinDto,
  ) {
    return this.routes.setPin(a, orderId, dto);
  }
}
