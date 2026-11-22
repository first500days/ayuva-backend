import { upgradesFor } from './feature-flags';

describe('upgradesFor', () => {
  const plans = [
    {
      tier: 'enterprise',
      name: 'Enterprise',
      priceMonthly: 999,
      disabledFeatures: [],
    },
    {
      tier: 'free',
      name: 'Free',
      priceMonthly: 0,
      disabledFeatures: ['lab_trends', 'partner_analytics'],
    },
    {
      tier: 'premium',
      name: 'Premium',
      priceMonthly: 299,
      disabledFeatures: ['partner_analytics'],
    },
  ];

  it('points each switched-off feature at the cheapest plan that has it', () => {
    expect(upgradesFor(['lab_trends', 'partner_analytics'], plans)).toEqual({
      lab_trends: { tier: 'premium', name: 'Premium' },
      partner_analytics: { tier: 'enterprise', name: 'Enterprise' },
    });
  });

  it('skips inactive plans and features no plan offers', () => {
    expect(
      upgradesFor(
        ['prep_pack'],
        [
          {
            tier: 'free',
            name: 'Free',
            priceMonthly: 0,
            active: false,
            disabledFeatures: [],
          },
        ],
      ),
    ).toEqual({});
  });
});
