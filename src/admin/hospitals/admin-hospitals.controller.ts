import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminHospitalsService } from './admin-hospitals.service';
import { QueryAdminHospitalsDto } from './dto/query-admin-hospitals.dto';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { HospitalVerificationDto } from './dto/hospital-verification.dto';
import { AdminHospitalResponseDto } from './dto/admin-hospital-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/hospitals')
export class AdminHospitalsController {
  constructor(private readonly adminHospitalsService: AdminHospitalsService) {}

  @Get()
  @ApiOperation({ summary: 'Hospital directory (FR-5.4)' })
  @ApiOkResponse({ type: [AdminHospitalResponseDto] })
  findAll(@Query() query: QueryAdminHospitalsDto): Promise<AdminHospitalResponseDto[]> {
    return this.adminHospitalsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single hospital detail' })
  @ApiOkResponse({ type: AdminHospitalResponseDto })
  findOne(@Param('id') id: string): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a hospital/clinic (FR-5.4)' })
  @ApiCreatedResponse({ type: AdminHospitalResponseDto })
  @AuditEvent(AuditAction.ADMIN_HOSPITAL_CREATE, 'Hospital')
  @UseInterceptors(AuditLogInterceptor)
  create(@Body() dto: CreateHospitalDto): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a hospital/clinic (FR-5.4)' })
  @ApiOkResponse({ type: AdminHospitalResponseDto })
  @AuditEvent(AuditAction.ADMIN_HOSPITAL_UPDATE, 'Hospital')
  @UseInterceptors(AuditLogInterceptor)
  update(@Param('id') id: string, @Body() dto: UpdateHospitalDto): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.update(id, dto);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Verify a hospital/clinic' })
  @ApiOkResponse({ type: AdminHospitalResponseDto })
  verify(@Param('id') id: string): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.verify(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a hospital/clinic' })
  @ApiOkResponse({ type: AdminHospitalResponseDto })
  reject(@Param('id') id: string): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.reject(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a hospital/clinic' })
  @ApiOkResponse({ type: AdminHospitalResponseDto })
  suspend(@Param('id') id: string): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.suspend(id);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a hospital/clinic' })
  @ApiOkResponse({ type: AdminHospitalResponseDto })
  activate(@Param('id') id: string): Promise<AdminHospitalResponseDto> {
    return this.adminHospitalsService.activate(id);
  }
}
