import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DiagnosticTest, DiagnosticTestDocument } from './schemas/diagnostic-test.schema';
import { Lab, LabDocument, LabStatus } from './schemas/lab.schema';
import { QueryTestsDto } from './dto/query-tests.dto';
import {
  DiagnosticTestResponseDto,
  LabOfferResponseDto,
  LabProviderResponseDto,
} from './dto/lab-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

@Injectable()
export class TestsService {
  constructor(
    @InjectModel(DiagnosticTest.name)
    private readonly testModel: Model<DiagnosticTestDocument>,
    @InjectModel(Lab.name)
    private readonly labModel: Model<LabDocument>,
  ) {}

  async findAll(query: QueryTestsDto): Promise<DiagnosticTestResponseDto[]> {
    const filter: Record<string, unknown> = { isActive: true };

    if (query.query) {
      const re = buildSafeRegex(query.query);
      filter['$or'] = [{ testName: re }, { tags: re }];
    }
    if (query.category && query.category !== 'All') {
      filter['category'] = query.category;
    }
    if (query.homeCollectionOnly === 'true') {
      filter['homeCollectionAvailable'] = true;
    }
    if (query.maxPrice) {
      filter['standardPrice'] = { $lte: Number(query.maxPrice) };
    }

    const tests = await this.testModel.find(filter).sort({ testName: 1 }).exec();
    return tests.map((t) => this.toTestResponse(t));
  }

  async findOne(id: string): Promise<DiagnosticTestResponseDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Test not found');
    const test = await this.testModel.findById(id);
    if (!test || !test.isActive) throw new NotFoundException('Test not found');
    return this.toTestResponse(test);
  }

  async offersForTest(testId: string): Promise<LabOfferResponseDto[]> {
    if (!Types.ObjectId.isValid(testId)) throw new NotFoundException('Test not found');
    const test = await this.testModel.findById(testId);
    if (!test) throw new NotFoundException('Test not found');

    return (test.providerPricing ?? [])
      .filter((pp) => pp.isActive)
      .map((pp) => ({
        labId: pp.labId.toString(),
        labName: pp.labName,
        testId: test.id,
        price: pp.price,
        turnaroundHours: pp.tatHours,
        homeCollection: pp.homeCollection,
        rating: 0,
        distanceKm: 0,
      }));
  }

  private toTestResponse(t: DiagnosticTestDocument): DiagnosticTestResponseDto {
    return {
      id: t.id,
      name: t.testName,
      aliases: t.tags ?? [],
      category: t.category,
      description: t.description ?? '',
      fromPrice: t.standardPrice ?? 0,
      sampleType: t.sampleType ?? 'none',
      turnaroundHours: t.tatHours ?? 24,
      fastingRequired: t.fastingRequired ?? false,
      preparation: t.preparationInstructions ? [t.preparationInstructions] : [],
      bookedThisWeek: 0,
      homeCollectionAvailable: t.homeCollectionAvailable ?? false,
    };
  }
}

@Injectable()
export class LabsService {
  constructor(
    @InjectModel(Lab.name)
    private readonly labModel: Model<LabDocument>,
  ) {}

  async findAll(): Promise<LabProviderResponseDto[]> {
    const labs = await this.labModel.find({ status: LabStatus.ACTIVE }).exec();
    return labs.map((l) => this.toResponse(l));
  }

  async findOne(id: string): Promise<LabProviderResponseDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Lab not found');
    const lab = await this.labModel.findOne({ _id: id, status: LabStatus.ACTIVE });
    if (!lab) throw new NotFoundException('Lab not found');
    return this.toResponse(lab);
  }

  private toResponse(l: LabDocument): LabProviderResponseDto {
    return {
      id: l.id,
      name: l.name,
      accreditation: 'NABL',
      rating: l.rating ?? 0,
      reviewCount: 0,
      distanceKm: 0,
      address: l.locations?.[0]?.address ?? '',
      homeCollection: l.reportWorkflow?.homeSampleCollection ?? false,
      openingHours: '',
      cashless: false,
    };
  }
}
