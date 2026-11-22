import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CareJourney,
  CareJourneyDocument,
  CareJourneyStatus,
  CareStep,
  CareStepStatus,
} from './schemas/care-journey.schema';
import {
  RecommendedCareLevel,
  TriageResult,
  TriageResultDocument,
} from '../symptom-nav/schemas/triage-result.schema';
import {
  SymptomEntry,
  SymptomEntryDocument,
} from '../symptom-nav/schemas/symptom-entry.schema';
import { GenerateCareJourneyDto } from './dto/generate-care-journey.dto';
import { UpdateCareStepDto } from './dto/update-care-step.dto';
import {
  CareJourneyMapResponseDto,
  CareJourneyResponseDto,
} from './dto/care-journey-response.dto';
import {
  buildJourneyMap,
  type MapAppointment,
  type MapDispense,
  type MapLabOrder,
  type MapStep,
} from './journey-map';
import { Dispense, DispenseDocument } from '../../partner/hospital/schemas/dispense.schema';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from '../../partner/lab/schemas/lab-order.schema';
import { NavIntent, NavIntentDocument } from '../nav-intent/schemas/nav-intent.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import { Provider, ProviderDocument } from '../../core/providers/schemas/provider.schema';
import {
  Prescription,
  PrescriptionDocument,
  PrescriptionStatus,
} from '../../partner/clinical/schemas/prescription.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordKind,
  MedicalRecordType,
} from '../../core/records/schemas/medical-record.schema';
import { dateStart } from '../../partner/hospital/clock';
import { AiInteractionLogService } from '../ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

// Deterministic pathway templates keyed by recommended care tier (TRD §5.2) —
// stands in for the real Care Journey Generator's model output.
const JOURNEY_TEMPLATES: Record<
  RecommendedCareLevel,
  { title: string; steps: Array<{ name: string; contextNote: string }> }
> = {
  [RecommendedCareLevel.SELF_CARE]: {
    title: 'Care Journey — Self Care',
    steps: [
      { name: 'Rest & Monitor', contextNote: 'Track symptoms daily; note any changes.' },
      { name: 'Self-Care Measures', contextNote: 'Hydration, rest, and over-the-counter comfort measures as appropriate.' },
      { name: 'Follow-up if Symptoms Persist', contextNote: 'Book a GP visit if symptoms continue beyond a few days.' },
    ],
  },
  [RecommendedCareLevel.GP]: {
    title: 'Care Journey — GP Consultation',
    steps: [
      { name: 'Book GP Appointment', contextNote: 'Bring a list of your current medications and symptom timeline.' },
      { name: 'GP Consultation', contextNote: 'Describe onset, duration, and severity clearly.' },
      { name: 'Possible Referral', contextNote: 'Your GP may refer you onward based on findings.' },
      { name: 'Follow-up', contextNote: 'Schedule a follow-up to confirm improvement.' },
    ],
  },
  [RecommendedCareLevel.SPECIALIST]: {
    title: 'Care Journey — Specialist Consultation',
    steps: [
      { name: 'GP Referral', contextNote: 'Obtain a referral letter and any prior test results.' },
      { name: 'Specialist Consultation', contextNote: 'Prepare a list of questions for the specialist.' },
      { name: 'Diagnostic Tests', contextNote: 'Complete any tests the specialist orders.' },
      { name: 'Treatment Plan', contextNote: 'Review the plan and confirm next steps.' },
      { name: 'Follow-up', contextNote: 'Book a follow-up to review test results.' },
    ],
  },
  [RecommendedCareLevel.URGENT_CARE]: {
    title: 'Care Journey — Urgent Care',
    steps: [
      { name: 'Urgent Care Visit', contextNote: 'Go to an urgent care centre today — do not wait for a routine slot.' },
      { name: 'Diagnostic Assessment', contextNote: 'Clinicians will assess and may order immediate tests.' },
      { name: 'Treatment', contextNote: 'Follow the care team\'s immediate treatment instructions.' },
      { name: 'Follow-up within 48h', contextNote: 'Arrange a short-interval follow-up to confirm you are improving.' },
    ],
  },
  [RecommendedCareLevel.EMERGENCY_ROOM]: {
    title: 'Care Journey — Emergency Care',
    steps: [
      { name: 'Seek Emergency Care Immediately', contextNote: 'Go to the nearest emergency department or call local emergency services now.' },
      { name: 'Emergency Assessment', contextNote: 'Emergency staff will triage and assess you immediately.' },
      { name: 'Stabilization', contextNote: 'Follow the emergency team\'s instructions.' },
      { name: 'Specialist Referral if Needed', contextNote: 'You may be referred onward once stabilized.' },
    ],
  },
};

