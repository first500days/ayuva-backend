import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
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
import { ResearchQueryDto, SaveVaultNoteDto } from './dto/vault.dto';
import { PartnerVaultService, VAULT_LIMITS } from './partner-vault.service';

function sendDownload(
  res: Response,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  inline = false,
) {
  res.setHeader('Content-Type', mimeType);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

/** The Doctor's Vault: a prescriber's own notepad, files and literature search. */
@ApiTags("Partner - Doctor's Vault")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@RequirePerm(Perm.CLINICAL_WRITE)
@Controller('partner/vault')
export class PartnerVaultController {
  constructor(private readonly vault: PartnerVaultService) {}

  @Get('notes')
  notes(
    @PartnerCtx() a: PartnerActor,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
  ) {
    return this.vault.notes(a, { ...(q && { q }), ...(tag && { tag }) });
  }

  @Post('notes')
  createNote(@PartnerCtx() a: PartnerActor, @Body() dto: SaveVaultNoteDto) {
    return this.vault.createNote(a, dto);
  }

  @Put('notes/:id')
  updateNote(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: SaveVaultNoteDto,
  ) {
    return this.vault.updateNote(a, id, dto);
  }

  @Delete('notes/:id')
  deleteNote(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.vault.deleteNote(a, id);
  }

  @Get('files')
  files(@PartnerCtx() a: PartnerActor) {
    return this.vault.files(a);
  }

  @Post('files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: VAULT_LIMITS.fileBytes },
    }),
  )
  upload(
    @PartnerCtx() a: PartnerActor,
    @UploadedFile() file: Express.Multer.File,
    @Body('tags') tags?: string,
  ) {
    return this.vault.upload(a, file, tags ? tags.split(',') : undefined);
  }

  @Get('files/:id')
  async download(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const f = await this.vault.download(a, id);
    sendDownload(res, f.buffer, f.name, f.mimeType, true);
  }

  @Delete('files/:id')
  deleteFile(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.vault.deleteFile(a, id);
  }

  @Get('research')
  @ApiOperation({
    summary:
      'Search PubMed, Europe PMC, Cochrane and guidelines (via the free Europe PMC API)',
  })
  research(@Query() q: ResearchQueryDto) {
    return this.vault.research(q);
  }

  @Get('export')
  @ApiOperation({
    summary:
      'Everything in the vault as a ZIP (Markdown notes + files) to take along',
  })
  async exportZip(@PartnerCtx() a: PartnerActor, @Res() res: Response) {
    const { buffer, fileName } = await this.vault.exportZip(a);
    sendDownload(res, buffer, fileName, 'application/zip');
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: VAULT_LIMITS.importBytes },
    }),
  )
  importZip(
    @PartnerCtx() a: PartnerActor,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vault.importZip(a, file);
  }
}
