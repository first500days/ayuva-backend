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
import { LiveBus } from '../../common/live/live-bus.service';
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
  SaveSketchDto,
  UpdateNoteDto,
} from './dto/clinical.dto';
import { PartnerPatientsService } from './partner-patients.service';
import { resolveDiagnosisCodes, searchDiagnosisCodes } from './diagnosis-codes';
import { suggestDiagnosisCodes } from '../referrals/prior-auth-draft';

const SECTION_LABEL: Record<string, string> = {
  chiefComplaint: 'Chief complaint',
  history: 'History',
  examination: 'Examination',
  assessment: 'Assessment',
  plan: 'Plan',
};

/** Clinical Notes & AYUVA Scribe. */
/** Sketches per note, and x/y numbers per sketch (≈ 4000 points). */
export const MAX_SKETCHES = 4;
const MAX_SKETCH_NUMBERS = 8000;

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
    private readonly live: LiveBus,
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

  /**
   * Insurance coding assistant: the ICD-11 / SNOMED CT codes the note's own
   * words point to, each with the phrase and section it came from. A
   * provisional draft only — nothing is saved; the doctor accepts or rejects
   * every code, and only accepted codes are signed. Rule-based; sizes logged only.
   */
  async suggestCodes(
    actor: PartnerActor,
    sections: Record<string, string | undefined>,
  ) {
    const started = Date.now();
    const sources = Object.entries(sections)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => ({
        label: SECTION_LABEL[k] ?? k,
        text: (v ?? '').slice(0, 20_000),
      }));
    const suggestions = suggestDiagnosisCodes(sources);
    await this.aiLog.record({
      userId: actor.userId,
      service: AiService.CODING,
      input: {
        characters: sources.reduce((n, s) => n + s.text.length, 0),
        providerId: actor.provider.id,
      },
      outcome: { codesSuggested: suggestions.map((s) => s.icd11) },
      latencyMs: Date.now() - started,
      source: AiSource.MOCK,
    });
    return {
      suggestions,
      provisional: true,
      source: 'rules',
      disclaimer: AI_DISCLAIMER,
    };
  }

  /** ICD-11 / SNOMED CT diagnosis search for the notes and prescription forms. */
  diagnosisCodes(q: string) {
    return searchDiagnosisCodes(q).map(({ icd11, snomed, display }) => ({
      icd11,
      snomed,
      display,
    }));
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
    return (
      notes
        .filter(
          (n) =>
            n.status === NoteStatus.SIGNED ||
            n.authorUserId.toString() === actor.userId,
        )
        // The list leaves out sketch strokes; opening a note loads them.
        .map((n) => this.toResponse(n, false))
    );
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
      ...this.ambientConsent(actor, dto),
      sections: dto.sections ?? {},
      vitals: dto.vitals ?? {},
      structuringSource: dto.structuringSource ?? 'manual',
      diagnoses: resolveDiagnosisCodes(dto.diagnosisCodes ?? []),
    });
    this.live.publish(actor.provider._id, 'notes');
    return this.toResponse(note);
  }

  /**
   * Ambient listening transcribes the patient as well as the doctor, so the
   * patient's agreement is confirmed and recorded once per note.
   */
  private ambientConsent(
    actor: PartnerActor,
    dto: { inputMode?: string; ambientConsent?: boolean },
    note?: ConsultationNoteDocument,
  ): { ambientConsentAt?: Date; ambientConsentBy?: string } {
    if (dto.inputMode !== 'ambient' || note?.ambientConsentAt) return {};
    if (dto.ambientConsent !== true)
      throw new BadRequestException(
        'Confirm that the patient agreed to the consultation being transcribed before using ambient listening',
      );
    return {
      ambientConsentAt: new Date(),
      ambientConsentBy: actor.member.fullName,
    };
  }

  async addSketch(actor: PartnerActor, id: string, dto: SaveSketchDto) {
    const note = await this.loadOwnDraft(actor, id);
    if ((note.sketches ?? []).length >= MAX_SKETCHES)
      throw new BadRequestException(
        `A note holds up to ${MAX_SKETCHES} sketches`,
      );
    note.sketches.push(this.sketchFrom(dto));
    await note.save();
    return this.toResponse(note);
  }

  async replaceSketch(
    actor: PartnerActor,
    id: string,
    sketchId: string,
    dto: SaveSketchDto,
  ) {
    const note = await this.loadOwnDraft(actor, id);
    const sketch = (note.sketches ?? []).find(
      (k) => k._id?.toString() === sketchId,
    );
    if (!sketch) throw new NotFoundException('Sketch not found');
    Object.assign(sketch, this.sketchFrom(dto));
    note.markModified('sketches');
    await note.save();
    return this.toResponse(note);
  }

  async removeSketch(actor: PartnerActor, id: string, sketchId: string) {
    const note = await this.loadOwnDraft(actor, id);
    const kept = (note.sketches ?? []).filter(
      (k) => k._id?.toString() !== sketchId,
    );
    if (kept.length === (note.sketches ?? []).length)
      throw new NotFoundException('Sketch not found');
    note.set('sketches', kept);
    await note.save();
    return this.toResponse(note);
  }

  private sketchFrom(dto: SaveSketchDto) {
    let numbers = 0;
    for (const stroke of dto.strokes) {
      if (stroke.p.length % 2)
        throw new BadRequestException('Each stroke needs x, y pairs');
      numbers += stroke.p.length;
    }
    if (numbers > MAX_SKETCH_NUMBERS)
      throw new BadRequestException(
        'This sketch is too detailed to save. Undo a few strokes and try again.',
      );
    return {
      template: dto.template,
      caption: dto.caption?.trim() ?? '',
      strokes: dto.strokes.map(({ c, w, p }) => ({ c, w, p })),
      updatedAt: new Date(),
    };
  }

  async update(actor: PartnerActor, id: string, dto: UpdateNoteDto) {
    const note = await this.loadOwnDraft(actor, id);
    if (dto.appointmentId) {
      await this.assertAppointment(actor, dto.appointmentId, note.patientId);
      note.appointmentId = new Types.ObjectId(dto.appointmentId);
    }
    if (dto.rawInput !== undefined) note.rawInput = dto.rawInput;
    if (dto.inputMode !== undefined) {
      note.set(this.ambientConsent(actor, dto, note));
      note.inputMode = dto.inputMode;
    }
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
    if (dto.diagnosisCodes !== undefined)
      note.set('diagnoses', resolveDiagnosisCodes(dto.diagnosisCodes));
    await note.save();
    this.live.publish(actor.provider._id, 'notes');
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
    await this.record(actor, AuditAction.PARTNER_NOTE_SIGN, note, {
      // The human authorisation entry. Audit rows are hash-sealed, so it can't be edited later.
      validation: {
        action: 'MANUALLY_AUTHORIZED_CLINICAL_NOTE',
        state: 'Signed',
        userId: actor.userId,
        timestamp: note.signedAt.toISOString(),
      },
      // Whether any part was drafted by the Scribe or the coding assistant before the doctor signed.
      structuringSource: note.structuringSource ?? 'manual',
      diagnoses: (note.diagnoses ?? []).map((d) => d.icd11),
    });
    this.live.publish(actor.provider._id, 'notes');
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
    const pdf = this.documents.visitSummaryPdf(
      note,
      actor.provider,
      await this.documents.brand(actor.provider),
    );
    const record = await this.documents.deliverToVault({
      patientId: note.patientId,
      buffer: pdf,
      fileName: `Visit summary - ${actor.provider.name} - ${note.signedAt!.toISOString().slice(0, 10)}.pdf`,
      type: MedicalRecordType.PRESCRIPTION,
      providerName: actor.provider.name,
      procedureType: 'Visit summary',
      attendingPhysician: note.authorName,
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
    this.live.publish(actor.provider._id, 'notes');
    return { id, removed: true };
  }

  async pdf(actor: PartnerActor, note: ConsultationNoteDocument) {
    return this.documents.visitSummaryPdf(
      note,
      actor.provider,
      await this.documents.brand(actor.provider),
    );
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
    extra: Record<string, unknown> = {},
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
        ...extra,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(n: ConsultationNoteDocument, withSketches = true) {
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
      ambientConsentAt: n.ambientConsentAt?.toISOString() ?? null,
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
      diagnoses: (n.diagnoses ?? []).map((d) => ({
        icd11: d.icd11,
        snomed: d.snomed,
        display: d.display,
      })),
      status: n.status,
      signedAt: n.signedAt?.toISOString() ?? null,
      sharedWithPatientAt: n.sharedWithPatientAt?.toISOString() ?? null,
      prescriptionId: n.prescriptionId?.toString() ?? null,
      sketchCount: (n.sketches ?? []).length,
      sketches: withSketches
        ? (n.sketches ?? []).map((k) => ({
            id: k._id?.toString() ?? '',
            template: k.template,
            caption: k.caption ?? '',
            strokes: (k.strokes ?? []).map((st) => ({
              c: st.c,
              w: st.w,
              p: [...st.p],
            })),
            updatedAt: k.updatedAt?.toISOString() ?? null,
          }))
        : [],
      createdAt: (n.createdAt ?? new Date()).toISOString(),
      updatedAt: (n.updatedAt ?? new Date()).toISOString(),
    };
  }
}
