import { estimateFee } from './insurance-estimate';

const panel = [
  { insurer: 'Star Health', cashless: true, opdCovered: true, copayPct: 20 },
  { insurer: 'HDFC ERGO', cashless: false, opdCovered: true, copayPct: 10 },
  { insurer: 'CGHS', cashless: true, opdCovered: false },
];

describe('estimateFee', () => {
  it('cashless with co-pay: pays only the co-pay', () => {
    expect(estimateFee(800, 'Star Health', panel)).toMatchObject({
      payAtVisit: 160,
      claimBack: 0,
      outOfPocket: 160,
      onPanel: true,
    });
  });

  it('reimbursement: pays the fee, claims the rest back', () => {
    expect(estimateFee(800, 'hdfc ergo', panel)).toMatchObject({
      payAtVisit: 800,
      claimBack: 720,
      outOfPocket: 80,
    });
  });

  it('accepted but OPD not covered, or not on the panel: full fee', () => {
    expect(estimateFee(800, 'CGHS', panel)).toMatchObject({
      outOfPocket: 800,
      onPanel: true,
    });
    expect(estimateFee(800, 'Niva Bupa', panel)).toMatchObject({
      outOfPocket: 800,
      onPanel: false,
    });
  });

  it('has nothing to say without a fee', () => {
    expect(estimateFee(undefined, 'Star Health', panel)).toBeNull();
  });
});
