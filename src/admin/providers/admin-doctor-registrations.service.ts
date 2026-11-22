import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
  RegistrationReview,
} from '../../partner/staff/schemas/partner-member.schema';
import {
  RegistrationState,
  registrationStateOf,
} from '../../partner/staff/registration-status';
import {
  Perm,
  StaffRole,
  hasPerm,
  orgTypeOf,
  roleLabel,
} from '../../partner/rbac/partner-permissions';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import {
  DoctorRegistrationDecisionDto,
  DoctorRegistrationQueryDto,
  DoctorRegistrationResponseDto,
} from './dto/doctor-registration.dto';

/**
 * Verification Queue → Doctor licences: Ayuva checks each prescriber's medical
 * council registration before they can sign e-prescriptions. A decision is
 * tied to the exact number reviewed, so editing the number re-queues it.
 */
@Injectable()
export class AdminDoctorRegistrationsService {
  constructor(
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: AppNotificationsService,
  ) {}

  async list(
    query: DoctorRegistrationQueryDto,
  ): Promise<DoctorRegistrationResponseDto[]> {
    const status = query.status ?? 'pending';
    const members = await this.memberModel
      .find({
        status: { $ne: MemberStatus.SUSPENDED },
        $or: [{ registrationNumber: { $nin: [null, ''] } }, { isOwner: true }],
      })
      .sort({ updatedAt: -1 })
      .limit(500)
      .exec();
    const providers = await this.providerModel
      .find({
        _id: { $in: [...new Set(members.map((m) => m.providerId.toString()))] },
      })
      .exec();
    const providerById = new Map(providers.map((p) => [p.id as string, p]));

    const rows: DoctorRegistrationResponseDto[] = [];
    for (const m of members) {
      const provider = providerById.get(m.providerId.toString());
      if (!provider || !this.isPrescriber(m, provider)) continue;
      // An owner's registration is checked with their clinic until that's verified.
      if (m.isOwner && !provider.verifiedAt) continue;
      const state = registrationStateOf(m, provider);
      if (state.status === 'missing') continue;
      if (status !== 'all' && state.status !== status) continue;
      rows.push(this.toRow(m, provider, state));
    }
    return rows;
  }

  async decide(
    memberId: string,
    dto: DoctorRegistrationDecisionDto,
    actor: { id: string; email: string },
  ): Promise<DoctorRegistrationResponseDto> {
    const member = Types.ObjectId.isValid(memberId)
      ? await this.memberModel.findById(memberId).exec()
      : null;
    if (!member) throw new NotFoundException('Doctor not found');
    const provider = await this.providerModel
      .findById(member.providerId)
      .exec();
    if (!provider) throw new NotFoundException('Organisation not found');
    const number = registrationStateOf(member, provider).number;
    if (!number) {
      throw new BadRequestException(
        'This member has no registration number to verify',
      );
    }
    const approve = dto.decision === 'approve';
    const previous = member.registrationVerification;
    member.registrationVerification = {
      status: approve
        ? RegistrationReview.VERIFIED
        : RegistrationReview.REJECTED,
      number,
      submittedAt:
        previous?.number === number ? previous.submittedAt : new Date(),
      decidedAt: new Date(),
      decidedBy: actor.email,
      notes: dto.notes?.trim() || undefined,
    };
    await member.save();

    await this.auditLogService.record({
      actorId: actor.id,
      action: AuditAction.ADMIN_DOCTOR_REGISTRATION_REVIEW,
      targetType: 'PartnerMember',
      targetId: member.id,
      metadata: {
        decision: dto.decision,
        registrationNumber: number,
        memberName: member.fullName,
        providerId: provider.id,
        notes: dto.notes?.trim(),
      },
    });
    await this.notifications
      .create(member.userId.toString(), {
        trigger: approve ? 'registration_verified' : 'registration_rejected',
        title: approve ? 'Registration verified' : 'Registration not verified',
        message: approve
          ? `Ayuva verified your medical registration ${number}. You can now sign e-prescriptions.`
          : `Ayuva couldn't verify registration ${number}: ${dto.notes?.trim() ?? 'see Settings'}. Correct it under Settings → My profile.`,
        lockScreenText: 'An update about your medical registration',
        actionLabel: 'Open',
        actionRoute: '/partner/settings',
      })
      .catch(() => undefined);
    return this.toRow(member, provider, registrationStateOf(member, provider));
  }

  /** Only people who prescribe or sign reports need a verified registration. */
  private isPrescriber(m: PartnerMemberDocument, provider: ProviderDocument) {
    return (
      m.role === StaffRole.DOCTOR ||
      hasPerm(orgTypeOf(provider.type), m.role, Perm.CLINICAL_WRITE)
    );
  }

  private toRow(
    m: PartnerMemberDocument,
    provider: ProviderDocument,
    state: RegistrationState,
  ): DoctorRegistrationResponseDto {
    const review =
      m.registrationVerification?.number === state.number
        ? m.registrationVerification
        : undefined;
    return {
      memberId: m.id,
      fullName: m.fullName,
      email: m.email,
      roleLabel: roleLabel(orgTypeOf(provider.type), m.role),
      isOwner: m.isOwner,
      title: m.title,
      department: m.department,
      registrationNumber: state.number ?? '',
      status: state.status,
      submittedAt: state.submittedAt ?? undefined,
      decidedAt: state.decidedAt ?? undefined,
      decidedBy: review?.decidedBy,
      notes: state.notes ?? undefined,
      verifiedVia: state.verifiedVia ?? undefined,
      organisation: {
        id: provider.id as string,
        name: provider.name,
        type: provider.type,
        status: provider.status,
      },
    };
  }
}
