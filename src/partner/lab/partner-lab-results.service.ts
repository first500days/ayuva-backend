import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MedicalRecordType } from '../../core/records/schemas/medical-record.schema';
import { ALLOWED_RECORD_MIME_TYPES } from '../../core/records/records.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { PartnerDocumentsService } from '../documents/partner-documents.service';
import {
  LabCatalogItem,
  LabCatalogItemDocument,
  LabParameter,
} from './schemas/lab-catalog-item.schema';
import { LabOrderDocument, LabOrderStatus } from './schemas/lab-order.schema';
import { LabResult, LabResultDocument } from './schemas/lab-result.schema';
import { computeFlag, isCriticalFlag } from './lab-flags';
import { PartnerLabOrdersService } from './partner-lab-orders.service';
import { SaveResultDto, UploadReportDto } from './dto/lab.dto';

const IMAGING_CATEGORIES = ['radiology', 'imaging', 'cardiology'];

/** A test section as posted by the Report Builder or read back from a saved result. */
interface ResultTestInput {
  testId?: string | Types.ObjectId | null;
  name: string;
  values: {
    name: string;
    value?: string | null;
    unit?: string | null;
    refLow?: number | null;
    refHigh?: number | null;
    refText?: string | null;
    criticalLow?: number | null;
    criticalHigh?: number | null;
  }[];
}

/** Report Builder (structured values → PDF) and Report Uploader (file → vault). */
@Injectable()
export class PartnerLabResultsService {
  constructor(
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    @InjectModel(LabCatalogItem.name)
    private readonly catalogModel: Model<LabCatalogItemDocument>,
    private readonly orders: PartnerLabOrdersService,
    private readonly documents: PartnerDocumentsService,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
  ) {}

  /** The saved draft/released result, or a blank template built from the catalogue's parameters. */
  async get(actor: PartnerActor, orderId: string) {
    const order = await this.orders.load(actor, orderId);
    const result = await this.resultModel
      .findOne({ orderId: order._id })
      .exec();
    if (result) return this.toResponse(result, order);
    return {
      orderId: order.id,
      status: 'new' as const,
      critical: false,
      comments: '',
      tests: await this.template(order),
      draftedByName: null,
      releasedByName: null,
      releasedAt: null,
      recordId: null,
      updatedAt: null,
    };
  }

