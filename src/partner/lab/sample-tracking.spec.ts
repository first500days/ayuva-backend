import { labelCode, labelTypes } from './sample-tracking';

describe('sample tracking', () => {
  it('makes short, order-derived vial codes', () => {
    expect(labelCode('LAB-261105-A1B2', 1)).toBe('261105A1B2-1');
    expect(labelCode('LAB-261105-A1B2', 10)).toBe('261105A1B2-10');
    expect(labelCode('WALKIN-7', 2)).toBe('WALKIN-7-2');
  });

  it('labels one vial per sample type', () => {
    expect(
      labelTypes([
        { sampleType: 'Serum' },
        { sampleType: 'EDTA whole blood' },
        { sampleType: ' Serum ' },
      ]),
    ).toEqual(['Serum', 'EDTA whole blood']);
    expect(labelTypes([{ sampleType: null }, {}])).toEqual(['Sample']);
  });
});
