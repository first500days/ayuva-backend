import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Ward, WardDocument, BedStatus, WardGender } from '../core/hospital/schemas/ward.schema';
import {
  Admission,
  AdmissionDocument,
  AdmissionStatus,
} from '../core/hospital/schemas/admission.schema';
import { ProviderCategory } from '../core/providers/schemas/provider.schema';
import { PartnerContextService } from './partner-context.service';
import { PartnerLiveGateway } from './partner-live.gateway';
import {
  AddBedsDto,
  AdmissionsQueryDto,
  AdmitDto,
  CreateWardDto,
  DischargeAdmissionDto,
  SaveWardLayoutDto,
  TransferAdmissionDto,
  UpdateWardDto,
} from './dto/partner-wards.dto';

/** Wards, beds, admissions and census for the Hospital Portal (Ops: Dashboard, Triage & Referral Management). */
@Injectable()
export class PartnerWardsService {
  constructor(
    @InjectModel(Ward.name) private readonly wardModel: Model<WardDocument>,
    @InjectModel(Admission.name) private readonly admissionModel: Model<AdmissionDocument>,
    private readonly context: PartnerContextService,
    private readonly live: PartnerLiveGateway,
  ) {}

  // ── Wards & beds ───────────────────────────────────────────────────────────

  async listWards(userId: string) {
    const provider = await this.requireHospital(userId);
    const wards = await this.wardModel.find({ providerId: provider._id }).sort({ name: 1 }).exec();
    const admissionsByBed = await this.activeAdmissionsByBed(provider._id, wards.map((w) => w._id));
    return wards.map((w) => this.toWardDto(w, admissionsByBed));
  }

  async createWard(userId: string, dto: CreateWardDto) {
    const provider = await this.requireHospital(userId);
    const prefix = dto.bedPrefix ?? (dto.name.trim().slice(0, 1).toUpperCase() || 'B');
    const beds = Array.from({ length: dto.bedCount }, (_, i) => ({
      id: `${prefix}${i + 1}`,
      label: `${prefix}${i + 1}`,
      status: BedStatus.AVAILABLE,
      x: null,
      y: null,
    }));
    const ward = await this.wardModel.create({
      providerId: provider._id,
      name: dto.name,
      department: dto.department ?? null,
      type: dto.type ?? 'general',
      floor: dto.floor ?? null,
      genderPolicy: dto.genderPolicy ?? WardGender.MIXED,
      beds,
    });
    this.live.notify(userId, ['wards', 'census']);
    return this.toWardDto(ward, new Map());
  }

  async updateWard(userId: string, id: string, dto: UpdateWardDto) {
    const provider = await this.requireHospital(userId);
    const ward = await this.getOwnWard(provider._id, id);

    if (dto.name !== undefined) ward.name = dto.name;
    if (dto.department !== undefined) ward.department = dto.department;
    if (dto.type !== undefined) ward.type = dto.type;
    if (dto.floor !== undefined) ward.floor = dto.floor;
    if (dto.genderPolicy !== undefined) ward.genderPolicy = dto.genderPolicy;

    if (dto.bedCapacity !== undefined) {
      if (dto.bedCapacity > ward.beds.length) {
        const prefix = ward.beds[0]?.label.replace(/\d+$/, '') || 'B';
        const toAdd = dto.bedCapacity - ward.beds.length;
        for (let i = 0; i < toAdd; i++) {
          const n = ward.beds.length + i + 1;
          ward.beds.push({ id: `${prefix}${n}`, label: `${prefix}${n}`, status: BedStatus.AVAILABLE, x: null, y: null });
        }
      } else if (dto.bedCapacity < ward.beds.length) {
        const removable = ward.beds.filter((b) => b.status === BedStatus.AVAILABLE);
        const toRemove = ward.beds.length - dto.bedCapacity;
        if (removable.length < toRemove) {
          throw new BadRequestException('Not enough free beds to reduce capacity by that much');
        }
        const removeIds = new Set(removable.slice(0, toRemove).map((b) => b.id));
        ward.beds = ward.beds.filter((b) => !removeIds.has(b.id));
      }
    }

    await ward.save();
    this.live.notify(userId, ['wards', 'census']);
    const admissionsByBed = await this.activeAdmissionsByBed(provider._id, [ward._id]);
    return this.toWardDto(ward, admissionsByBed);
  }

