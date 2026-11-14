import { clientIp } from '../../common/request-context/client-ip';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { PublicLinkLimit } from '../../auth/auth-throttle';
import { ReportDispatchService } from './report-dispatch.service';
import { ReportLinksService } from './report-links.service';

class VerifyReportCodeDto {
  @ApiProperty({ description: 'The 6-digit code sent to the patient', example: '482910' })
  @IsString()
  @Matches(/^\s*\d{6}\s*$/, { message: 'Enter the 6-digit code' })
  code: string;
}

/** The page a WhatsApp or email link opens. No sign-in: the signed link plus a one-time code. */
@ApiTags('Public - secure report links')
@PublicLinkLimit()
@Controller('public/report-links')
export class PublicReportLinksController {
  constructor(
    private readonly links: ReportLinksService,
    private readonly dispatch: ReportDispatchService,
  ) {}

  @Get('view/file')
  @ApiOperation({ summary: 'The report file, during the session after a verified code' })
  async file(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, fileName } = await this.links.file(authorization);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(buffer);
  }

  @Get(':token')
  @ApiOperation({ summary: 'Whether the link can be opened. Changes nothing.' })
  status(@Param('token') token: string) {
    return this.links.status(token);
  }

  @Post(':token/code')
  @HttpCode(200)
  @ApiOperation({ summary: "Send a one-time code to the patient's own phone" })
  sendCode(@Param('token') token: string) {
    return this.links.sendCode(token);
  }

  @Post(':token/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the code and open the report once' })
  verify(
    @Param('token') token: string,
    @Body() dto: VerifyReportCodeDto,
    @Req() req: Request,
  ) {
    return this.links.verifyCode(token, dto.code.trim(), clientIp(req));
  }

  @Post(':token/renew')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a fresh link to the details on record' })
  renew(@Param('token') token: string) {
    return this.dispatch.renew(token);
  }
}
