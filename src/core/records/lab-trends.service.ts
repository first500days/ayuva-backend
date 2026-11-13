import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LabResult,
  LabResultDocument,
} from '../../partner/lab/schemas/lab-result.schema';
import {
  Provider,
  ProviderDocument,
} from '../providers/schemas/provider.schema';
import { buildLabTrends, type LabTrend } from './lab-trends';

const LOOKBACK_MS = 2 * 365 * 86_400_000;
const MAX_REPORTS = 60;

/**
 * GET /records/lab-trends: the patient's released lab results from AYUVA
 * partner labs and hospitals, turned into per-test trends (lab-trends.ts).
 */
@Injectable()
export class LabTrendsService {
  constructor(
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
  ) {}

  async forPatient(
    userId: string,
  ): Promise<{ trends: LabTrend[]; note: string }> {
    const results = await this.resultModel
      .find({
        patientId: new Types.ObjectId(userId),
        status: 'released',
        releasedAt: { $gte: new Date(Date.now() - LOOKBACK_MS) },
      })
      .select('providerId tests releasedAt')
      .sort({ releasedAt: -1 })
      .limit(MAX_REPORTS)
      .lean()
      .exec();
    const labs = await this.providerModel
      .find({ _id: { $in: results.map((r) => r.providerId) } })
      .select('name')
      .lean()
      .exec();
    const labName = new Map(labs.map((l) => [l._id.toString(), l.name]));
    return {
      trends: buildLabTrends(
        results.map((r) => ({
          at: r.releasedAt ?? new Date(0),
          labName: labName.get(r.providerId.toString()),
          values: (r.tests ?? []).flatMap((t) => t.values ?? []),
        })),
      ),
      note: 'From lab reports released to you through AYUVA. Descriptions are worked out by fixed rules and describe the numbers only; ask your doctor what they mean for you.',
    };
  }
}
