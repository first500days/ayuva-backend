import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { TestsService, LabsService } from './labs.service';
import { QueryTestsDto } from './dto/query-tests.dto';
import { DiagnosticTestResponseDto, LabOfferResponseDto, LabProviderResponseDto } from './dto/lab-response.dto';

@ApiTags('Diagnostic Tests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  @ApiOperation({ summary: 'Search diagnostic tests (FR-7.9)' })
  @ApiOkResponse({ type: [DiagnosticTestResponseDto] })
  findAll(@Query() query: QueryTestsDto): Promise<DiagnosticTestResponseDto[]> {
    return this.testsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Diagnostic test detail (FR-7.10)' })
  @ApiOkResponse({ type: DiagnosticTestResponseDto })
  findOne(@Param('id') id: string): Promise<DiagnosticTestResponseDto> {
    return this.testsService.findOne(id);
  }

  @Get(':id/offers')
  @ApiOperation({ summary: "Lab offers for a given test — for comparison screen (FR-7.10)" })
  @ApiOkResponse({ type: [LabOfferResponseDto] })
  offersForTest(@Param('id') id: string): Promise<LabOfferResponseDto[]> {
    return this.testsService.offersForTest(id);
  }
}

@ApiTags('Labs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('labs')
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  @Get()
  @ApiOperation({ summary: 'List all active labs (FR-7.7)' })
  @ApiOkResponse({ type: [LabProviderResponseDto] })
  findAll(): Promise<LabProviderResponseDto[]> {
    return this.labsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lab detail (FR-7.8)' })
  @ApiOkResponse({ type: LabProviderResponseDto })
  findOne(@Param('id') id: string): Promise<LabProviderResponseDto> {
    return this.labsService.findOne(id);
  }
}
