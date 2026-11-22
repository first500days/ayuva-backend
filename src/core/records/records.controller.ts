import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RecordsService } from './records.service';
import { LabTrendsService } from './lab-trends.service';
import { ScanExplainService } from './scan-explain.service';
import { ScanViewKeysService } from './scan-view-keys.service';
import { UploadRecordDto } from './dto/upload-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { AttachAppointmentDto } from './dto/attach-appointment.dto';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';
import { MedicalRecordDetailResponseDto } from './dto/medical-record-detail-response.dto';
import { MedicalRecordType } from './schemas/medical-record.schema';
import { PlainLanguageResponseDto } from './dto/plain-language-response.dto';
import { AskRecordsDto, AskRecordsResponseDto } from './dto/ask-records.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

@ApiTags('Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('records')
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly labTrends: LabTrendsService,
    private readonly scanExplain: ScanExplainService,
    private readonly scanKeys: ScanViewKeysService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Upload a medical record — PDF, photo, or scan (FR-8.1-8.3)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: Object.values(MedicalRecordType),
          nullable: true,
        },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: MedicalRecordResponseDto })
  @AuditEvent(AuditAction.RECORD_UPLOAD, 'MedicalRecord')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
    AuditLogInterceptor,
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.recordsService.upload(user.sub, file, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List records — folder, search by name/tag/provider, tag, kind and date filters (FR-8.4, U08)',
  })
  @ApiOkResponse({ type: [MedicalRecordResponseDto] })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryRecordsDto,
  ): Promise<MedicalRecordResponseDto[]> {
    return this.recordsService.findAll(user.sub, query);
  }

  // Declared before ':id' so the path isn't read as a record id.
  @Get('lab-trends')
  @ApiOperation({
    summary:
      'Lab values over time per test from released partner lab reports, with where the latest sits against the reference range and a plain, rule-based description',
  })
  labTrendsList(@CurrentUser() user: JwtPayload) {
    return this.labTrends.forPatient(user.sub);
  }

  @Get(':id/file')
  @ApiOperation({ summary: "Download the record's file (U08 row menu)" })
  @AuditEvent(AuditAction.RECORD_DOWNLOAD, 'MedicalRecord')
  @UseInterceptors(AuditLogInterceptor)
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName, mimeType } = await this.recordsService.download(
      user.sub,
      id,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/["\r\n]/g, '')}"`,
    );
    res.send(buffer);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename, move folder, tag, set provider/date (U08 row menu)',
  })
  @ApiOkResponse({ type: MedicalRecordResponseDto })
  @AuditEvent(AuditAction.RECORD_UPDATE, 'MedicalRecord')
  @UseInterceptors(AuditLogInterceptor)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.recordsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a record and its file (U08 row menu)' })
  @AuditEvent(AuditAction.RECORD_DELETE, 'MedicalRecord')
  @UseInterceptors(AuditLogInterceptor)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.recordsService.remove(user.sub, id);
  }

  @Post(':id/explain-scan')
  @HttpCode(200)
  @ApiOperation({
    summary:
      '"Explain My Scan": the imaging report\'s conclusion in its own words, its terms in plain language, sizes mentioned, the doctor\'s signed note and questions to ask. Rule-based; always carries the clinical-validation disclaimer.',
  })
  explainScanFor(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scanExplain.explain(user.sub, id);
  }

  @Post(':id/view-key')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'A single-use, 60-second link (GET /scan-view?key=) for the in-app scan viewer; imaging studies only',
  })
  scanViewKey(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scanKeys.issue(user.sub, id);
  }

  @Post('ask')
  @HttpCode(200)
  @ApiOperation({
    summary:
      '"Ask Your Records": answer a question about your own history (last test, how many, a value from your lab PDFs, or a search). Rule-based.',
  })
  @ApiOkResponse({ type: AskRecordsResponseDto })
  ask(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AskRecordsDto,
  ): Promise<AskRecordsResponseDto> {
    return this.recordsService.ask(user.sub, dto.question);
  }

  @Get(':id/plain-language')
  @ApiOperation({
    summary:
      '"Simplify": everyday meanings of the medical words in the document, and each lab value against the range printed beside it. Rule-based; no medical opinion.',
  })
  @ApiOkResponse({ type: PlainLanguageResponseDto })
  @AuditEvent(AuditAction.RECORD_VIEW, 'MedicalRecord')
  @UseInterceptors(AuditLogInterceptor)
  plainLanguage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<PlainLanguageResponseDto> {
    return this.recordsService.plainLanguage(user.sub, id);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a single record with its AI interpretation status (FR-8.4, FR-9.2)',
  })
  @ApiOkResponse({ type: MedicalRecordDetailResponseDto })
  @AuditEvent(AuditAction.RECORD_VIEW, 'MedicalRecord')
  @UseInterceptors(AuditLogInterceptor)
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<MedicalRecordDetailResponseDto> {
    return this.recordsService.findOne(user.sub, id);
  }

  @Post(':id/attach-appointment')
  @ApiOperation({
    summary:
      'Attach a record/its interpretation to an upcoming booked appointment (FR-9.5)',
  })
  @ApiOkResponse({ type: MedicalRecordResponseDto })
  attachToAppointment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AttachAppointmentDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.recordsService.attachToAppointment(
      user.sub,
      id,
      dto.appointmentId,
    );
  }
}
