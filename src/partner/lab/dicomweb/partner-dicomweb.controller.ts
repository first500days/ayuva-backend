import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../../rbac/partner-perm.guard';
import type { PartnerActor } from '../../rbac/partner-perm.guard';
import { Perm } from '../../rbac/partner-permissions';
import {
  PartnerDicomwebService,
  type StudyQuery,
} from './partner-dicomweb.service';
import type { PixelFrame } from './dicom-part10';

const DICOM_JSON = 'application/dicom+json';

interface Part {
  data: Buffer;
  contentType: string;
}

/** A multipart/related body, the form WADO-RS retrieves are sent in. */
function sendMultipart(res: Response, parts: Part[], type: string) {
  const boundary = `ayuva${randomBytes(12).toString('hex')}`;
  res.setHeader(
    'Content-Type',
    `multipart/related; type="${type}"; boundary=${boundary}`,
  );
  const chunks = parts.flatMap((p) => [
    Buffer.from(`--${boundary}\r\nContent-Type: ${p.contentType}\r\n\r\n`),
    p.data,
    Buffer.from('\r\n'),
  ]);
  res.end(Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]));
}

function frameParts(frames: PixelFrame[]): Part[] {
  return frames.map((f) => ({
    data: f.data,
    contentType: `${f.contentType}; transfer-syntax=${f.transferSyntax}`,
  }));
}

/** "1,2,3" → [1, 2, 3], ignoring anything that isn't a number. */
const parseFrames = (list: string) =>
  list
    .split(',')
    .map((n) => Number(n.trim()))
    .filter(Number.isInteger);

@ApiTags('Partner - DICOMweb')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@RequirePerm(Perm.IMAGING_VIEW)
@Controller('partner/dicomweb')
export class PartnerDicomwebController {
  constructor(private readonly dicomweb: PartnerDicomwebService) {}

  // ── QIDO-RS ──────────────────────────────────────────────────────────────

  @Get('studies')
  @Header('Content-Type', DICOM_JSON)
  @ApiOperation({ summary: 'QIDO-RS: search for studies' })
  searchStudies(@PartnerCtx() a: PartnerActor, @Query() q: StudyQuery) {
    return this.dicomweb.searchStudies(a, q);
  }

  @Get('studies/:study/series')
  @Header('Content-Type', DICOM_JSON)
  @ApiOperation({ summary: 'QIDO-RS: series in a study' })
  searchSeries(@PartnerCtx() a: PartnerActor, @Param('study') study: string) {
    return this.dicomweb.searchSeries(a, study);
  }

  @Get('studies/:study/instances')
  @Header('Content-Type', DICOM_JSON)
  @ApiOperation({ summary: 'QIDO-RS: instances in a study' })
  searchStudyInstances(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
  ) {
    return this.dicomweb.searchInstances(a, study);
  }

  @Get('studies/:study/series/:series/instances')
  @Header('Content-Type', DICOM_JSON)
  @ApiOperation({ summary: 'QIDO-RS: instances in a series' })
  searchSeriesInstances(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
    @Param('series') series: string,
  ) {
    return this.dicomweb.searchInstances(a, study, series);
  }

  // ── WADO-RS ──────────────────────────────────────────────────────────────

  @Get('studies/:study/series/:series/metadata')
  @Header('Content-Type', DICOM_JSON)
  @ApiOperation({ summary: 'WADO-RS: metadata for a series' })
  seriesMetadata(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
    @Param('series') series: string,
  ) {
    return this.dicomweb.seriesMetadata(a, study, series);
  }

  @Get('studies/:study/series/:series/instances/:sop/metadata')
  @Header('Content-Type', DICOM_JSON)
  @ApiOperation({ summary: 'WADO-RS: metadata for an instance' })
  metadata(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
    @Param('series') series: string,
    @Param('sop') sop: string,
  ) {
    return this.dicomweb.metadata(a, study, series, sop);
  }

  @Get('studies/:study/series/:series/instances/:sop')
  @ApiOperation({ summary: 'WADO-RS: retrieve an instance' })
  async instance(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
    @Param('series') series: string,
    @Param('sop') sop: string,
    @Res() res: Response,
  ) {
    const data = await this.dicomweb.instance(a, study, series, sop);
    sendMultipart(
      res,
      [{ data, contentType: 'application/dicom' }],
      'application/dicom',
    );
  }

  @Get('studies/:study/series/:series/instances/:sop/frames/:frames')
  @ApiOperation({
    summary: 'WADO-RS: retrieve frames (1-based, comma-separated)',
  })
  async frames(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
    @Param('series') series: string,
    @Param('sop') sop: string,
    @Param('frames') frames: string,
    @Res() res: Response,
  ) {
    const list = await this.dicomweb.frames(
      a,
      study,
      series,
      sop,
      parseFrames(frames),
    );
    sendMultipart(res, frameParts(list), 'application/octet-stream');
  }

  /**
   * Not part of DICOMweb: the instance up to Pixel Data, as DICOM. The viewer's
   * overlays and measurements read real DICOM headers, and this lets a whole
   * series lay out before any pixels are downloaded.
   */
  @Get('studies/:study/series/:series/instances/:sop/header')
  @ApiOperation({ summary: 'An instance without its pixels (Part 10 header)' })
  async header(
    @PartnerCtx() a: PartnerActor,
    @Param('study') study: string,
    @Param('series') series: string,
    @Param('sop') sop: string,
    @Res() res: Response,
  ) {
    const data = await this.dicomweb.header(a, study, series, sop);
    res.setHeader('Content-Type', 'application/dicom');
    res.end(data);
  }
}
