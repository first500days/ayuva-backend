import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { PartnerPriorAuthService } from './partner-prior-auth.service';
import {
  ApprovePriorAuthDto,
  CancelPriorAuthDto,
  PriorAuthDecisionDto,
  PriorAuthQueryDto,
  SubmitPriorAuthDto,
  UpdatePriorAuthDto,
} from './dto/prior-auth.dto';

/** Insurance pre-authorisation for referred patients: rules draft, the insurance desk approves and sends. */
@ApiTags('Partner - Pre-authorisation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@RequirePerm(Perm.CLAIMS_MANAGE)
@Controller('partner/prior-auths')
export class PartnerPriorAuthController {
  constructor(private readonly priorAuth: PartnerPriorAuthService) {}

  @Get()
  list(@PartnerCtx() a: PartnerActor, @Query() q: PriorAuthQueryDto) {
    return this.priorAuth.list(a, q);
  }

  @Post('from-referral/:referralId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Draft (or redraft) the request from the referral and signed notes — a provisional draft, nothing is sent',
  })
  draft(@PartnerCtx() a: PartnerActor, @Param('referralId') id: string) {
    return this.priorAuth.draftForReferral(a, id);
  }

  @Get(':id')
  get(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.priorAuth.get(a, id);
  }

  @Get(':id/packet')
  @ApiOperation({
    summary: 'The request as a FHIR R4 Claim (use: preauthorization)',
  })
  packet(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.priorAuth.packet(a, id);
  }

  @Patch(':id')
  update(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdatePriorAuthDto,
  ) {
    return this.priorAuth.update(a, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'The human approval step; sends to the payer gateway when one is configured',
  })
  approve(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ApprovePriorAuthDto,
  ) {
    return this.priorAuth.approve(a, id, dto.attest);
  }

  @Post(':id/submitted')
  @HttpCode(200)
  @ApiOperation({ summary: "Mark as submitted on the payer's portal" })
  submitted(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: SubmitPriorAuthDto,
  ) {
    return this.priorAuth.markSubmitted(a, id, dto.payerRef);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @ApiOperation({ summary: "Record the payer's answer" })
  decision(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: PriorAuthDecisionDto,
  ) {
    return this.priorAuth.recordDecision(a, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: CancelPriorAuthDto,
  ) {
    return this.priorAuth.cancel(a, id, dto.note);
  }
}
