import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { MedicalRecordType } from '../../core/records/schemas/medical-record.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { PartnerDocumentsService } from '../documents/partner-documents.service';
import { PartnerPatientsService } from '../clinical/partner-patients.service';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import { BedStatus, Ward, WardDocument } from './schemas/ward.schema';
import {
  AdmissionDocument,
  AdmissionStatus,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  AddBedsDto,
  AdmissionsQueryDto,
  AdmitDto,
  CreateWardDto,
  DischargeDto,
  TransferDto,
  UpdateWardDto,
} from './dto/hospital.dto';

/** Inpatient / Ward Management: bed board, admissions, transfers and discharges. */
@Injectable()
export class PartnerWardsService {
  constructor(
    @InjectModel(Ward.name) private readonly wardModel: Model<WardDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly documents: PartnerDocumentsService,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
  ) {}

  // ── Wards & beds ──────────────────────────────────────────────────────────

  async listWards(actor: PartnerActor) {
    const [wards, admitted] = await Promise.all([
      this.wardModel
        .find({ providerId: actor.provider._id })
        .sort({ name: 1 })
        .exec(),
      this.admissionModel
        .find({
          providerId: actor.provider._id,
          status: AdmissionStatus.ADMITTED,
        })
        .exec(),
    ]);
    const byId = new Map(admitted.map((a) => [a.id, a]));
    return wards.map((w) => this.wardResponse(w, byId));
  }

  async createWard(actor: PartnerActor, dto: CreateWardDto) {
    if (
      await this.wardModel.exists({
        providerId: actor.provider._id,
        name: dto.name.trim(),
      })
    ) {
      throw new ConflictException('A ward with this name already exists');
    }
    const prefix =
      dto.bedPrefix ??
      `${dto.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 3)}-`;
    const ward = await this.wardModel.create({
      providerId: actor.provider._id,
      name: dto.name.trim(),
      department: dto.department,
      type: dto.type ?? 'general',
      floor: dto.floor,
      beds: Array.from({ length: dto.bedCount }, (_, i) => ({
        label: `${prefix}${i + 1}`,
        status: BedStatus.AVAILABLE,
      })),
    });
    await this.recordWard(actor, ward, {
      change: 'ward_created',
      beds: dto.bedCount,
    });
    return this.wardResponse(ward, new Map());
  }

  async updateWard(actor: PartnerActor, id: string, dto: UpdateWardDto) {
    const ward = await this.loadWard(actor, id);
    for (const [k, v] of Object.entries(dto))
      if (v !== undefined) ward.set(k, v);
    await ward.save();
    return this.wardResponse(ward, await this.admittedMap(actor));
  }

  async addBeds(actor: PartnerActor, id: string, dto: AddBedsDto) {
    const ward = await this.loadWard(actor, id);
    const prefix =
      dto.prefix ?? ward.beds[0]?.label.replace(/\d+$/, '') ?? 'B-';
    const used = new Set(ward.beds.map((b) => b.label));
    let n = ward.beds.length;
    for (let added = 0; added < dto.count;) {
      n += 1;
      const label = `${prefix}${n}`;
      if (used.has(label)) continue;
      ward.beds.push({
        _id: new Types.ObjectId(),
        label,
        status: BedStatus.AVAILABLE,
      });
      added += 1;
    }
    await ward.save();
    return this.wardResponse(ward, await this.admittedMap(actor));
  }

