import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { OrgType } from '../rbac/partner-permissions';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerNotifySettingsService } from '../notify/partner-notify-settings.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { Ward, WardDocument } from './schemas/ward.schema';
import { CapacityScope, CapacityWard, capacityScopes } from './capacity';

/**
 * Capacity warnings (Notification Center → Alert rules): flags floor managers
 * when bed occupancy of a ward, a ward type or the whole hospital reaches the
 * thresholds the hospital set, before wards overcrowd.
 */
@Injectable()
export class PartnerCapacityService {
  private readonly logger = new Logger(PartnerCapacityService.name);

  constructor(
    @InjectModel(Ward.name) private readonly wardModel: Model<WardDocument>,
    private readonly settings: PartnerNotifySettingsService,
    private readonly notifier: PartnerNotifierService,
  ) {}

  /** Scopes at or over their threshold right now, for the bed board's warning banner. */
  async warnings(providerId: Types.ObjectId, wards?: CapacityWard[]) {
    const { scopes } = await this.evaluate(providerId, wards);
    return scopes
      .filter((s) => s.over)
      .map((s) => ({
        key: s.key,
        scope: s.rule.scope,
        label: s.label,
        wardId: s.wardId,
        occupied: s.occupied,
        total: s.total,
        percent: s.percent,
        thresholdPercent: s.rule.thresholdPercent,
      }));
  }

  /**
   * Re-evaluates occupancy after beds change and alerts each scope that has
   * just crossed its threshold. Best-effort: it never fails the admission.
   */
  async check(actor: Pick<PartnerActor, 'orgType' | 'provider'>) {
    if (actor.orgType !== OrgType.HOSPITAL) return;
    const providerId = actor.provider._id;
    try {
      const { scopes, alerting } = await this.evaluate(providerId);
      const byKey = new Map(scopes.map((s) => [s.key, s]));
      await this.settings.clearCapacityAlerts(
        providerId,
        [...alerting].filter((k) => byKey.get(k)?.rearm ?? true),
      );
      for (const s of scopes) {
        if (!s.over || alerting.has(s.key)) continue;
        if (await this.settings.markCapacityAlert(providerId, s.key))
          await this.alert(providerId, s);
      }
    } catch (err) {
      this.logger.warn(`Capacity check failed: ${String(err)}`);
    }
  }

  private async evaluate(providerId: Types.ObjectId, wards?: CapacityWard[]) {
    const [rows, state] = await Promise.all([
      wards ??
        this.wardModel
          .find({ providerId })
          .select('name type beds.status')
          .lean()
          .exec()
          .then((ws) =>
            ws.map((w) => ({
              id: w._id.toString(),
              name: w.name,
              type: w.type,
              beds: w.beds,
            })),
          ),
      this.settings.capacityState(providerId),
    ]);
    return {
      scopes: capacityScopes(state.rules, rows),
      alerting: state.alerting,
    };
  }

  private alert(providerId: Types.ObjectId, s: CapacityScope) {
    // Bed counts and ward names only, so the email/SMS text carries no patient detail.
    return this.notifier.emit(providerId, {
      trigger: PartnerTrigger.CAPACITY_WARNING,
      title: `Capacity warning: ${s.label} at ${s.percent}%`,
      message: `${s.occupied} of ${s.total} beds occupied, ${s.total - s.occupied} free — at or over the ${s.rule.thresholdPercent}% warning level.`,
      safeMessage: `Capacity warning: ${s.label} is at ${s.percent}% (${s.occupied} of ${s.total} beds occupied).`,
      route: '/partner/wards',
      data: {
        scope: s.rule.scope,
        label: s.label,
        wardId: s.wardId,
        occupied: s.occupied,
        total: s.total,
        percent: s.percent,
        thresholdPercent: s.rule.thresholdPercent,
      },
    });
  }
}
