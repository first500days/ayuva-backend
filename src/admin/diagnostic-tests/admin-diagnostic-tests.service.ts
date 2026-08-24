import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { DiagnosticTest, DiagnosticTestDocument } from '../../core/labs/schemas/diagnostic-test.schema';
import { QueryDiagnosticTestsDto } from './dto/query-diagnostic-tests.dto';
import { CreateDiagnosticTestDto } from './dto/create-diagnostic-test.dto';
import { UpdateDiagnosticTestDto } from './dto/update-diagnostic-test.dto';
import { AdminDiagnosticTestResponseDto } from './dto/admin-diagnostic-test-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

@Injectable()
export class AdminDiagnosticTestsService {
  constructor(
    @InjectModel(DiagnosticTest.name)
    private readonly diagnosticTestModel: Model<DiagnosticTestDocument>,
  ) {}

  async findAll(query: QueryDiagnosticTestsDto): Promise<AdminDiagnosticTestResponseDto[]> {
    const and: QueryFilter<DiagnosticTestDocument>[] = [];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({
        $or: [
          { testName: re },
          { testCode: re },
          { category: re },
          { tags: re },
        ],
      });
    }
    if (query.category) and.push({ category: query.category });
    if (query.testCode) and.push({ testCode: query.testCode });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });

    const filter: QueryFilter<DiagnosticTestDocument> = and.length > 0 ? { $and: and } : {};

    const sortField = query.sortBy || 'testName';
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    const tests = await this.diagnosticTestModel
      .find(filter)
      .sort(sort)
      .skip(query.skip || 0)
      .limit(query.limit || 50)
      .exec();

    return tests.map((t) => this.toResponse(t));
  }

  async findOne(id: string): Promise<AdminDiagnosticTestResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Diagnostic test not found');
    }
    const test = await this.diagnosticTestModel.findById(id).exec();
    if (!test) {
      throw new NotFoundException('Diagnostic test not found');
    }
    return this.toResponse(test);
  }

  async findByCode(testCode: string): Promise<AdminDiagnosticTestResponseDto> {
    const test = await this.diagnosticTestModel.findOne({ testCode }).exec();
    if (!test) {
      throw new NotFoundException(`Diagnostic test with code ${testCode} not found`);
    }
    return this.toResponse(test);
  }

  async create(dto: CreateDiagnosticTestDto): Promise<AdminDiagnosticTestResponseDto> {
    const test = await this.diagnosticTestModel.create({
      testCode: dto.testCode,
      testName: dto.testName,
      category: dto.category,
      sampleType: dto.sampleType ?? '',
      tatHours: dto.tatHours ?? 0,
      standardPrice: dto.standardPrice ?? 0,
      homeCollectionAvailable: dto.homeCollectionAvailable ?? false,
      fastingRequired: dto.fastingRequired ?? false,
      providerPricing: dto.providerPricing?.map(p => ({
        labId: new Types.ObjectId(p.labId),
        labName: p.labName,
        price: p.price,
        tatHours: p.tatHours ?? 0,
        homeCollection: p.homeCollection ?? true,
        isActive: p.isActive ?? true,
      })) || [],
      isActive: dto.isActive ?? true,
      tags: dto.tags || [],
      description: dto.description,
      preparationInstructions: dto.preparationInstructions,
      reportFormat: dto.reportFormat,
      referenceRange: dto.referenceRange,
    });
    return this.toResponse(test);
  }

  async update(id: string, dto: UpdateDiagnosticTestDto): Promise<AdminDiagnosticTestResponseDto> {
    const test = await this.getTestOrThrow(id);

    if (dto.testCode !== undefined) test.testCode = dto.testCode;
    if (dto.testName !== undefined) test.testName = dto.testName;
    if (dto.category !== undefined) test.category = dto.category;
    if (dto.sampleType !== undefined) test.sampleType = dto.sampleType;
    if (dto.tatHours !== undefined) test.tatHours = dto.tatHours;
    if (dto.standardPrice !== undefined) test.standardPrice = dto.standardPrice;
    if (dto.homeCollectionAvailable !== undefined) test.homeCollectionAvailable = dto.homeCollectionAvailable;
    if (dto.fastingRequired !== undefined) test.fastingRequired = dto.fastingRequired;
    if (dto.providerPricing !== undefined) {
      test.providerPricing = dto.providerPricing.map(p => ({
        labId: new Types.ObjectId(p.labId),
        labName: p.labName,
        price: p.price,
        tatHours: p.tatHours ?? 0,
        homeCollection: p.homeCollection ?? true,
        isActive: p.isActive ?? true,
      }));
    }
    if (dto.isActive !== undefined) test.isActive = dto.isActive;
    if (dto.tags !== undefined) test.tags = dto.tags;
    if (dto.description !== undefined) test.description = dto.description;
    if (dto.preparationInstructions !== undefined) test.preparationInstructions = dto.preparationInstructions;
    if (dto.reportFormat !== undefined) test.reportFormat = dto.reportFormat;
    if (dto.referenceRange !== undefined) test.referenceRange = dto.referenceRange;

    await test.save();
    return this.toResponse(test);
  }

  async delete(id: string): Promise<{ message: string }> {
    const test = await this.getTestOrThrow(id);
    await test.deleteOne();
    return { message: 'Diagnostic test deleted successfully' };
  }

  async bulkCreate(dtos: CreateDiagnosticTestDto[]): Promise<AdminDiagnosticTestResponseDto[]> {
    const tests = await this.diagnosticTestModel.insertMany(
      dtos.map(dto => ({
        ...dto,
        sampleType: dto.sampleType ?? '',
        providerPricing: dto.providerPricing?.map(p => ({
          labId: new Types.ObjectId(p.labId),
          labName: p.labName,
          price: p.price,
          tatHours: p.tatHours ?? 0,
          homeCollection: p.homeCollection ?? true,
          isActive: p.isActive ?? true,
        })) || [],
      }))
    );
    return tests.map(t => this.toResponse(t));
  }

  async getCategories(): Promise<string[]> {
    return this.diagnosticTestModel.distinct('category', { isActive: true }).exec();
  }

  async getActiveCount(): Promise<number> {
    return this.diagnosticTestModel.countDocuments({ isActive: true }).exec();
  }

  private async getTestOrThrow(id: string): Promise<DiagnosticTestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Diagnostic test not found');
    }
    const test = await this.diagnosticTestModel.findById(id).exec();
    if (!test) {
      throw new NotFoundException('Diagnostic test not found');
    }
    return test;
  }

  private toResponse(test: DiagnosticTestDocument | any): AdminDiagnosticTestResponseDto {
    return {
      id: test.id,
      testCode: test.testCode,
      testName: test.testName,
      category: test.category,
      sampleType: test.sampleType ?? '',
      tatHours: test.tatHours ?? 0,
      standardPrice: test.standardPrice ?? 0,
      homeCollectionAvailable: test.homeCollectionAvailable ?? false,
      fastingRequired: test.fastingRequired ?? false,
      providerPricing: (test.providerPricing || []).map((p: any) => ({
        labId: p.labId?.toString(),
        labName: p.labName,
        price: p.price,
        tatHours: p.tatHours ?? 0,
        homeCollection: p.homeCollection ?? true,
        isActive: p.isActive ?? true,
      })),
      isActive: test.isActive ?? true,
      tags: test.tags ?? [],
      description: test.description,
      preparationInstructions: test.preparationInstructions,
      reportFormat: test.reportFormat,
      referenceRange: test.referenceRange,
      createdAt: test.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: test.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}