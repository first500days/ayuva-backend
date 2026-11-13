import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiInteractionLogService } from '../../ai/ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../../ai/common/ai-source.enum';
import {
  ConsultationNote,
  ConsultationNoteDocument,
  NoteStatus,
} from '../../partner/clinical/schemas/consultation-note.schema';
import { readDocumentText } from './document-text';
import { RecordsService } from './records.service';
import {
  explainScan,
  type ScanExplanation,
  type ScanNote,
} from './scan-explainer';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordType,
} from './schemas/medical-record.schema';

/** A doctor's note this long after the scan is taken to be about it. */
const NOTE_WINDOW_MS = 30 * 86_400_000;

/**
 * POST /records/:id/explain-scan. Reads the imaging report the patient holds
 * and the doctor's signed note for the visit it belongs to, and returns the
 * rule-based explanation (scan-explainer.ts). Logged like every AI surface.
 */
@Injectable()
export class ScanExplainService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    private readonly records: RecordsService,
    private readonly aiLog: AiInteractionLogService,
  ) {}

  async explain(userId: string, recordId: string): Promise<ScanExplanation> {
    if (!Types.ObjectId.isValid(recordId))
      throw new NotFoundException('Record not found');
    const record = await this.recordModel
      .findOne({ _id: recordId, patientId: new Types.ObjectId(userId) })
      .exec();
    if (!record) throw new NotFoundException('Record not found');
    if (record.type !== MedicalRecordType.SCAN)
      throw new BadRequestException('Explain My Scan is for imaging reports');

    const started = Date.now();
    let reportText = '';
    try {
      const { buffer, mimeType } = await this.records.download(
        userId,
        recordId,
      );
      reportText = await readDocumentText(buffer, mimeType);
    } catch {
      // No file or unreadable: the explanation says so.
    }
    const date = record.recordDate ?? record.uploadedAt ?? undefined;
    const note = await this.doctorNote(userId, record, date);
    const out = explainScan({
      procedureType: record.procedureType,
      providerName: record.providerName,
      date,
      reportText,
      note,
    });

    await this.aiLog
      .record({
        userId,
        service: AiService.SCAN_EXPLAINER,
        input: {
          recordId,
          procedureType: record.procedureType ?? null,
          textRead: out.textRead,
        },
        outcome: {
          sections: out.sections.map((s) => s.heading),
          terms: out.terms.map((t) => t.term),
          measurements: out.measurements,
          doctorNote: !!out.sources.doctorNote,
          disclaimer: out.disclaimer,
        },
        latencyMs: Date.now() - started,
        source: AiSource.MOCK,
      })
      .catch(() => undefined);
    return out;
  }

  /** The signed note of the visit the scan was attached to, else the first within a month after it. */
  private async doctorNote(
    userId: string,
    record: MedicalRecordDocument,
    date: Date | undefined,
  ): Promise<ScanNote | null> {
    const base = {
      patientId: new Types.ObjectId(userId),
      status: NoteStatus.SIGNED,
    };
    let note = record.attachedAppointmentId
      ? await this.noteModel
          .findOne({ ...base, appointmentId: record.attachedAppointmentId })
          .sort({ signedAt: -1 })
          .lean()
          .exec()
      : null;
    if (!note && date)
      note = await this.noteModel
        .findOne({
          ...base,
          signedAt: {
            $gte: date,
            $lte: new Date(date.getTime() + NOTE_WINDOW_MS),
          },
        })
        .sort({ signedAt: 1 })
        .lean()
        .exec();
    if (!note) return null;
    return {
      doctor: note.authorName || 'Your doctor',
      signedAt: note.signedAt ?? new Date(),
      assessment: note.sections?.assessment,
      plan: note.sections?.plan,
      advice: note.sections?.advice,
    };
  }
}
