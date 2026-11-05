import { composeBrief, pickLabs } from './patient-brief';

describe('patient summary paragraph', () => {
  it('puts flagged results first, then key tests, latest value only', () => {
    const labs = pickLabs([
      {
        parameter: 'Serum calcium',
        unit: 'mg/dL',
        points: [{ at: '2026-10-01T05:00:00Z', value: 9.4, flag: 'normal' }],
      },
      {
        parameter: 'HbA1c',
        unit: '%',
        points: [
          { at: '2026-06-01T05:00:00Z', value: 7.1, flag: 'high' },
          { at: '2026-10-02T05:00:00Z', value: 8.2, flag: 'high' },
        ],
      },
      {
        parameter: 'Creatinine',
        unit: 'mg/dL',
        points: [{ at: '2026-10-02T05:00:00Z', value: 1.0, flag: 'normal' }],
      },
    ]);
    expect(labs.map((l) => `${l.parameter} ${l.value}`)).toEqual([
      'HbA1c 8.2',
      'Creatinine 1',
      'Serum calcium 9.4',
    ]);
  });

  it('writes one traceable paragraph', () => {
    const text = composeBrief({
      name: 'Asha Verma',
      age: 58,
      gender: 'female',
      conditions: [
        {
          label: 'Type 2 diabetes mellitus',
          since: new Date('2026-03-12T06:00:00Z'),
          source: 'diagnosed',
        },
        { label: 'Atrial fibrillation', source: 'patient' },
        { label: 'type 2 diabetes mellitus', source: 'patient' },
      ],
      admission: null,
      lastVisit: {
        at: new Date('2026-10-20T06:00:00Z'),
        by: 'Dr Rao',
        summary: 'Uncontrolled diabetes; metformin increased',
      },
      medications: ['Metformin 1 g', 'Warfarin 5 mg'],
      labs: [
        {
          parameter: 'HbA1c',
          value: 8.2,
          unit: '%',
          flag: 'high',
          at: new Date('2026-10-02T05:00:00Z'),
        },
      ],
    });
    expect(text).toBe(
      'Asha Verma, 58-year-old woman. Known conditions: Type 2 diabetes mellitus (since 12 Mar 2026) and Atrial fibrillation (patient-reported). Last visit 20 Oct 2026 with Dr Rao: Uncontrolled diabetes; metformin increased. Active medicines: Metformin 1 g and Warfarin 5 mg. Latest results: HbA1c 8.2 % (high, 2 Oct 2026).',
    );
  });

  it('says plainly when there is nothing on record', () => {
    expect(
      composeBrief({
        name: 'New Patient',
        conditions: [],
        medications: [],
        labs: [],
      }),
    ).toBe(
      'New Patient. No diagnoses or conditions on record. No active prescriptions from your organisation.',
    );
  });
});
