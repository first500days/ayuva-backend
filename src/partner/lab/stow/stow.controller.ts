import {
  Controller,
  Headers,
  Ip,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { boundaryOf, parseMultipart } from './multipart-related';
import { stowResponse } from './stow-checks';
import { PartnerStowService } from './partner-stow.service';

/** One request; larger studies arrive in several. */
export const MAX_STOW_BYTES = 100 * 1024 * 1024;

async function readBody(req: Request, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const tooLarge = () =>
  new PayloadTooLargeException(
    `Send at most ${MAX_STOW_BYTES / 1024 / 1024} MB per request: split the study into several`,
  );

/**
 * DICOMweb STOW-RS for a lab's on-site gateway (Orthanc or a PACS). The
 * gateway authenticates with its key; there is no user session.
 */
@ApiTags('DICOMweb ingest')
@UseGuards(ThrottlerGuard)
// A study sent one image per request is many requests; the key is the real gate.
@Throttle({ default: { limit: 1200, ttl: 60_000 } })
@Controller('dicomweb-ingest')
export class StowController {
  constructor(private readonly stow: PartnerStowService) {}

  @Post(['studies', 'studies/:study'])
  @ApiHeader({ name: 'x-analyser-key', required: false, description: 'The gateway key (or Authorization: Bearer)' })
  @ApiOperation({
    summary:
      'Store DICOM images pushed by a scanner or PACS gateway (multipart/related; type="application/dicom")',
  })
  async store(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-analyser-key') keyHeader: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Ip() ip: string,
    @Param('study') _study?: string,
  ) {
    const key = keyHeader ?? /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
    // The key is checked before a byte of the study is read.
    const gateway = await this.stow.gateway(key);
    const boundary = boundaryOf(contentType);
    if (!boundary)
      throw new UnsupportedMediaTypeException(
        'Send multipart/related; type="application/dicom" with a boundary',
      );
    const parts = parseMultipart(await readBody(req, MAX_STOW_BYTES), boundary);
    const { status, body } = stowResponse(await this.stow.store(gateway, parts, ip));
    res.status(status).type('application/dicom+json').send(JSON.stringify(body));
  }
}