const AVG_DAYS_PER_STEP = 3;

const MAP_QUERY_LIMIT = 60;
const MAP_RECORD_TYPES = [
  MedicalRecordType.PRESCRIPTION,
  MedicalRecordType.LAB_REPORT,
  MedicalRecordType.SCAN,
  MedicalRecordType.DISCHARGE,
];
const CLOSED_APPOINTMENT_STATUSES = [
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.CANCELLED_BY_PROVIDER,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.REFUNDED,
];

/** What the patient asked AYUVA for, as steps to get there. It makes no clinical judgement. */
export function pathwayFromIntent(intent: {
  suggestedFilters?: Record<string, unknown>;
  suggestedActions?: Record<string, unknown>[];
}): {
  title: string;
  steps: Array<Pick<CareStep, 'name' | 'contextNote' | 'trigger' | 'route' | 'params'>>;
} {
  const primary = intent.suggestedActions?.find((a) => a.primary);
  const route = typeof primary?.route === 'string' ? primary.route : '/(tabs)/explore';
  const params = primary?.params as Record<string, string> | undefined;

  if (primary?.kind === 'tests') {
    return {
      title: 'Your lab test',
      steps: [
        { name: 'Book your test', contextNote: 'Choose a lab and a time that suits you.', trigger: 'booked', route, params },
        { name: 'Give your sample', contextNote: 'Follow any preparation the lab gives you.', trigger: 'visited' },
        { name: 'Get your report', contextNote: 'It arrives in your Health Passport when the lab releases it.', trigger: 'document' },
        { name: 'Go over it with a doctor', contextNote: 'Bring the report to your next visit.', trigger: 'followup' },
      ],
    };
  }

  const specialty =
    typeof intent.suggestedFilters?.specialty === 'string'
      ? intent.suggestedFilters.specialty
      : undefined;
  return {
    title: specialty ? `Seeing a ${specialty}` : 'Your care pathway',
    steps: [
      { name: specialty ? `Book a ${specialty}` : 'Book a visit', contextNote: 'Pick a time that suits you.', trigger: 'booked', route, params },
      { name: 'Attend your visit', contextNote: 'Bring your current medicines and earlier reports.', trigger: 'visited' },
      { name: 'Keep what your doctor gives you', contextNote: 'Prescriptions and reports arrive in your Health Passport.', trigger: 'document' },
      { name: 'Follow-up', contextNote: 'Only if your doctor asks for one.', trigger: 'followup' },
    ],
  };
}

@Injectable()
export class CareJourneyService {
  constructor(
    @InjectModel(CareJourney.name)
    private readonly careJourneyModel: Model<CareJourneyDocument>,
    @InjectModel(TriageResult.name)
    private readonly triageResultModel: Model<TriageResultDocument>,
    @InjectModel(SymptomEntry.name)
    private readonly symptomEntryModel: Model<SymptomEntryDocument>,
    @InjectModel(NavIntent.name)
    private readonly navIntentModel: Model<NavIntentDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    private readonly aiInteractionLogService: AiInteractionLogService,
    // Partner Portal pharmacy and lab checkpoints. Optional for hand-built test modules.
    @Optional()
    @InjectModel(Dispense.name)
    private readonly dispenseModel?: Model<DispenseDocument>,
    @Optional()
    @InjectModel(PartnerLabOrder.name)
    private readonly labOrderModel?: Model<LabOrderDocument>,
  ) {}