  async saveLayout(userId: string, id: string, dto: SaveWardLayoutDto) {
    const provider = await this.requireHospital(userId);
    const ward = await this.getOwnWard(provider._id, id);
    const byId = new Map(dto.beds.map((b) => [b.id, b]));
    ward.layoutCols = dto.cols;
    for (const bed of ward.beds) {
      const pos = byId.get(bed.id);
      if (pos) {
        bed.x = pos.x;
        bed.y = pos.y;
      }
    }
    await ward.save();
    this.live.notify(userId, ['wards']);
    const admissionsByBed = await this.activeAdmissionsByBed(provider._id, [ward._id]);
    return this.toWardDto(ward, admissionsByBed);
  }

  async addBeds(userId: string, id: string, dto: AddBedsDto) {
    const provider = await this.requireHospital(userId);
    const ward = await this.getOwnWard(provider._id, id);
    const prefix = dto.prefix ?? ward.beds[0]?.label.replace(/\d+$/, '') ?? 'B';
    const start = ward.beds.length;
    for (let i = 0; i < dto.count; i++) {
      const n = start + i + 1;
      ward.beds.push({ id: `${prefix}${n}`, label: `${prefix}${n}`, status: BedStatus.AVAILABLE, x: null, y: null });
    }
    await ward.save();
    this.live.notify(userId, ['wards', 'census']);
    const admissionsByBed = await this.activeAdmissionsByBed(provider._id, [ward._id]);
    return this.toWardDto(ward, admissionsByBed);
  }

  async setBed(userId: string, wardId: string, bedId: string, status: BedStatus) {
    const provider = await this.requireHospital(userId);
    const ward = await this.getOwnWard(provider._id, wardId);
    const bed = ward.beds.find((b) => b.id === bedId);
    if (!bed) throw new NotFoundException('Bed not found');

    if (status === BedStatus.OCCUPIED) {
      throw new BadRequestException('A bed becomes occupied by admitting a patient, not by direct status change');
    }
    if (bed.status === BedStatus.OCCUPIED) {
      throw new BadRequestException('Discharge or transfer the current patient before changing this bed\'s status');
    }

    bed.status = status;
    await ward.save();
    this.live.notify(userId, ['wards', 'census']);
    const admissionsByBed = await this.activeAdmissionsByBed(provider._id, [ward._id]);
    return this.toWardDto(ward, admissionsByBed);
  }

  async removeWard(userId: string, id: string) {
    const provider = await this.requireHospital(userId);
    const ward = await this.getOwnWard(provider._id, id);
    const activeCount = await this.admissionModel.countDocuments({
      wardId: ward._id,
      status: AdmissionStatus.ADMITTED,
    });
    if (activeCount > 0) {
      throw new BadRequestException('Cannot remove a ward with active admissions');
    }
    await ward.deleteOne();
    this.live.notify(userId, ['wards', 'census']);
    return { id };
  }

  // ── Census ─────────────────────────────────────────────────────────────────

