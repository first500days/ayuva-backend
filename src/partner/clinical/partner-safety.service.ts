import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import {
  AuditAction,
  AuditLog,
  AuditLogDocument,
} from '../../audit-log/schemas/audit-log.schema';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../core/health-profile/schemas/health-profile.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerPatientsService } from './partner-patients.service';
import { durationDays } from './partner-timeline.service';
import {
  Prescription,
  PrescriptionDocument,
  PrescriptionStatus,
} from './schemas/prescription.schema';
import {
  PatientAllergy,
  PatientAllergyDocument,
} from './schemas/patient-allergy.schema';
import { AddAllergyDto, RxCheckDto } from './dto/safety.dto';
import { checkPrescription } from './rx-safety';

const VIEW_WINDOW_MS = 30 * 60 * 1000;
const DAY = 86_400_000;

export const SAFETY_NOTE =
  "Rule-based checks against the recorded allergies, this organisation's active prescriptions and a curated list of serious interactions. Not exhaustive — use your clinical judgement.";

/**
 * Allergy alerts and prescription safety checks for a patient: what the
 * patient reported in their health profile, what the clinicians recorded,
 * and rule-based allergy / interaction / duplicate warnings on a
 * prescription being written. Only clinicians (records.view /
 * clinical.write) see any of it.
 */
@Injectable()
export class PartnerSafetyService {
  constructor(
    @InjectModel(PatientAllergy.name)
    private readonly allergyModel: Model<PatientAllergyDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly audit: AuditLogService,
  ) {}

  async alerts(actor: PartnerActor, patientId: string) {
    const patient = await this.patients.assertLinked(actor, patientId);
    const out = await this.alertsFor(actor, patient._id);
    // Reading the patient's own health-profile allergies is a record access; log it (once per half hour).
    const recent = await this.auditModel.exists({
      actorId: new Types.ObjectId(actor.userId),
      action: AuditAction.PARTNER_PATIENT_VIEW,
      targetId: patient._id,
      'metadata.label': 'Allergies & alerts',
      createdAt: { $gte: new Date(Date.now() - VIEW_WINDOW_MS) },
    });
    if (!recent)
      await this.audit.record({
        actorId: actor.userId,
        action: AuditAction.PARTNER_PATIENT_VIEW,
        targetType: 'User',
        targetId: patient.id,
        metadata: {
          providerId: actor.provider.id,
          patientId: patient.id,
          label: 'Allergies & alerts',
        },
        ipAddress: actor.ip,
      });
    return out;
  }

