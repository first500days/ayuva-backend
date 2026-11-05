import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordKind,
  MedicalRecordType,
  consentTokenFor,
} from './schemas/medical-record.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import {
  ReportInterpretation,
  ReportInterpretationDocument,
  patientView,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { StorageService } from '../../storage/storage.service';
import { systemFileName } from '../../common/utils/system-file-name.util';
import { ReminderQueueService } from '../../notifications/queue/reminder-queue.service';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';
import { MedicalRecordDetailResponseDto } from './dto/medical-record-detail-response.dto';
import { UploadRecordDto } from './dto/upload-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';
import {
  detectDocument,
  FILENAME_TYPE_PATTERNS,
  type DocumentDetection,
} from './document-detect';
import { readDocumentText } from './document-text';
import { simplifyDocument, type PlainLanguageGuide } from './plain-language';
import { parseQuestion } from './ask-records';
import type { AskRecordsResponseDto } from './dto/ask-records.dto';

const FOLDER_WORDS: Record<MedicalRecordType, [string, string]> = {
  [MedicalRecordType.LAB_REPORT]: ['lab report', 'lab reports'],
  [MedicalRecordType.SCAN]: ['scan', 'scans'],
  [MedicalRecordType.PRESCRIPTION]: ['prescription', 'prescriptions'],
  [MedicalRecordType.DISCHARGE]: ['discharge summary', 'discharge summaries'],
  [MedicalRecordType.INSURANCE]: ['insurance document', 'insurance documents'],
  [MedicalRecordType.VACCINATION]: [
    'vaccination record',
    'vaccination records',
  ],
  [MedicalRecordType.CERTIFICATE]: ['certificate', 'certificates'],
};
// Lab PDFs read to answer a value question, newest first.
const ASK_MAX_REPORTS = 12;

const dateText = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
const num = (n: number) => String(Number(n.toFixed(3)));

export const ALLOWED_RECORD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
];

// Priority-ordered filename heuristics. Phase 3 replaces this with real
// OCR/AI-assisted classification (PRD FR-8.3) — this rule-based pass is the
// permanent fallback/first-pass, not a placeholder to be deleted outright.
// File-name folder hints live with the rest of the document reading.
const CATEGORY_PATTERNS = FILENAME_TYPE_PATTERNS;

