import { CapacityRuleConfig } from '../notify/partner-triggers';
import { BedStatus } from './schemas/ward.schema';

/**
 * After alerting, a scope re-arms only once occupancy falls this many points
 * under the threshold, so one bed changing hands at the limit doesn't re-alert.
 */
export const CAPACITY_REARM_GAP = 5;

const TYPE_SCOPE_LABEL: Record<string, string> = {
  general: 'General wards',
  icu: 'ICU',
  private: 'Private rooms',
  semi_private: 'Semi-private rooms',
  emergency: 'Emergency',
  maternity: 'Maternity',
  paediatric: 'Pediatrics',
};

export interface CapacityWard {
  id: string;
  name: string;
  type: string;
  beds: { status: BedStatus }[];
}

export interface CapacityScope {
  /** Rule id + what it measures, e.g. "icu|type:icu" or "any-ward|ward:<id>". */
  key: string;
  rule: CapacityRuleConfig;
  label: string;
  wardId: string | null;
  occupied: number;
  total: number;
  /** Rounded, for display. */
  percent: number;
  /** Occupancy has reached the rule's threshold. */
  over: boolean;
  /** Far enough under the threshold to alert again on the next crossing. */
  rearm: boolean;
}

/** Bed occupancy of every enabled rule's scope: each ward, a ward type, or the whole hospital. */
export function capacityScopes(
  rules: CapacityRuleConfig[],
  wards: CapacityWard[],
): CapacityScope[] {
  const out: CapacityScope[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const groups =
      rule.scope === 'each_ward'
        ? wards.map((w) => ({
            key: `ward:${w.id}`,
            label: w.name,
            wardId: w.id,
            wards: [w],
          }))
        : rule.scope === 'hospital'
          ? [{ key: 'hospital', label: 'All wards', wardId: null, wards }]
          : [
              {
                key: `type:${rule.scope}`,
                label: TYPE_SCOPE_LABEL[rule.scope] ?? rule.scope,
                wardId: null,
                wards: wards.filter((w) => w.type === rule.scope),
              },
            ];
    for (const g of groups) {
      const beds = g.wards.flatMap((w) => w.beds);
      const total = beds.length;
      if (!total) continue;
      const occupied = beds.filter(
        (b) => b.status === BedStatus.OCCUPIED,
      ).length;
      out.push({
        key: `${rule.id}|${g.key}`,
        rule,
        label: g.label,
        wardId: g.wardId,
        occupied,
        total,
        percent: Math.round((occupied / total) * 100),
        // Integer maths, so 19 of 20 beds is exactly 95%.
        over: occupied * 100 >= rule.thresholdPercent * total,
        rearm:
          occupied * 100 < (rule.thresholdPercent - CAPACITY_REARM_GAP) * total,
      });
    }
  }
  return out;
}
