import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PrepPack, PrepPackDocument } from './schemas/prep-pack.schema';
import { Appointment } from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import { Medication } from '../../core/medications/schemas/medication.schema';
import {
  MedicalRecord,
  recordTitle,
} from '../../core/records/schemas/medical-record.schema';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import {
  DiagnosticTest,
  DiagnosticTestDocument,
} from '../../core/labs/schemas/diagnostic-test.schema';
import {
  LabDeliveryOrder,
  LabDeliveryOrderDocument,
} from '../../core/labs/schemas/lab-delivery-order.schema';
import { dateStart } from '../../partner/hospital/clock';
import {
  PrepPackResponseDto,
  PrepPackItemDto,
  PrepPackSectionDto,
  UpdatePrepPackDto,
} from './dto/prep-pack.dto';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';
import { documentTasks, fastingWindow, type PrepTest } from './prep-guidelines';

// MOCK implementation (TRD §6) — assembles the pack from the user's real
// data (appointments, medications, records) with static placeholder questions.
// The preparation block (fasting countdown, document ticks) is worked out
// fresh on every read from the booking and what the patient has prepared.
@Injectable()
export class PrepPackService {
  constructor(
    @InjectModel(PrepPack.name)
    private readonly prepPackModel: Model<PrepPackDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<any>,
    @InjectModel(Medication.name)
    private readonly medicationModel: Model<any>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<any>,
    // Optional for hand-built test modules.
    @Optional()
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel?: Model<AppointmentSlotDocument>,
    @Optional()
    @InjectModel(Provider.name)
    private readonly providerModel?: Model<ProviderDocument>,
    @Optional()
    @InjectModel(LabDeliveryOrder.name)
    private readonly labOrderModel?: Model<LabDeliveryOrderDocument>,
    @Optional()
    @InjectModel(DiagnosticTest.name)
    private readonly testModel?: Model<DiagnosticTestDocument>,
  ) {}

  async get(userId: string, appointmentId: string): Promise<PrepPackResponseDto> {
    const appointment = await this.ownAppointment(userId, appointmentId);
    // Return cached pack if already generated (idempotent per appointment)
    const existing = await this.prepPackModel.findOne({
      userId: new Types.ObjectId(userId),
      appointmentId,
    });

    if (existing) {
      return this.toResponse(existing, appointment);
    }

    // Build from real user data
    const sections = await this.buildSections(userId, appointmentId);

    const pack = await this.prepPackModel.create({
      userId: new Types.ObjectId(userId),
      appointmentId,
      sections: sections as unknown as Record<string, unknown>[],
    });

    return this.toResponse(pack, appointment);
  }

  /** Saves the patient's symptom notes and what they chose to include. */
  async update(
    userId: string,
    appointmentId: string,
    dto: UpdatePrepPackDto,
  ): Promise<PrepPackResponseDto> {
    await this.get(userId, appointmentId);
    const pack = await this.prepPackModel.findOne({
      userId: new Types.ObjectId(userId),
      appointmentId,
    });
    if (!pack) throw new NotFoundException('Prep pack not found');
    if (dto.symptomNotes !== undefined) pack.symptomNotes = dto.symptomNotes.trim();
    if (dto.included) {
      const known = new Set(
        (pack.sections as unknown as PrepPackSectionDto[]).flatMap((s) =>
          s.items.map((i) => i.id),
        ),
      );
      const next = { ...(pack.included ?? {}) };
      for (const [id, on] of Object.entries(dto.included))
        if (known.has(id)) next[id] = !!on;
      pack.included = next;
      pack.markModified('included');
    }
    await pack.save();
    return this.toResponse(pack, await this.ownAppointment(userId, appointmentId));
  }

