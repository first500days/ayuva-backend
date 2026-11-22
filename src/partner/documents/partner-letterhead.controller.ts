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
import { PartnerLetterheadService } from './partner-letterhead.service';
import { PartnerDocumentsService } from './partner-documents.service';
import { UpdateLetterheadDto } from './dto/letterhead.dto';

/** Header, footer and logo on prescriptions, lab reports and other issued documents. */
@ApiTags('Partner - Letterhead')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/letterhead')
export class PartnerLetterheadController {
  constructor(
    private readonly letterhead: PartnerLetterheadService,
    private readonly documents: PartnerDocumentsService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @RequirePerm(Perm.ORG_SETTINGS)
  get(@PartnerCtx() a: PartnerActor) {
    return this.letterhead.get(a);
  }

  @Put()
  @RequirePerm(Perm.ORG_SETTINGS)
  @ApiOperation({
    summary: 'Set the header and footer text for issued documents',
  })
  async update(
    @PartnerCtx() a: PartnerActor,
    @Body() dto: UpdateLetterheadDto,
  ) {
    const out = await this.letterhead.update(a, dto);
    await this.record(a, 'Letterhead text');
    return out;
  }

  @Post('logo')
  @HttpCode(200)
  @RequirePerm(Perm.ORG_SETTINGS)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024 },
    }),
  )
  async setLogo(
    @PartnerCtx() a: PartnerActor,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const out = await this.letterhead.setLogo(a, file);
    await this.record(a, 'Letterhead logo uploaded');
    return out;
  }

  @Delete('logo')
  @RequirePerm(Perm.ORG_SETTINGS)
  async removeLogo(@PartnerCtx() a: PartnerActor) {
    const out = await this.letterhead.removeLogo(a);
    await this.record(a, 'Letterhead logo removed');
    return out;
  }

  @Get('logo')
  @RequirePerm(Perm.ORG_SETTINGS)
  async logo(@PartnerCtx() a: PartnerActor, @Res() res: Response) {
    const buffer = await this.letterhead.logo(a);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  @Get('preview')
  @RequirePerm(Perm.ORG_SETTINGS)
  @ApiOperation({
    summary: 'Sample lab report PDF with the saved letterhead',
  })
  async preview(@PartnerCtx() a: PartnerActor, @Res() res: Response) {
    const provider = await this.letterhead.provider(a);
    const pdf = this.documents.letterheadSamplePdf(
      provider,
      await this.documents.brand(provider),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="Letterhead preview.pdf"',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }

  private record(a: PartnerActor, label: string) {
    return this.audit.record({
      actorId: a.userId,
      action: AuditAction.PARTNER_SETTINGS_UPDATE,
      targetType: 'PartnerLetterhead',
      metadata: { providerId: a.provider.id, label },
    });
  }
}
