import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import { MedicalRecordType } from '../../core/records/schemas/medical-record.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AiInteractionLogService } from '../../ai/ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../../ai/common/ai-source.enum';
import { AI_DISCLAIMER } from '../../ai/common/ai-disclaimer.constant';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerDocumentsService } from '../documents/partner-documents.service';
import { structureConsultation } from './scribe/scribe-structurer';
import {
  ConsultationNote,
  ConsultationNoteDocument,
  NoteStatus,
} from './schemas/consultation-note.schema';
import {
  CreateNoteDto,
  NotesQueryDto,
  UpdateNoteDto,
} from './dto/clinical.dto';
import { PartnerPatientsService } from './partner-patients.service';

/** Clinical Notes & AYUVA Scribe. */
@Injectable()
export class PartnerNotesService {
  constructor(
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly documents: PartnerDocumentsService,
    private readonly aiLog: AiInteractionLogService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * AYUVA Scribe: turns the doctor's own typed/dictated text into structured
   * sections and prescription lines for review. Mock engine until the AI team's
   * model is plugged in; the response always says which (`source`). Only sizes
   * are logged — the clinical text itself never goes into the AI log.
   */
  async structure(actor: PartnerActor, text: string) {
    const started = Date.now();
    const result = structureConsultation(text);
    const filled = Object.entries(result.sections)
      .filter(([, v]) => v)
      .map(([k]) => k);
    await this.aiLog.record({
      userId: actor.userId,
      service: AiService.SCRIBE,
      input: { characters: text.length, providerId: actor.provider.id },
      outcome: {
        sectionsFilled: filled,
        medications: result.medications.length,
        vitals: Object.keys(result.vitals),
      },
      latencyMs: Date.now() - started,
      source: AiSource.MOCK,
    });
    return { ...result, source: AiSource.MOCK, disclaimer: AI_DISCLAIMER };
  }

  async list(actor: PartnerActor, q: NotesQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.patientId) filter.patientId = new Types.ObjectId(q.patientId);
    if (q.status) filter.status = q.status;
    if (q.mine) filter.authorMemberId = actor.member._id;
    const notes = await this.noteModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .exec();
    // Another clinician's draft is theirs alone until signed.
    return notes
      .filter(
        (n) =>
          n.status === NoteStatus.SIGNED ||
          n.authorUserId.toString() === actor.userId,
      )
      .map((n) => this.toResponse(n));
  }

  async get(actor: PartnerActor, id: string) {
    const note = await this.load(actor, id);
    if (
      note.status !== NoteStatus.SIGNED &&
      note.authorUserId.toString() !== actor.userId
    ) {
      throw new NotFoundException('Note not found');
    }
    return this.toResponse(note);
  }

  async create(actor: PartnerActor, dto: CreateNoteDto) {
    const patient = await this.patients.assertLinked(actor, dto.patientId);
    if (dto.appointmentId)
      await this.assertAppointment(actor, dto.appointmentId, patient._id);
    const note = await this.noteModel.create({
      providerId: actor.provider._id,
      authorMemberId: actor.member._id,
      authorUserId: new Types.ObjectId(actor.userId),
      authorName: actor.member.fullName,
      patientId: patient._id,
      patientName: patient.fullName,
      appointmentId: dto.appointmentId
        ? new Types.ObjectId(dto.appointmentId)
        : undefined,
      rawInput: dto.rawInput ?? '',
      inputMode: dto.inputMode ?? 'typed',
      sections: dto.sections ?? {},
      vitals: dto.vitals ?? {},
      structuringSource: dto.structuringSource ?? 'manual',
    });
    return this.toResponse(note);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateNoteDto) {
    const note = await this.loadOwnDraft(actor, id);
    if (dto.appointmentId) {
      await this.assertAppointment(actor, dto.appointmentId, note.patientId);
      note.appointmentId = new Types.ObjectId(dto.appointmentId);
    }
    if (dto.rawInput !== undefined) note.rawInput = dto.rawInput;
    if (dto.inputMode !== undefined) note.inputMode = dto.inputMode;
    if (dto.sections) {
      note.set('sections', { ...this.plainSections(note), ...dto.sections });
    }
    if (dto.vitals) {
      const current =
        (note.toObject() as unknown as { vitals?: Record<string, string> })
          .vitals ?? {};
      note.set('vitals', { ...current, ...dto.vitals });
    }
    if (dto.structuringSource !== undefined)
      note.structuringSource = dto.structuringSource;
    await note.save();
    return this.toResponse(note);
  }

  async sign(actor: PartnerActor, id: string) {
    const note = await this.loadOwnDraft(actor, id);
    const s = this.plainSections(note);
    if (!Object.values(s).some((v) => v && v.trim())) {
      throw new BadRequestException('Add at least one section before signing');
    }
    note.status = NoteStatus.SIGNED;
    note.signedAt = new Date();
    await note.save();
    await this.record(actor, AuditAction.PARTNER_NOTE_SIGN, note);
    return this.toResponse(note);
  }

