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
      ...results.flatMap((r) =>
        r.tests.flatMap((t) =>
          t.values.flatMap((v) => {
            const value = Number.parseFloat(v.value);
            return Number.isFinite(value) && r.releasedAt
              ? [
                  {
                    parameter: v.name,
                    value,
                    unit: v.unit ?? null,
                    refHigh: v.refHigh ?? null,
                    at: r.releasedAt.toISOString(),
                  },
                ]
              : [];
          }),
        ),
      ),
      ...samples.flatMap((s) => pointsFromEntries(s.entries)),
    ];
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

/** Numbers written in a hospital lab's free-text results (notes are skipped). */
export function pointsFromEntries(
  entries: { kind: string; text: string; at: Date }[] | undefined,
): LabPoint[] {
  return (entries ?? [])
    .filter((e) => e.kind !== 'note')
    .flatMap((e) => pointsFromText(e.text, e.at.toISOString()));
}