  async census(userId: string) {
    const provider = await this.requireHospital(userId);
    const wards = await this.wardModel.find({ providerId: provider._id }).exec();

    let totalBeds = 0;
    let occupied = 0;
    let cleaning = 0;
    let maintenance = 0;
    let reserved = 0;
    const byWard = wards.map((w) => {
      const total = w.beds.length;
      const wOccupied = w.beds.filter((b) => b.status === BedStatus.OCCUPIED).length;
      const wAvailable = w.beds.filter((b) => b.status === BedStatus.AVAILABLE).length;
      totalBeds += total;
      occupied += wOccupied;
      cleaning += w.beds.filter((b) => b.status === BedStatus.CLEANING).length;
      maintenance += w.beds.filter((b) => b.status === BedStatus.MAINTENANCE).length;
      reserved += w.beds.filter((b) => b.status === BedStatus.RESERVED).length;
      return {
        wardId: w.id,
        name: w.name,
        department: w.department,
        type: w.type,
        genderPolicy: w.genderPolicy,
        total,
        occupied: wOccupied,
        available: wAvailable,
      };
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [admittedToday, dischargedToday, dischargedAll] = await Promise.all([
      this.admissionModel.countDocuments({ providerId: provider._id, admittedAt: { $gte: startOfDay } }),
      this.admissionModel.countDocuments({ providerId: provider._id, dischargedAt: { $gte: startOfDay } }),
      this.admissionModel
        .find({ providerId: provider._id, status: AdmissionStatus.DISCHARGED })
        .select('admittedAt dischargedAt')
        .limit(500)
        .exec(),
    ]);

    const stays = dischargedAll
      .filter((a) => a.dischargedAt)
      .map((a) => (a.dischargedAt!.getTime() - a.admittedAt.getTime()) / (1000 * 60 * 60 * 24));
    const avgLengthOfStayDays = stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length : null;

    return {
      totalBeds,
      occupied,
      available: totalBeds - occupied - cleaning - maintenance - reserved,
      cleaning,
      maintenance,
      reserved,
      occupancyRate: totalBeds ? occupied / totalBeds : 0,
      admittedToday,
      dischargedToday,
      avgLengthOfStayDays,
      byWard,
    };
  }

  // ── Admissions ─────────────────────────────────────────────────────────────

  async listAdmissions(userId: string, q: AdmissionsQueryDto) {
    const provider = await this.requireHospital(userId);
    const filter: Record<string, unknown> = { providerId: provider._id };
    if (q.status) filter.status = q.status;
    if (q.wardId) filter.wardId = new Types.ObjectId(q.wardId);
    if (q.q) filter.patientName = { $regex: q.q, $options: 'i' };

    const [admissions, wards] = await Promise.all([
      this.admissionModel.find(filter).sort({ admittedAt: -1 }).limit(300).exec(),
      this.wardModel.find({ providerId: provider._id }).exec(),
    ]);
    const wardById = new Map(wards.map((w) => [w.id, w]));
    return admissions.map((a) => this.toAdmissionDto(a, wardById));
  }

  async admit(userId: string, dto: AdmitDto) {
    const provider = await this.requireHospital(userId);
    const ward = await this.getOwnWard(provider._id, dto.wardId);
    const bed = ward.beds.find((b) => b.id === dto.bedId);
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.status !== BedStatus.AVAILABLE) {
      throw new BadRequestException(`Bed ${bed.label} is not available`);
    }

    bed.status = BedStatus.OCCUPIED;
    await ward.save();

    const admission = await this.admissionModel.create({
      providerId: provider._id,
      admissionNo: `ADM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      patientId: dto.patientId ? new Types.ObjectId(dto.patientId) : null,
      patientName: dto.patientName ?? 'Unnamed patient',
      patientPhone: dto.patientPhone ?? null,
      age: dto.age ?? null,
      gender: dto.gender ?? null,
      wardId: ward._id,
      bedId: bed.id,
      department: dto.department ?? ward.department,
      attendingMemberId: dto.attendingMemberId ?? null,
      reason: dto.reason ?? '',
      admittedAt: new Date(),
      expectedDischargeAt: dto.expectedDischargeAt ? new Date(dto.expectedDischargeAt) : null,
    });

    this.live.notify(userId, ['wards', 'census']);
    return this.toAdmissionDto(admission, new Map([[ward.id, ward]]));
  }

  async transfer(userId: string, id: string, dto: TransferAdmissionDto) {
    const provider = await this.requireHospital(userId);
    const admission = await this.getOwnAdmission(provider._id, id);
    if (admission.status !== AdmissionStatus.ADMITTED) {
      throw new BadRequestException('Only an active admission can be transferred');
    }

    const fromWard = await this.getOwnWard(provider._id, admission.wardId.toString());
    const toWard =
      dto.wardId === admission.wardId.toString() ? fromWard : await this.getOwnWard(provider._id, dto.wardId);
    const toBed = toWard.beds.find((b) => b.id === dto.bedId);
    if (!toBed) throw new NotFoundException('Target bed not found');
    if (toBed.id === admission.bedId && toWard.id === fromWard.id) {
      throw new BadRequestException('Patient is already in that bed');
    }
    if (toBed.status !== BedStatus.AVAILABLE) {
      throw new BadRequestException(`Bed ${toBed.label} is not available`);
    }

    const fromBed = fromWard.beds.find((b) => b.id === admission.bedId);
    if (fromBed) fromBed.status = BedStatus.CLEANING;
    toBed.status = BedStatus.OCCUPIED;

    await fromWard.save();
    if (toWard.id !== fromWard.id) await toWard.save();

    admission.transfers.push({
      at: new Date(),
      from: `${fromWard.name} / ${fromBed?.label ?? admission.bedId}`,
      to: `${toWard.name} / ${toBed.label}`,
      reason: dto.reason ?? null,
      byName: null,
    });
    admission.wardId = toWard._id;
    admission.bedId = toBed.id;
    if (dto.department !== undefined) admission.department = dto.department;
    if (dto.attendingMemberId !== undefined) admission.attendingMemberId = dto.attendingMemberId;
    if (dto.gender !== undefined && !admission.gender) admission.gender = dto.gender;
    await admission.save();

    this.live.notify(userId, ['wards', 'census']);
    return this.toAdmissionDto(admission, new Map([[toWard.id, toWard]]));
  }

  async discharge(userId: string, id: string, dto: DischargeAdmissionDto) {
    const provider = await this.requireHospital(userId);
    const admission = await this.getOwnAdmission(provider._id, id);
    if (admission.status !== AdmissionStatus.ADMITTED) {
      throw new BadRequestException('Admission is already discharged');
    }

    const ward = await this.getOwnWard(provider._id, admission.wardId.toString());
    const bed = ward.beds.find((b) => b.id === admission.bedId);
    if (bed) bed.status = BedStatus.CLEANING;
    await ward.save();

    admission.status = AdmissionStatus.DISCHARGED;
    admission.dischargedAt = new Date();
    admission.dischargeType = dto.type;
    admission.dischargeNote = dto.note ?? '';
    admission.summarySent = Boolean(dto.sendSummary);
    await admission.save();

    this.live.notify(userId, ['wards', 'census']);
    return this.toAdmissionDto(admission, new Map([[ward.id, ward]]));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async requireHospital(userId: string) {
    const provider = await this.context.requireLive(userId);
    if (provider.type !== ProviderCategory.HOSPITAL) {
      throw new ForbiddenException('Wards & admissions are only available to hospital accounts');
    }
    return provider;
  }

  private async getOwnWard(providerId: Types.ObjectId, wardId: string) {
    if (!Types.ObjectId.isValid(wardId)) throw new NotFoundException('Ward not found');
    const ward = await this.wardModel.findOne({ _id: wardId, providerId }).exec();
    if (!ward) throw new NotFoundException('Ward not found');
    return ward;
  }

  private async getOwnAdmission(providerId: Types.ObjectId, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Admission not found');
    const admission = await this.admissionModel.findOne({ _id: id, providerId }).exec();
    if (!admission) throw new NotFoundException('Admission not found');
    return admission;
  }

  private async activeAdmissionsByBed(providerId: Types.ObjectId, wardIds: Types.ObjectId[]) {
    const admissions = await this.admissionModel
      .find({ providerId, wardId: { $in: wardIds }, status: AdmissionStatus.ADMITTED })
      .exec();
    const map = new Map<string, AdmissionDocument>();
    for (const a of admissions) map.set(`${a.wardId.toString()}:${a.bedId}`, a);
    return map;
  }

  private toWardDto(ward: WardDocument, admissionsByBed: Map<string, AdmissionDocument>) {
    return {
      id: ward.id,
      name: ward.name,
      department: ward.department,
      type: ward.type,
      floor: ward.floor,
      genderPolicy: ward.genderPolicy,
      layoutCols: ward.layoutCols,
      beds: ward.beds.map((b) => {
        const admission = admissionsByBed.get(`${ward.id}:${b.id}`);
        return {
          id: b.id,
          label: b.label,
          status: b.status,
          x: b.x,
          y: b.y,
          admission: admission
            ? {
                id: admission.id,
                admissionNo: admission.admissionNo,
                patientName: admission.patientName,
                admittedAt: admission.admittedAt.toISOString(),
                expectedDischargeAt: admission.expectedDischargeAt?.toISOString() ?? null,
                attendingName: null,
                department: admission.department,
              }
            : null,
        };
      }),
    };
  }

  private toAdmissionDto(admission: AdmissionDocument, wardById: Map<string, WardDocument>) {
    const ward = wardById.get(admission.wardId.toString());
    const bed = ward?.beds.find((b) => b.id === admission.bedId);
    const lengthOfStayDays =
      (admission.dischargedAt ?? new Date()).getTime() - admission.admittedAt.getTime();

    return {
      id: admission.id,
      admissionNo: admission.admissionNo,
      patientId: admission.patientId?.toString() ?? null,
      patientName: admission.patientName,
      patientPhone: admission.patientPhone,
      age: admission.age,
      gender: admission.gender,
      wardId: admission.wardId.toString(),
      wardName: ward?.name ?? '',
      bedId: admission.bedId,
      bedLabel: bed?.label ?? admission.bedId,
      department: admission.department,
      // Attending is not resolvable yet — no staff/roster module exists backend-side.
      attending: null,
      reason: admission.reason,
      admittedAt: admission.admittedAt.toISOString(),
      expectedDischargeAt: admission.expectedDischargeAt?.toISOString() ?? null,
      status: admission.status,
      dischargedAt: admission.dischargedAt?.toISOString() ?? null,
      dischargeType: admission.dischargeType,
      dischargeNote: admission.dischargeNote,
      summarySent: admission.summarySent,
      lengthOfStayDays: Math.floor(lengthOfStayDays / (1000 * 60 * 60 * 24)),
      transfers: admission.transfers.map((t) => ({
        at: t.at.toISOString(),
        from: t.from,
        to: t.to,
        reason: t.reason,
        byName: t.byName,
      })),
      admittedByName: admission.admittedByName,
      // Insurance claims live in a separate module not built yet.
      insurance: null,
    };
  }
}