  /** Sends the signed note to the patient's vault as a visit summary PDF. */
  async shareWithPatient(actor: PartnerActor, id: string) {
    const note = await this.load(actor, id);
    if (note.status !== NoteStatus.SIGNED)
      throw new BadRequestException(
        'Sign the note before sending it to the patient',
      );
    if (note.authorUserId.toString() !== actor.userId)
      throw new ForbiddenException('Only the author can send this note');
    if (note.vaultRecordId)
      throw new BadRequestException(
        'This visit summary is already in the patient’s vault',
      );
    const pdf = this.documents.visitSummaryPdf(note, actor.provider);
    const record = await this.documents.deliverToVault({
      patientId: note.patientId,
      buffer: pdf,
      fileName: `Visit summary - ${actor.provider.name} - ${note.signedAt!.toISOString().slice(0, 10)}.pdf`,
      type: MedicalRecordType.PRESCRIPTION,
      providerName: actor.provider.name,
      recordDate: note.signedAt,
      tags: ['visit-summary'],
      appointmentId: note.appointmentId,
      notification: {
        trigger: 'consultation_summary_uploaded',
        title: 'Visit summary added',
        message: `${note.authorName} at ${actor.provider.name} sent you a summary of your visit.`,
        lockScreenText: 'A new document is in your vault',
      },
    });
    note.vaultRecordId = record._id;
    note.sharedWithPatientAt = new Date();
    await note.save();
    await this.record(actor, AuditAction.PARTNER_NOTE_SHARE, note);
    return this.toResponse(note);
  }

  async remove(actor: PartnerActor, id: string) {
    const note = await this.loadOwnDraft(actor, id);
    await note.deleteOne();
    return { id, removed: true };
  }

  pdf(actor: PartnerActor, note: ConsultationNoteDocument) {
    return this.documents.visitSummaryPdf(note, actor.provider);
  }

  async loadReadable(actor: PartnerActor, id: string) {
    const note = await this.load(actor, id);
    if (
      note.status !== NoteStatus.SIGNED &&
      note.authorUserId.toString() !== actor.userId
    ) {
      throw new NotFoundException('Note not found');
    }
    return note;
  }

  private async load(actor: PartnerActor, id: string) {
    const note = Types.ObjectId.isValid(id)
      ? await this.noteModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  private async loadOwnDraft(actor: PartnerActor, id: string) {
    const note = await this.load(actor, id);
    if (note.authorUserId.toString() !== actor.userId)
      throw new ForbiddenException('Only the author can change this note');
    if (note.status !== NoteStatus.DRAFT)
      throw new BadRequestException('A signed note can’t be changed');
    return note;
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

  private plainSections(note: ConsultationNoteDocument) {
    const s = note.sections ?? ({} as ConsultationNoteDocument['sections']);
    return {
      chiefComplaint: s.chiefComplaint ?? '',
      history: s.history ?? '',
      examination: s.examination ?? '',
      assessment: s.assessment ?? '',
      plan: s.plan ?? '',
      advice: s.advice ?? '',
      followUp: s.followUp ?? '',
    };
  }

  private record(
    actor: PartnerActor,
    action: AuditAction,
    note: ConsultationNoteDocument,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType: 'ConsultationNote',
      targetId: note.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: note.patientId.toString(),
        label: 'Consultation note',
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(n: ConsultationNoteDocument) {
    const v = (n.vitals ?? {}) as Record<string, string | undefined>;
    return {
      id: n.id,
      patientId: n.patientId.toString(),
      patientName: n.patientName,
      appointmentId: n.appointmentId?.toString() ?? null,
      authorMemberId: n.authorMemberId.toString(),
      authorName: n.authorName,
      rawInput: n.rawInput,
      inputMode: n.inputMode,
      sections: this.plainSections(n),
      vitals: {
        bp: v.bp ?? '',
        pulse: v.pulse ?? '',
        temperature: v.temperature ?? '',
        spo2: v.spo2 ?? '',
        respiratoryRate: v.respiratoryRate ?? '',
        weight: v.weight ?? '',
        height: v.height ?? '',
      },
      structuringSource: n.structuringSource,
      status: n.status,
      signedAt: n.signedAt?.toISOString() ?? null,
      sharedWithPatientAt: n.sharedWithPatientAt?.toISOString() ?? null,
      prescriptionId: n.prescriptionId?.toString() ?? null,
      createdAt: (n.createdAt ?? new Date()).toISOString(),
      updatedAt: (n.updatedAt ?? new Date()).toISOString(),
    };
  }
}
