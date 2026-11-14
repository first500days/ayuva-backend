import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ScanViewKeysService } from './scan-view-keys.service';

/** The app's in-app viewer page: it loads from this origin and reads the file. */
const VIEWER_ORIGIN = 'https://viewer.ayuva.local';

/**
 * GET /scan-view?key=… — opens one imaging study with a single-use link from
 * POST /records/:id/view-key. No bearer token: the link is the credential, so
 * it works once, for 60 seconds, and is never cached.
 */
@ApiTags('Records')
@Controller('scan-view')
export class ScanViewController {
  constructor(private readonly keys: ScanViewKeysService) {}

  @Get()
  @ApiOperation({
    summary:
      "Open one of the patient's own imaging studies with a single-use link (in-app scan viewer)",
  })
  @ApiQuery({ name: 'key', required: true })
  async open(@Query('key') key: string, @Res() res: Response): Promise<void> {
    const { buffer, mimeType } = await this.keys.redeem(String(key ?? ''));
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The viewer page reads PDFs with fetch(); images load as <img>.
    res.setHeader('Access-Control-Allow-Origin', VIEWER_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.send(buffer);
  }
}
