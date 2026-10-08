import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { StorageService } from '../../storage/storage.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import { PartnerPatientsService } from '../clinical/partner-patients.service';
import {
  ReferralDocument,
  ReferralPriority,
} from '../referrals/schemas/referral.schema';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from './schemas/lab-order.schema';
import { LabResult, LabResultDocument } from './schemas/lab-result.schema';
import { LabCatalogItemDocument } from './schemas/lab-catalog-item.schema';
import { PartnerLabCatalogService } from './partner-lab-catalog.service';
import { PartnerLabInventoryService } from './partner-lab-inventory.service';
import {
  AdvanceLabOrderDto,
  CreateLabOrderDto,
  LabOrdersQueryDto,
  UpdateLabOrderDto,
} from './dto/lab.dto';

/** Pipeline order; an order only ever moves forward. DELIVERED is reached by releasing a report. */
const FLOW = [
  LabOrderStatus.ORDERED,
  LabOrderStatus.SAMPLE_COLLECTED,
  LabOrderStatus.PROCESSING,
  LabOrderStatus.REPORT_READY,
  LabOrderStatus.DELIVERED,
];
const OPEN = [
  LabOrderStatus.ORDERED,
  LabOrderStatus.SAMPLE_COLLECTED,
  LabOrderStatus.PROCESSING,
  LabOrderStatus.REPORT_READY,
];
const DICOM_MAX_BYTES = 60 * 1024 * 1024;