  async generate(
    userId: string,
    dto: GenerateCareJourneyDto,
  ): Promise<CareJourneyResponseDto> {
    if (!dto.triageResultId) {
      return this.generateFromIntent(userId, dto.intentId as string);
    }
    const startedAt = Date.now();

    const triageResult = await this.getOwnedTriageResultOrThrow(
      userId,
      dto.triageResultId,
    );

    const template = JOURNEY_TEMPLATES[triageResult.recommendedCareLevel];
    const steps: CareStep[] = template.steps.map((s, i) => ({
      name: s.name,
      status: i === 0 ? CareStepStatus.CURRENT : CareStepStatus.UPCOMING,
      contextNote: s.contextNote,
    }));

    const journey = await this.careJourneyModel.create({
      userId: new Types.ObjectId(userId),
      triageResultId: triageResult._id,
      title: template.title,
      steps,
      progressPct: 0,
      status: CareJourneyStatus.ACTIVE,
    });

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.CARE_JOURNEY,
      input: { triageResultId: dto.triageResultId },
      outcome: { journeyId: journey.id, stepCount: steps.length },
      latencyMs: Date.now() - startedAt,
      source: AiSource.MOCK,
    });

    return this.toResponse(journey);
  }

  /** A pathway from "Ask AYUVA". Steps are navigation only, and finish from real events. */
  private async generateFromIntent(
    userId: string,
    intentId: string,
  ): Promise<CareJourneyResponseDto> {
    const startedAt = Date.now();
    const owner = new Types.ObjectId(userId);
    const intent = await this.navIntentModel.findOne({ _id: intentId, userId: owner });
    if (!intent) throw new NotFoundException('Intent not found');

    // A second tap on "Build my journey" returns the one already started.
    const existing = await this.careJourneyModel.findOne({
      userId: owner,
      navIntentId: intent._id,
      status: CareJourneyStatus.ACTIVE,
    });
    if (existing) return this.toResponse(existing);

    const template = pathwayFromIntent(intent);
    const journey = await this.careJourneyModel.create({
      userId: owner,
      navIntentId: intent._id,
      title: template.title,
      steps: template.steps.map((s, i) => ({
        ...s,
        status: i === 0 ? CareStepStatus.CURRENT : CareStepStatus.UPCOMING,
      })),
      progressPct: 0,
      status: CareJourneyStatus.ACTIVE,
    });

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.CARE_JOURNEY,
      input: { intentId },
      outcome: { journeyId: journey.id, stepCount: template.steps.length },
      latencyMs: Date.now() - startedAt,
      source: AiSource.MOCK,
    });
    return this.toResponse(journey);
  }

  /** Everything for the Journey tab in one read, with pathway steps brought up to date. */
  async map(userId: string): Promise<CareJourneyMapResponseDto> {
    const patientId = new Types.ObjectId(userId);
    const [journey, appointments, prescriptions, records, dispenses, labOrders] = await Promise.all([
      this.careJourneyModel
        .findOne({ userId: patientId, status: CareJourneyStatus.ACTIVE })
        .sort({ createdAt: -1 })
        .exec(),
      this.loadAppointments(patientId),
      this.rxModel
        .find({ patientId, status: PrescriptionStatus.SIGNED })
        .sort({ signedAt: -1 })
        .limit(MAP_QUERY_LIMIT)
        .lean()
        .exec(),
      this.recordModel
        .find({
          patientId,
          kind: MedicalRecordKind.ORIGINAL,
          type: { $in: MAP_RECORD_TYPES },
          tags: { $ne: 'cancelled' },
        })
        .sort({ recordDate: -1 })
        .limit(MAP_QUERY_LIMIT)
        .exec(),
      this.loadDispenses(patientId),
      this.loadLabOrders(patientId),
    ]);

    const built = buildJourneyMap({
      now: new Date(),
      journey: journey
        ? {
            id: journey.id,
            createdAt: (journey as unknown as { createdAt: Date }).createdAt,
            steps: journey.steps,
          }
        : null,
      appointments,
      prescriptions: prescriptions.map((p) => ({
        id: p._id.toString(),
        doctorName: p.doctorName,
        signedAt: p.signedAt ?? new Date(0),
        followUpDate: p.followUpDate ?? undefined,
      })),
      records: records.map((r) => {
        const uploadedAt = r.uploadedAt ?? new Date(0);
        return {
          id: r.id,
          type: r.type,
          providerName: r.providerName,
          fromProvider: !r.patientUploaded && !!r.providerName,
          date: r.recordDate ?? uploadedAt,
          uploadedAt,
        };
      }),
      dispenses,
      labOrders,
    });

    if (journey) await this.saveProgress(journey, built.steps, built.progressPct);
    return {
      milestones: built.milestones,
      journey: journey ? this.toResponse(journey) : null,
    };
  }

  /** Only when something changed, so opening the tab doesn't write every time. */
  private async saveProgress(
    journey: CareJourneyDocument,
    steps: MapStep[],
    progressPct: number,
  ): Promise<void> {
    const changed = steps.some((s, i) => s.status !== journey.steps[i].status);
    if (!changed) return;
    steps.forEach((s, i) => {
      journey.steps[i].status = s.status;
    });
    journey.progressPct = progressPct;
    if (steps.every((s) => s.status === CareStepStatus.DONE)) {
      journey.status = CareJourneyStatus.RESOLVED;
    }
    journey.markModified('steps');
    await journey.save();
  }

  /** Hospital pharmacy hand-overs of this patient's prescriptions. */
  private async loadDispenses(patientId: Types.ObjectId): Promise<MapDispense[]> {
    if (!this.dispenseModel) return [];
    const rows = await this.dispenseModel
      .find({ patientId })
      .sort({ createdAt: -1 })
      .limit(MAP_QUERY_LIMIT)
      .lean()
      .exec();
    const names = await this.providerNames(rows.map((r) => r.providerId));
    return rows.map((r) => ({
      id: r._id.toString(),
      providerName: names.get(r.providerId.toString()) ?? 'the hospital pharmacy',
      at: (r as unknown as { createdAt?: Date }).createdAt ?? new Date(0),
      complete: (r.lines ?? []).every((l) => l.complete !== false),
    }));
  }

  /** Diagnostic orders placed for this patient, open or closed by the lab. */
  private async loadLabOrders(patientId: Types.ObjectId): Promise<MapLabOrder[]> {
    if (!this.labOrderModel) return [];
    const rows = await this.labOrderModel
      .find({ patientId, status: { $ne: LabOrderStatus.CANCELLED } })
      .sort({ createdAt: -1 })
      .limit(MAP_QUERY_LIMIT)
      .lean()
      .exec();
    const names = await this.providerNames(rows.map((r) => r.providerId));
    return rows.map((r) => {
      const closed = [...(r.statusHistory ?? [])]
        .reverse()
        .find((e) => e.status === LabOrderStatus.REPORT_READY || e.status === LabOrderStatus.DELIVERED);
      return {
        id: r._id.toString(),
        orderNo: r.orderNo,
        providerName: names.get(r.providerId.toString()) ?? 'the lab',
        status: r.status,
        orderedAt: (r as unknown as { createdAt?: Date }).createdAt ?? new Date(0),
        closedAt: closed?.at,
        tests: r.items?.length ?? 0,
      };
    });
  }

  private async providerNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.providerModel
      .find({ _id: { $in: ids } })
      .select('name')
      .lean()
      .exec();
    return new Map(rows.map((p) => [p._id.toString(), p.name]));
  }

  private async loadAppointments(patientId: Types.ObjectId): Promise<MapAppointment[]> {
    const rows = await this.appointmentModel
      .find({ patientId, status: { $nin: CLOSED_APPOINTMENT_STATUSES } })
      .sort({ createdAt: -1 })
      .limit(MAP_QUERY_LIMIT)
      .lean()
      .exec();
    const [slots, providers] = await Promise.all([
      this.slotModel.find({ _id: { $in: rows.map((a) => a.slotId) } }).lean().exec(),
      this.providerModel
        .find({ _id: { $in: rows.map((a) => a.providerId) } })
        .select('name')
        .lean()
        .exec(),
    ]);
    const slotById = new Map(slots.map((s) => [s._id.toString(), s]));
    const nameById = new Map(providers.map((p) => [p._id.toString(), p.name]));

    return rows.flatMap((a) => {
      const slot = slotById.get(a.slotId.toString());
      if (!slot) return [];
      const [hour, minute] = slot.time.split(':').map(Number);
      const at = new Date(
        dateStart(slot.date.toISOString().slice(0, 10)).getTime() +
          (hour * 60 + minute) * 60_000,
      );
      return [
        {
          id: a._id.toString(),
          providerName: a.assignedName || nameById.get(a.providerId.toString()) || 'your provider',
          at,
          createdAt: a.createdAt ?? at,
          completed: a.status === AppointmentStatus.COMPLETED,
          isFollowUp: !!a.followUpOfId,
        },
      ];
    });
  }

  async findOne(userId: string, id: string): Promise<CareJourneyResponseDto> {
    const journey = await this.getOwnedJourneyOrThrow(userId, id);
    return this.toResponse(journey);
  }

  async findActive(userId: string): Promise<CareJourneyResponseDto> {
    const journey = await this.careJourneyModel
      .findOne({ userId: new Types.ObjectId(userId), status: CareJourneyStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .exec();
    if (!journey) {
      throw new NotFoundException('No active care journey found');
    }
    return this.toResponse(journey);
  }

  async updateStep(
    userId: string,
    id: string,
    dto: UpdateCareStepDto,
  ): Promise<CareJourneyResponseDto> {
    const journey = await this.getOwnedJourneyOrThrow(userId, id);

    if (dto.stepIndex >= journey.steps.length) {
      throw new BadRequestException('stepIndex is out of range for this journey');
    }

    journey.steps[dto.stepIndex].status = dto.status;

    // Auto-promote the next upcoming step to current once one is marked done —
    // real persisted progress-tracking state, not AI-generated (PRD Care Journey Generator).
    if (dto.status === CareStepStatus.DONE) {
      const next = journey.steps
        .slice(dto.stepIndex + 1)
        .find((s) => s.status === CareStepStatus.UPCOMING);
      if (next) next.status = CareStepStatus.CURRENT;
    }

    const doneCount = journey.steps.filter((s) => s.status === CareStepStatus.DONE).length;
    journey.progressPct = Math.round((doneCount / journey.steps.length) * 100);
    if (doneCount === journey.steps.length) {
      journey.status = CareJourneyStatus.RESOLVED;
    }

    journey.markModified('steps');
    await journey.save();

    return this.toResponse(journey);
  }

  private async getOwnedTriageResultOrThrow(
    userId: string,
    triageResultId: string,
  ): Promise<TriageResultDocument> {
    if (!Types.ObjectId.isValid(triageResultId)) {
      throw new NotFoundException('Triage result not found');
    }
    const triageResult = await this.triageResultModel.findById(triageResultId);
    if (!triageResult) {
      throw new NotFoundException('Triage result not found');
    }
    const symptomEntry = await this.symptomEntryModel.findOne({
      _id: triageResult.symptomEntryId,
      userId: new Types.ObjectId(userId),
    });
    if (!symptomEntry) {
      throw new NotFoundException('Triage result not found');
    }
    return triageResult;
  }

  private async getOwnedJourneyOrThrow(
    userId: string,
    id: string,
  ): Promise<CareJourneyDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Care journey not found');
    }
    const journey = await this.careJourneyModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });
    if (!journey) {
      throw new NotFoundException('Care journey not found');
    }
    return journey;
  }

  private toResponse(journey: CareJourneyDocument): CareJourneyResponseDto {
    return {
      id: journey.id,
      triageResultId: journey.triageResultId?.toString(),
      title: journey.title,
      steps: journey.steps.map((s) => ({
        name: s.name,
        status: s.status,
        contextNote: s.contextNote,
      })),
      progressPct: journey.progressPct,
      status: journey.status,
      // Nothing supports a duration for a patient-started pathway; the app hides a 0.
      timelineEstimateDays: journey.navIntentId ? 0 : journey.steps.length * AVG_DAYS_PER_STEP,
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }
}
