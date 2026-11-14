import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RecordViewKeysService } from './record-view-keys.service';

/**
 * Opens a shared record with a single-use key from
 * POST /partner/shared-records/:grantId/records/:recordId/view-key. The key is
 * the credential (so it works in a new tab or viewer); it is spent on use.
 */
@ApiTags('Partner Portal')
@Controller('partner/record-view')
export class PartnerRecordViewController {
  constructor(private readonly keys: RecordViewKeysService) {}

  @Get()
  @ApiOperation({
    summary: 'Open one shared record with its single-use key (logged)',
  })
  async open(@Query('key') key: string, @Res() res: Response) {
    const { buffer, fileName } = await this.keys.redeem(key ?? '');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"`,
    );
    res.send(buffer);
  }
}
