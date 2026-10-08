import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import {
  Provider,
  ProviderCategory,
  ProviderDocument,
  ProviderStatus,
} from '../../core/providers/schemas/provider.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { OrgType, orgTypeOf } from '../rbac/partner-permissions';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { PartnerPatientsService } from '../clinical/partner-patients.service';
import { PartnerDocumentsService } from '../documents/partner-documents.service';
import { PartnerLabCatalogService } from '../lab/partner-lab-catalog.service';
import { PartnerLabOrdersService } from '../lab/partner-lab-orders.service';
import {
  Referral,
  ReferralDocument,
  ReferralPriority,
  ReferralStatus,
  ReferralType,
} from './schemas/referral.schema';
import {
  CreateReferralDto,
  DirectoryQueryDto,
  ReferralsQueryDto,
} from './dto/referral.dto';

const LIVE = [ProviderStatus.ACTIVE, ProviderStatus.VERIFIED];
const TYPE_LABEL: Record<ReferralType, string> = {
  [ReferralType.CONSULTATION]: 'a consultation',
  [ReferralType.DIAGNOSTIC]: 'diagnostic tests',
  [ReferralType.ADMISSION]: 'admission',
  [ReferralType.SECOND_OPINION]: 'a second opinion',
};

/** Referral Outbox (doctors) and inward/outward Referral Management (hospitals, labs). */
@Injectable()
export class PartnerReferralsService {
  private readonly logger = new Logger(PartnerReferralsService.name);

  constructor(
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly documents: PartnerDocumentsService,
    private readonly notifier: PartnerNotifierService,
    private readonly notifications: AppNotificationsService,
    private readonly catalog: PartnerLabCatalogService,
    private readonly labOrders: PartnerLabOrdersService,
    private readonly audit: AuditLogService,
  ) {}