  private async ownAppointment(userId: string, appointmentId: string) {
    if (!Types.ObjectId.isValid(appointmentId))
      throw new NotFoundException('Appointment not found');
    const appointment = await this.appointmentModel
      .findOne({ _id: appointmentId, patientId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment as {
      _id: Types.ObjectId;
      providerId: Types.ObjectId;
      slotId: Types.ObjectId;
      assignedName?: string;
      department?: string;
    };
  }

  private async buildSections(userId: string, appointmentId: string): Promise<PrepPackSectionDto[]> {
    const sections: PrepPackSectionDto[] = [];

    // Medications section
    const meds = await this.medicationModel.find({
      userId: new Types.ObjectId(userId),
      active: true,
    }).limit(10).exec();

    if (meds.length > 0) {
      sections.push({
        kind: 'medication',
        title: 'Current Medications',
        description: 'Your active medications to share with the provider.',
        items: meds.map((m): PrepPackItemDto => ({
          id: m.id,
          kind: 'medication',
          title: m.name,
          detail: `${m.dosage} — ${m.frequency}`,
          included: true,
        })),
      });
    }

    // Recent records section
    const records = await this.recordModel.find({
      patientId: new Types.ObjectId(userId),
    }).sort({ uploadedAt: -1 }).limit(5).exec();

    if (records.length > 0) {
      sections.push({
        kind: 'record',
        title: 'Recent Medical Records',
        description: 'Select which records to share with your provider.',
        items: records.map((r): PrepPackItemDto => ({
          id: r.id,
          kind: 'record',
          // What the document is, never the phone's file name.
          title: recordTitle(r),
          detail: r.providerName ?? r.type,
          recordId: r.id,
          date: (r.recordDate ?? r.uploadedAt)?.toISOString()?.slice(0, 10),
          included: true,
        })),
      });
    }

    // Suggested questions section (mock)
    sections.push({
      kind: 'question',
      title: 'Suggested Questions',
      description: 'Questions to ask your provider during the visit.',
      items: [
        { id: 'q1', kind: 'question', title: 'What are the possible causes of my symptoms?', included: true },
        { id: 'q2', kind: 'question', title: 'What tests or scans might you recommend?', included: true },
        { id: 'q3', kind: 'question', title: 'Are there any lifestyle changes I should make?', included: false },
        { id: 'q4', kind: 'question', title: 'When should I follow up?', included: true },
      ],
    });

    return sections;
  }

  /** The visit's real time, from its slot ("HH:mm" on the slot's day, clinic time). */
  private async appointmentAt(slotId: Types.ObjectId): Promise<Date | null> {
    const slot = await this.slotModel?.findById(slotId).lean().exec();
    if (!slot) return null;
    const [hour, minute] = slot.time.split(':').map(Number);
    return new Date(
      dateStart(slot.date.toISOString().slice(0, 10)).getTime() +
        ((hour || 0) * 60 + (minute || 0)) * 60_000,
    );
  }

  /** Tests booked for this appointment, with the lab catalogue's preparation text. */
  private async bookedTests(appointmentId: Types.ObjectId): Promise<PrepTest[]> {
    const orders =
      (await this.labOrderModel
        ?.find({ appointmentId })
        .select('tests')
        .lean()
        .exec()) ?? [];
    const items = orders.flatMap((o) => o.tests ?? []);
    if (!items.length) return [];
    const catalogue =
      (await this.testModel
        ?.find({ testName: { $in: items.map((i) => i.testName) } })
        .select('testName fastingRequired preparationInstructions')
        .lean()
        .exec()) ?? [];
    const byName = new Map(catalogue.map((t) => [t.testName.toLowerCase(), t]));
    return items.map((i) => {
      const c = byName.get(i.testName.toLowerCase());
      return {
        name: i.testName,
        fastingRequired: !!(i.fastingRequired || c?.fastingRequired),
        preparation: c?.preparationInstructions ?? null,
      };
    });
  }

  private async toResponse(
    pack: PrepPackDocument,
    appointment: Awaited<ReturnType<PrepPackService['ownAppointment']>>,
  ): Promise<PrepPackResponseDto> {
    const [at, provider, tests] = await Promise.all([
      this.appointmentAt(appointment.slotId),
      this.providerModel?.findById(appointment.providerId).select('name specialty').lean().exec(),
      this.bookedTests(appointment._id),
    ]);
    const included = pack.included ?? {};
    const sections = (pack.sections as unknown as PrepPackSectionDto[]).map((s) => ({
      ...s,
      items: s.items.map((i) => ({ ...i, included: included[i.id] ?? i.included })),
    }));
    const count = (kind: string) =>
      sections
        .filter((s) => s.kind === kind)
        .flatMap((s) => s.items)
        .filter((i) => i.included).length;
    const fasting = at ? fastingWindow(at, tests) : null;
    return {
      id: pack.id,
      appointmentId: appointment._id.toString(),
      providerName: appointment.assignedName || provider?.name || 'Your provider',
      specialty: appointment.department || provider?.specialty?.[0] || 'Consultation',
      appointmentDate: at ? at.toISOString().slice(0, 10) : '',
      appointmentTime: at
        ? at.toLocaleTimeString('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: process.env.SLOT_TIMEZONE ?? 'Asia/Kolkata',
          })
        : '',
      appointmentAt: at?.toISOString(),
      sections,
      symptomNotes: pack.symptomNotes ?? '',
      preparation: {
        fasting,
        tasks: documentTasks({
          symptomsNoted: !!pack.symptomNotes?.trim(),
          questionsChosen: count('question'),
          recordsAttached: count('record'),
          medicinesListed: count('medication'),
        }),
      },
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }
}
