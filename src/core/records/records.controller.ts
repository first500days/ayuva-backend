import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RecordsService } from './records.service';
import { UploadRecordDto } from './dto/upload-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { AttachAppointmentDto } from './dto/attach-appointment.dto';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';
import { MedicalRecordDetailResponseDto } from './dto/medical-record-detail-response.dto';
import { MedicalRecordType } from './schemas/medical-record.schema';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

@ApiTags('Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.recordsService.upload(user.sub, file, dto.type);
  }

  @Get()
  @ApiOperation({
    summary: 'List records, optionally filtered by category (FR-8.4)',
  })
  @ApiOkResponse({ type: [MedicalRecordResponseDto] })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryRecordsDto,
  ): Promise<MedicalRecordResponseDto[]> {
    return this.recordsService.findAll(user.sub, query.type);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a single record with its AI interpretation status (FR-8.4, FR-9.2)',
  })
  @ApiOkResponse({ type: MedicalRecordDetailResponseDto })
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