@Injectable()
export class RecordsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly reportInterpretationModel: Model<ReportInterpretationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly storageService: StorageService,
    private readonly reminderQueueService: ReminderQueueService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    options: UploadRecordDto = {},
  ): Promise<MedicalRecordResponseDto> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (!ALLOWED_RECORD_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}" — allowed: ${ALLOWED_RECORD_MIME_TYPES.join(', ')}`,
      );
    }

    const kind = options.kind ?? MedicalRecordKind.ORIGINAL;
    const source = options.derivedFromRecordId
      ? await this.getOwnedRecordOrThrow(userId, options.derivedFromRecordId)
      : undefined;
    if (kind === MedicalRecordKind.SIMPLIFICATION && !source) {
      throw new BadRequestException(
        'A simplification must name the record it explains (derivedFromRecordId)',
      );
    }
    if (options.appointmentId) {
      await this.getOwnedAppointmentOrThrow(userId, options.appointmentId);
    }

    // A patient's own document: read its folder, date and provider from the
    // text it carries (and its file name) for whatever they didn't say.
    const detection =
      kind === MedicalRecordKind.ORIGINAL &&
      (!options.type || !options.recordDate || !options.providerName)
        ? detectDocument({
            text: await readDocumentText(file.buffer, file.mimetype),
            fileName: file.originalname,
          })
        : undefined;
    const detected: DocumentDetection | undefined = detection && {
      textRead: detection.textRead,
      ...(!options.type && detection.type && { type: detection.type }),
      ...(!options.recordDate &&
        detection.recordDate && { recordDate: detection.recordDate }),
      ...(!options.providerName &&
        detection.providerName && { providerName: detection.providerName }),
    };

    // A saved explanation lives in its source's folder, next to it.
    const type =
      options.type ??
      source?.type ??
      (kind === MedicalRecordKind.VISIT_SUMMARY
        ? MedicalRecordType.PRESCRIPTION
        : (detected?.type?.value ??
          this.categorize(file.originalname, file.mimetype)));
    const providerName =
      options.providerName ??
      source?.providerName ??
      detected?.providerName?.value;
    const recordDate = options.recordDate
      ? new Date(options.recordDate)
      : (source?.recordDate ??
        (detected?.recordDate
          ? new Date(detected.recordDate.value)
          : undefined));

    // The device filename only feeds the folder guess above and the patient's
    // own vault title; the stored key and every other screen get a system name.
    const recordId = new Types.ObjectId();
    const systemName = systemFileName(recordId.toHexString(), file.mimetype, file.originalname);
    const fileRef = await this.storageService.upload(file.buffer, systemName, userId);
    // Consent is snapshotted onto the record at ingestion (the admin "Consent Token").
    const patient = await this.userModel.findById(userId).select('consent').lean().exec();

    const record = await this.recordModel.create({
      _id: recordId,
      patientId: userId,
      fileRef,
      originalFileName: file.originalname,
      systemFileName: systemName,
      consentToken: consentTokenFor(userId, patient?.consent, 'ingestion'),
      mimeType: file.mimetype,
      type,
      kind,
      tags: options.tags ?? [],
      ...(source && { derivedFromRecordId: source._id }),
      ...(options.appointmentId && {
        attachedAppointmentId: new Types.ObjectId(options.appointmentId),
      }),
      ...(providerName && { providerName }),
      ...(recordDate && { recordDate }),
      patientUploaded: true,
    });

    // Push text can show on a lock screen, so it names the system file, not the device one.
    await this.reminderQueueService.sendDocumentUploadConfirmation({
      recordId: record.id,
      userId,
      fileName: systemName,
    });

    // `detected` tells the app what was read, so the patient can confirm or correct it.
    return { ...this.toResponse(record), ...(detected && { detected }) };
  }

  /** U08 vault listing: folder, free-text (name/tag/provider), tag, kind and clinical-date filters. */
  async findAll(
    userId: string,
    filters: QueryRecordsDto = {},
  ): Promise<MedicalRecordResponseDto[]> {
    const and: QueryFilter<MedicalRecordDocument>[] = [
      { patientId: new Types.ObjectId(userId) },
    ];
    if (filters.type) {
      and.push({
        type: filters.type,
        kind: { $ne: MedicalRecordKind.VISIT_SUMMARY },
      });
    }
    if (filters.kind) {
      // Records from before `kind` existed are originals.
      and.push(
        filters.kind === MedicalRecordKind.ORIGINAL
          ? { kind: { $in: [MedicalRecordKind.ORIGINAL, null] } }
          : { kind: filters.kind },
      );
    }
    if (filters.tag) {
      and.push({ tags: filters.tag.trim().toLowerCase() });
    }
    if (filters.q) {
      const re = buildSafeRegex(filters.q);
      and.push({
        $or: [{ originalFileName: re }, { tags: re }, { providerName: re }],
      });
    }
    if (filters.from || filters.to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (filters.from) range.$gte = startOfDay(filters.from);
      if (filters.to) range.$lte = endOfDay(filters.to);
      // Clinical date when known, upload date otherwise — the same fallback the timeline uses.
      and.push({
        $or: [
          { recordDate: range },
          { recordDate: { $exists: false }, uploadedAt: range },
        ],
      });
    }

    const records = await this.recordModel
      .find(and.length > 1 ? { $and: and } : and[0])
      .sort({ uploadedAt: -1 })
      .exec();
    return records
      .map((r) => this.toResponse(r))
      .sort((a, b) => b.recordDate.localeCompare(a.recordDate));
  }

  /** U08 row menu: rename, move folder, tags, provider, clinical date. */
  async update(
    userId: string,
    id: string,
    dto: UpdateRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.getOwnedRecordOrThrow(userId, id);
    if (dto.title !== undefined) record.originalFileName = dto.title.trim();
    if (dto.type !== undefined) record.type = dto.type;
    if (dto.tags !== undefined) record.tags = dto.tags;
    if (dto.providerName !== undefined) {
      record.providerName = dto.providerName.trim() || undefined;
    }
    if (dto.recordDate !== undefined) record.recordDate = new Date(dto.recordDate);
    await record.save();
    return this.toResponse(record);
  }

  /**
   * Deletes the record and its file. Share grants are not rewritten: partner
   * reads resolve records live, so a deleted record simply stops appearing.
   * Saved explanations of it stay — they are the patient's own documents —
   * but lose their source link.
   */
  async remove(userId: string, id: string): Promise<void> {
    const record = await this.getOwnedRecordOrThrow(userId, id);
    await this.recordModel.deleteOne({ _id: record._id });
    await this.recordModel.updateMany(
      { derivedFromRecordId: record._id },
      { $unset: { derivedFromRecordId: '' } },
    );
    await this.storageService.remove(record.fileRef);
  }

  /** The decrypted file, for the patient's own download/share (U08). */
  async download(
    userId: string,
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const record = await this.getOwnedRecordOrThrow(userId, id);
    const buffer = await this.storageService.read(record.fileRef);
    return {
      buffer,
      fileName: record.originalFileName,
      mimeType: record.mimeType ?? guessMimeType(record.originalFileName),
    };
  }

  /**
   * "Ask Your Records": a question about the patient's own history, answered
   * from their vault by rules — dates, counts, values read from their lab
   * PDFs, or a search — always with the records it came from.
   */
  async ask(userId: string, question: string): Promise<AskRecordsResponseDto> {
    const intent = parseQuestion(question);
    const docs = await this.recordModel
      .find({
        patientId: new Types.ObjectId(userId),
        kind: {
          $nin: [
            MedicalRecordKind.SIMPLIFICATION,
            MedicalRecordKind.VISIT_SUMMARY,
          ],
        },
        ...('type' in intent && intent.type && { type: intent.type }),
      })
      .exec();
    const when = (r: MedicalRecordDocument) =>
      r.recordDate ?? r.uploadedAt ?? new Date(0);
    docs.sort((a, b) => when(b).getTime() - when(a).getTime());
    const from = (r: MedicalRecordDocument) =>
      r.providerName ? ` from ${r.providerName}` : '';
    const [one, many] =
      'type' in intent && intent.type
        ? FOLDER_WORDS[intent.type]
        : ['record', 'records'];

    if (intent.kind === 'latest' || intent.kind === 'earliest') {
      const r = intent.kind === 'latest' ? docs[0] : docs[docs.length - 1];
      return {
        basis: 'dates',
        answer: r
          ? `Your ${intent.kind === 'latest' ? 'most recent' : 'first'} ${one} is "${r.originalFileName}", dated ${dateText(when(r))}${from(r)}.`
          : `I couldn't find any ${many} in your records.`,
        records: r ? [this.toResponse(r)] : [],
      };
    }

    if (intent.kind === 'count') {
      const since = intent.since;
      const hits = since ? docs.filter((r) => when(r) >= since) : docs;
      return {
        basis: 'count',
        answer: `You have ${hits.length} ${hits.length === 1 ? one : many}${since ? ` since ${dateText(since)}` : ''}.`,
        records: hits.slice(0, 5).map((r) => this.toResponse(r)),
      };
    }

    if (intent.kind === 'value') {
      const labs = docs
        .filter((r) => r.type === MedicalRecordType.LAB_REPORT)
        .slice(0, ASK_MAX_REPORTS);
      const found: { r: MedicalRecordDocument; text: string }[] = [];
      for (const r of labs) {
        if (found.length >= 3) break;
        const text = await this.storageService
          .read(r.fileRef)
          .then((buf) =>
            readDocumentText(
              buf,
              r.mimeType ?? guessMimeType(r.originalFileName),
            ),
          )
          .catch(() => '');
        const v = simplifyDocument(text).values.find((x) =>
          intent.marker.pattern.test(x.name),
        );
        if (!v) continue;
        found.push({
          r,
          text:
            `${num(v.value)} ${v.unit}`.trim() +
            ` on ${dateText(when(r))}${from(r)} — ${v.position} the range printed on that report (${num(v.low)}–${num(v.high)})`,
        });
      }
      const label = intent.marker.label;
      return {
        basis: 'values',
        answer: found.length
          ? `Your ${label} was ${found[0].text}.` +
            (found.length > 1
              ? ` Before that: ${found
                  .slice(1)
                  .map((f) => f.text.split(' — ')[0])
                  .join('; ')}.`
              : '')
          : labs.length
            ? `I couldn't find a ${label} value in the text of your lab reports. Photos and scanned reports can't be read yet.`
            : "You don't have any lab reports in your records yet.",
        records: found.map((f) => this.toResponse(f.r)),
      };
    }

    const words = intent.words;
    const matches = words.length
      ? docs.filter((r) =>
          words.some((w) => {
            const re = buildSafeRegex(w);
            return (
              re.test(r.originalFileName) ||
              re.test(r.providerName ?? '') ||
              (r.tags ?? []).some((t) => re.test(t))
            );
          }),
        )
      : intent.type
        ? docs
        : [];
    return {
      basis: 'search',
      answer: matches.length
        ? `I found ${matches.length} ${matches.length === 1 ? one : many}${words.length ? ` matching "${words.join(' ')}"` : ''}.`
        : 'I couldn\'t find anything for that. Try "When was my last blood test?" or "What was my HbA1c?"',
      records: matches.slice(0, 5).map((r) => this.toResponse(r)),
    };
  }

  /** "Simplify": what the document's medical words mean, and where each value sits. */
  async plainLanguage(userId: string, id: string): Promise<PlainLanguageGuide> {
    const { buffer, mimeType } = await this.download(userId, id);
    return simplifyDocument(await readDocumentText(buffer, mimeType));
  }

  async findOne(
    userId: string,
    id: string,
  ): Promise<MedicalRecordDetailResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Record not found');
    }

    const record = await this.recordModel.findOne({
      _id: id,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    // ReportInterpretation is Phase-3-owned and may not exist yet — a record with
    // no matching doc is honestly reported as "queued", not a 404 or a fake status.
    // A summary held for clinical review reads as still processing.
    const interpretation = await this.reportInterpretationModel
      .findOne({ recordId: record._id })
      .exec();

    return {
      ...this.toResponse(record),
      ...patientView(interpretation),
    };
  }

  async attachToAppointment(
    userId: string,
    recordId: string,
    appointmentId: string,
  ): Promise<MedicalRecordResponseDto> {
    if (!Types.ObjectId.isValid(recordId) || !Types.ObjectId.isValid(appointmentId)) {
      throw new NotFoundException('Record or appointment not found');
    }

    const record = await this.recordModel.findOne({
      _id: recordId,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      patientId: new Types.ObjectId(userId),
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    record.attachedAppointmentId = new Types.ObjectId(appointmentId);
    await record.save();

    return this.toResponse(record);
  }

  private categorize(filename: string, mimetype: string): MedicalRecordType {
    for (const [pattern, type] of CATEGORY_PATTERNS) {
      if (pattern.test(filename)) return type;
    }
    if (mimetype.startsWith('image/')) {
      // Photo/scan capture with no recognisable filename hint (FR-8.1) — the scans folder is the safest default.
      return MedicalRecordType.SCAN;
    }
    // Generic scanned/typed document with no other signal — most common real-world catch-all.
    return MedicalRecordType.PRESCRIPTION;
  }

  private async getOwnedRecordOrThrow(
    userId: string,
    id: string,
  ): Promise<MedicalRecordDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Record not found');
    }
    const record = await this.recordModel.findOne({
      _id: id,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }
    return record;
  }

  private async getOwnedAppointmentOrThrow(
    userId: string,
    id: string,
  ): Promise<AppointmentDocument> {
    const appointment = Types.ObjectId.isValid(id)
      ? await this.appointmentModel.findOne({
          _id: id,
          patientId: new Types.ObjectId(userId),
        })
      : null;
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  private toResponse(record: MedicalRecordDocument): MedicalRecordResponseDto {
    const uploadedAt = (record.uploadedAt ?? new Date()).toISOString();
    return {
      id: record.id,
      title: record.originalFileName,
      type: record.type,
      kind: record.kind ?? MedicalRecordKind.ORIGINAL,
      uploadedAt,
      recordDate: record.recordDate?.toISOString() ?? uploadedAt,
      tags: record.tags ?? [],
      providerName: record.providerName,
      // Older patient uploads had no provider name; deliveries always carry one.
      source:
        record.patientUploaded || !record.providerName
          ? 'uploaded'
          : 'provider',
      derivedFromRecordId: record.derivedFromRecordId?.toString(),
      attachedAppointmentId: record.attachedAppointmentId?.toString(),
    };
  }
}

function startOfDay(isoDate: string): Date {
  const d = new Date(isoDate);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(isoDate: string): Date {
  const d = new Date(isoDate);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
};

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}
