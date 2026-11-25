import { chargeMoney } from './partner-charges.service';

describe('chargeMoney', () => {
  it('multiplies, adds GST and rounds to paise', () => {
    expect(chargeMoney(1500, 3, 0)).toEqual({
      amount: 4500,
      tax: 0,
      total: 4500,
    });
    expect(chargeMoney(12.35, 3, 12)).toEqual({
      amount: 37.05,
      tax: 4.45,
      total: 41.5,
    });
  });

  it('handles fractional quantities (e.g. half a day)', () => {
    expect(chargeMoney(999.99, 0.5, 5)).toEqual({
      amount: 500,
      tax: 25,
      total: 525,
    });
  });
});
