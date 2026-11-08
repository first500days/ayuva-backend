import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import { MedicalRecordType } from '../../core/records/schemas/medical-record.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { ReminderQueueService } from '../../notifications/queue/reminder-queue.service';
import { MailService } from '../../mail/mail.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { StaffRole } from '../rbac/partner-permissions';
import { PartnerDocumentsService } from '../documents/partner-documents.service';
import {
  Prescription,
  PrescriptionDocument,
  PrescriptionStatus,
} from './schemas/prescription.schema';
import {
  ConsultationNote,
  ConsultationNoteDocument,
} from './schemas/consultation-note.schema';
import {
  CreatePrescriptionDto,
  PrescriptionsQueryDto,
  SignPrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/clinical.dto';
import { PartnerPatientsService } from './partner-patients.service';
import { PartnerSafetyService } from './partner-safety.service';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { SMS_SENDER } from '../../notifications/sms/sms-sender';
import type { SmsSender } from '../../notifications/sms/sms-sender';
import { WHATSAPP_SENDER } from '../../notifications/sms/whatsapp-sender';
import type { WhatsAppSender } from '../../notifications/sms/whatsapp-sender';
import { OrgType } from '../rbac/partner-permissions';
import { blocksSigning } from './rx-safety';
import { resolveDiagnosisCodes } from './diagnosis-codes';
import {
  registrationStateOf,
  signingRegistration,
} from '../staff/registration-status';

/** Digital Prescriptions (E-Rx): draft → sign → patient vault (+ optional pharmacy). */
@Injectable()
export class PartnerPrescriptionsService {
  private readonly logger = new Logger(PartnerPrescriptionsService.name);

  constructor(
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly documents: PartnerDocumentsService,
    private readonly notifications: AppNotificationsService,
    private readonly mail: MailService,
    private readonly audit: AuditLogService,
    private readonly safety: PartnerSafetyService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsAppSender,
    private readonly config: ConfigService,
    private readonly reminders: ReminderQueueService,
  ) {}

  async list(actor: PartnerActor, q: PrescriptionsQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.patientId) filter.patientId = new Types.ObjectId(q.patientId);
    if (q.status) filter.status = q.status;
    if (q.mine) filter.authorMemberId = actor.member._id;
    const rxs = await this.rxModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .exec();
    return rxs
      .filter(
        (r) =>
          r.status !== PrescriptionStatus.DRAFT ||
          r.authorUserId.toString() === actor.userId,
      )
      .map((r) => this.toResponse(r));
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.loadReadable(actor, id));
  }

  async create(actor: PartnerActor, dto: CreatePrescriptionDto) {
    const patient = await this.patients.assertLinked(actor, dto.patientId);
    if (dto.appointmentId)
      await this.assertAppointment(actor, dto.appointmentId, patient._id);
    let noteId: Types.ObjectId | undefined;
    let diagnoses = resolveDiagnosisCodes(dto.diagnosisCodes ?? []);
    if (dto.noteId) {
      const note = await this.noteModel.findOne({
        _id: dto.noteId,
        providerId: actor.provider._id,
        patientId: patient._id,
      });
      if (!note)
        throw new BadRequestException('That note is not for this patient');
      noteId = note._id;
      // Carries the consultation's coded diagnoses onto the slip unless chosen here.
      if (dto.diagnosisCodes === undefined)
        diagnoses = (note.diagnoses ?? []).map(
          ({ icd11, snomed, display }) => ({
            icd11,
            snomed,
            display,
          }),
        );
    }
    const rx = await this.rxModel.create({
      providerId: actor.provider._id,
      providerName: actor.provider.name,
      authorMemberId: actor.member._id,
      authorUserId: new Types.ObjectId(actor.userId),
      doctorName: actor.member.fullName,
      doctorTitle: actor.member.title,
      doctorRegistrationNumber: signingRegistration(
        actor.member,
        actor.provider,
      ),
      patientId: patient._id,
      patientName: patient.fullName,
      appointmentId: dto.appointmentId
        ? new Types.ObjectId(dto.appointmentId)
        : undefined,
      noteId,
      items: dto.items,
      diagnosis: dto.diagnosis ?? '',
      diagnoses,
      advice: dto.advice ?? '',
      investigations: dto.investigations ?? [],
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
    });
    if (noteId)
      await this.noteModel.updateOne(
        { _id: noteId },
        { $set: { prescriptionId: rx._id } },
      );
    return this.toResponse(rx);
  }

  async update(actor: PartnerActor, id: string, dto: UpdatePrescriptionDto) {
    const rx = await this.loadOwnDraft(actor, id);
    if (dto.items !== undefined) rx.set('items', dto.items);
    if (dto.diagnosis !== undefined) rx.diagnosis = dto.diagnosis;
    if (dto.diagnosisCodes !== undefined)
      rx.set('diagnoses', resolveDiagnosisCodes(dto.diagnosisCodes));
    if (dto.advice !== undefined) rx.advice = dto.advice;
    if (dto.investigations !== undefined)
      rx.investigations = dto.investigations;
    if (dto.followUpDate !== undefined)
      rx.followUpDate = dto.followUpDate
        ? new Date(dto.followUpDate)
        : undefined;
    if (dto.appointmentId) {
      await this.assertAppointment(actor, dto.appointmentId, rx.patientId);
      rx.appointmentId = new Types.ObjectId(dto.appointmentId);
    }
    await rx.save();
    return this.toResponse(rx);
  }

  async sign(actor: PartnerActor, id: string, dto: SignPrescriptionDto) {
    const rx = await this.loadOwnDraft(actor, id);
    if (!rx.items.length)
      throw new BadRequestException('Add at least one medicine before signing');
    if (!rx.diagnoses?.length) {
      throw new BadRequestException(
        'Add at least one coded diagnosis (ICD-11 / SNOMED CT) before signing',
      );
    }
    const registration = registrationStateOf(actor.member, actor.provider);
    if (!registration.number) {
      throw new BadRequestException(
        'Add your medical registration number (Settings → My profile) before signing prescriptions',
      );
    }
    // A self-entered licence number isn't enough: Ayuva has to verify it first.
    if (registration.status !== 'verified') {
      throw new ForbiddenException(
        registration.status === 'rejected'
          ? `Ayuva couldn't verify registration ${registration.number}${registration.notes ? ` (${registration.notes})` : ''}. Correct it under Settings → My profile — prescription signing stays locked until it's verified.`
          : `Prescription signing is locked until Ayuva verifies your medical registration ${registration.number}.`,
      );
    }
    const regNo = registration.number;
    // Allergy / interaction / duplicate checks: serious ones must be acknowledged.
    const review = await this.safety.review(
      actor,
      rx.patientId,
      rx.items,
      rx._id,
    );
    const serious = review.warnings.filter(blocksSigning);
    if (serious.length && !dto.acknowledgeWarnings)
      throw new BadRequestException(
        `Review the ${serious.length} safety warning${serious.length === 1 ? '' : 's'} before signing: ${serious
          .slice(0, 2)
          .map((w) => w.message)
          .join(' ')}`,
      );
    rx.safetyReview = {
      checkedAt: new Date(),
      warnings: review.warnings.map((w) => ({
        severity: w.severity,
        kind: w.kind,
        message: w.message,
      })),
      acknowledged: serious.length > 0,
    };
    // Where it goes. SMS / WhatsApp only point to the vault copy, so they imply it.
    const targets = new Set<string>(
      dto.dispatchTo ?? (dto.sendToVault === false ? [] : ['vault']),
    );
    if (targets.has('sms') || targets.has('whatsapp')) targets.add('vault');
    if (targets.has('internal_pharmacy') && actor.orgType !== OrgType.HOSPITAL)
      throw new BadRequestException(
        'Only a hospital with a pharmacy can send prescriptions to an internal pharmacy',
      );
    const toVault = targets.has('vault');
    rx.dispatchTo = [...targets];
    const signedAt = new Date();
    rx.doctorName = actor.member.fullName;
    rx.doctorTitle = actor.member.title;
    rx.doctorRegistrationNumber = regNo;
    rx.rxNumber = await this.newRxNumber(signedAt);
    rx.signedAt = signedAt;
    rx.attestedAt = signedAt;
    rx.status = PrescriptionStatus.SIGNED;
    rx.signatureHash = this.contentHash(rx, actor.userId, signedAt);
    await rx.save();

    const pdf = this.documents.prescriptionPdf(rx, actor.provider);
    const fileName = `Prescription ${rx.rxNumber} - ${actor.provider.name}.pdf`;
    if (toVault) {
      const record = await this.documents.deliverToVault({
        patientId: rx.patientId,
        buffer: pdf,
        fileName,
        type: MedicalRecordType.PRESCRIPTION,
        providerName: actor.provider.name,
        procedureType: 'Prescription',
        attendingPhysician: rx.doctorName,
        recordDate: signedAt,
        tags: ['e-prescription'],
        appointmentId: rx.appointmentId,
        notification: {
          trigger: 'prescription_available',
          title: 'New prescription',
          message: `${rx.doctorName} sent you a prescription (${rx.items.length} medicine${rx.items.length === 1 ? '' : 's'}). It's in your Medical Vault.`,
          lockScreenText: 'A new document is in your vault',
        },
      });
      rx.vaultRecordId = record._id;
      rx.deliveredToVaultAt = new Date();
    }
    if (dto.pharmacy?.email) {
      rx.pharmacy = { name: dto.pharmacy.name, email: dto.pharmacy.email };
      const sent = await this.mail.sendMail(
        dto.pharmacy.email,
        `E-prescription ${rx.rxNumber} from ${actor.provider.name}`,
        `<p>Please find attached e-prescription <strong>${rx.rxNumber}</strong> issued by ${escapeHtml(rx.doctorName)} (Reg. ${escapeHtml(regNo)}), ${escapeHtml(actor.provider.name)}.</p>
         <p>Verification hash: <code>${rx.signatureHash}</code></p>`,
        [{ filename: fileName, content: pdf }],
      );
      if (sent) rx.pharmacySentAt = new Date();
      else this.logger.warn(`Pharmacy email for ${rx.rxNumber} failed`);
    }
    rx.dispatchResult = {
      ...(targets.has('internal_pharmacy') && { pharmacy: 'queued' }),
      ...(await this.notifyPatient(rx, targets)),
    };
    await rx.save();
    if (toVault && rx.followUpDate) {
      // Not awaited: a slow or absent Redis must never hold up a signature.
      void this.reminders
        .scheduleCareFollowUp({
          prescriptionId: rx.id,
          userId: rx.patientId.toString(),
          doctorName: rx.doctorName,
          followUpDate: rx.followUpDate,
        })
        .catch((err: unknown) =>
          this.logger.error(`Follow-up reminder failed for ${rx.id}`, err as Error),
        );
    }
    await this.record(actor, AuditAction.PARTNER_RX_SIGN, rx, {
      rxNumber: rx.rxNumber,
      items: rx.items.length,
      diagnoses: rx.diagnoses.map((d) => d.icd11),
      registration: regNo,
      attested: true,
      toVault,
      toPharmacy: !!rx.pharmacySentAt,
      dispatchTo: rx.dispatchTo,
      ...(rx.safetyReview?.warnings.length && {
        safetyWarnings: rx.safetyReview.warnings.length,
        acknowledged: rx.safetyReview.acknowledged,
      }),
    });
    return this.toResponse(rx);
  }

  async cancel(actor: PartnerActor, id: string, reason: string) {
    const rx = await this.load(actor, id);
    if (rx.status !== PrescriptionStatus.SIGNED)
      throw new BadRequestException(
        'Only a signed prescription can be cancelled',
      );
    const isAuthor = rx.authorUserId.toString() === actor.userId;
    if (!isAuthor && actor.role !== StaffRole.ADMIN) {
      throw new ForbiddenException(
        'Only the prescriber or an administrator can cancel a prescription',
      );
    }
    rx.status = PrescriptionStatus.CANCELLED;
    rx.cancelledAt = new Date();
    rx.cancelReason = reason;
    await rx.save();
    void this.reminders
      .cancelCareFollowUp(rx.id)
      .catch((err: unknown) =>
        this.logger.error(`Could not remove follow-up reminder for ${rx.id}`, err as Error),
      );
    await this.documents.tagVaultRecord(rx.vaultRecordId, 'cancelled');
    await this.notifications
      .create(rx.patientId.toString(), {
        trigger: 'prescription_cancelled',
        category: 'documents',
        title: 'Prescription cancelled',
        message: `${rx.doctorName} cancelled prescription ${rx.rxNumber}: ${reason}. Do not use it; contact your doctor if unsure.`,
        lockScreenText: 'An update about a prescription',
        actionLabel: 'View',
        actionRoute: rx.vaultRecordId ? '/record/[id]' : '/records',
        ...(rx.vaultRecordId && {
          actionParams: { id: rx.vaultRecordId.toString() },
        }),
      })
      .catch(() => undefined);
    await this.record(actor, AuditAction.PARTNER_RX_CANCEL, rx, {
      rxNumber: rx.rxNumber,
      reason,
    });
    return this.toResponse(rx);
  }

  async remove(actor: PartnerActor, id: string) {
    const rx = await this.loadOwnDraft(actor, id);
    await rx.deleteOne();
    return { id, removed: true };
  }

  async pdf(actor: PartnerActor, id: string) {
    const rx = await this.loadReadable(actor, id);
    return {
      buffer: this.documents.prescriptionPdf(rx, actor.provider),
      fileName: `Prescription ${rx.rxNumber ?? 'draft'}.pdf`,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * SMS / WhatsApp notice to the patient. It carries no medical details —
   * no doctor, medicine or diagnosis — only that something is waiting in
   * the Ayuva app (and the app link when one is configured).
   */
  private async notifyPatient(
    rx: PrescriptionDocument,
    targets: Set<string>,
  ): Promise<{ sms?: string; whatsapp?: string }> {
    if (!targets.has('sms') && !targets.has('whatsapp')) return {};
    const patient = await this.userModel
      .findById(rx.patientId)
      .select('phone')
      .lean()
      .exec();
    const phone = patient?.phone;
    const link = this.config.get<string>('sms.patientAppUrl') || undefined;
    const body = `Ayuva: you have a new document in your Medical Vault. Open the Ayuva app to view it.${link ? ` ${link}` : ''}`;
    const out: { sms?: string; whatsapp?: string } = {};
    if (targets.has('sms'))
      out.sms = !phone
        ? 'no_phone'
        : (await this.sms.send(phone, body))
          ? this.sms.live === false
            ? 'logged'
            : 'sent'
          : 'failed';
    if (targets.has('whatsapp'))
      out.whatsapp = !phone
        ? 'no_phone'
        : (await this.whatsapp.send(phone, body, link))
          ? this.whatsapp.live
            ? 'sent'
            : 'logged'
          : 'failed';
    return out;
  }

  private contentHash(
    rx: PrescriptionDocument,
    signerUserId: string,
    signedAt: Date,
  ): string {
    const canonical = JSON.stringify({
      rxNumber: rx.rxNumber,
      providerId: rx.providerId.toString(),
      patientId: rx.patientId.toString(),
      doctor: rx.doctorName,
      registration: rx.doctorRegistrationNumber,
      items: rx.items.map((i) => [
        i.medicine,
        i.form,
        i.strength,
        i.dose,
        i.frequency,
        i.duration,
        i.route,
        i.instructions,
        i.quantity,
        // Appended only when set, so prescriptions without refills hash exactly as before.
        ...(i.refills ? [i.refills] : []),
      ]),
      diagnosis: rx.diagnosis,
      diagnoses: rx.diagnoses.map((d) => [d.icd11, d.snomed]),
      advice: rx.advice,
      investigations: rx.investigations,
      followUpDate: rx.followUpDate?.toISOString() ?? null,
      signer: signerUserId,
      signedAt: signedAt.toISOString(),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async newRxNumber(at: Date): Promise<string> {
    const day = at.toISOString().slice(0, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const candidate = `RX-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
      if (!(await this.rxModel.exists({ rxNumber: candidate })))
        return candidate;
    }
    throw new Error('Could not allocate a prescription number');
  }

  private async load(actor: PartnerActor, id: string) {
    const rx = Types.ObjectId.isValid(id)
      ? await this.rxModel.findOne({ _id: id, providerId: actor.provider._id })
      : null;
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  private async loadReadable(actor: PartnerActor, id: string) {
    const rx = await this.load(actor, id);
    if (
      rx.status === PrescriptionStatus.DRAFT &&
      rx.authorUserId.toString() !== actor.userId
    ) {
      throw new NotFoundException('Prescription not found');
    }
    return rx;
  }

  private async loadOwnDraft(actor: PartnerActor, id: string) {
    const rx = await this.load(actor, id);
    if (rx.authorUserId.toString() !== actor.userId)
      throw new ForbiddenException(
        'Only the prescriber can change this prescription',
      );
    if (rx.status !== PrescriptionStatus.DRAFT) {
      throw new BadRequestException(
        'A signed prescription can’t be edited — cancel it and issue a new one',
      );
    }
    return rx;
  }

  private async assertAppointment(
    actor: PartnerActor,
    appointmentId: string,
    patientId: Types.ObjectId,
  ) {
    const ok = await this.appointmentModel.exists({
      _id: appointmentId,
      providerId: actor.provider._id,
      patientId,
    });
    if (!ok)
      throw new BadRequestException(
        'That appointment is not this patient’s visit with your organisation',
      );
  }

  private record(
    actor: PartnerActor,
    action: AuditAction,
    rx: PrescriptionDocument,
    extra: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType: 'Prescription',
      targetId: rx.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: rx.patientId.toString(),
        label: rx.rxNumber,
        ...extra,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(r: PrescriptionDocument) {
    return {
      id: r.id,
      rxNumber: r.rxNumber ?? null,
      status: r.status,
      patientId: r.patientId.toString(),
      patientName: r.patientName,
      appointmentId: r.appointmentId?.toString() ?? null,
      noteId: r.noteId?.toString() ?? null,
      authorMemberId: r.authorMemberId.toString(),
      doctorName: r.doctorName,
      doctorTitle: r.doctorTitle ?? null,
      doctorRegistrationNumber: r.doctorRegistrationNumber ?? null,
      items: r.items.map((i) => ({
        medicine: i.medicine,
        form: i.form ?? '',
        strength: i.strength ?? '',
        dose: i.dose ?? '',
        frequency: i.frequency,
        duration: i.duration,
        route: i.route ?? '',
        instructions: i.instructions ?? '',
        quantity: i.quantity ?? '',
        refills: i.refills ?? 0,
      })),
      diagnosis: r.diagnosis,
      diagnoses: (r.diagnoses ?? []).map((d) => ({
        icd11: d.icd11,
        snomed: d.snomed,
        display: d.display,
      })),
      advice: r.advice,
      investigations: r.investigations,
      followUpDate: r.followUpDate?.toISOString().slice(0, 10) ?? null,
      signedAt: r.signedAt?.toISOString() ?? null,
      signatureHash: r.signatureHash ?? null,
      dispatchTo: r.dispatchTo ?? null,
      dispatchResult: r.dispatchResult
        ? {
            pharmacy: r.dispatchResult.pharmacy ?? null,
            sms: r.dispatchResult.sms ?? null,
            whatsapp: r.dispatchResult.whatsapp ?? null,
          }
        : null,
      safetyReview: r.safetyReview
        ? {
            checkedAt: r.safetyReview.checkedAt.toISOString(),
            warnings: r.safetyReview.warnings,
            acknowledged: r.safetyReview.acknowledged,
          }
        : null,
      attestedAt: r.attestedAt?.toISOString() ?? null,
      deliveredToVaultAt: r.deliveredToVaultAt?.toISOString() ?? null,
      pharmacy: r.pharmacy?.email
        ? { name: r.pharmacy.name ?? null, email: r.pharmacy.email }
        : null,
      pharmacySentAt: r.pharmacySentAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason ?? null,
      createdAt: (r.createdAt ?? new Date()).toISOString(),
      updatedAt: (r.updatedAt ?? new Date()).toISOString(),
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
