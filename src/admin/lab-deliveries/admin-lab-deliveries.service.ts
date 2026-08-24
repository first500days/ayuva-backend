import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { LabDeliveryOrder, LabDeliveryOrderDocument, LabDeliveryStatus, LabDeliveryMethod } from '../../core/labs/schemas/lab-delivery-order.schema';
import { QueryLabDeliveriesDto } from './dto/query-lab-deliveries.dto';
import { UpdateLabDeliveryDto, RetryDeliveryDto, ManualDeliveryDto } from './dto/update-lab-delivery.dto';
import { AdminLabDeliveryResponseDto } from './dto/admin-lab-delivery-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

@Injectable()
export class AdminLabDeliveriesService {
  constructor(
    @InjectModel(LabDeliveryOrder.name)
    private readonly deliveryModel: Model<LabDeliveryOrderDocument>,
  ) {}

  async findAll(query: QueryLabDeliveriesDto): Promise<AdminLabDeliveryResponseDto[]> {
    const and: QueryFilter<LabDeliveryOrderDocument>[] = [];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({
        $or: [
          { orderId: re },
          { patientName: re },
          { labName: re },
        ],
      });
    }
    if (query.labId) and.push({ labId: new Types.ObjectId(query.labId) });
    if (query.patientId) and.push({ patientId: new Types.ObjectId(query.patientId) });
    if (query.status) and.push({ status: query.status });
    if (query.orderId) and.push({ orderId: query.orderId });
    if (query.fromDate || query.toDate) {
      const range: Record<string, Date> = {};
      if (query.fromDate) range.$gte = new Date(query.fromDate);
      if (query.toDate) range.$lte = new Date(query.toDate);
      and.push({ createdAt: range });
    }

    const filter: QueryFilter<LabDeliveryOrderDocument> = and.length > 0 ? { $and: and } : {};

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    const deliveries = await this.deliveryModel
      .find(filter)
      .sort(sort)
      .skip(query.skip || 0)
      .limit(query.limit || 50)
      .exec();

