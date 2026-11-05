import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import {
  AuditAction,
  AuditLog,
  AuditLogDocument,
} from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm, hasPerm } from '../rbac/partner-permissions';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { PartnerPatientsService } from './partner-patients.service';
import {
  CaseMessage,
  CaseMessageDocument,
} from './schemas/case-message.schema';
import { PostCaseMessageDto } from './dto/discussion.dto';

const VIEW_WINDOW_MS = 30 * 60 * 1000;
const MAX_MESSAGES = 200;

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

/**
 * Internal case discussion with @mentions. Anyone who can read the patient's
 * records in the organisation can take part; a mention notifies only the
 * people named, and email/SMS copies carry no patient details.
 */
@Injectable()
export class PartnerDiscussionService {
  constructor(
    @InjectModel(CaseMessage.name)
    private readonly messageModel: Model<CaseMessageDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly audit: AuditLogService,
    private readonly notifier: PartnerNotifierService,
  ) {}

  /** Colleagues who can read patient records, so can be @mentioned. */
  async mentionable(actor: PartnerActor) {
    const members = await this.memberModel
      .find({ providerId: actor.provider._id, status: MemberStatus.ACTIVE })
      .select('fullName role department')
      .sort({ fullName: 1 })
      .exec();
    return members
      .filter(
        (m) =>
          m.id !== actor.member.id &&
          hasPerm(actor.orgType, m.role, Perm.RECORDS_VIEW),
      )
      .map((m) => ({
        memberId: m.id,
        name: m.fullName,
        role: m.role,
        department: m.department ?? null,
      }));
  }

  async list(actor: PartnerActor, patientId: string) {
    const patient = await this.patients.assertLinked(actor, patientId);
    const rows = await this.messageModel
      .find({ providerId: actor.provider._id, patientId: patient._id })
      .sort({ createdAt: -1 })
      .limit(MAX_MESSAGES)
      .exec();
    await this.logView(actor, patient._id);
    return rows.reverse().map((m) => this.view(actor, m));
  }

  async post(actor: PartnerActor, patientId: string, dto: PostCaseMessageDto) {
    const patient = await this.patients.assertLinked(actor, patientId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Write a message first');
    // A mention counts when the person was picked from the list and is still named in the text.
    const wanted = new Set(dto.mentions ?? []);
    const lower = body.toLowerCase();
    const mentions = (await this.mentionable(actor)).filter(
      (c) =>
        wanted.has(c.memberId) && lower.includes(`@${c.name.toLowerCase()}`),
    );
    const msg = await this.messageModel.create({
      providerId: actor.provider._id,
      patientId: patient._id,
      authorMemberId: actor.member._id,
      authorUserId: new Types.ObjectId(actor.userId),
      authorName: actor.member.fullName,
      authorRole: actor.role,
      body,
      mentions: mentions.map((m) => ({
        memberId: new Types.ObjectId(m.memberId),
        name: m.name,
      })),
    });
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_CASE_MESSAGE,
      targetType: 'User',
      targetId: patient.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: patient.id,
        messageId: msg.id,
        mentions: mentions.length,
        label: 'Case discussion',
      },
      ipAddress: actor.ip,
    });
    if (mentions.length)
      await this.notifier.emit(actor.provider._id, {
        trigger: PartnerTrigger.CLINICAL_MENTION,
        title: `${actor.member.fullName} mentioned you`,
        message: `On {patient}'s case: “${clip(body, 140)}”`,
        patientId: patient.id,
        safeMessage:
          'A colleague mentioned you in a case discussion. Open the Ayuva Partner Portal to read it.',
        route: '/partner/patients',
        params: { patientId: patient.id, tab: 'discussion' },
        data: { messageId: msg.id },
        memberIds: mentions.map((m) => m.memberId),
        excludeUserId: actor.userId,
      });
    return this.view(actor, msg);
  }

  async remove(actor: PartnerActor, messageId: string) {
    if (!Types.ObjectId.isValid(messageId))
      throw new NotFoundException('Message not found');
    const msg = await this.messageModel
      .findOne({ _id: messageId, providerId: actor.provider._id })
      .exec();
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.authorMemberId.toString() !== actor.member.id)
      throw new ForbiddenException('Only the author can remove a message');
    if (!msg.removedAt) {
      msg.removedAt = new Date();
      await msg.save();
      await this.audit.record({
        actorId: actor.userId,
        action: AuditAction.PARTNER_CASE_MESSAGE,
        targetType: 'User',
        targetId: msg.patientId.toString(),
        metadata: {
          providerId: actor.provider.id,
          patientId: msg.patientId.toString(),
          messageId: msg.id,
          removed: true,
          label: 'Case discussion',
        },
        ipAddress: actor.ip,
      });
    }
    return this.view(actor, msg);
  }

  /** Reading the discussion is a record access; logged once per half hour. */
  private async logView(actor: PartnerActor, patientId: Types.ObjectId) {
    const recent = await this.auditModel.exists({
      actorId: new Types.ObjectId(actor.userId),
      action: AuditAction.PARTNER_PATIENT_VIEW,
      targetId: patientId,
      'metadata.label': 'Case discussion',
      createdAt: { $gte: new Date(Date.now() - VIEW_WINDOW_MS) },
    });
    if (!recent)
      await this.audit.record({
        actorId: actor.userId,
        action: AuditAction.PARTNER_PATIENT_VIEW,
        targetType: 'User',
        targetId: patientId.toString(),
        metadata: {
          providerId: actor.provider.id,
          patientId: patientId.toString(),
          label: 'Case discussion',
        },
        ipAddress: actor.ip,
      });
  }

  private view(actor: PartnerActor, m: CaseMessageDocument) {
    const removed = !!m.removedAt;
    return {
      id: m.id,
      authorMemberId: m.authorMemberId.toString(),
      authorName: m.authorName,
      authorRole: m.authorRole,
      body: removed ? '' : m.body,
      mentions: removed
        ? []
        : m.mentions.map((x) => ({
            memberId: x.memberId.toString(),
            name: x.name,
          })),
      mine: m.authorMemberId.toString() === actor.member.id,
      mentionsMe:
        !removed &&
        m.mentions.some((x) => x.memberId.toString() === actor.member.id),
      removed,
      createdAt: (m.createdAt ?? new Date()).toISOString(),
    };
  }
}