  /** Verified Ayuva organisations a patient can be referred to. */
  async directory(actor: PartnerActor, q: DirectoryQueryDto) {
    const filter: Record<string, unknown> = {
      status: { $in: LIVE },
      _id: { $ne: actor.provider._id },
    };
    if (q.type === OrgType.HOSPITAL) filter.type = ProviderCategory.HOSPITAL;
    else if (q.type === OrgType.DIAGNOSTIC)
      filter.type = ProviderCategory.DIAGNOSTIC;
    else if (q.type === OrgType.CLINIC)
      filter.type = {
        $in: [
          ProviderCategory.GP,
          ProviderCategory.SPECIALIST,
          ProviderCategory.PHYSIO,
        ],
      };
    if (q.q?.trim()) {
      const re = buildSafeRegex(q.q);
      filter.$or = [
        { name: re },
        { specialty: re },
        { 'locations.label': re },
        { departments: re },
      ];
    }
    const providers = await this.providerModel
      .find(filter)
      .sort({ name: 1 })
      .limit(50)
      .exec();
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      orgType: orgTypeOf(p.type),
      category: p.type,
      specialty: p.specialty,
      departments: p.departments ?? [],
      location: p.locations?.[0]
        ? `${p.locations[0].label}${p.locations[0].address ? ` — ${p.locations[0].address}` : ''}`
        : null,
    }));
  }

  async list(actor: PartnerActor, q: ReferralsQueryDto) {
    const pid = actor.provider._id;
    const filter: Record<string, unknown> =
      q.direction === 'outgoing'
        ? { fromProviderId: pid }
        : q.direction === 'incoming'
          ? { toProviderId: pid }
          : { $or: [{ fromProviderId: pid }, { toProviderId: pid }] };
    if (q.status) filter.status = q.status;
    if (q.patientId) filter.patientId = new Types.ObjectId(q.patientId);
    const rows = await this.referralModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .exec();
    return rows.map((r) => this.toResponse(r, actor));
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.loadVisible(actor, id), actor);
  }

  async create(actor: PartnerActor, dto: CreateReferralDto) {
    const patient = await this.patients.assertLinked(actor, dto.patientId);
    if (!!dto.toProviderId === !!dto.toExternal) {
      throw new BadRequestException(
        'Refer either to an Ayuva organisation (toProviderId) or an external provider (toExternal)',
      );
    }
    let target: ProviderDocument | null = null;
    if (dto.toProviderId) {
      target = Types.ObjectId.isValid(dto.toProviderId)
        ? await this.providerModel.findOne({
            _id: dto.toProviderId,
            status: { $in: LIVE },
          })
        : null;
      if (!target)
        throw new NotFoundException(
          'That organisation is not on Ayuva or not verified',
        );
      if (target._id.equals(actor.provider._id))
        throw new BadRequestException(
          "You can't refer a patient to your own organisation",
        );
    }
    const now = new Date();
    const referral = await this.referralModel.create({
      referralNo: await this.newNumber(now),
      fromProviderId: actor.provider._id,
      fromProviderName: actor.provider.name,
      fromMemberId: actor.member._id,
      fromName: actor.member.fullName,
      toProviderId: target?._id,
      toName: target?.name ?? dto.toExternal!.name,
      toType: target ? orgTypeOf(target.type) : 'external',
      toExternal: dto.toExternal,
      patientId: patient._id,
      patientName: patient.fullName,
      type: dto.type,
      priority: dto.priority,
      reason: dto.reason,
      clinicalSummary: dto.clinicalSummary ?? '',
      requestedTests: dto.requestedTests ?? [],
      department: dto.department,
      history: [
        { at: now, status: ReferralStatus.SENT, byName: actor.member.fullName },
      ],
    });

    if (target) {
      await this.notifier.emit(target._id, {
        trigger: PartnerTrigger.REFERRAL_RECEIVED,
        title:
          dto.priority === ReferralPriority.EMERGENCY
            ? 'EMERGENCY referral received'
            : 'New referral received',
        message: `${actor.member.fullName} (${actor.provider.name}) referred {patient} for ${TYPE_LABEL[dto.type]}: ${dto.reason}`,
        patientId: patient.id,
        safeMessage: `${actor.provider.name} sent you a ${dto.priority} referral.`,
        route: '/partner/referrals',
        params: { referralId: referral.id },
        data: {
          referralId: referral.id,
          referralNo: referral.referralNo,
          type: dto.type,
          priority: dto.priority,
        },
      });
    }
    await this.notifications
      .create(patient.id, {
        trigger: 'referral_created',
        category: 'appointments',
        title: 'You have been referred',
        message: target
          ? `${actor.member.fullName} referred you to ${target.name} for ${TYPE_LABEL[dto.type]}. Book with them and share your records from Sharing so they can see your history.`
          : `${actor.member.fullName} referred you to ${referral.toName} for ${TYPE_LABEL[dto.type]}. Ask the clinic for your referral letter.`,
        lockScreenText: 'You have a new referral',
        actionLabel: target ? 'View provider' : 'View',
        actionRoute: target ? '/provider/[id]' : '/appointments',
        ...(target && { actionParams: { id: target.id } }),
      })
      .catch(() => undefined);
    await this.record(actor, AuditAction.PARTNER_REFERRAL_CREATE, referral, {
      change: 'sent',
      to: referral.toName,
    });
    return this.toResponse(referral, actor);
  }

  async respond(
    actor: PartnerActor,
    id: string,
    decision: 'accept' | 'decline',
    note?: string,
  ) {
    const referral = await this.loadIncoming(actor, id);
    if (referral.status !== ReferralStatus.SENT)
      throw new BadRequestException('This referral has already been answered');
    const now = new Date();
    referral.status =
      decision === 'accept' ? ReferralStatus.ACCEPTED : ReferralStatus.DECLINED;
    referral.respondedAt = now;
    referral.respondedByName = actor.member.fullName;
    referral.responseNote = note;
    referral.history.push({
      at: now,
      status: referral.status,
      byName: actor.member.fullName,
      note,
    });

    // A diagnostic centre accepting a test referral gets the order raised for it.
    let orderNote: string | undefined;
    if (
      decision === 'accept' &&
      actor.orgType === OrgType.DIAGNOSTIC &&
      referral.requestedTests.length
    ) {
      const items = await this.catalog.matchByNames(
        actor.provider._id,
        referral.requestedTests,
      );
      if (items.length) {
        const order = await this.labOrders.create(
          actor,
          {
            patientId: referral.patientId.toString(),
            testIds: items.map((i) => i.id),
          },
          { referral, items },
        );
        referral.labOrderId = new Types.ObjectId(order.id);
        orderNote = `Lab order ${order.orderNo} created`;
      } else {
        orderNote = 'No catalogue tests matched — create the order manually';
      }
    }
    await referral.save();

    await this.notifier.emit(referral.fromProviderId, {
      trigger: PartnerTrigger.REFERRAL_UPDATED,
      title: decision === 'accept' ? 'Referral accepted' : 'Referral declined',
      message: `${actor.provider.name} ${decision === 'accept' ? 'accepted' : 'declined'} your referral for {patient}${note ? `: ${note}` : '.'}`,
      patientId: referral.patientId.toString(),
      safeMessage: `${actor.provider.name} ${decision === 'accept' ? 'accepted' : 'declined'} one of your referrals.`,
      route: '/partner/referrals',
      params: { referralId: referral.id },
      data: { referralId: referral.id, status: referral.status },
    });
    if (decision === 'accept') {
      await this.notifications
        .create(referral.patientId.toString(), {
          trigger: 'referral_accepted',
          category: 'appointments',
          title: 'Referral accepted',
          message: `${actor.provider.name} accepted your referral from ${referral.fromName}.${referral.labOrderId ? ' Your tests are booked.' : ' You can now book a visit.'}`,
          lockScreenText: 'Update on your referral',
          actionLabel: 'View provider',
          actionRoute: '/provider/[id]',
          actionParams: { id: actor.provider.id },
        })
        .catch(() => undefined);
    }
    await this.record(actor, AuditAction.PARTNER_REFERRAL_UPDATE, referral, {
      change: referral.status,
      ...(orderNote && { orderNote }),
    });
    return {
      ...this.toResponse(referral, actor),
      orderNote: orderNote ?? null,
    };
  }

  async complete(actor: PartnerActor, id: string, note?: string) {
    const referral = await this.loadIncoming(actor, id);
    if (referral.status !== ReferralStatus.ACCEPTED)
      throw new BadRequestException(
        'Only an accepted referral can be completed',
      );
    const now = new Date();
    referral.status = ReferralStatus.COMPLETED;
    referral.completedAt = now;
    referral.history.push({
      at: now,
      status: ReferralStatus.COMPLETED,
      byName: actor.member.fullName,
      note,
    });
    await referral.save();
    await this.notifier.emit(referral.fromProviderId, {
      trigger: PartnerTrigger.REFERRAL_UPDATED,
      title: 'Referral completed',
      message: `${actor.provider.name} completed the referral for {patient}${note ? `: ${note}` : '.'}`,
      patientId: referral.patientId.toString(),
      safeMessage: `${actor.provider.name} completed one of your referrals.`,
      route: '/partner/referrals',
      params: { referralId: referral.id },
      data: { referralId: referral.id, status: referral.status },
    });
    await this.record(actor, AuditAction.PARTNER_REFERRAL_UPDATE, referral, {
      change: 'completed',
    });
    return this.toResponse(referral, actor);
  }

  async cancel(actor: PartnerActor, id: string, note?: string) {
    const referral = await this.loadVisible(actor, id);
    if (!referral.fromProviderId.equals(actor.provider._id))
      throw new ForbiddenException(
        'Only the referring organisation can cancel',
      );
    if (
      ![ReferralStatus.SENT, ReferralStatus.ACCEPTED].includes(referral.status)
    ) {
      throw new BadRequestException('This referral is already closed');
    }
    const now = new Date();
    referral.status = ReferralStatus.CANCELLED;
    referral.history.push({
      at: now,
      status: ReferralStatus.CANCELLED,
      byName: actor.member.fullName,
      note,
    });
    await referral.save();
    if (referral.toProviderId) {
      await this.notifier.emit(referral.toProviderId, {
        trigger: PartnerTrigger.REFERRAL_UPDATED,
        title: 'Referral cancelled',
        message: `${actor.provider.name} cancelled the referral for {patient}${note ? `: ${note}` : '.'}`,
        patientId: referral.patientId.toString(),
        safeMessage: `${actor.provider.name} cancelled a referral.`,
        route: '/partner/referrals',
        data: { referralId: referral.id, status: referral.status },
      });
    }
    await this.record(actor, AuditAction.PARTNER_REFERRAL_UPDATE, referral, {
      change: 'cancelled',
    });
    return this.toResponse(referral, actor);
  }

  async letter(actor: PartnerActor, id: string) {
    const referral = await this.loadVisible(actor, id);
    const from = referral.fromProviderId.equals(actor.provider._id)
      ? actor.provider
      : await this.providerModel.findById(referral.fromProviderId);
    return {
      buffer: this.documents.referralLetterPdf(
        referral,
        from ?? actor.provider,
      ),
      fileName: `Referral ${referral.referralNo}.pdf`,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async loadVisible(actor: PartnerActor, id: string) {
    const r = Types.ObjectId.isValid(id)
      ? await this.referralModel.findOne({
          _id: id,
          $or: [
            { fromProviderId: actor.provider._id },
            { toProviderId: actor.provider._id },
          ],
        })
      : null;
    if (!r) throw new NotFoundException('Referral not found');
    return r;
  }

  private async loadIncoming(actor: PartnerActor, id: string) {
    const r = await this.loadVisible(actor, id);
    if (!r.toProviderId?.equals(actor.provider._id))
      throw new ForbiddenException(
        'Only the receiving organisation can do this',
      );
    return r;
  }

  private async newNumber(at: Date) {
    const day = at.toISOString().slice(2, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const candidate = `REF-${day}-${randomBytes(2).toString('hex').toUpperCase()}`;
      if (!(await this.referralModel.exists({ referralNo: candidate })))
        return candidate;
    }
    throw new Error('Could not allocate a referral number');
  }

  private record(
    actor: PartnerActor,
    action: AuditAction,
    r: ReferralDocument,
    extra: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType: 'Referral',
      targetId: r.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: r.patientId.toString(),
        label: r.referralNo,
        ...extra,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(r: ReferralDocument, actor: PartnerActor) {
    const outgoing = r.fromProviderId.equals(actor.provider._id);
    return {
      id: r.id,
      referralNo: r.referralNo,
      direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
      from: {
        providerId: r.fromProviderId.toString(),
        name: r.fromProviderName,
        doctor: r.fromName,
      },
      to: {
        providerId: r.toProviderId?.toString() ?? null,
        name: r.toName,
        type: r.toType,
        external: r.toExternal
          ? {
              name: r.toExternal.name,
              email: r.toExternal.email ?? null,
              phone: r.toExternal.phone ?? null,
              address: r.toExternal.address ?? null,
            }
          : null,
      },
      patientId: r.patientId.toString(),
      patientName: r.patientName,
      type: r.type,
      priority: r.priority,
      reason: r.reason,
      clinicalSummary: r.clinicalSummary,
      requestedTests: r.requestedTests,
      department: r.department ?? null,
      status: r.status,
      responseNote: r.responseNote ?? null,
      respondedAt: r.respondedAt?.toISOString() ?? null,
      respondedByName: r.respondedByName ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      labOrderId: r.labOrderId?.toString() ?? null,
      history: r.history.map((h) => ({
        at: h.at.toISOString(),
        status: h.status,
        byName: h.byName ?? null,
        note: h.note ?? null,
      })),
      createdAt: (r.createdAt ?? new Date()).toISOString(),
    };
  }
}
