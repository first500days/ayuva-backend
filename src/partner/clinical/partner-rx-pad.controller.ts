import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
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
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerRxPadService } from './partner-rx-pad.service';
import { UpdateRxPadDto } from './dto/rx-pad.dto';

/** A prescriber's own prescription header and signature (Settings → Prescription pad). */
@ApiTags('Partner - Prescription pad')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@RequirePerm(Perm.CLINICAL_WRITE)
@Controller('partner/rx-pad')
export class PartnerRxPadController {
  constructor(
    private readonly pad: PartnerRxPadService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My prescription pad, plus the letterhead it prints under',
  })
  get(@PartnerCtx() a: PartnerActor) {
    return this.pad.view(a);
  }

  @Put()
  async update(@PartnerCtx() a: PartnerActor, @Body() dto: UpdateRxPadDto) {
    const out = await this.pad.update(a, dto);
    await this.record(a, 'Prescription pad text');
    return out;
  }

  @Post('signature')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 300 * 1024 },
    }),
  )
  async setSignature(
    @PartnerCtx() a: PartnerActor,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const out = await this.pad.setSignature(a, file);
    await this.record(a, 'Signature image saved');
    return out;
  }

  @Delete('signature')
  async removeSignature(@PartnerCtx() a: PartnerActor) {
    const out = await this.pad.removeSignature(a);
    await this.record(a, 'Signature image removed');
    return out;
  }

  @Get('signature')
  async signature(@PartnerCtx() a: PartnerActor, @Res() res: Response) {
    this.image(res, await this.pad.signature(a));
  }

  @Get('logo')
  @ApiOperation({
    summary: "The organisation's letterhead logo, for the live preview",
  })
  async logo(@PartnerCtx() a: PartnerActor, @Res() res: Response) {
    this.image(res, await this.pad.logo(a));
  }

  private image(res: Response, buffer: Buffer) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  private record(a: PartnerActor, label: string) {
    return this.audit.record({
      actorId: a.userId,
      action: AuditAction.PARTNER_SETTINGS_UPDATE,
      targetType: 'PartnerRxPad',
      metadata: { providerId: a.provider.id, memberId: a.member.id, label },
    });
  }
}