  async addAllergy(actor: PartnerActor, patientId: string, dto: AddAllergyDto) {
    const patient = await this.patients.assertLinked(actor, patientId);
    const dup = await this.allergyModel.exists({
      providerId: actor.provider._id,
      patientId: patient._id,
      kind: 'allergy',
      removedAt: { $exists: false },
      substance: new RegExp(
        `^${dto.substance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'i',
      ),
    });
    if (dup)
      throw new BadRequestException(
        `${dto.substance} is already on the allergy list`,
      );
    await this.allergyModel.create({
      providerId: actor.provider._id,
      patientId: patient._id,
      kind: 'allergy',
      substance: dto.substance,
      reaction: dto.reaction || undefined,
      severity: dto.severity ?? 'unknown',
      recordedByMemberId: actor.member._id,
      recordedByName: actor.member.fullName,
    });
    // A recorded allergy ends any "no known drug allergies" confirmation.
    await this.allergyModel.updateMany(
      {
        providerId: actor.provider._id,
        patientId: patient._id,
        kind: 'nkda',
        removedAt: { $exists: false },
      },
      {
        $set: {
          removedAt: new Date(),
          removedByName: actor.member.fullName,
          removeReason: `Allergy recorded: ${dto.substance}`,
        },
      },
    );
    await this.record(actor, patient._id, {
      change: 'allergy_added',
      substance: dto.substance,
      severity: dto.severity ?? 'unknown',
    });
    return this.alertsFor(actor, patient._id);
  }

  async removeAllergy(
    actor: PartnerActor,
    patientId: string,
    allergyId: string,
    reason: string,
  ) {
    const patient = await this.patients.assertLinked(actor, patientId);
    if (!Types.ObjectId.isValid(allergyId))
      throw new NotFoundException('Allergy not found');
    const a = await this.allergyModel
      .findOne({
        _id: allergyId,
        providerId: actor.provider._id,
        patientId: patient._id,
        removedAt: { $exists: false },
      })
      .exec();
    if (!a) throw new NotFoundException('Allergy not found');
    a.removedAt = new Date();
    a.removedByName = actor.member.fullName;
    a.removeReason = reason;
    await a.save();
    await this.record(actor, patient._id, {
      change: a.kind === 'nkda' ? 'nkda_removed' : 'allergy_removed',
      substance: a.substance,
      reason,
    });
    return this.alertsFor(actor, patient._id);
  }

  async confirmNoKnownAllergies(actor: PartnerActor, patientId: string) {
    const patient = await this.patients.assertLinked(actor, patientId);
    const current = await this.alertsFor(actor, patient._id);
    if (current.recorded.length || current.patientReported.length)
      throw new BadRequestException(
        'Allergies are on record — review them instead of confirming none',
      );
    if (current.noKnownAllergies) return current;
    await this.allergyModel.create({
      providerId: actor.provider._id,
      patientId: patient._id,
      kind: 'nkda',
      recordedByMemberId: actor.member._id,
      recordedByName: actor.member.fullName,
    });
    await this.record(actor, patient._id, { change: 'nkda_confirmed' });
    return this.alertsFor(actor, patient._id);
  }

  /** Live check while a prescription is written. */
  async check(actor: PartnerActor, dto: RxCheckDto) {
    const patient = await this.patients.assertLinked(actor, dto.patientId);
    return this.review(actor, patient._id, dto.items);
  }

  /** The checks behind the live warnings and the signing gate. */
  async review(
    actor: PartnerActor,
    patientId: Types.ObjectId,
    items: { medicine: string; strength?: string | null }[],
    excludeRxId?: Types.ObjectId,
  ) {
    const [alerts, active] = await Promise.all([
      this.alertsFor(actor, patientId),
      this.activeMedicines(actor, patientId, excludeRxId),
    ]);
    const allergies = [
      ...alerts.patientReported,
      ...alerts.recorded.map((r) => r.substance),
    ];
    const result = checkPrescription({
      items: items.map((i) => ({
        medicine: i.medicine ?? '',
        strength: i.strength,
      })),
      allergies,
      activeMedicines: active,
    });
    return {
      ...result,
      checkedAgainst: {
        allergies,
        activeMedicines: active.map((m) => `${m.medicine} (${m.source})`),
      },
      note: SAFETY_NOTE,
    };
  }

  private async alertsFor(actor: PartnerActor, patientId: Types.ObjectId) {
    const [profile, entries] = await Promise.all([
      this.profileModel
        .findOne({ userId: patientId })
        .select('allergies conditions')
        .lean()
        .exec(),
      this.allergyModel
        .find({
          providerId: actor.provider._id,
          patientId,
          removedAt: { $exists: false },
        })
        .sort({ createdAt: 1 })
        .exec(),
    ]);
    const clean = (list?: string[]) =>
      (list ?? [])
        .map((s) => s.trim())
        .filter((s) => s && !/^(none|nil|no|nkda|na|n\/a|-)$/i.test(s));
    const nkda = entries.find((e) => e.kind === 'nkda');
    return {
      patientReported: clean(profile?.allergies),
      conditions: clean(profile?.conditions),
      recorded: entries
        .filter((e) => e.kind === 'allergy')
        .map((e) => ({
          id: e.id,
          substance: e.substance ?? '',
          reaction: e.reaction ?? null,
          severity: e.severity ?? 'unknown',
          recordedByName: e.recordedByName ?? null,
          at: e.createdAt?.toISOString() ?? null,
        })),
      noKnownAllergies: nkda
        ? {
            id: nkda.id,
            recordedByName: nkda.recordedByName ?? null,
            at: nkda.createdAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /** Medicines from this organisation's signed prescriptions still within their duration. */
  private async activeMedicines(
    actor: PartnerActor,
    patientId: Types.ObjectId,
    excludeRxId?: Types.ObjectId,
  ) {
    const rxs = await this.rxModel
      .find({
        providerId: actor.provider._id,
        patientId,
        status: PrescriptionStatus.SIGNED,
        signedAt: { $gte: new Date(Date.now() - 365 * DAY) },
        ...(excludeRxId && { _id: { $ne: excludeRxId } }),
      })
      .exec();
    const now = Date.now();
    const out: { medicine: string; source: string }[] = [];
    for (const rx of rxs) {
      if (!rx.signedAt) continue;
      for (const item of rx.items) {
        const days = durationDays(item.duration);
        const until =
          days !== null
            ? rx.signedAt.getTime() + days * DAY
            : rx.signedAt.getTime() + 30 * DAY;
        if (until >= now)
          out.push({
            medicine: [item.medicine, item.strength].filter(Boolean).join(' '),
            source: `${rx.rxNumber ?? 'Rx'} by ${rx.doctorName}`,
          });
      }
    }
    return out;
  }

  private record(
    actor: PartnerActor,
    patientId: Types.ObjectId,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ALLERGY_UPDATE,
      targetType: 'User',
      targetId: patientId.toString(),
      metadata: {
        providerId: actor.provider.id,
        patientId: patientId.toString(),
        label: 'Allergy list',
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }
}