  async setBedStatus(
    actor: PartnerActor,
    wardId: string,
    bedId: string,
    status: BedStatus,
  ) {
    const ward = await this.loadWard(actor, wardId);
    const bed = ward.beds.find((b) => b._id.toString() === bedId);
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.status === BedStatus.OCCUPIED)
      throw new BadRequestException(
        'An occupied bed changes only through transfer or discharge',
      );
    bed.status = status;
    await ward.save();
    return this.wardResponse(ward, await this.admittedMap(actor));
  }

  async removeWard(actor: PartnerActor, id: string) {
    const ward = await this.loadWard(actor, id);
    if (ward.beds.some((b) => b.status === BedStatus.OCCUPIED)) {
      throw new BadRequestException(
        'Discharge or transfer every patient before removing this ward',
      );
    }
    await ward.deleteOne();
    await this.recordWard(actor, ward, { change: 'ward_removed' });
    return { id, removed: true };
  }

  // ── Admissions ────────────────────────────────────────────────────────────

  async listAdmissions(actor: PartnerActor, q: AdmissionsQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.status) filter.status = q.status;
    if (q.wardId) filter.wardId = new Types.ObjectId(q.wardId);
    if (q.q?.trim()) {
      const re = buildSafeRegex(q.q);
      filter.$or = [
        { patientName: re },
        { admissionNo: re },
        { department: re },
      ];
    }
    const rows = await this.admissionModel
      .find(filter)
      .sort({ admittedAt: -1 })
      .limit(300)
      .exec();
    return rows.map((a) => this.admissionResponse(a));
  }

  async admit(actor: PartnerActor, dto: AdmitDto) {
    let patientId: Types.ObjectId | undefined;
    let patientName = dto.patientName?.trim();
    if (dto.patientId) {
      const patient = await this.patients.assertLinked(actor, dto.patientId);
      patientId = patient._id;
      patientName = patient.fullName;
      if (
        await this.admissionModel.exists({
          providerId: actor.provider._id,
          patientId,
          status: AdmissionStatus.ADMITTED,
        })
      ) {
        throw new ConflictException('This patient is already admitted');
      }
    }
    if (!patientName)
      throw new BadRequestException(
        'Choose a linked patient or enter the walk-in patient’s name',
      );
    const attending = dto.attendingMemberId
      ? await this.activeMember(actor, dto.attendingMemberId)
      : undefined;

    const admissionId = new Types.ObjectId();
    const ward = await this.claimBed(actor, dto.wardId, dto.bedId, admissionId);
    const bed = ward.beds.find((b) => b._id.toString() === dto.bedId)!;
    let admission: AdmissionDocument;
    try {
      admission = await this.admissionModel.create({
        _id: admissionId,
        admissionNo: await this.newNumber(),
        providerId: actor.provider._id,
        patientId,
        patientName,
        patientPhone: dto.patientPhone,
        age: dto.age,
        gender: dto.gender,
        wardId: ward._id,
        wardName: ward.name,
        bedId: bed._id,
        bedLabel: bed.label,
        department: dto.department ?? ward.department,
        attendingMemberId: attending?._id,
        attendingName: attending?.fullName,
        reason: dto.reason ?? '',
        admittedAt: new Date(),
        expectedDischargeAt: dto.expectedDischargeAt
          ? new Date(dto.expectedDischargeAt)
          : undefined,
        admittedByName: actor.member.fullName,
      });
    } catch (err) {
      await this.releaseBed(ward._id, bed._id, BedStatus.AVAILABLE);
      throw err;
    }
    await this.notifyChange(
      actor,
      admission,
      'Patient admitted',
      `${admission.patientName} admitted to ${admission.wardName} / ${admission.bedLabel}${admission.department ? ` (${admission.department})` : ''}.`,
      attending,
    );
    await this.recordAdmission(actor, admission, {
      change: 'admitted',
      ward: admission.wardName,
      bed: admission.bedLabel,
    });
    return this.admissionResponse(admission);
  }

  async transfer(actor: PartnerActor, id: string, dto: TransferDto) {
    const admission = await this.loadAdmission(actor, id);
    if (admission.status !== AdmissionStatus.ADMITTED)
      throw new BadRequestException(
        'Only an admitted patient can be transferred',
      );
    if (
      admission.wardId.toString() === dto.wardId &&
      admission.bedId.toString() === dto.bedId
    ) {
      throw new BadRequestException('Choose a different bed');
    }
    const attending = dto.attendingMemberId
      ? await this.activeMember(actor, dto.attendingMemberId)
      : undefined;
    const newWard = await this.claimBed(
      actor,
      dto.wardId,
      dto.bedId,
      admission._id,
    );
    const newBed = newWard.beds.find((b) => b._id.toString() === dto.bedId)!;
    await this.releaseBed(
      admission.wardId,
      admission.bedId,
      BedStatus.CLEANING,
    );

    admission.transfers.push({
      at: new Date(),
      fromWardName: admission.wardName,
      fromBedLabel: admission.bedLabel,
      toWardName: newWard.name,
      toBedLabel: newBed.label,
      fromDepartment: admission.department,
      toDepartment: dto.department ?? admission.department,
      reason: dto.reason,
      byName: actor.member.fullName,
    });
    admission.wardId = newWard._id;
    admission.wardName = newWard.name;
    admission.bedId = newBed._id;
    admission.bedLabel = newBed.label;
    if (dto.department) admission.department = dto.department;
    if (attending) {
      admission.attendingMemberId = attending._id;
      admission.attendingName = attending.fullName;
    }
    await admission.save();
    await this.notifyChange(
      actor,
      admission,
      'Patient transferred',
      `${admission.patientName} moved to ${admission.wardName} / ${admission.bedLabel}${dto.reason ? ` — ${dto.reason}` : ''}.`,
      attending,
    );
    await this.recordAdmission(actor, admission, {
      change: 'transferred',
      ward: admission.wardName,
      bed: admission.bedLabel,
    });
    return this.admissionResponse(admission);
  }

  async discharge(actor: PartnerActor, id: string, dto: DischargeDto) {
    const admission = await this.loadAdmission(actor, id);
    if (admission.status !== AdmissionStatus.ADMITTED)
      throw new BadRequestException('This patient is already discharged');
    if (dto.sendSummary && !admission.patientId) {
      throw new BadRequestException(
        'Only a patient with an Ayuva account can receive the summary in their vault',
      );
    }
    admission.status = AdmissionStatus.DISCHARGED;
    admission.dischargedAt = new Date();
    admission.dischargeType = dto.type;
    admission.dischargeNote = dto.note ?? '';
    await this.releaseBed(
      admission.wardId,
      admission.bedId,
      BedStatus.CLEANING,
    );

    if (dto.sendSummary && admission.patientId) {
      const pdf = this.documents.dischargeSummaryPdf(admission, actor.provider);
      const record = await this.documents.deliverToVault({
        patientId: admission.patientId,
        buffer: pdf,
        fileName: `Discharge summary ${admission.admissionNo} - ${actor.provider.name}.pdf`,
        type: MedicalRecordType.DISCHARGE,
        providerName: actor.provider.name,
        recordDate: admission.dischargedAt,
        tags: ['discharge-summary'],
        notification: {
          trigger: 'discharge_summary_available',
          title: 'Discharge summary ready',
          message: `${actor.provider.name} added your discharge summary to your Medical Vault.`,
          lockScreenText: 'A new document is in your vault',
        },
      });
      admission.vaultRecordId = record._id;
    }
    await admission.save();
    await this.notifyChange(
      actor,
      admission,
      'Patient discharged',
      `${admission.patientName} discharged from ${admission.wardName} / ${admission.bedLabel}. Bed ${admission.bedLabel} needs cleaning.`,
    );
    await this.recordAdmission(actor, admission, {
      change: 'discharged',
      dischargeType: dto.type,
      summarySent: !!admission.vaultRecordId,
    });
    return this.admissionResponse(admission);
  }

  /** Bed census for the hospital dashboard. */
  async census(actor: PartnerActor) {
    const providerId = actor.provider._id;
    const wards = await this.wardModel.find({ providerId }).exec();
    const beds = wards.flatMap((w) => w.beds.map((b) => ({ ward: w, bed: b })));
    const count = (s: BedStatus) =>
      beds.filter((b) => b.bed.status === s).length;
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [admittedToday, dischargedToday, recent] = await Promise.all([
      this.admissionModel.countDocuments({
        providerId,
        admittedAt: { $gte: dayStart },
      }),
      this.admissionModel.countDocuments({
        providerId,
        dischargedAt: { $gte: dayStart },
      }),
      this.admissionModel
        .find({ providerId, dischargedAt: { $gte: since30 } })
        .select('admittedAt dischargedAt')
        .lean()
        .exec(),
    ]);
    const stays = recent.map(
      (a) => (a.dischargedAt!.getTime() - a.admittedAt.getTime()) / 86_400_000,
    );
    const total = beds.length;
    const occupied = count(BedStatus.OCCUPIED);
    return {
      totalBeds: total,
      occupied,
      available: count(BedStatus.AVAILABLE),
      cleaning: count(BedStatus.CLEANING),
      maintenance: count(BedStatus.MAINTENANCE),
      reserved: count(BedStatus.RESERVED),
      occupancyRate: total ? Math.round((occupied / total) * 100) : 0,
      admittedToday,
      dischargedToday,
      avgLengthOfStayDays: stays.length
        ? Math.round((stays.reduce((a, b) => a + b, 0) / stays.length) * 10) /
          10
        : null,
      byWard: wards.map((w) => ({
        wardId: w.id,
        name: w.name,
        department: w.department ?? null,
        type: w.type,
        total: w.beds.length,
        occupied: w.beds.filter((b) => b.status === BedStatus.OCCUPIED).length,
        available: w.beds.filter((b) => b.status === BedStatus.AVAILABLE)
          .length,
      })),
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Atomically flips an available/reserved bed to occupied — two admissions can never win one bed. */
  private async claimBed(
    actor: PartnerActor,
    wardId: string,
    bedId: string,
    admissionId: Types.ObjectId,
  ): Promise<WardDocument> {
    if (!Types.ObjectId.isValid(wardId) || !Types.ObjectId.isValid(bedId))
      throw new NotFoundException('Bed not found');
    const ward = await this.wardModel.findOneAndUpdate(
      {
        _id: wardId,
        providerId: actor.provider._id,
        beds: {
          $elemMatch: {
            _id: new Types.ObjectId(bedId),
            status: { $in: [BedStatus.AVAILABLE, BedStatus.RESERVED] },
          },
        },
      },
      {
        $set: {
          'beds.$.status': BedStatus.OCCUPIED,
          'beds.$.admissionId': admissionId,
        },
      },
      { returnDocument: 'after' },
    );
    if (!ward)
      throw new ConflictException(
        'That bed is not available — pick another one',
      );
    return ward;
  }

  private releaseBed(
    wardId: Types.ObjectId,
    bedId: Types.ObjectId,
    status: BedStatus,
  ) {
    return this.wardModel
      .updateOne(
        { _id: wardId, 'beds._id': bedId },
        {
          $set: { 'beds.$.status': status },
          $unset: { 'beds.$.admissionId': '' },
        },
      )
      .exec();
  }

  private async activeMember(actor: PartnerActor, memberId: string) {
    const m = Types.ObjectId.isValid(memberId)
      ? await this.memberModel.findOne({
          _id: memberId,
          providerId: actor.provider._id,
          status: MemberStatus.ACTIVE,
        })
      : null;
    if (!m)
      throw new BadRequestException(
        'That staff member is not active in your hospital',
      );
    return m;
  }

  private async loadWard(actor: PartnerActor, id: string) {
    const ward = Types.ObjectId.isValid(id)
      ? await this.wardModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!ward) throw new NotFoundException('Ward not found');
    return ward;
  }

  private async loadAdmission(actor: PartnerActor, id: string) {
    const a = Types.ObjectId.isValid(id)
      ? await this.admissionModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!a) throw new NotFoundException('Admission not found');
    return a;
  }

  private async admittedMap(actor: PartnerActor) {
    const admitted = await this.admissionModel
      .find({
        providerId: actor.provider._id,
        status: AdmissionStatus.ADMITTED,
      })
      .exec();
    return new Map(admitted.map((a) => [a.id, a]));
  }

  private async newNumber() {
    const day = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const candidate = `ADM-${day}-${randomBytes(2).toString('hex').toUpperCase()}`;
      if (!(await this.admissionModel.exists({ admissionNo: candidate })))
        return candidate;
    }
    throw new Error('Could not allocate an admission number');
  }

  private async notifyChange(
    actor: PartnerActor,
    a: AdmissionDocument,
    title: string,
    message: string,
    attending?: PartnerMemberDocument,
  ) {
    await this.notifier.emit(actor.provider._id, {
      trigger: PartnerTrigger.ADMISSION_UPDATE,
      title,
      message,
      safeMessage: `${title} (${a.admissionNo}).`,
      route: '/partner/wards',
      params: { admissionId: a.id },
      data: {
        admissionId: a.id,
        admissionNo: a.admissionNo,
        status: a.status,
        ward: a.wardName,
        bed: a.bedLabel,
      },
      memberIds: attending
        ? [attending.id]
        : a.attendingMemberId
          ? [a.attendingMemberId.toString()]
          : [],
      excludeUserId: actor.userId,
    });
  }

  private recordWard(
    actor: PartnerActor,
    ward: WardDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ADMISSION_UPDATE,
      targetType: 'Ward',
      targetId: ward.id,
      metadata: {
        providerId: actor.provider.id,
        label: ward.name,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }

  private recordAdmission(
    actor: PartnerActor,
    a: AdmissionDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ADMISSION_UPDATE,
      targetType: 'PartnerAdmission',
      targetId: a.id,
      metadata: {
        providerId: actor.provider.id,
        ...(a.patientId && { patientId: a.patientId.toString() }),
        label: a.admissionNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }

  private wardResponse(
    w: WardDocument,
    admittedById: Map<string, AdmissionDocument>,
  ) {
    return {
      id: w.id,
      name: w.name,
      department: w.department ?? null,
      type: w.type,
      floor: w.floor ?? null,
      beds: w.beds.map((b) => {
        const a = b.admissionId
          ? admittedById.get(b.admissionId.toString())
          : undefined;
        return {
          id: b._id.toString(),
          label: b.label,
          status: b.status,
          admission: a
            ? {
                id: a.id,
                admissionNo: a.admissionNo,
                patientName: a.patientName,
                admittedAt: a.admittedAt.toISOString(),
                attendingName: a.attendingName ?? null,
                department: a.department ?? null,
              }
            : null,
        };
      }),
    };
  }

  admissionResponse(a: AdmissionDocument) {
    return {
      id: a.id,
      admissionNo: a.admissionNo,
      patientId: a.patientId?.toString() ?? null,
      patientName: a.patientName,
      patientPhone: a.patientPhone ?? null,
      age: a.age ?? null,
      gender: a.gender ?? null,
      wardId: a.wardId.toString(),
      wardName: a.wardName,
      bedId: a.bedId.toString(),
      bedLabel: a.bedLabel,
      department: a.department ?? null,
      attending: a.attendingMemberId
        ? { id: a.attendingMemberId.toString(), name: a.attendingName ?? '' }
        : null,
      reason: a.reason,
      admittedAt: a.admittedAt.toISOString(),
      expectedDischargeAt: a.expectedDischargeAt?.toISOString() ?? null,
      status: a.status,
      dischargedAt: a.dischargedAt?.toISOString() ?? null,
      dischargeType: a.dischargeType ?? null,
      dischargeNote: a.dischargeNote,
      summarySent: !!a.vaultRecordId,
      lengthOfStayDays: Math.max(
        0,
        Math.round(
          (((a.dischargedAt ?? new Date()).getTime() - a.admittedAt.getTime()) /
            86_400_000) *
            10,
        ) / 10,
      ),
      transfers: a.transfers.map((t) => ({
        at: t.at.toISOString(),
        from: `${t.fromWardName} / ${t.fromBedLabel}`,
        to: `${t.toWardName} / ${t.toBedLabel}`,
        reason: t.reason ?? null,
        byName: t.byName ?? null,
      })),
      admittedByName: a.admittedByName ?? null,
    };
  }
}
