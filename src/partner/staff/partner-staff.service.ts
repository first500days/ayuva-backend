import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  CURRENT_CONSENT_VERSION,
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { MailService } from '../../mail/mail.service';
import { AuthService } from '../../auth/auth.service';
import { AuthTokensResponseDto } from '../../auth/dto/auth-tokens-response.dto';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  StaffRole,
  assignableRoles,
  orgTypeOf,
  permissionsFor,
  roleLabel,
} from '../rbac/partner-permissions';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from './schemas/partner-member.schema';
import {
  AcceptInviteDto,
  InviteStaffDto,
  UpdateOwnStaffProfileDto,
  UpdateStaffDto,
} from './dto/staff.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Placeholder consent until the invitee accepts the terms themselves; the
// ConsentGuard rejects it, and the account has no password until then anyway.
const PENDING_CONSENT_VERSION = 'invite-pending';

/** Staff Management & Practitioner Roster: the organisation's people, roles and duty hours. */
@Injectable()
export class PartnerStaffService {
  constructor(
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    private readonly audit: AuditLogService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly notifier: PartnerNotifierService,
    private readonly config: ConfigService,
  ) {}

  async list(actor: PartnerActor) {
    const members = await this.memberModel
      .find({ providerId: actor.provider._id })
      .sort({ isOwner: -1, status: 1, fullName: 1 })
      .exec();
    const load = await this.workload(actor.provider._id);
    return {
      roles: assignableRoles(actor.orgType).map((r) => ({
        role: r,
        label: roleLabel(actor.orgType, r),
        permissions: permissionsFor(actor.orgType, r),
      })),
      departments: actor.provider.departments ?? [],
      members: members.map((m) => this.toResponse(m, actor, load.get(m.id))),
    };
  }

  async invite(actor: PartnerActor, dto: InviteStaffDto) {
    this.assertAssignable(actor, dto.role);
    const email = dto.email.trim().toLowerCase();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException(
        'An Ayuva account already uses this email — staff need a dedicated work email',
      );
    }

