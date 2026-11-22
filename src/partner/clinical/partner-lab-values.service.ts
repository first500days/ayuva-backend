import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../../core/records/schemas/medical-record.schema';
import { grantRecordFilter } from '../../core/sharing/share-scope';
import {
  LisSample,
  LisSampleDocument,
  LisStatus,
} from '../hospital/schemas/lis-sample.schema';
import { LabResult, LabResultDocument } from '../lab/schemas/lab-result.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { type LabPoint, pointsFromText } from './lab-panel';
import { PartnerPatientsService } from './partner-patients.service';

const LOOKBACK_MS = 200 * 86_400_000;
const REPORTED = [LisStatus.RESULTED, LisStatus.VERIFIED];

/**
 * Lab values this organisation may see for a patient, for safety rules:
 * its own released reports, reports from labs the patient shared with it, and
 * its hospital lab's results. Callers log the access.
 */
@Injectable()
export class PartnerLabValuesService {
  constructor(
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    @InjectModel(LisSample.name)
    private readonly lisModel: Model<LisSampleDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    private readonly patients: PartnerPatientsService,
  ) {}

  async forPatient(
    actor: PartnerActor,
    patientId: Types.ObjectId,
  ): Promise<LabPoint[]> {
    const since = new Date(Date.now() - LOOKBACK_MS);
    const shared = await this.sharedRecordIds(actor, patientId);
    const [results, samples] = await Promise.all([
      this.resultModel
        .find({
          patientId,
          status: 'released',
          releasedAt: { $gte: since },
          $or: [
            { providerId: actor.provider._id },
            ...(shared.length ? [{ recordId: { $in: shared } }] : []),
          ],
        })
        .select('tests releasedAt')
        .lean()
        .exec(),
      this.lisModel
        .find({
          providerId: actor.provider._id,
          patientId,
          status: { $in: REPORTED },
          updatedAt: { $gte: since },
        })
        .select('entries')
        .lean()
        .exec(),
    ]);
    return [
      ...results.flatMap(pointsFromResult),
      ...samples.flatMap((s) => pointsFromEntries(s.entries)),
    ];
  }

  /**
   * Values for inpatients, including walk-ins known only by their admission:
   * this hospital's lab and its own released reports. Runs without a
   * signed-in person, so it never reads what a patient shared with a person.
   */
  async forAdmissions(
    providerId: Types.ObjectId,
    admissions: { _id: Types.ObjectId; patientId?: Types.ObjectId }[],
  ): Promise<Map<string, LabPoint[]>> {
    const since = new Date(Date.now() - LOOKBACK_MS);
    const patientIds = admissions.flatMap((a) =>
      a.patientId ? [a.patientId] : [],
    );
    const [samples, results] = await Promise.all([
      this.lisModel
        .find({
          providerId,
          status: { $in: REPORTED },
          updatedAt: { $gte: since },
          $or: [
            { admissionId: { $in: admissions.map((a) => a._id) } },
            { patientId: { $in: patientIds } },
          ],
        })
        .select('entries admissionId patientId')
        .lean()
        .exec(),
      this.resultModel
        .find({
          providerId,
          status: 'released',
          releasedAt: { $gte: since },
          patientId: { $in: patientIds },
        })
        .select('tests releasedAt patientId')
        .lean()
        .exec(),
    ]);
    const out = new Map<string, LabPoint[]>();
    for (const a of admissions) {
      const pid = a.patientId?.toString();
      out.set(a._id.toString(), [
        ...samples
          .filter(
            (s) =>
              s.admissionId?.equals(a._id) ||
              (!!pid && s.patientId?.toString() === pid),
          )
          .flatMap((s) => pointsFromEntries(s.entries)),
        ...results
          .filter((r) => !!pid && r.patientId?.toString() === pid)
          .flatMap(pointsFromResult),
      ]);
    }
    return out;
  }

  private async sharedRecordIds(
    actor: PartnerActor,
    patientId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    if (!actor.permissions.includes(Perm.RECORDS_VIEW)) return [];
    const grants = await this.patients.activeGrants(
      actor.provider._id,
      patientId,
    );
    const ids: Types.ObjectId[] = [];
    for (const g of grants) {
      const rows = await this.recordModel
        .find(grantRecordFilter(g))
        .select('_id')
        .limit(300)
        .lean()
        .exec();
      rows.forEach((r) => ids.push(r._id));
    }
    return ids;
  }
}

function pointsFromResult(r: {
  releasedAt?: Date;
  tests: {
    values: {
      name: string;
      value: string;
      unit?: string;
      refHigh?: number;
    }[];
  }[];
}): LabPoint[] {
  const at = r.releasedAt?.toISOString();
  if (!at) return [];
  return r.tests.flatMap((t) =>
    t.values.flatMap((v) => {
      const value = Number.parseFloat(v.value);
      return Number.isFinite(value)
        ? [
            {
              parameter: v.name,
              value,
              unit: v.unit ?? null,
              refHigh: v.refHigh ?? null,
              at,
            },
          ]
        : [];
    }),
  );
}

/** Numbers written in a hospital lab's free-text results (notes are skipped). */
export function pointsFromEntries(
  entries: { kind: string; text: string; at: Date }[] | undefined,
): LabPoint[] {
  return (entries ?? [])
    .filter((e) => e.kind !== 'note')
    .flatMap((e) => pointsFromText(e.text, e.at.toISOString()));
}
