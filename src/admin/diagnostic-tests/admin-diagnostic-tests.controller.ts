import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AdminDiagnosticTestsService } from './admin-diagnostic-tests.service';
import { QueryDiagnosticTestsDto } from './dto/query-diagnostic-tests.dto';
import { CreateDiagnosticTestDto } from './dto/create-diagnostic-test.dto';
import { UpdateDiagnosticTestDto } from './dto/update-diagnostic-test.dto';
import { AdminDiagnosticTestResponseDto } from './dto/admin-diagnostic-test-response.dto';

@ApiTags('Admin - Diagnostic Tests')
@Controller('admin/diagnostic-tests')
export class AdminDiagnosticTestsController {
  constructor(private readonly service: AdminDiagnosticTestsService) {}

  @Get()
  @ApiOperation({ summary: 'List all diagnostic tests with filters' })
  @ApiResponse({ status: 200, type: [AdminDiagnosticTestResponseDto] })
  async findAll(@Query() query: QueryDiagnosticTestsDto): Promise<AdminDiagnosticTestResponseDto[]> {
    return this.service.findAll(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all unique categories' })
  @ApiResponse({ status: 200, type: [String] })
  async getCategories(): Promise<string[]> {
    return this.service.getCategories();
  }

  @Get('count/active')
  @ApiOperation({ summary: 'Get count of active diagnostic tests' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { count: { type: 'number' } } } })
  async getActiveCount(): Promise<{ count: number }> {
    const count = await this.service.getActiveCount();
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get diagnostic test by ID' })
  @ApiParam({ name: 'id', description: 'Test ObjectId' })
  @ApiResponse({ status: 200, type: AdminDiagnosticTestResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string): Promise<AdminDiagnosticTestResponseDto> {
    return this.service.findOne(id);
  }

  @Get('code/:testCode')
  @ApiOperation({ summary: 'Get diagnostic test by test code' })
  @ApiParam({ name: 'testCode', description: 'Test code (e.g., CBC-001)' })
  @ApiResponse({ status: 200, type: AdminDiagnosticTestResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findByCode(@Param('testCode') testCode: string): Promise<AdminDiagnosticTestResponseDto> {
    return this.service.findByCode(testCode);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new diagnostic test' })
  @ApiResponse({ status: 201, type: AdminDiagnosticTestResponseDto })
  async create(@Body() dto: CreateDiagnosticTestDto): Promise<AdminDiagnosticTestResponseDto> {
    return this.service.create(dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk create diagnostic tests' })
  @ApiResponse({ status: 201, type: [AdminDiagnosticTestResponseDto] })
  async bulkCreate(@Body() dtos: CreateDiagnosticTestDto[]): Promise<AdminDiagnosticTestResponseDto[]> {
    return this.service.bulkCreate(dtos);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update diagnostic test' })
  @ApiParam({ name: 'id', description: 'Test ObjectId' })
  @ApiResponse({ status: 200, type: AdminDiagnosticTestResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDiagnosticTestDto,
  ): Promise<AdminDiagnosticTestResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete diagnostic test' })
  @ApiParam({ name: 'id', description: 'Test ObjectId' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { message: { type: 'string' } } } })
  @ApiResponse({ status: 404, description: 'Not found' })
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    return this.service.delete(id);
  }
}