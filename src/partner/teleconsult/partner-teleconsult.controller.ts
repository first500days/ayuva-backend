import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { PublicLinkLimit } from '../../auth/auth-throttle';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../rbac/partner-perm.guard';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { StartTeleconsultDto } from './dto/teleconsult.dto';
import { PartnerTeleconsultService } from './partner-teleconsult.service';

/** Video consultations from Clinical Notes & E-Rx (prescribers). */
@ApiTags('Partner - Teleconsult')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@RequirePerm(Perm.CLINICAL_WRITE)
@Controller('partner/teleconsults')
export class PartnerTeleconsultController {
  constructor(private readonly calls: PartnerTeleconsultService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Open a video room for a linked patient (records their consent); returns the doctor's join token and the patient's link",
  })
  start(@PartnerCtx() a: PartnerActor, @Body() dto: StartTeleconsultDto) {
    return this.calls.start(a, dto);
  }

  @Get(':id')
  get(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.calls.get(a, id);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.calls.end(a, id);
  }
}

/** The patient's join page: the link itself is the credential, so it is rate limited. */
@ApiTags('Public - Teleconsult')
@PublicLinkLimit()
@Controller('public/teleconsult')
export class PublicTeleconsultController {
  constructor(private readonly calls: PartnerTeleconsultService) {}

  @Get(':token')
  info(@Param('token') token: string) {
    return this.calls.publicInfo(token);
  }
}
