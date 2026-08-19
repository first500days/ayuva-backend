import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminRecordsService } from './admin-records.service';
import { QueryAdminRecordsDto } from './dto/query-admin-records.dto';
import { AdminRecordResponseDto } from './dto/admin-record-response.dto';

@ApiTags('Admin - Medical Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/records')
export class AdminRecordsController {
  constructor(private readonly adminRecordsService: AdminRecordsService) {}

  @Get()
  @ApiOperation({ summary: 'Medical records list (FR-5.7)' })
  @ApiOkResponse({ type: [AdminRecordResponseDto] })
  findAll(@Query() query: QueryAdminRecordsDto): Promise<AdminRecordResponseDto[]> {
    return this.adminRecordsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single medical record detail (FR-5.7)' })
  @ApiOkResponse({ type: AdminRecordResponseDto })
  findOne(@Param('id') id: string): Promise<AdminRecordResponseDto> {
    return this.adminRecordsService.findOne(id);
  }
}
