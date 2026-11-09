import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../rbac/partner-perm.guard';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import {
  CreateMonitorDto,
  RecordVitalsDto,
  UpdateMonitorDto,
} from './dto/telemetry.dto';
import { PartnerTelemetryService } from './partner-telemetry.service';

@ApiTags('Partner - Telemetry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/telemetry')
export class PartnerTelemetryController {
  constructor(private readonly telemetry: PartnerTelemetryService) {}

  @Get('board')
  @RequirePerm(Perm.TELEMETRY_VIEW)
  @ApiOperation({
    summary: 'Every admitted patient: current vitals and early-warning screen',
  })
  board(@PartnerCtx() a: PartnerActor) {
    return this.telemetry.board(a);
  }

  @Get('admissions/:id/vitals')
  @RequirePerm(Perm.TELEMETRY_VIEW)
  history(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.telemetry.history(a, id);
  }

  @Post('admissions/:id/vitals')
  @RequirePerm(Perm.TELEMETRY_RECORD)
  @ApiOperation({ summary: 'Chart observations by hand' })
  record(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: RecordVitalsDto,
  ) {
    return this.telemetry.recordVitals(a, id, dto);
  }

  @Get('monitors')
  @RequirePerm(Perm.TELEMETRY_MANAGE)
  monitors(@PartnerCtx() a: PartnerActor) {
    return this.telemetry.listMonitors(a);
  }

  @Post('monitors')
  @RequirePerm(Perm.TELEMETRY_MANAGE)
  @ApiOperation({ summary: 'Register a monitor; its key is shown this once' })
  createMonitor(@PartnerCtx() a: PartnerActor, @Body() dto: CreateMonitorDto) {
    return this.telemetry.createMonitor(a, dto);
  }

  @Patch('monitors/:id')
  @RequirePerm(Perm.TELEMETRY_MANAGE)
  updateMonitor(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateMonitorDto,
  ) {
    return this.telemetry.updateMonitor(a, id, dto);
  }

  @Post('monitors/:id/rotate-key')
  @RequirePerm(Perm.TELEMETRY_MANAGE)
  rotateKey(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.telemetry.rotateKey(a, id);
  }
}
