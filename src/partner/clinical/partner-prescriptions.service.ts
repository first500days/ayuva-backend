import {
  BadRequestException,
  ForbiddenException,
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
    if (dto.noteId) {
      const note = await this.noteModel.findOne({
        _id: dto.noteId,
        providerId: actor.provider._id,
        patientId: patient._id,
      });
      if (!note)
        throw new BadRequestException('That note is not for this patient');
      noteId = note._id;
    }
    const rx = await this.rxModel.create({
      providerId: actor.provider._id,
      providerName: actor.provider.name,
      authorMemberId: actor.member._id,
      authorUserId: new Types.ObjectId(actor.userId),
      doctorName: actor.member.fullName,
      doctorTitle: actor.member.title,
      doctorRegistrationNumber: this.registrationNumber(actor),
      patientId: patient._id,
      patientName: patient.fullName,
      appointmentId: dto.appointmentId
        ? new Types.ObjectId(dto.appointmentId)
        : undefined,
      noteId,
      items: dto.items,
      diagnosis: dto.diagnosis ?? '',
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
    const regNo = this.registrationNumber(actor);
    if (!regNo) {
      throw new BadRequestException(
        'Add your medical registration number (My profile) before signing prescriptions',
      );
    }
    const signedAt = new Date();
    rx.doctorName = actor.member.fullName;
    rx.doctorTitle = actor.member.title;
    rx.doctorRegistrationNumber = regNo;
    rx.rxNumber = await this.newRxNumber(signedAt);
    rx.signedAt = signedAt;
    rx.status = PrescriptionStatus.SIGNED;
    rx.signatureHash = this.contentHash(rx, actor.userId, signedAt);
    await rx.save();

    const pdf = this.documents.prescriptionPdf(rx, actor.provider);
    const fileName = `Prescription ${rx.rxNumber} - ${actor.provider.name}.pdf`;
    if (dto.sendToVault !== false) {
      const record = await this.documents.deliverToVault({
        patientId: rx.patientId,
        buffer: pdf,
        fileName,
        type: MedicalRecordType.PRESCRIPTION,
        providerName: actor.provider.name,
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
    await rx.save();
    await this.record(actor, AuditAction.PARTNER_RX_SIGN, rx, {
      rxNumber: rx.rxNumber,
      items: rx.items.length,
      toVault: dto.sendToVault !== false,
      toPharmacy: !!rx.pharmacySentAt,
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

  /** The signer's council registration; a clinic owner falls back to the practice's registration. */
  private registrationNumber(actor: PartnerActor): string | undefined {
    return (
      actor.member.registrationNumber ||
      (actor.member.isOwner ? actor.provider.registrationNumber : undefined) ||
      undefined
    );
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
      ]),
      diagnosis: rx.diagnosis,
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
      })),
      diagnosis: r.diagnosis,
      advice: r.advice,
      investigations: r.investigations,
      followUpDate: r.followUpDate?.toISOString().slice(0, 10) ?? null,
      signedAt: r.signedAt?.toISOString() ?? null,
      signatureHash: r.signatureHash ?? null,
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
