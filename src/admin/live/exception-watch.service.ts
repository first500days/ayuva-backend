import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminIssue,
  AdminIssueDocument,
  IssueStatus,
} from '../operations/schemas/admin-issue.schema';
import {
  Provider,
  ProviderDocument,
  ProviderStatus,
} from '../../core/providers/schemas/provider.schema';
import {
  ESCALATE_AFTER_MS,
  UNADDRESSED_ISSUE_STATES,
  waitingMinutes,
} from './exceptions';

const SWEEP_MS = 60_000;

export interface EscalatedItem {
  kind: 'issue' | 'verification';
  id: string;
  title: string;
  waitingMin: number;
  severity?: string;
}

/**
 * Every minute: stamps exceptions and verifications that have just passed 15
 * minutes unaddressed (escalatedAt, kept for the record) and hands the current
 * list to the admin live socket, which tells open Super-Admin screens.
 */
@Injectable()
export class ExceptionWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExceptionWatchService.name);
  private timer?: NodeJS.Timeout;
  private listeners = new Set<
    (items: EscalatedItem[], fresh: EscalatedItem[]) => void
  >();

  constructor(
    @InjectModel(AdminIssue.name)
    private readonly issueModel: Model<AdminIssueDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  onChange(
    listener: (items: EscalatedItem[], fresh: EscalatedItem[]) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The current escalated items (for a screen that just opened). */
  async current(now = new Date()): Promise<EscalatedItem[]> {
    const cutoff = new Date(now.getTime() - ESCALATE_AFTER_MS);
    const [issues, providers] = await Promise.all([
      this.issueModel
        .find({
          status: { $in: UNADDRESSED_ISSUE_STATES as IssueStatus[] },
          createdAt: { $lte: cutoff },
        })
        .select('title severity createdAt')
        .sort({ createdAt: 1 })
        .limit(50)
        .lean()
        .exec(),
      this.providerModel
        .find({
          status: {
            $in: [ProviderStatus.PENDING, ProviderStatus.UNDER_REVIEW],
          },
          createdAt: { $lte: cutoff },
        })
        .select('name createdAt')
        .sort({ createdAt: 1 })
        .limit(50)
        .lean()
        .exec(),
    ]);
    return [
      ...issues.map((i) => ({
        kind: 'issue' as const,
        id: i._id.toString(),
        title: i.title,
        severity: String(i.severity ?? '').toLowerCase(),
        waitingMin: waitingMinutes((i as { createdAt?: Date }).createdAt, now),
      })),
      ...providers.map((p) => ({
        kind: 'verification' as const,
        id: p._id.toString(),
        title: `Verify ${p.name}`,
        waitingMin: waitingMinutes((p as { createdAt?: Date }).createdAt, now),
      })),
    ];
  }

  async sweep(now = new Date()): Promise<EscalatedItem[]> {
    try {
      const cutoff = new Date(now.getTime() - ESCALATE_AFTER_MS);
      const freshIssues = await this.issueModel
        .find({
          status: { $in: UNADDRESSED_ISSUE_STATES as IssueStatus[] },
          createdAt: { $lte: cutoff },
          escalatedAt: { $exists: false },
        })
        .select('_id')
        .lean()
        .exec();
      if (freshIssues.length)
        await this.issueModel
          .updateMany(
            { _id: { $in: freshIssues.map((i) => i._id) } },
            { $set: { escalatedAt: now } },
          )
          .exec();
      const items = await this.current(now);
      const freshIds = new Set(freshIssues.map((i) => i._id.toString()));
      const fresh = items.filter(
        (i) =>
          freshIds.has(i.id) ||
          (i.kind === 'verification' &&
            i.waitingMin === Math.floor(ESCALATE_AFTER_MS / 60_000)),
      );
      this.listeners.forEach((l) => l(items, fresh));
      return items;
    } catch (err) {
      this.logger.debug(`exception sweep failed: ${String(err)}`);
      return [];
    }
  }
}
