import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lab, LabDocument, LabStatus } from '../../core/labs/schemas/lab.schema';
import { QueryAdminLabsDto } from './dto/query-admin-labs.dto';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { AdminLabResponseDto } from './dto/admin-lab-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { AdminDiagnosticTestsService } from '../diagnostic-tests/admin-diagnostic-tests.service';
import { AdminLabDeliveriesService } from '../lab-deliveries/admin-lab-deliveries.service';

@Injectable()
export class AdminLabsService {
  constructor(
    @InjectModel(Lab.name)
    private readonly labModel: Model<LabDocument>,
    private readonly diagnosticTestsService: AdminDiagnosticTestsService,
    private readonly labDeliveriesService: AdminLabDeliveriesService,
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

  // Diagnostic Tests - delegate to DiagnosticTestsService
  async getDiagnosticCatalogue() {
    return this.diagnosticTestsService.findAll({ isActive: true, limit: 100 });
  }

  async getDiagnosticTest(id: string) {
    return this.diagnosticTestsService.findOne(id);
  }

  async createDiagnosticTest(dto: any) {
    return this.diagnosticTestsService.create(dto);
  }

  async updateDiagnosticTest(id: string, dto: any) {
    return this.diagnosticTestsService.update(id, dto);
  }

  async deleteDiagnosticTest(id: string) {
    return this.diagnosticTestsService.delete(id);
  }

  // Lab Deliveries - delegate to LabDeliveriesService
  async getDeliveryPipeline(query?: any) {
    return this.labDeliveriesService.findAll(query || {});
  }

  async getDeliveryStats() {
    return this.labDeliveriesService.getStats();
  }

  async getStuckDeliveries(hours?: number) {
    return this.labDeliveriesService.getStuckDeliveries(hours || 24);
  }

  async getFailedDeliveries() {
    return this.labDeliveriesService.getFailedDeliveries();
  }

  async getDeliveryById(id: string) {
    return this.labDeliveriesService.findOne(id);
  }

  async updateDelivery(id: string, dto: any) {
    return this.labDeliveriesService.update(id, dto);
  }

  async retryDelivery(id: string, dto: { deliveryMethod: string }) {
    return this.labDeliveriesService.retryDelivery(id, dto as any);
  }

  async manualDelivery(id: string, dto: { reportFileUrl: string; reportFileName: string; deliveryMethod?: string }) {
    return this.labDeliveriesService.manualDelivery(id, dto as any);
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
}