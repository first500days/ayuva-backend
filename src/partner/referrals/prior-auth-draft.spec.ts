import { draftPriorAuth } from './prior-auth-draft';

describe('draftPriorAuth', () => {
  it('finds coded conditions and procedures with the words it matched', () => {
    const d = draftPriorAuth(
      [
        {
          label: 'Referral reason',
          text: 'Known HTN with unstable angina, planned for CAG ± angioplasty',
        },
        {
          label: 'Latest signed note',
          text: 'Type 2 diabetes on metformin. ECG changes.',
        },
      ],
      {
        admission: true,
        payer: 'Star Health',
        policyNumber: 'P-1',
        estimatedAmount: 180000,
      },
    );
    const codes = d.diagnoses.map((x) => x.icd11);
    expect(codes).toContain('BA00'); // hypertension, via "HTN"
    expect(codes).toContain('BA40'); // angina
    expect(d.diagnoses.find((x) => x.icd11 === 'BA40')!.evidence).toContain(
      'Referral reason',
    );
    expect(d.procedures.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        'Coronary angiography',
        'Coronary angioplasty (PTCA) with stent',
      ]),
    );
    expect(d.suggestedStayDays).toBe(3);
    expect(d.missing).toEqual([]);
  });

  it('ignores short abbreviations written in lower case inside prose', () => {
    const d = draftPriorAuth(
      [
        {
          label: 'Clinical summary',
          text: 'Seen after lunch; bp not recorded, af of note',
        },
      ],
      { admission: false },
    );
    expect(d.diagnoses.map((x) => x.icd11)).not.toContain('BC81.3');
    expect(d.diagnoses.map((x) => x.icd11)).not.toContain('BA00');
  });

  it('lists what the desk still has to add', () => {
    const d = draftPriorAuth([{ label: 'Referral reason', text: 'Review' }], {
      admission: true,
    });
    expect(d.diagnoses).toEqual([]);
    expect(d.suggestedStayDays).toBe(1);
    expect(d.missing).toEqual([
      'A coded diagnosis (none was found in the notes)',
      'Insurer / TPA',
      'Policy or member ID',
      'Estimated cost',
    ]);
  });
});
