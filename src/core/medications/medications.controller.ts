import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { MedicationsService } from './medications.service';
import { CreateMedicationLogDto } from './dto/create-medication-log.dto';
import { MedicationsTodayResponseDto } from './dto/medication-today-response.dto';
import { MedicationLogResponseDto } from './dto/medication-log-response.dto';
import { RefillAlertResponseDto } from './dto/refill-alert-response.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { MedicationResponseDto } from './dto/medication-response.dto';

@ApiTags('Medications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('medications')
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Get('today')
  @ApiOperation({
    summary: "Today's medication list + adherence summary (FR-10.1, FR-10.2)",
  })
  @ApiOkResponse({ type: MedicationsTodayResponseDto })
  getToday(
    @CurrentUser() user: JwtPayload,
  ): Promise<MedicationsTodayResponseDto> {
    return this.medicationsService.getToday(user.sub);
  }

  @Post(':id/log')
  @ApiOperation({
    summary: 'Log a dose as taken/upcoming/skipped (FR-10.1, FR-10.6)',
  })
  @ApiCreatedResponse({ type: MedicationLogResponseDto })
  logDose(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateMedicationLogDto,
  ): Promise<MedicationLogResponseDto> {
    return this.medicationsService.logDose(user.sub, id, dto);
  }

  @Get('refill-alerts')
  @ApiOperation({ summary: 'Medications running low on supply (FR-10.4)' })
  @ApiOkResponse({ type: [RefillAlertResponseDto] })
  getRefillAlerts(
    @CurrentUser() user: JwtPayload,
  ): Promise<RefillAlertResponseDto[]> {
    return this.medicationsService.getRefillAlerts(user.sub);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit a medication — reschedules its reminder jobs to match (FR-10.3)',
  })
  @ApiOkResponse({ type: MedicationResponseDto })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMedicationDto,
  ): Promise<MedicationResponseDto> {
    return this.medicationsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a medication — cancels any pending reminder jobs',
  })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.medicationsService.remove(user.sub, id);
  }
}