/** Order Pipeline (Lab Queue) and Technician Assignment. */
@Injectable()
export class PartnerLabOrdersService {
  constructor(
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly catalog: PartnerLabCatalogService,
    private readonly inventory: PartnerLabInventoryService,
    private readonly patients: PartnerPatientsService,
    private readonly notifier: PartnerNotifierService,
    private readonly notifications: AppNotificationsService,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: PartnerActor, q: LabOrdersQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.status === 'open') filter.status = { $in: OPEN };
    else if (q.status) filter.status = q.status;
    if (q.patientId) filter.patientId = new Types.ObjectId(q.patientId);
    if (q.assigned === 'me') {
      filter.$or = [
        { technicianMemberId: actor.member._id },
        { collectorMemberId: actor.member._id },
      ];
    } else if (q.assigned === 'none') {
      filter.technicianMemberId = { $exists: false };
    } else if (q.assigned && Types.ObjectId.isValid(q.assigned)) {
      const mid = new Types.ObjectId(q.assigned);
      filter.$or = [{ technicianMemberId: mid }, { collectorMemberId: mid }];
    }
    if (q.q?.trim()) {
      const re = buildSafeRegex(q.q);
      const or = [{ orderNo: re }, { patientName: re }, { 'items.name': re }];
      filter.$and = [...((filter.$and as object[]) ?? []), { $or: or }];
    }
    const orders = await this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .exec();
    return orders.map((o) => this.toResponse(o));
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.load(actor, id));
  }

  async create(
    actor: PartnerActor,
    dto: CreateLabOrderDto,
    origin?: { referral: ReferralDocument; items: LabCatalogItemDocument[] },
  ): Promise<ReturnType<PartnerLabOrdersService['toResponse']>> {
    const patient = await this.patients.assertLinked(actor, dto.patientId);
    const items =
      origin?.items ??
      (await this.catalog.loadForOrder(actor.provider._id, dto.testIds));
    if (dto.appointmentId) {
      const ok = await this.appointmentModel.exists({
        _id: dto.appointmentId,
        providerId: actor.provider._id,
        patientId: patient._id,
      });
      if (!ok)
        throw new BadRequestException(
          'That appointment is not this patient’s booking with your centre',
        );
    }
    const technician = dto.technicianMemberId
      ? await this.activeMember(actor, dto.technicianMemberId)
      : undefined;
    const collector = dto.collectorMemberId
      ? await this.activeMember(actor, dto.collectorMemberId)
      : undefined;
    const now = new Date();
    const maxTat = Math.max(...items.map((i) => i.tatHours ?? 24), 0);
    const order = await this.orderModel.create({
      orderNo: await this.newOrderNo(now),
      providerId: actor.provider._id,
      patientId: patient._id,
      patientName: patient.fullName,
      items: items.map((i) => ({
        testId: i._id,
        code: i.code,
        name: i.name,
        category: i.category,
        price: i.price,
        sampleType: i.sampleType,
        tatHours: i.tatHours,
      })),
      total: items.reduce((s, i) => s + i.price, 0),
      source: origin
        ? 'referral'
        : dto.appointmentId
          ? 'appointment'
          : 'walk_in',
      appointmentId: dto.appointmentId
        ? new Types.ObjectId(dto.appointmentId)
        : undefined,
      ...(origin && {
        referralId: origin.referral._id,
        referringProviderId: origin.referral.fromProviderId,
        referringProviderName: origin.referral.fromProviderName,
        referringDoctorName: origin.referral.fromName,
      }),
      sampleCollection: {
        type: dto.collectionType ?? 'lab',
        address: dto.address,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
      priority:
        dto.priority ??
        (origin?.referral.priority === ReferralPriority.EMERGENCY
          ? 'stat'
          : origin?.referral.priority === ReferralPriority.URGENT
            ? 'urgent'
            : 'routine'),
      technicianMemberId: technician?._id,
      technicianName: technician?.fullName,
      collectorMemberId: collector?._id,
      collectorName: collector?.fullName,
      dueAt: new Date(now.getTime() + maxTat * 3_600_000),
      notes: dto.notes ?? '',
      statusHistory: [
        {
          at: now,
          status: LabOrderStatus.ORDERED,
          byName: actor.member.fullName,
          note: origin
            ? `From referral ${origin.referral.referralNo}`
            : undefined,
        },
      ],
    });

    await this.notifier.emit(actor.provider._id, {
      trigger: PartnerTrigger.LAB_ORDER_RECEIVED,
      title: 'New lab order',
      message: `{patient} — ${order.items.map((i) => i.name).join(', ')} (${order.orderNo})`,
      patientId: patient.id,
      safeMessage: `New lab order ${order.orderNo} is waiting in your Lab Queue.`,
      route: '/partner/lab/queue',
      params: { orderId: order.id },
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        tests: order.items.map((i) => i.code),
        priority: order.priority,
      },
      excludeUserId: actor.userId,
    });
    await this.notifications
      .create(patient.id, {
        trigger: 'test_booking_confirmed',
        category: 'appointments',
        title: 'Tests booked',
        message: `${actor.provider.name} booked: ${order.items.map((i) => i.name).join(', ')}${order.sampleCollection.type === 'home' ? ' (home sample collection)' : ''}.`,
        lockScreenText: 'Your test booking is confirmed',
        actionLabel: 'View',
        actionRoute: '/tests',
      })
      .catch(() => undefined);
    for (const m of [technician, collector])
      if (m) await this.tellAssignee(actor, m, order);
    await this.record(actor, order, {
      change: 'created',
      source: order.source,
    });
    return this.toResponse(order);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateLabOrderDto) {
    const order = await this.load(actor, id);
    const changes: Record<string, unknown> = {};
    const newlyAssigned: PartnerMemberDocument[] = [];
    if (dto.technicianMemberId !== undefined) {
      if (dto.technicianMemberId === null) {
        order.technicianMemberId = undefined;
        order.technicianName = undefined;
      } else {
        const m = await this.activeMember(actor, dto.technicianMemberId);
        if (!order.technicianMemberId?.equals(m._id)) newlyAssigned.push(m);
        order.technicianMemberId = m._id;
        order.technicianName = m.fullName;
      }
      changes.technician = order.technicianName ?? null;
    }
    if (dto.collectorMemberId !== undefined) {
      if (dto.collectorMemberId === null) {
        order.collectorMemberId = undefined;
        order.collectorName = undefined;
      } else {
        const m = await this.activeMember(actor, dto.collectorMemberId);
        if (!order.collectorMemberId?.equals(m._id)) newlyAssigned.push(m);
        order.collectorMemberId = m._id;
        order.collectorName = m.fullName;
      }
      changes.collector = order.collectorName ?? null;
    }
    if (dto.priority) order.priority = changes.priority = dto.priority;
    if (
      dto.collectionType ||
      dto.address !== undefined ||
      dto.scheduledAt !== undefined
    ) {
      order.sampleCollection = {
        ...this.plainCollection(order),
        ...(dto.collectionType && { type: dto.collectionType }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.scheduledAt !== undefined && {
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        }),
      };
      order.markModified('sampleCollection');
      changes.collection = order.sampleCollection.type;
    }
    if (dto.notes !== undefined) order.notes = dto.notes;
    if (dto.pacsUrl !== undefined)
      order.pacsUrl = changes.pacsUrl = dto.pacsUrl || undefined;
    if (dto.paymentStatus) {
      order.payment = {
        status: dto.paymentStatus,
        method: dto.paymentMethod ?? order.payment?.method,
        paidAt:
          dto.paymentStatus === 'paid'
            ? (order.payment?.paidAt ?? new Date())
            : undefined,
      };
      order.markModified('payment');
      changes.payment = dto.paymentStatus;
    }
    await order.save();
    for (const m of newlyAssigned) await this.tellAssignee(actor, m, order);
    if (Object.keys(changes).length) await this.record(actor, order, changes);
    return this.toResponse(order);
  }

  async advance(actor: PartnerActor, id: string, dto: AdvanceLabOrderDto) {
    const order = await this.load(actor, id);
    const target = dto.status as LabOrderStatus;
    if (target === LabOrderStatus.CANCELLED) {
      if (
        ![
          LabOrderStatus.ORDERED,
          LabOrderStatus.SAMPLE_COLLECTED,
          LabOrderStatus.PROCESSING,
        ].includes(order.status)
      ) {
        throw new BadRequestException(
          'Only an order that has no report yet can be cancelled',
        );
      }
    } else {
      const from = FLOW.indexOf(order.status);
      const to = FLOW.indexOf(target);
      if (from < 0 || to <= from)
        throw new BadRequestException(
          `Can't move an order from ${order.status} to ${target}`,
        );
    }
    const now = new Date();
    if (target === LabOrderStatus.SAMPLE_COLLECTED) {
      order.sampleCollection = {
        ...this.plainCollection(order),
        collectedAt: now,
      };
      order.markModified('sampleCollection');
      // Turnaround runs from sample collection.
      const maxTat = Math.max(...order.items.map((i) => i.tatHours ?? 24), 0);
      order.dueAt = new Date(now.getTime() + maxTat * 3_600_000);
    }
    order.status = target;
    order.statusHistory.push({
      at: now,
      status: target,
      byName: actor.member.fullName,
      note: dto.note,
    });
    await order.save();
    await this.record(actor, order, { change: target });
    return this.toResponse(order);
  }

  /** Lab Queue KPIs for the diagnostic dashboard. */
  async summary(actor: PartnerActor) {
    const providerId = actor.provider._id;
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const since30 = new Date(now.getTime() - 30 * 86_400_000);

    const [
      byStatus,
      overdue,
      dueToday,
      homeToday,
      mine,
      delivered30,
      revenue,
      critical30,
      alerts,
      volume,
    ] = await Promise.all([
      this.orderModel.aggregate<{ _id: string; n: number }>([
        { $match: { providerId, status: { $in: OPEN } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      this.orderModel.countDocuments({
        providerId,
        status: { $in: OPEN },
        dueAt: { $lt: now },
      }),
      this.orderModel.countDocuments({
        providerId,
        status: { $in: OPEN },
        dueAt: { $gte: now, $lt: dayEnd },
      }),
      this.orderModel.countDocuments({
        providerId,
        'sampleCollection.type': 'home',
        'sampleCollection.scheduledAt': { $gte: dayStart, $lt: dayEnd },
      }),
      this.orderModel.countDocuments({
        providerId,
        status: { $in: OPEN },
        $or: [
          { technicianMemberId: actor.member._id },
          { collectorMemberId: actor.member._id },
        ],
      }),
      this.orderModel
        .find({ providerId, deliveredAt: { $gte: since30 } })
        .select('createdAt deliveredAt dueAt')
        .lean()
        .exec(),
      this.orderModel.aggregate<{ total: number }>([
        {
          $match: {
            providerId,
            'payment.status': 'paid',
            'payment.paidAt': { $gte: monthStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      this.resultModel.countDocuments({
        providerId,
        critical: true,
        releasedAt: { $gte: since30 },
      }),
      this.inventory.alerts(providerId),
      this.orderModel.aggregate<{ _id: string; n: number }>([
        {
          $match: {
            providerId,
            createdAt: { $gte: since30 },
            status: { $ne: LabOrderStatus.CANCELLED },
          },
        },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 6 },
      ]),
    ]);
    const tats = delivered30.map(
      (o) =>
        (o.deliveredAt!.getTime() - (o.createdAt ?? o.deliveredAt!).getTime()) /
        3_600_000,
    );
    const onTime = delivered30.filter(
      (o) => !o.dueAt || o.deliveredAt! <= o.dueAt,
    ).length;
    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
    return {
      pipeline: {
        ordered: counts[LabOrderStatus.ORDERED] ?? 0,
        sample_collected: counts[LabOrderStatus.SAMPLE_COLLECTED] ?? 0,
        processing: counts[LabOrderStatus.PROCESSING] ?? 0,
        report_ready: counts[LabOrderStatus.REPORT_READY] ?? 0,
      },
      overdue,
      dueToday,
      homeCollectionsToday: homeToday,
      assignedToMe: mine,
      deliveredLast30: delivered30.length,
      avgTatHours: tats.length
        ? Math.round((tats.reduce((a, b) => a + b, 0) / tats.length) * 10) / 10
        : null,
      onTimeRate: delivered30.length
        ? Math.round((onTime / delivered30.length) * 100)
        : null,
      criticalLast30: critical30,
      revenueThisMonth: revenue[0]?.total ?? 0,
      inventory: alerts,
      topTests: volume.map((v) => ({ name: v._id, count: v.n })),
    };
  }

  // ── Imaging (DICOM) ───────────────────────────────────────────────────────

  async addImaging(
    actor: PartnerActor,
    id: string,
    file: Express.Multer.File | undefined,
    description?: string,
  ) {
    const order = await this.load(actor, id);
    if (!file) throw new BadRequestException('Attach a DICOM (.dcm) file');
    if (file.size > DICOM_MAX_BYTES)
      throw new BadRequestException('DICOM files are limited to 60 MB each');
    const isDicom =
      ['.dcm', '.dicom'].includes(extname(file.originalname).toLowerCase()) ||
      file.mimetype === 'application/dicom' ||
      (file.buffer.length > 132 &&
        file.buffer.subarray(128, 132).toString('latin1') === 'DICM');
    if (!isDicom)
      throw new BadRequestException(
        'Only DICOM (.dcm) files can be attached as imaging',
      );
    const fileRef = await this.storage.upload(
      file.buffer,
      file.originalname,
      `imaging-${actor.provider.id}`,
    );
    order.imaging.push({
      _id: new Types.ObjectId(),
      fileRef,
      fileName: file.originalname,
      size: file.size,
      uploadedAt: new Date(),
      uploadedByName: actor.member.fullName,
      description,
    });
    await order.save();
    await this.record(actor, order, {
      change: 'imaging_added',
      file: file.originalname,
    });
    return this.toResponse(order);
  }

  /** The centre itself, or the organisation that referred the patient, may open a study. */
  async readImaging(actor: PartnerActor, id: string, fileId: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Order not found');
    const order = await this.orderModel.findById(id);
    const own = order?.providerId.equals(actor.provider._id);
    const referrer = order?.referringProviderId?.equals(actor.provider._id);
    if (!order || (!own && !referrer))
      throw new NotFoundException('Order not found');
    if (!actor.permissions.includes(Perm.IMAGING_VIEW))
      throw new ForbiddenException('Your role cannot view imaging');
    const file = order.imaging.find((f) => f._id.toString() === fileId);
    if (!file) throw new NotFoundException('Imaging file not found');
    const buffer = await this.storage.read(file.fileRef);
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_IMAGING_VIEW,
      targetType: 'PartnerLabOrder',
      targetId: order.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: order.patientId.toString(),
        label: file.fileName,
      },
      ipAddress: actor.ip,
    });
    return { buffer, fileName: file.fileName };
  }

  /** Studies a referring organisation can open for its patients. */
  async referredImaging(actor: PartnerActor, patientId?: string) {
    const filter: Record<string, unknown> = {
      referringProviderId: actor.provider._id,
      'imaging.0': { $exists: true },
    };
    if (patientId && Types.ObjectId.isValid(patientId))
      filter.patientId = new Types.ObjectId(patientId);
    const orders = await this.orderModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(100)
      .exec();
    const labs = await this.providerModel
      .find({
        _id: { $in: [...new Set(orders.map((o) => o.providerId.toString()))] },
      })
      .select('name')
      .lean()
      .exec();
    const labName = new Map(labs.map((l) => [l._id.toString(), l.name]));
    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      labName: labName.get(o.providerId.toString()) ?? 'Diagnostic centre',
      patientId: o.patientId.toString(),
      patientName: o.patientName,
      tests: o.items.map((i) => i.name),
      status: o.status,
      pacsUrl: o.pacsUrl ?? null,
      imaging: o.imaging.map((f) => ({
        id: f._id.toString(),
        fileName: f.fileName,
        size: f.size,
        uploadedAt: f.uploadedAt.toISOString(),
        description: f.description ?? null,
      })),
    }));
  }

  async removeImaging(actor: PartnerActor, id: string, fileId: string) {
    const order = await this.load(actor, id);
    const file = order.imaging.find((f) => f._id.toString() === fileId);
    if (!file) throw new NotFoundException('Imaging file not found');
    order.imaging = order.imaging.filter((f) => f._id.toString() !== fileId);
    await order.save();
    await this.storage.remove(file.fileRef);
    await this.record(actor, order, {
      change: 'imaging_removed',
      file: file.fileName,
    });
    return this.toResponse(order);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  async load(actor: PartnerActor, id: string) {
    const order = Types.ObjectId.isValid(id)
      ? await this.orderModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async activeMember(actor: PartnerActor, memberId: string) {
    const m = Types.ObjectId.isValid(memberId)
      ? await this.memberModel.findOne({
          _id: memberId,
          providerId: actor.provider._id,
          status: MemberStatus.ACTIVE,
        })
      : null;
    if (!m)
      throw new BadRequestException(
        'That staff member is not active in your organisation',
      );
    return m;
  }

  private async tellAssignee(
    actor: PartnerActor,
    member: PartnerMemberDocument,
    order: LabOrderDocument,
  ) {
    if (member.userId.toString() === actor.userId) return;
    await this.notifications
      .create(member.userId.toString(), {
        trigger: 'partner_lab_assignment',
        category: 'general',
        title: 'Lab order assigned to you',
        message: `${order.orderNo} · ${order.patientName} · ${order.items.map((i) => i.name).join(', ')}${order.priority !== 'routine' ? ` (${order.priority.toUpperCase()})` : ''}`,
        lockScreenText: 'New assignment',
        actionLabel: 'Open',
        actionRoute: '/partner/lab/queue',
        actionParams: { orderId: order.id },
      })
      .catch(() => undefined);
  }

  private plainCollection(order: LabOrderDocument) {
    const c = order.sampleCollection ?? { type: 'lab' };
    return {
      type: c.type ?? 'lab',
      address: c.address,
      scheduledAt: c.scheduledAt,
      collectedAt: c.collectedAt,
    };
  }

  private async newOrderNo(at: Date): Promise<string> {
    const day = at.toISOString().slice(2, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const candidate = `LAB-${day}-${randomBytes(2).toString('hex').toUpperCase()}`;
      if (!(await this.orderModel.exists({ orderNo: candidate })))
        return candidate;
    }
    throw new Error('Could not allocate an order number');
  }

  private record(
    actor: PartnerActor,
    order: LabOrderDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_ORDER_UPDATE,
      targetType: 'PartnerLabOrder',
      targetId: order.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: order.patientId.toString(),
        label: order.orderNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(o: LabOrderDocument) {
    const now = Date.now();
    return {
      id: o.id,
      orderNo: o.orderNo,
      patientId: o.patientId.toString(),
      patientName: o.patientName,
      items: o.items.map((i) => ({
        testId: i.testId.toString(),
        code: i.code,
        name: i.name,
        category: i.category,
        price: i.price,
        sampleType: i.sampleType ?? null,
        tatHours: i.tatHours,
      })),
      total: o.total,
      source: o.source,
      appointmentId: o.appointmentId?.toString() ?? null,
      referralId: o.referralId?.toString() ?? null,
      referringProviderName: o.referringProviderName ?? null,
      referringDoctorName: o.referringDoctorName ?? null,
      collection: {
        type: o.sampleCollection?.type ?? 'lab',
        address: o.sampleCollection?.address ?? null,
        scheduledAt: o.sampleCollection?.scheduledAt?.toISOString() ?? null,
        collectedAt: o.sampleCollection?.collectedAt?.toISOString() ?? null,
      },
      priority: o.priority,
      status: o.status,
      technician: o.technicianMemberId
        ? { id: o.technicianMemberId.toString(), name: o.technicianName ?? '' }
        : null,
      collector: o.collectorMemberId
        ? { id: o.collectorMemberId.toString(), name: o.collectorName ?? '' }
        : null,
      dueAt: o.dueAt?.toISOString() ?? null,
      overdue: !!o.dueAt && OPEN.includes(o.status) && o.dueAt.getTime() < now,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      vaultRecordId: o.vaultRecordId?.toString() ?? null,
      imaging: o.imaging.map((f) => ({
        id: f._id.toString(),
        fileName: f.fileName,
        size: f.size,
        uploadedAt: f.uploadedAt.toISOString(),
        uploadedByName: f.uploadedByName ?? null,
        description: f.description ?? null,
      })),
      pacsUrl: o.pacsUrl ?? null,
      payment: {
        status: o.payment?.status ?? 'unpaid',
        method: o.payment?.method ?? null,
        paidAt: o.payment?.paidAt?.toISOString() ?? null,
      },
      notes: o.notes,
      history: o.statusHistory.map((h) => ({
        at: h.at.toISOString(),
        status: h.status,
        byName: h.byName ?? null,
        note: h.note ?? null,
      })),
      createdAt: (o.createdAt ?? new Date()).toISOString(),
    };
  }
}
