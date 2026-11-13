import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  AdmissionDocument,
  AdmissionStatus,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  LisSample,
  LisSampleDocument,
  LisStatus,
} from './schemas/lis-sample.schema';
import { ClaimStatus } from './schemas/insurance-claim.schema';
import { PartnerClaimsService } from './partner-claims.service';
import { PartnerTelemetryService } from './partner-telemetry.service';
import { READY_AT, dischargeReadiness } from './discharge-readiness';

const OPEN_LIS = [
  LisStatus.REQUESTED,
  LisStatus.COLLECTED,
  LisStatus.RECEIVED,
  LisStatus.PROCESSING,
  LisStatus.RESULTED,
];

/**
 * The bed board's "% discharge ready" cue per admitted patient. A forecast
 * only: the discharge itself always needs a named person's approval.
 */
@Injectable()
export class PartnerDischargeReadinessService {
  constructor(
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(LisSample.name)
    private readonly lisModel: Model<LisSampleDocument>,
    private readonly telemetry: PartnerTelemetryService,
    private readonly claims: PartnerClaimsService,
  ) {}

  async forProvider(actor: PartnerActor) {
    const providerId = actor.provider._id;
    const admitted = await this.admissionModel
      .find({ providerId, status: AdmissionStatus.ADMITTED })
      .limit(1000)
      .exec();
    const ids = admitted.map((a) => a._id);
    const [warnings, claims, pending] = await Promise.all([
      this.telemetry.warningLevels(providerId, admitted),
      this.claims.latestByAdmission(providerId, ids),
      this.lisModel
        .aggregate<{ _id: unknown; n: number }>([
          {
            $match: {
              providerId,
              admissionId: { $in: ids },
              status: { $in: OPEN_LIS },
            },
          },
          { $group: { _id: '$admissionId', n: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const pendingBy = new Map(pending.map((p) => [String(p._id), p.n]));
    const now = new Date();
    return {
      readyAt: READY_AT,
      note: 'A rule-based forecast to help plan discharges. It never discharges anyone: a head nurse or administrator approves every discharge.',
      admissions: admitted.map((a) => {
        const c = claims.get(a.id);
        const r = dischargeReadiness({
          admittedAt: a.admittedAt,
          expectedDischargeAt: a.expectedDischargeAt ?? null,
          now,
          warning: warnings.get(a.id) ?? null,
          pendingLabs: pendingBy.get(a.id) ?? 0,
          claim: !c
            ? 'none'
            : c.cleared
              ? 'cleared'
              : c.status === ClaimStatus.REJECTED
                ? 'rejected'
                : 'pending',
        });
        return { admissionId: a.id, bedId: a.bedId.toString(), ...r };
      }),
    };
  }
}