  async save(actor: PartnerActor, orderId: string, dto: SaveResultDto) {
    const order = await this.orders.load(actor, orderId);
    this.assertOpen(order);
    const existing = await this.resultModel
      .findOne({ orderId: order._id })
      .select('status')
      .lean()
      .exec();
    if (existing?.status === 'released')
      throw new BadRequestException('This report has already been released');
    const tests = this.withFlags(dto.tests);
    const result = await this.resultModel.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          providerId: actor.provider._id,
          patientId: order.patientId,
          tests,
          comments: dto.comments ?? '',
          critical: tests.some((t) =>
            t.values.some((v) => isCriticalFlag(v.flag)),
          ),
          draftedByName: actor.member.fullName,
        },
        $setOnInsert: { status: 'draft' },
      },
      { upsert: true, returnDocument: 'after' },
    );

    // A complete draft is waiting for sign-off; a partial one is still in processing.
    const complete = tests.every((t) => t.values.every((v) => v.value.trim()));
    const target = complete
      ? LabOrderStatus.REPORT_READY
      : LabOrderStatus.PROCESSING;
    if (
      [
        LabOrderStatus.ORDERED,
        LabOrderStatus.SAMPLE_COLLECTED,
        LabOrderStatus.PROCESSING,
      ].includes(order.status) &&
      order.status !== target
    ) {
      order.status = target;
      order.statusHistory.push({
        at: new Date(),
        status: target,
        byName: actor.member.fullName,
        note: complete ? 'Results entered' : 'Results in progress',
      });
      await order.save();
    }
    return this.toResponse(result, order);
  }

  /** Pathologist sign-off: renders the PDF into the patient's vault and closes the order. */
  async release(actor: PartnerActor, orderId: string) {
    const order = await this.orders.load(actor, orderId);
    this.assertOpen(order);
    const result = await this.resultModel.findOne({ orderId: order._id });
    if (!result)
      throw new BadRequestException(
        'Enter the results before releasing the report',
      );
    if (!result.tests.some((t) => t.values.some((v) => v.value?.trim()))) {
      throw new BadRequestException('The report has no values yet');
    }
    result.set('tests', this.withFlags(result.toObject().tests));
    result.critical = result.tests.some((t) =>
      t.values.some((v) => isCriticalFlag(v.flag)),
    );
    result.status = 'released';
    result.releasedAt = new Date();
    result.releasedByName = actor.member.fullName;
    const pdf = this.documents.labReportPdf(order, result, actor.provider);
    const record = await this.deliver(
      actor,
      order,
      pdf,
      'application/pdf',
      `Lab report ${order.orderNo} - ${actor.provider.name}.pdf`,
    );
    result.recordId = record._id;
    await result.save();
    await this.closeOrder(actor, order, record._id, result.critical);
    return this.toResponse(result, order);
  }

  /** Uploads a finished report file (PDF/image) straight to the patient's vault. */
  async upload(
    actor: PartnerActor,
    orderId: string,
    file: Express.Multer.File | undefined,
    dto: UploadReportDto,
  ) {
    const order = await this.orders.load(actor, orderId);
    this.assertOpen(order);
    if (!file) throw new BadRequestException('Attach the report file');
    if (!ALLOWED_RECORD_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Reports must be PDF or an image (${ALLOWED_RECORD_MIME_TYPES.join(', ')})`,
      );
    }
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '.pdf';
    const record = await this.deliver(
      actor,
      order,
      file.buffer,
      file.mimetype,
      `Lab report ${order.orderNo} - ${actor.provider.name}${ext}`,
    );
    const critical = dto.critical === true;
    const result = await this.resultModel.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          providerId: actor.provider._id,
          patientId: order.patientId,
          status: 'released',
          critical,
          comments: dto.comments ?? '',
          releasedAt: new Date(),
          releasedByName: actor.member.fullName,
          recordId: record._id,
        },
        $setOnInsert: { tests: [] },
      },
      { upsert: true, returnDocument: 'after' },
    );
    await this.closeOrder(actor, order, record._id, critical);
    return this.toResponse(result, order);
  }

  /** PDF preview of the current draft (or blank template) before release. */
  async preview(actor: PartnerActor, orderId: string) {
    const order = await this.orders.load(actor, orderId);
    let result = await this.resultModel.findOne({ orderId: order._id }).exec();
    if (!result) {
      result = new this.resultModel({
        providerId: actor.provider._id,
        orderId: order._id,
        patientId: order.patientId,
        tests: await this.template(order),
        status: 'draft',
      });
    }
    return {
      buffer: this.documents.labReportPdf(order, result, actor.provider),
      fileName: `Preview ${order.orderNo}.pdf`,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private assertOpen(order: LabOrderDocument) {
    if (order.status === LabOrderStatus.DELIVERED)
      throw new BadRequestException(
        'This order’s report has already been delivered',
      );
    if (order.status === LabOrderStatus.CANCELLED)
      throw new BadRequestException('This order was cancelled');
  }

  private withFlags(tests: ResultTestInput[]) {
    return tests.map((t) => ({
      ...(t.testId && { testId: new Types.ObjectId(t.testId.toString()) }),
      name: t.name,
      values: t.values.map((v) => ({
        name: v.name,
        value: (v.value ?? '').trim(),
        unit: v.unit || undefined,
        refLow: v.refLow ?? undefined,
        refHigh: v.refHigh ?? undefined,
        refText: v.refText || undefined,
        criticalLow: v.criticalLow ?? undefined,
        criticalHigh: v.criticalHigh ?? undefined,
        flag: computeFlag(v),
      })),
    }));
  }

  /** One section per ordered test; a package expands into its component tests. */
  private async template(order: LabOrderDocument) {
    const ids = order.items.map((i) => i.testId);
    const items = await this.catalogModel.find({ _id: { $in: ids } }).exec();
    const byId = new Map(items.map((i) => [i.id, i]));
    const componentIds = items.flatMap((i) => (i.isPackage ? i.includes : []));
    const components = componentIds.length
      ? await this.catalogModel.find({ _id: { $in: componentIds } }).exec()
      : [];
    const compById = new Map(components.map((c) => [c.id, c]));
    const section = (item: LabCatalogItemDocument) => {
      const params: LabParameter[] = item.parameters.length
        ? item.parameters
        : [{ name: 'Result' }];
      return {
        testId: item.id,
        name: item.name,
        values: params.map((p) => ({
          name: p.name,
          value: '',
          unit: p.unit ?? null,
          refLow: p.refLow ?? null,
          refHigh: p.refHigh ?? null,
          refText: p.refText ?? null,
          criticalLow: p.criticalLow ?? null,
          criticalHigh: p.criticalHigh ?? null,
          flag: 'none',
        })),
      };
    };
    const out: ReturnType<typeof section>[] = [];
    for (const it of order.items) {
      const item = byId.get(it.testId.toString());
      if (!item) {
        out.push({
          testId: it.testId.toString(),
          name: it.name,
          values: [
            {
              name: 'Result',
              value: '',
              unit: null,
              refLow: null,
              refHigh: null,
              refText: null,
              criticalLow: null,
              criticalHigh: null,
              flag: 'none',
            },
          ],
        });
      } else if (item.isPackage) {
        for (const cid of item.includes) {
          const component = compById.get(cid.toString());
          if (component) out.push(section(component));
        }
      } else {
        out.push(section(item));
      }
    }
    return out;
  }

  private deliver(
    actor: PartnerActor,
    order: LabOrderDocument,
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ) {
    const imaging = order.items.every((i) =>
      IMAGING_CATEGORIES.includes(i.category.toLowerCase()),
    );
    return this.documents.deliverToVault({
      patientId: order.patientId,
      buffer,
      fileName,
      mimeType,
      type: imaging ? MedicalRecordType.SCAN : MedicalRecordType.LAB_REPORT,
      providerName: actor.provider.name,
      recordDate:
        order.sampleCollection?.collectedAt ?? order.createdAt ?? new Date(),
      tags: [
        'lab-report',
        ...order.items.map((i) => i.code.toLowerCase()),
      ].slice(0, 12),
      notification: {
        trigger: 'report_available',
        title: 'Your test report is ready',
        message: `${actor.provider.name} added your report for ${order.items.map((i) => i.name).join(', ')} to your Medical Vault.`,
        lockScreenText: 'A new document is in your vault',
      },
    });
  }

  private async closeOrder(
    actor: PartnerActor,
    order: LabOrderDocument,
    recordId: Types.ObjectId,
    critical: boolean,
  ) {
    const now = new Date();
    order.status = LabOrderStatus.DELIVERED;
    order.deliveredAt = now;
    order.vaultRecordId = recordId;
    order.statusHistory.push({
      at: now,
      status: LabOrderStatus.DELIVERED,
      byName: actor.member.fullName,
      note: critical
        ? 'Released — CRITICAL value'
        : 'Released to patient vault',
    });
    await order.save();

    const tests = order.items.map((i) => i.name).join(', ');
    const data = {
      orderId: order.id,
      orderNo: order.orderNo,
      critical,
      tests: order.items.map((i) => i.code),
    };
    if (order.referringProviderId) {
      await this.notifier.emit(order.referringProviderId, {
        trigger: critical
          ? PartnerTrigger.CRITICAL_LAB_RESULT
          : PartnerTrigger.LAB_RESULT_READY,
        title: critical ? 'CRITICAL lab result' : 'Lab result ready',
        message: `${actor.provider.name} released ${tests} for {patient}${critical ? ' — contains a CRITICAL value' : ''}. It shows on the patient's timeline if they share records with you.`,
        patientId: order.patientId.toString(),
        safeMessage: critical
          ? 'A referred patient has a critical lab result — open the Ayuva Partner Portal now.'
          : 'A lab report for a patient you referred is ready.',
        route: `/partner/patients/${order.patientId.toString()}`,
        data,
      });
    }
    if (critical) {
      await this.notifier.emit(actor.provider._id, {
        trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
        title: 'CRITICAL result released',
        message: `${order.orderNo} for {patient} contains a critical value. Make sure the referring doctor or patient has been contacted.`,
        patientId: order.patientId.toString(),
        safeMessage: `Order ${order.orderNo} has a critical value — follow your critical-result call-out procedure.`,
        route: '/partner/lab/queue',
        params: { orderId: order.id },
        data,
        excludeUserId: actor.userId,
      });
    }
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_REPORT_RELEASE,
      targetType: 'PartnerLabOrder',
      targetId: order.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: order.patientId.toString(),
        label: order.orderNo,
        critical,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(r: LabResultDocument, order: LabOrderDocument) {
    return {
      orderId: order.id,
      status: r.status as 'draft' | 'released',
      critical: r.critical,
      comments: r.comments,
      tests: r.tests.map((t) => ({
        testId: t.testId?.toString() ?? null,
        name: t.name,
        values: t.values.map((v) => ({
          name: v.name,
          value: v.value,
          unit: v.unit ?? null,
          refLow: v.refLow ?? null,
          refHigh: v.refHigh ?? null,
          refText: v.refText ?? null,
          criticalLow: v.criticalLow ?? null,
          criticalHigh: v.criticalHigh ?? null,
          flag: v.flag,
        })),
      })),
      draftedByName: r.draftedByName ?? null,
      releasedByName: r.releasedByName ?? null,
      releasedAt: r.releasedAt?.toISOString() ?? null,
      recordId: r.recordId?.toString() ?? null,
      updatedAt: (r.updatedAt ?? new Date()).toISOString(),
    };
  }
}
