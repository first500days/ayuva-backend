import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PrepPack, PrepPackDocument } from './schemas/prep-pack.schema';
import { Appointment } from '../../core/appointments/schemas/appointment.schema';
import { Medication } from '../../core/medications/schemas/medication.schema';
import { MedicalRecord } from '../../core/records/schemas/medical-record.schema';
import { PrepPackResponseDto, PrepPackItemDto, PrepPackSectionDto } from './dto/prep-pack.dto';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

// MOCK implementation (TRD §6) — assembles the pack from the user's real
// data (appointments, medications, records) with static placeholder questions.
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
  ) {}

  async get(userId: string, appointmentId: string): Promise<PrepPackResponseDto> {
    // Return cached pack if already generated (idempotent per appointment)
    const existing = await this.prepPackModel.findOne({
      userId: new Types.ObjectId(userId),
      appointmentId,
    });

    if (existing) {
      return this.toResponse(existing, appointmentId);
    }

    // Build from real user data
    const sections = await this.buildSections(userId, appointmentId);

    const pack = await this.prepPackModel.create({
      userId: new Types.ObjectId(userId),
      appointmentId,
      sections: sections as unknown as Record<string, unknown>[],
    });

    return this.toResponse(pack, appointmentId);
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
          title: r.originalFileName,
          detail: r.type,
          recordId: r.id,
          date: r.uploadedAt?.toISOString()?.slice(0, 10),
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

  private toResponse(pack: PrepPackDocument, appointmentId: string): PrepPackResponseDto {
    return {
      id: pack.id,
      appointmentId,
      providerName: 'Your Provider',
      specialty: 'Consultation',
      appointmentDate: new Date().toISOString().slice(0, 10),
      appointmentTime: '10:00 AM',
      sections: pack.sections as unknown as PrepPackSectionDto[],
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }
}
