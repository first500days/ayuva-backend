import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import { PartnerAnalysersService } from './partner-analysers.service';
import {
  CreateAnalyserDto,
  IngestMessageDto,
  UpdateAnalyserDto,
} from './dto/analyser.dto';

/** Analyser set-up (admins) and the interface log (lab staff). */
@ApiTags('Partner - Lab analysers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lab/analysers')
export class PartnerAnalysersController {
  constructor(private readonly analysers: PartnerAnalysersService) {}

  @Get()
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  list(@PartnerCtx() a: PartnerActor) {
    return this.analysers.list(a);
  }

  @Post()
  @RequirePerm(Perm.LAB_CATALOG)
  @ApiOperation({
    summary: 'Register an analyser; returns its bridge key once',
  })
  create(@PartnerCtx() a: PartnerActor, @Body() dto: CreateAnalyserDto) {
    return this.analysers.create(a, dto);
  }

  @Patch(':id')
  @RequirePerm(Perm.LAB_CATALOG)
  update(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateAnalyserDto,
  ) {
    return this.analysers.update(a, id, dto);
  }

  @Post(':id/rotate-key')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_CATALOG)
  rotateKey(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.analysers.rotateKey(a, id);
  }

  @Get(':id/messages')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  messages(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.analysers.messages(a, id);
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_CATALOG)
  @ApiOperation({
    summary:
      'Run a pasted message through the interface (results are applied, as from the bridge)',
  })
  test(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: IngestMessageDto,
  ) {
    return this.analysers.testMessage(a, id, dto.message);
  }
}

/** Machine endpoint for the on-site bridge (no user session; the analyser key identifies it). */
@ApiTags('LIS bridge')
@Controller('lis')
export class LisIngestController {
  constructor(private readonly analysers: PartnerAnalysersService) {}

  @Post('ingest')
  @HttpCode(200)
  @ApiHeader({ name: 'x-analyser-key', required: true })
  @ApiOperation({
    summary:
      'Receive one HL7 or ASTM result message from the on-site bridge; returns the HL7 ACK to relay',
  })
  ingest(
    @Headers('x-analyser-key') key: string | undefined,
    @Body() dto: IngestMessageDto,
    @Ip() ip: string,
  ) {
    return this.analysers.ingest(key, dto.message, ip);
  }
}
