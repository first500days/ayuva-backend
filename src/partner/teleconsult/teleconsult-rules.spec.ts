import { prohibitedForTeleconsult } from './teleconsult-rules';

describe('prohibitedForTeleconsult', () => {
  it('finds Schedule X and NDPS medicines as whole words', () => {
    const out = prohibitedForTeleconsult([
      { medicine: 'Paracetamol' },
      { medicine: 'Tab Alprazolam' },
      { medicine: 'Tramadol + Paracetamol' },
      { medicine: 'Methylphenidate SR' },
    ]);
    expect(out.map((o) => [o.line, o.matched])).toEqual([
      [1, 'alprazolam'],
      [2, 'tramadol'],
      [3, 'methylphenidate'],
    ]);
  });

  it('does not match inside other words', () => {
    expect(
      prohibitedForTeleconsult([{ medicine: 'Morphinex-free syrup' }]),
    ).toEqual([]);
    expect(prohibitedForTeleconsult([{ medicine: 'Pantoprazole' }])).toEqual(
      [],
    );
  });
});
