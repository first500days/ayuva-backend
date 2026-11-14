/**
 * Features a subscription tier can switch off, from the Admin Panel, without
 * a redeploy. A plan lists only what it turns OFF, so a plan nobody has
 * configured keeps everything on. The app and the Partner Portal read the
 * signed-in person's (or organisation owner's) plan and show an upgrade
 * prompt over a switched-off screen instead of the screen.
 */
export const FEATURE_FLAGS = {
  // Patient app
  family_profiles: { label: 'Family profiles', audience: 'app' },
  ai_simplifier: { label: 'Simplify & Explain My Scan', audience: 'app' },
  lab_trends: { label: 'Lab trend gauges', audience: 'app' },
  prep_pack: { label: 'Prep Pack', audience: 'app' },
  // Partner Portal
  partner_analytics: {
    label: 'Analytics & staffing forecast',
    audience: 'partner',
  },
  partner_ai_scribe: {
    label: 'AYUVA Scribe & coding assistant',
    audience: 'partner',
  },
  partner_imaging_insights: { label: 'Imaging insights', audience: 'partner' },
} as const satisfies Record<
  string,
  { label: string; audience: 'app' | 'partner' }
>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const ALL_FEATURE_FLAGS = Object.keys(FEATURE_FLAGS) as FeatureFlag[];

/** For each switched-off feature, the cheapest active plan that has it on. */
export function upgradesFor(
  disabled: readonly string[],
  plans: {
    tier: string;
    name: string;
    priceMonthly: number;
    active?: boolean;
    disabledFeatures?: string[];
  }[],
): Record<string, { tier: string; name: string }> {
  const sorted = [...plans]
    .filter((p) => p.active !== false)
    .sort((a, b) => a.priceMonthly - b.priceMonthly);
  const out: Record<string, { tier: string; name: string }> = {};
  for (const f of disabled) {
    const p = sorted.find((x) => !(x.disabledFeatures ?? []).includes(f));
    if (p) out[f] = { tier: p.tier, name: p.name };
  }
  return out;
}