    return deliveries.map((d) => this.toResponse(d));
  }

  async findOne(id: string): Promise<AdminLabDeliveryResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Lab delivery not found');
    }
    const delivery = await this.deliveryModel.findById(id).exec();
    if (!delivery) {
      throw new NotFoundException('Lab delivery not found');
    }
    return this.toResponse(delivery);
  }

  async findByOrderId(orderId: string): Promise<AdminLabDeliveryResponseDto> {
    const delivery = await this.deliveryModel.findOne({ orderId }).exec();
    if (!delivery) {
      throw new NotFoundException(`Lab delivery with order ID ${orderId} not found`);
    }
    return this.toResponse(delivery);
  }

  async update(id: string, dto: UpdateLabDeliveryDto): Promise<AdminLabDeliveryResponseDto> {
    const delivery = await this.getDeliveryOrThrow(id);

    if (dto.status !== undefined) {
      const oldStatus = delivery.status;
      delivery.status = dto.status;
      if (dto.status === LabDeliveryStatus.DELIVERED && oldStatus !== LabDeliveryStatus.DELIVERED) {
        delivery.deliveredAt = new Date();
        delivery.patientNotified = true;
        delivery.notifiedAt = new Date();
      }
      if (dto.status === LabDeliveryStatus.PROCESSING && oldStatus === LabDeliveryStatus.COLLECTED) {
        delivery.processedAt = new Date();
      }
    }
    if (dto.deliveryMethod !== undefined) delivery.deliveryMethod = dto.deliveryMethod;
    if (dto.reportFileUrl !== undefined) delivery.reportFileUrl = dto.reportFileUrl;
    if (dto.reportFileName !== undefined) delivery.reportFileName = dto.reportFileName;
    if (dto.errorReason !== undefined) delivery.errorReason = dto.errorReason;
    if (dto.assignedTo !== undefined) delivery.assignedTo = dto.assignedTo;
    if (dto.priority !== undefined) delivery.priority = dto.priority;

    await delivery.save();
    return this.toResponse(delivery);
  }

  async retryDelivery(id: string, dto: RetryDeliveryDto): Promise<AdminLabDeliveryResponseDto> {
    const delivery = await this.getDeliveryOrThrow(id);

    const attempt = {
      attemptedAt: new Date(),
      method: dto.deliveryMethod,
      success: false,
      responseCode: undefined,
      errorReason: undefined,
      payload: undefined,
    };

    delivery.attempts += 1;
    delivery.attemptHistory.push(attempt);
    delivery.status = LabDeliveryStatus.PROCESSING;
    delivery.deliveryMethod = dto.deliveryMethod;

    await delivery.save();

    // In real implementation, this would trigger the actual delivery mechanism
    // For now, we simulate a successful retry
    setTimeout(async () => {
      await this.simulateDeliverySuccess(delivery.id);
    }, 1000);

    return this.toResponse(delivery);
  }

  async manualDelivery(id: string, dto: ManualDeliveryDto): Promise<AdminLabDeliveryResponseDto> {
    const delivery = await this.getDeliveryOrThrow(id);

    delivery.status = LabDeliveryStatus.DELIVERED;
    delivery.deliveredAt = new Date();
    delivery.reportFileUrl = dto.reportFileUrl;
    delivery.reportFileName = dto.reportFileName;
    delivery.deliveryMethod = dto.deliveryMethod || LabDeliveryMethod.ELECTRONIC_VAULT;
    delivery.patientNotified = true;
    delivery.notifiedAt = new Date();

    const attempt = {
      attemptedAt: new Date(),
      method: delivery.deliveryMethod,
      success: true,
      responseCode: undefined,
      errorReason: undefined,
      payload: undefined,
    };
    delivery.attemptHistory.push(attempt);

    await delivery.save();
    return this.toResponse(delivery);
  }

  async getStuckDeliveries(hoursThreshold = 24): Promise<AdminLabDeliveryResponseDto[]> {
    const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    const deliveries = await this.deliveryModel
      .find({
        status: { $in: [LabDeliveryStatus.COLLECTED, LabDeliveryStatus.PROCESSING] },
        updatedAt: { $lt: threshold },
      })
      .sort({ updatedAt: 1 })
      .exec();

    return deliveries.map((d) => this.toResponse(d));
  }

  async getFailedDeliveries(): Promise<AdminLabDeliveryResponseDto[]> {
    const deliveries = await this.deliveryModel
      .find({ status: LabDeliveryStatus.FAILED })
      .sort({ updatedAt: -1 })
      .exec();

    return deliveries.map((d) => this.toResponse(d));
  }

  async getStats(): Promise<{
    total: number;
    byStatus: Record<LabDeliveryStatus, number>;
    avgTurnaroundMinutes: number;
    stuckCount: number;
    failedCount: number;
  }> {
    const [total, byStatusAgg, allDeliveries] = await Promise.all([
      this.deliveryModel.countDocuments().exec(),
      this.deliveryModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      this.deliveryModel
        .find({ status: LabDeliveryStatus.DELIVERED, deliveredAt: { $exists: true }, collectedAt: { $exists: true } })
        .select('collectedAt deliveredAt')
        .exec(),
    ]);

    const byStatus: Record<LabDeliveryStatus, number> = {} as any;
    for (const s of Object.values(LabDeliveryStatus)) {
      byStatus[s] = 0;
    }
    for (const row of byStatusAgg) {
      byStatus[row._id as LabDeliveryStatus] = row.count;
    }

    let totalTurnaround = 0;
    let deliveredCount = 0;
    for (const d of allDeliveries) {
      if (d.collectedAt && d.deliveredAt) {
        totalTurnaround += (d.deliveredAt.getTime() - d.collectedAt.getTime()) / (1000 * 60);
        deliveredCount++;
      }
    }

    const stuckDeliveries = await this.getStuckDeliveries(24);
    const failedDeliveries = await this.getFailedDeliveries();

    return {
      total,
      byStatus,
      avgTurnaroundMinutes: deliveredCount > 0 ? Math.round(totalTurnaround / deliveredCount) : 0,
      stuckCount: stuckDeliveries.length,
      failedCount: failedDeliveries.length,
    };
  }

  private async simulateDeliverySuccess(id: string): Promise<void> {
    const delivery = await this.deliveryModel.findById(id).exec();
    if (delivery && delivery.status === LabDeliveryStatus.PROCESSING) {
      delivery.status = LabDeliveryStatus.DELIVERED;
      delivery.deliveredAt = new Date();
      delivery.patientNotified = true;
      delivery.notifiedAt = new Date();
      delivery.attemptHistory[delivery.attemptHistory.length - 1].success = true;
      await delivery.save();
    }
  }

  private async getDeliveryOrThrow(id: string): Promise<LabDeliveryOrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Lab delivery not found');
    }
    const delivery = await this.deliveryModel.findById(id).exec();
    if (!delivery) {
      throw new NotFoundException('Lab delivery not found');
    }
    return delivery;
  }

  private toResponse(delivery: LabDeliveryOrderDocument): AdminLabDeliveryResponseDto {
    let turnaroundMinutes: number | undefined;
    if (delivery.collectedAt && delivery.deliveredAt) {
      turnaroundMinutes = Math.round((delivery.deliveredAt.getTime() - delivery.collectedAt.getTime()) / (1000 * 60));
    }

    return {
      id: delivery.id,
      labId: delivery.labId.toString(),
      labName: delivery.labName,
      patientId: delivery.patientId.toString(),
      patientName: delivery.patientName,
      appointmentId: delivery.appointmentId?.toString(),
      testId: delivery.testId?.toString(),
      tests: delivery.tests.map(t => ({
        testCode: t.testCode,
        testName: t.testName,
        category: t.category,
        sampleType: t.sampleType,
        fastingRequired: t.fastingRequired,
      })),
      orderId: delivery.orderId,
      status: delivery.status,
      collectedAt: delivery.collectedAt?.toISOString(),
      processedAt: delivery.processedAt?.toISOString(),
      deliveredAt: delivery.deliveredAt?.toISOString(),
      expectedDeliveryAt: delivery.expectedDeliveryAt?.toISOString(),
      deliveryMethod: delivery.deliveryMethod,
      attempts: delivery.attempts,
      attemptHistory: delivery.attemptHistory.map(a => ({
        attemptedAt: a.attemptedAt.toISOString(),
        method: a.method,
        responseCode: a.responseCode,
        errorReason: a.errorReason,
        success: a.success,
      })),
      errorReason: delivery.errorReason,
      webhookPayload: delivery.webhookPayload,
      labReportMetadata: delivery.labReportMetadata,
      reportFileUrl: delivery.reportFileUrl,
      reportFileName: delivery.reportFileName,
      patientNotified: delivery.patientNotified,
      notifiedAt: delivery.notifiedAt?.toISOString(),
      assignedTo: delivery.assignedTo,
      priority: delivery.priority,
      createdAt: delivery.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: delivery.updatedAt?.toISOString() ?? new Date().toISOString(),
      turnaroundMinutes,
    };
  }
}