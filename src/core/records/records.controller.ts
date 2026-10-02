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
import { UploadRecordDto } from './dto/upload-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { AttachAppointmentDto } from './dto/attach-appointment.dto';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';
import { MedicalRecordDetailResponseDto } from './dto/medical-record-detail-response.dto';
import { MedicalRecordType } from './schemas/medical-record.schema';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

@ApiTags('Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

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
