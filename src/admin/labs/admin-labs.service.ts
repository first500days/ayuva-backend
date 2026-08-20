import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lab, LabDocument, LabStatus } from '../../core/labs/schemas/lab.schema';
import { QueryAdminLabsDto } from './dto/query-admin-labs.dto';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { AdminLabResponseDto } from './dto/admin-lab-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

@Injectable()
export class AdminLabsService {
  constructor(
    @InjectModel(Lab.name)
    private readonly labModel: Model<LabDocument>,
  ) {}

  async findAll(query: QueryAdminLabsDto): Promise<AdminLabResponseDto[]> {
    const and: any[] = [];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({ $or: [{ name: re }, { specialty: re }] });
    }
    if (query.status) and.push({ status: query.status });

    const filter = and.length > 0 ? { $and: and } : {};

    const labs = await this.labModel.find(filter).sort({ name: 1 }).exec();
    return labs.map((l) => this.toResponse(l));
  }

  async findOne(id: string): Promise<AdminLabResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Lab not found');
    }
    const lab = await this.labModel.findById(id).exec();
    if (!lab) {
      throw new NotFoundException('Lab not found');
    }
    return this.toResponse(lab);
  }

  async create(dto: CreateLabDto): Promise<AdminLabResponseDto> {
    const lab = await this.labModel.create({
      name: dto.name,
      specialty: dto.specialty,
      languages: dto.languages,
      locations: dto.locations,
      rating: dto.rating ?? 0,
      profileImageUrl: dto.profileImageUrl,
      status: LabStatus.PENDING,
    });
    return this.toResponse(lab);
  }

  async update(id: string, dto: UpdateLabDto): Promise<AdminLabResponseDto> {
    const lab = await this.getLabOrThrow(id);

    if (dto.name !== undefined) lab.name = dto.name;
    if (dto.specialty !== undefined) lab.specialty = dto.specialty;
    if (dto.languages !== undefined) lab.languages = dto.languages;
    if (dto.locations !== undefined) lab.locations = dto.locations;
    if (dto.rating !== undefined) lab.rating = dto.rating;
    if (dto.profileImageUrl !== undefined) lab.profileImageUrl = dto.profileImageUrl;
    if (dto.status !== undefined) lab.status = dto.status;

    await lab.save();
    return this.toResponse(lab);
  }

  async verify(id: string): Promise<AdminLabResponseDto> {
    const lab = await this.getLabOrThrow(id);
    lab.status = LabStatus.VERIFIED;
    await lab.save();
    return this.toResponse(lab);
  }

  async reject(id: string): Promise<AdminLabResponseDto> {
    const lab = await this.getLabOrThrow(id);
    lab.status = LabStatus.REJECTED;
    await lab.save();
    return this.toResponse(lab);
  }

  async suspend(id: string): Promise<AdminLabResponseDto> {
    const lab = await this.getLabOrThrow(id);
    lab.status = LabStatus.SUSPENDED;
    await lab.save();
    return this.toResponse(lab);
  }

  async activate(id: string): Promise<AdminLabResponseDto> {
    const lab = await this.getLabOrThrow(id);
    lab.status = LabStatus.ACTIVE;
    await lab.save();
    return this.toResponse(lab);
  }

  private async getLabOrThrow(id: string): Promise<LabDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Lab not found');
    }
    const lab = await this.labModel.findById(id).exec();
    if (!lab) {
      throw new NotFoundException('Lab not found');
    }
    return lab;
  }

  private toResponse(lab: LabDocument): AdminLabResponseDto {
    return {
      id: lab.id,
      name: lab.name,
      specialty: lab.specialty,
      languages: lab.languages,
      locations: lab.locations.map((l) => ({
        label: l.label,
        address: l.address,
      })),
      rating: lab.rating,
      status: lab.status,
      profileImageUrl: lab.profileImageUrl,
    };
  }

  async getDiagnosticCatalogue() {
    return [
      {
        id: 'diag-1',
        testCode: 'CBC-001',
        testName: 'Complete Blood Count (CBC) with ESR',
        category: 'Hematology',
        sampleType: 'Whole Blood (EDTA)',
        tatHours: 12,
        standardPrice: 450,
        homeCollectionAvailable: true,
        fastingRequired: false,
        activeLabsCount: 16,
        providerPricing: [
          { labId: 'lab-1', labName: 'Dr. Lal PathLabs', price: 420, tatHours: 8, homeCollection: true },
          { labId: 'lab-2', labName: 'Metropolis Diagnostics', price: 450, tatHours: 12, homeCollection: true },
          { labId: 'lab-3', labName: 'SRL Diagnostics', price: 400, tatHours: 10, homeCollection: true },
        ],
      },
      {
        id: 'diag-2',
        testCode: 'LIPID-002',
        testName: 'Lipid Profile Comprehensive',
        category: 'Biochemistry',
        sampleType: 'Serum',
        tatHours: 24,
        standardPrice: 850,
        homeCollectionAvailable: true,
        fastingRequired: true,
        activeLabsCount: 18,
        providerPricing: [
          { labId: 'lab-1', labName: 'Dr. Lal PathLabs', price: 800, tatHours: 24, homeCollection: true },
          { labId: 'lab-2', labName: 'Metropolis Diagnostics', price: 850, tatHours: 18, homeCollection: true },
        ],
      },
      {
        id: 'diag-3',
        testCode: 'THY-003',
        testName: 'Thyroid Function Test (Total T3, T4, TSH)',
        category: 'Endocrinology',
        sampleType: 'Serum',
        tatHours: 12,
        standardPrice: 650,
        homeCollectionAvailable: true,
        fastingRequired: false,
        activeLabsCount: 15,
        providerPricing: [
          { labId: 'lab-1', labName: 'Dr. Lal PathLabs', price: 600, tatHours: 12, homeCollection: true },
          { labId: 'lab-3', labName: 'SRL Diagnostics', price: 620, tatHours: 10, homeCollection: true },
        ],
      },
      {
        id: 'diag-4',
        testCode: 'HBA1C-004',
        testName: 'HbA1c Glycated Hemoglobin',
        category: 'Diabetes Care',
        sampleType: 'Whole Blood',
        tatHours: 6,
        standardPrice: 550,
        homeCollectionAvailable: true,
        fastingRequired: false,
        activeLabsCount: 18,
        providerPricing: [
          { labId: 'lab-1', labName: 'Dr. Lal PathLabs', price: 500, tatHours: 6, homeCollection: true },
          { labId: 'lab-2', labName: 'Metropolis Diagnostics', price: 550, tatHours: 6, homeCollection: true },
        ],
      },
      {
        id: 'diag-5',
        testCode: 'LFT-005',
        testName: 'Liver Function Test (LFT)',
        category: 'Biochemistry',
        sampleType: 'Serum',
        tatHours: 18,
        standardPrice: 900,
        homeCollectionAvailable: true,
        fastingRequired: true,
        activeLabsCount: 14,
        providerPricing: [
          { labId: 'lab-2', labName: 'Metropolis Diagnostics', price: 880, tatHours: 18, homeCollection: true },
          { labId: 'lab-3', labName: 'SRL Diagnostics', price: 900, tatHours: 16, homeCollection: true },
        ],
      },
    ];
  }

  async getDeliveryPipeline() {
    return [
      {
        id: 'DEL-8801',
        orderId: 'ORD-5402',
        patientName: 'Priya Sundaram',
        testName: 'Complete Blood Count (CBC)',
        labName: 'Dr. Lal PathLabs - Indiranagar',
        collectedAt: '2026-08-20T08:30:00Z',
        deliveredAt: '2026-08-20T11:45:00Z',
        status: 'delivered',
        turnaroundMinutes: 195,
        deliveryMethod: 'Electronic Vault & SMS Link',
        attempts: 1,
      },
      {
        id: 'DEL-8802',
        orderId: 'ORD-5409',
        patientName: 'Anand Kulkarni',
        testName: 'Lipid Profile Comprehensive',
        labName: 'Metropolis Diagnostics - Koramangala',
        collectedAt: '2026-08-20T09:15:00Z',
        deliveredAt: null,
        status: 'processing',
        turnaroundMinutes: null,
        deliveryMethod: 'Electronic Vault',
        attempts: 0,
      },
      {
        id: 'DEL-8803',
        orderId: 'ORD-5390',
        patientName: 'Meera Nair',
        testName: 'Thyroid Panel (T3, T4, TSH)',
        labName: 'SRL Diagnostics - Whitefield',
        collectedAt: '2026-08-19T14:00:00Z',
        deliveredAt: null,
        status: 'failed',
        turnaroundMinutes: null,
        deliveryMethod: 'LIMS Webhook Push',
        attempts: 3,
        errorReason: 'Remote LIMS webhook returned 504 Gateway Timeout',
      },
    ];
  }

  async retryDelivery(deliveryId: string) {
    return {
      deliveryId,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      message: 'Payload successfully re-transmitted to Patient Vault',
    };
  }
}
