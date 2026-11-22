import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PrepPack,
  PrepPackDocument,
} from '../../ai/prep-pack/schemas/prep-pack.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';

interface PackItem {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  recordId?: string;
  date?: string;
  included: boolean;
}

/**
 * The patient's pre-visit inputs as one structured bundle for the clinic:
 * their symptom notes in their own words, the questions they picked, the
 * medicines and documents they chose to include. Only when the patient turned
 * on "Send to the clinic" in their Prep Pack, and only for that appointment's
 * clinic. Each read is logged in the patient's own access history.
 */
@Injectable()
export class PartnerPreVisitService {
  constructor(
    @InjectModel(PrepPack.name)
    private readonly packModel: Model<PrepPackDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AccessLog.name)
    private readonly logModel: Model<AccessLogDocument>,
    private readonly audit: AuditLogService,
  ) {}

  async forAppointment(actor: PartnerActor, appointmentId: string) {
    if (!Types.ObjectId.isValid(appointmentId))
      throw new NotFoundException('Appointment not found');
    const appt = await this.appointmentModel
      .findOne({ _id: appointmentId, providerId: actor.provider._id })
      .lean()
      .exec();
    if (!appt) throw new NotFoundException('Appointment not found');
    const pack = await this.packModel
      .findOne({ appointmentId, userId: appt.patientId, sendToClinic: true })
      .lean()
      .exec();
    if (!pack) return { appointmentId, submitted: false as const };

    const included = (pack.included ?? {}) as Record<string, boolean>;
    const items = (
      (pack.sections ?? []) as unknown as { kind: string; items: PackItem[] }[]
    )
      .flatMap((s) => s.items ?? [])
      .filter((i) => included[i.id] ?? i.included);
    await this.logModel.create({
      userId: appt.patientId,
      grantId: `previsit:${appointmentId}`,
      organisationName: actor.provider.name,
      recordTitle: 'your pre-visit notes and questions',
      action: 'viewed',
      viewerUserId: actor.member.userId,
      viewerName: actor.member.fullName,
    });
    await this.audit.record({
      actorId: actor.member.userId.toString(),
      action: AuditAction.PARTNER_RECORD_VIEW,
      targetType: 'PrepPack',
      targetId: (pack as { _id: Types.ObjectId })._id.toString(),
      metadata: { appointmentId, kind: 'pre_visit_bundle' },
    });
    return {
      appointmentId,
      submitted: true as const,
      submittedAt: (
        (pack as { updatedAt?: Date }).updatedAt ?? new Date()
      ).toISOString(),
      symptomNotes: pack.symptomNotes ?? '',
      questions: items.filter((i) => i.kind === 'question').map((i) => i.title),
      medicines: items
        .filter((i) => i.kind === 'medication')
        .map((i) => ({ name: i.title, detail: i.detail ?? null })),
      documents: items
        .filter((i) => i.kind === 'record')
        .map((i) => ({
          title: i.title,
          from: i.detail ?? null,
          date: i.date ?? null,
          recordId: i.recordId ?? null,
        })),
      note: 'Written by the patient for this visit. Documents open only if the patient has also shared them with you.',
    };
  }

  /** Which of these appointments have a pre-visit bundle waiting. */
  async submittedIds(appointmentIds: string[]): Promise<Set<string>> {
    if (!appointmentIds.length) return new Set();
    const rows = await this.packModel
      .find({ appointmentId: { $in: appointmentIds }, sendToClinic: true })
      .select('appointmentId')
      .lean()
      .exec();
    return new Set(rows.map((r) => r.appointmentId));
  }
}