    const user = await this.userModel.create({
      fullName: dto.fullName.trim(),
      email,
      role: UserRole.PARTNER,
      status: UserStatus.ACTIVE,
      consent: {
        termsAccepted: false,
        privacyAccepted: false,
        healthDataProcessingAccepted: false,
        version: PENDING_CONSENT_VERSION,
        acceptedAt: new Date(),
      },
    });
    const { token, hash } = this.newToken();
    let member: PartnerMemberDocument;
    try {
      member = await this.memberModel.create({
        providerId: actor.provider._id,
        userId: user._id,
        role: dto.role,
        status: MemberStatus.INVITED,
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone,
        title: dto.title,
        department: dto.department,
        registrationNumber: dto.registrationNumber,
        inviteTokenHash: hash,
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      await this.userModel.deleteOne({ _id: user._id });
      throw err;
    }

    const inviteUrl = this.inviteUrl(token);
    await this.sendInviteEmail(
      member,
      actor.provider.name,
      actor.member.fullName,
      inviteUrl,
    );
    await this.record(actor, AuditAction.PARTNER_STAFF_INVITE, member, {
      role: dto.role,
      email,
    });
    return { member: this.toResponse(member, actor), inviteUrl };
  }

  async update(actor: PartnerActor, id: string, dto: UpdateStaffDto) {
    const member = await this.getMember(actor, id);
    const changes: Record<string, unknown> = {};

    if (dto.role !== undefined && dto.role !== member.role) {
      if (member.isOwner)
        throw new BadRequestException(
          "The organisation owner's role can't be changed",
        );
      this.assertAssignable(actor, dto.role);
      if (member.role === StaffRole.ADMIN)
        await this.assertAnotherAdmin(actor, member);
      changes.role = { from: member.role, to: dto.role };
      member.role = dto.role;
    }
    for (const key of [
      'title',
      'department',
      'phone',
      'registrationNumber',
    ] as const) {
      if (dto[key] !== undefined) {
        const value = dto[key]?.trim() || undefined;
        if (value !== member[key]) changes[key] = value ?? null;
        member.set(key, value);
      }
    }
    if (dto.dutySchedule !== undefined) {
      for (const b of dto.dutySchedule) {
        if (b.start >= b.end)
          throw new BadRequestException(
            `Duty block on ${b.day} must end after it starts`,
          );
      }
      member.dutySchedule = dto.dutySchedule;
      changes.dutySchedule = dto.dutySchedule.length;
    }
    // Phone stays on the member only — User.phone is unique and reserved for patient OTP sign-in.
    await member.save();
    await this.record(actor, AuditAction.PARTNER_STAFF_UPDATE, member, changes);
    return this.toResponse(member, actor);
  }

  async updateOwnProfile(actor: PartnerActor, dto: UpdateOwnStaffProfileDto) {
    const member = actor.member;
    for (const key of ['title', 'phone', 'registrationNumber'] as const) {
      if (dto[key] !== undefined)
        member.set(key, dto[key]?.trim() || undefined);
    }
    await member.save();
    return this.toResponse(member, actor);
  }

  async suspend(actor: PartnerActor, id: string) {
    const member = await this.getMember(actor, id);
    if (member.isOwner)
      throw new BadRequestException(
        "The organisation owner can't be suspended",
      );
    if (member.userId.toString() === actor.userId)
      throw new BadRequestException("You can't suspend yourself");
    if (member.status !== MemberStatus.ACTIVE)
      throw new BadRequestException('Only an active member can be suspended');
    if (member.role === StaffRole.ADMIN)
      await this.assertAnotherAdmin(actor, member);
    member.status = MemberStatus.SUSPENDED;
    await member.save();
    // Staff logins belong to exactly one organisation, so suspending the member blocks the login too.
    await this.userModel.updateOne(
      { _id: member.userId },
      { $set: { status: UserStatus.INACTIVE } },
    );
    await this.record(actor, AuditAction.PARTNER_STAFF_SUSPEND, member, {
      suspended: true,
    });
    return this.toResponse(member, actor);
  }

  async reactivate(actor: PartnerActor, id: string) {
    const member = await this.getMember(actor, id);
    if (member.status !== MemberStatus.SUSPENDED)
      throw new BadRequestException('Member is not suspended');
    member.status = MemberStatus.ACTIVE;
    await member.save();
    await this.userModel.updateOne(
      { _id: member.userId },
      { $set: { status: UserStatus.ACTIVE } },
    );
    await this.record(actor, AuditAction.PARTNER_STAFF_SUSPEND, member, {
      suspended: false,
    });
    return this.toResponse(member, actor);
  }

  async resendInvite(actor: PartnerActor, id: string) {
    const member = await this.getMember(actor, id);
    if (member.status !== MemberStatus.INVITED)
      throw new BadRequestException('This member has already joined');
    const { token, hash } = this.newToken();
    member.inviteTokenHash = hash;
    member.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await member.save();
    const inviteUrl = this.inviteUrl(token);
    await this.sendInviteEmail(
      member,
      actor.provider.name,
      actor.member.fullName,
      inviteUrl,
    );
    return { member: this.toResponse(member, actor), inviteUrl };
  }

  /** Withdraws an invitation that hasn't been accepted. Joined members are suspended instead, keeping their audit trail. */
  async revokeInvite(actor: PartnerActor, id: string) {
    const member = await this.getMember(actor, id);
    if (member.status !== MemberStatus.INVITED) {
      throw new BadRequestException(
        'Joined members are suspended, not removed, so their activity stays auditable',
      );
    }
    await this.memberModel.deleteOne({ _id: member._id });
    await this.userModel.deleteOne({
      _id: member.userId,
      role: UserRole.PARTNER,
      passwordHash: { $exists: false },
    });
    await this.record(actor, AuditAction.PARTNER_STAFF_UPDATE, member, {
      inviteRevoked: true,
    });
    return { id: member.id, removed: true };
  }

  // ── Public invite acceptance ──────────────────────────────────────────────

  async describeInvite(token: string) {
    const member = await this.findInvite(token);
    const provider = await this.providerModel
      .findById(member.providerId)
      .select('name type')
      .exec();
    const orgType = orgTypeOf(provider?.type ?? '');
    return {
      email: member.email,
      fullName: member.fullName,
      organisationName: provider?.name ?? 'Your organisation',
      organisationType: orgType,
      role: member.role,
      roleLabel: roleLabel(orgType, member.role),
      expiresAt: member.inviteExpiresAt?.toISOString(),
    };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<AuthTokensResponseDto> {
    const member = await this.findInvite(dto.token);
    const now = new Date();
    await this.userModel.updateOne(
      { _id: member.userId },
      {
        $set: {
          passwordHash: await bcrypt.hash(dto.password, 10),
          status: UserStatus.ACTIVE,
          consent: {
            termsAccepted: true,
            privacyAccepted: true,
            healthDataProcessingAccepted: true,
            version: CURRENT_CONSENT_VERSION,
            acceptedAt: now,
          },
        },
      },
    );
    member.status = MemberStatus.ACTIVE;
    member.joinedAt = now;
    member.inviteTokenHash = undefined;
    member.inviteExpiresAt = undefined;
    await member.save();

    await this.audit.record({
      actorId: member.userId.toString(),
      action: AuditAction.PARTNER_STAFF_ACCEPT,
      targetType: 'PartnerMember',
      targetId: member.id,
      metadata: { providerId: member.providerId.toString(), role: member.role },
    });
    await this.notifier.emit(member.providerId, {
      trigger: PartnerTrigger.STAFF_JOINED,
      title: 'Staff member joined',
      message: `${member.fullName} accepted their invitation (${member.role}).`,
      safeMessage:
        'A staff member accepted their invitation to your organisation.',
      route: '/partner/staff',
      data: { memberId: member.id, role: member.role },
      excludeUserId: member.userId.toString(),
    });
    return this.auth.login({ email: member.email, password: dto.password });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async findInvite(token: string): Promise<PartnerMemberDocument> {
    const hash = createHash('sha256').update(token).digest('hex');
    const member = await this.memberModel.findOne({
      inviteTokenHash: hash,
      status: MemberStatus.INVITED,
    });
    if (
      !member ||
      !member.inviteExpiresAt ||
      member.inviteExpiresAt < new Date()
    ) {
      throw new NotFoundException(
        'This invitation is invalid or has expired — ask your administrator to resend it',
      );
    }
    return member;
  }

  private async getMember(
    actor: PartnerActor,
    id: string,
  ): Promise<PartnerMemberDocument> {
    const member = Types.ObjectId.isValid(id)
      ? await this.memberModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!member) throw new NotFoundException('Staff member not found');
    return member;
  }

  private assertAssignable(actor: PartnerActor, role: StaffRole) {
    if (!assignableRoles(actor.orgType).includes(role)) {
      throw new BadRequestException(
        `A ${actor.orgType} organisation can't assign the ${role} role`,
      );
    }
  }

  /** An organisation must always keep at least one active administrator. */
  private async assertAnotherAdmin(
    actor: PartnerActor,
    member: PartnerMemberDocument,
  ) {
    const others = await this.memberModel.countDocuments({
      providerId: actor.provider._id,
      role: StaffRole.ADMIN,
      status: MemberStatus.ACTIVE,
      _id: { $ne: member._id },
    });
    if (others === 0)
      throw new ForbiddenException(
        'Your organisation must keep at least one active administrator',
      );
  }

  /** Assigned appointments today and over the next 7 days, per member — the roster's workload column. */
  private async workload(
    providerId: Types.ObjectId,
  ): Promise<Map<string, { today: number; week: number }>> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(start.getTime() + 86_400_000);
    const weekEnd = new Date(start.getTime() + 7 * 86_400_000);
    const slots = await this.slotModel
      .find({ providerId, date: { $gte: start, $lt: weekEnd } })
      .select('_id date')
      .lean()
      .exec();
    const slotDate = new Map(slots.map((s) => [s._id.toString(), s.date]));
    const appts = await this.appointmentModel
      .find({
        providerId,
        slotId: { $in: slots.map((s) => s._id) },
        assignedMemberId: { $exists: true },
        status: {
          $in: [
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.REQUESTED,
            AppointmentStatus.COMPLETED,
          ],
        },
      })
      .select('assignedMemberId slotId')
      .lean()
      .exec();
    const load = new Map<string, { today: number; week: number }>();
    for (const a of appts) {
      const key = a.assignedMemberId!.toString();
      const entry = load.get(key) ?? { today: 0, week: 0 };
      entry.week += 1;
      const d = slotDate.get(a.slotId.toString());
      if (d && d >= start && d < tomorrow) entry.today += 1;
      load.set(key, entry);
    }
    return load;
  }

  private newToken() {
    const token = randomBytes(32).toString('hex');
    return { token, hash: createHash('sha256').update(token).digest('hex') };
  }

  private inviteUrl(token: string) {
    return `${this.config.get<string>('frontend.url') ?? ''}/partner/accept-invite?token=${token}`;
  }

  private sendInviteEmail(
    member: PartnerMemberDocument,
    orgName: string,
    inviterName: string,
    url: string,
  ) {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return this.mail.sendMail(
      member.email,
      `You're invited to join ${orgName} on Ayuva`,
      `<div style="font-family:Arial,sans-serif;max-width:520px">
        <p>${esc(inviterName)} invited you to join <strong>${esc(orgName)}</strong> on the Ayuva Partner Portal as <strong>${esc(member.role)}</strong>.</p>
        <p><a href="${esc(url)}" style="background:#0E7C7B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
        <p style="color:#889;font-size:12px">This link expires in 7 days. If you weren't expecting it, ignore this email.</p>
      </div>`,
    );
  }

  private record(
    actor: PartnerActor,
    action: AuditAction,
    member: PartnerMemberDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType: 'PartnerMember',
      targetId: member.id,
      metadata: {
        providerId: actor.provider.id,
        memberName: member.fullName,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(
    m: PartnerMemberDocument,
    actor: { orgType: PartnerActor['orgType'] },
    load?: { today: number; week: number },
  ) {
    return {
      id: m.id,
      userId: m.userId.toString(),
      fullName: m.fullName,
      email: m.email,
      phone: m.phone ?? null,
      role: m.role,
      roleLabel: roleLabel(actor.orgType, m.role),
      isOwner: m.isOwner,
      status: m.status,
      title: m.title ?? null,
      department: m.department ?? null,
      registrationNumber: m.registrationNumber ?? null,
      dutySchedule: (m.dutySchedule ?? []).map((b) => ({
        day: b.day,
        start: b.start,
        end: b.end,
      })),
      invitedAt: m.createdAt?.toISOString() ?? null,
      inviteExpiresAt: m.inviteExpiresAt?.toISOString() ?? null,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
      appointmentsToday: load?.today ?? 0,
      appointmentsWeek: load?.week ?? 0,
    };
  }
}
