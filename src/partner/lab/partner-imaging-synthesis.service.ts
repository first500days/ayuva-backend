import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { LabResult, LabResultDocument } from './schemas/lab-result.schema';
import { LabOrderDocument, PartnerLabOrder } from './schemas/lab-order.schema';
import {
  LabPoint,
  Measurement,
  regionOf,
  synthesise,
} from './imaging-synthesis';

/**
 * Feeds the viewer's Insights tab: the study's region and modality, the
 * patient's lab results from around the same time, and the measurements drawn
 * on the images go through the rules in imaging-synthesis.ts.
 *
 * Only results the caller could already open are used: a diagnostic centre
 * sees its own released reports; the organisation that referred the patient
 * sees released reports of the orders it referred.
 */
@Injectable()
export class PartnerImagingSynthesisService {
  constructor(
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    private readonly audit: AuditLogService,
  ) {}

  async forOrder(
    actor: PartnerActor,
    orderId: string,
    measurements: Measurement[],
  ) {
    if (!Types.ObjectId.isValid(orderId))
      throw new NotFoundException('Order not found');
    const order = await this.orderModel.findById(orderId).exec();
    const own = order?.providerId.equals(actor.provider._id);
    const referrer = order?.referringProviderId?.equals(actor.provider._id);
    if (!order || (!own && !referrer))
      throw new NotFoundException('Order not found');
    if (!actor.permissions.includes(Perm.IMAGING_VIEW))
      throw new ForbiddenException('Your role cannot view imaging');

    const orderFilter = own
      ? { providerId: actor.provider._id, patientId: order.patientId }
      : { referringProviderId: actor.provider._id, patientId: order.patientId };
    const orderIds = await this.orderModel
      .find(orderFilter)
      .select('_id')
      .limit(500)
      .lean()
      .exec();
    const results = await this.resultModel
      .find({
        orderId: { $in: orderIds.map((o) => o._id) },
        patientId: order.patientId,
        status: 'released',
      })
      .sort({ releasedAt: -1 })
      .limit(200)
      .exec();
    const labs: LabPoint[] = results.flatMap((r) =>
      r.tests.flatMap((t) =>
        t.values
          .filter((v) => v.value?.toString().trim())
          .map((v) => ({
            test: t.name,
            name: v.name,
            value: v.value,
            unit: v.unit ?? null,
            flag: v.flag ?? 'none',
            at: r.releasedAt ?? r.updatedAt ?? new Date(),
          })),
      ),
    );

    const modality =
      order.imaging.find(
        (f) => f.modality && f.modality !== 'SR' && f.modality !== 'OT',
      )?.modality ?? null;
    const studyLabel = `${order.items.map((i) => i.name).join(', ') || 'Imaging'} · ${order.orderNo}`;
    const region = regionOf([
      ...order.items.map((i) => i.name),
      ...order.imaging.map((f) => f.seriesDescription),
      ...order.imaging.map((f) => f.description),
    ]);
    const studyAt =
      order.imaging[0]?.uploadedAt ??
      (order as { createdAt?: Date }).createdAt ??
      new Date();
    const synthesis = synthesise({
      region,
      modality,
      studyAt,
      studyLabel,
      labs,
      measurements: measurements.slice(0, 50),
    });
    // Reading lab values alongside a study is a record access like any other.
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_IMAGING_VIEW,
      targetType: 'PartnerLabOrder',
      targetId: order.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: order.patientId.toString(),
        label: `${order.orderNo}: imaging + lab insights viewed (${synthesis.related.length} related results)`,
      },
      ipAddress: actor.ip,
    });
    return {
      orderId: order.id,
      modality,
      studyAt: studyAt.toISOString(),
      ...synthesis,
      related: synthesis.related.map((l) => ({ ...l, at: l.at.toISOString() })),
      basis: own
        ? 'Released reports from this centre for this patient'
        : 'Released reports of orders your organisation referred for this patient',
    };
  }
}
