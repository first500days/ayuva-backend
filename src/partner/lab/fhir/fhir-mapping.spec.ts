import {
  indexBundle,
  mapObservation,
  mapObservations,
  mapReports,
  nextPage,
} from './fhir-mapping';

const GLUCOSE = {
  resourceType: 'Observation',
  id: 'obs1',
  code: {
    coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose' }],
    text: 'Glucose, serum',
  },
  valueQuantity: { value: 126, unit: 'mg/dL' },
  referenceRange: [{ low: { value: 70 }, high: { value: 110 } }],
  interpretation: [{ coding: [{ code: 'H' }] }],
  effectiveDateTime: '2026-11-08T05:00:00Z',
};

const bundle = (...entries: Record<string, unknown>[]) => ({
  resourceType: 'Bundle',
  entry: entries.map((resource) => ({ resource })),
});

describe('mapObservation', () => {
  it('reads a numeric result with its range and flag', () => {
    expect(mapObservation(GLUCOSE)).toEqual([
      {
        code: '2345-7',
        name: 'Glucose, serum',
        value: '126',
        unit: 'mg/dL',
        refLow: 70,
        refHigh: 110,
        refText: null,
        flag: 'H',
        effectiveAt: '2026-11-08T05:00:00Z',
      },
    ]);
  });

  it('keeps a comparator, and falls back to the unit code', () => {
    const [v] = mapObservation({
      code: { text: 'CRP' },
      valueQuantity: { value: 5, comparator: '<', code: 'mg/L' },
    });
    expect(v).toMatchObject({ value: '<5', unit: 'mg/L' });
  });

  it.each([
    [{ valueString: 'Positive' }, 'Positive'],
    [{ valueCodeableConcept: { text: 'Reactive' } }, 'Reactive'],
    [{ valueCodeableConcept: { coding: [{ display: 'Absent' }] } }, 'Absent'],
    [{ valueInteger: 4 }, '4'],
    [{ valueBoolean: false }, 'No'],
  ])('reads %j', (value, expected) => {
    expect(
      mapObservation({ code: { text: 'Test' }, ...value })[0].value,
    ).toBe(expected);
  });

  it('flattens components such as blood pressure', () => {
    const values = mapObservation({
      code: { text: 'Blood pressure' },
      component: [
        { code: { text: 'Systolic' }, valueQuantity: { value: 120, unit: 'mmHg' } },
        { code: { text: 'Diastolic' }, valueQuantity: { value: 80, unit: 'mmHg' } },
      ],
    });
    expect(values.map((v) => [v.name, v.value])).toEqual([
      ['Systolic', '120'],
      ['Diastolic', '80'],
    ]);
  });

  it('leaves out an observation with no value or no name', () => {
    expect(mapObservation({ code: { text: 'X' } })).toEqual([]);
    expect(mapObservation({ valueString: 'y' })).toEqual([]);
    expect(
      mapObservation({ code: { text: 'X' }, dataAbsentReason: {} }),
    ).toEqual([]);
  });

  it('keeps a printed range', () => {
    expect(
      mapObservation({
        code: { text: 'X' },
        valueString: 'a',
        referenceRange: [{ text: 'Negative' }],
      })[0].refText,
    ).toBe('Negative');
  });
});

describe('mapReports', () => {
  const report = {
    resourceType: 'DiagnosticReport',
    id: 'r1',
    status: 'final',
    code: { text: 'Metabolic panel' },
    issued: '2026-11-08T06:00:00Z',
    effectiveDateTime: '2026-11-08T05:00:00Z',
    performer: [{ display: 'City Hospital Lab' }],
    conclusion: 'High glucose.',
    result: [{ reference: 'Observation/obs1' }],
  };

  it('joins a report to the results included in the search', () => {
    const [r] = mapReports(bundle(report, GLUCOSE));
    expect(r).toMatchObject({
      id: 'r1',
      status: 'final',
      name: 'Metabolic panel',
      conclusion: 'High glucose.',
      performer: 'City Hospital Lab',
    });
    expect(r.values.map((v) => v.name)).toEqual(['Glucose, serum']);
  });

  it('follows absolute references too', () => {
    const [r] = mapReports(
      bundle(
        { ...report, result: [{ reference: 'https://h/fhir/Observation/obs1' }] },
        GLUCOSE,
      ),
    );
    expect(r.values).toHaveLength(1);
  });

  it('finds results contained inside the report', () => {
    const [r] = mapReports(
      bundle({
        ...report,
        contained: [{ ...GLUCOSE, id: 'c1' }],
        result: [{ reference: '#c1' }],
      }),
    );
    expect(r.values).toHaveLength(1);
  });

  it('skips a reference it cannot find', () => {
    expect(mapReports(bundle(report))[0].values).toEqual([]);
  });

  it('uses a plain-text report when there is no conclusion', () => {
    const [r] = mapReports(
      bundle({
        ...report,
        conclusion: undefined,
        presentedForm: [
          { contentType: 'application/pdf', data: 'AAAA' },
          {
            contentType: 'text/plain',
            data: Buffer.from('Lungs clear.').toString('base64'),
          },
        ],
      }),
    );
    expect(r.conclusion).toBe('Lungs clear.');
  });

  it('copes with an empty or malformed bundle', () => {
    expect(mapReports({ resourceType: 'Bundle' })).toEqual([]);
    expect(mapReports(null)).toEqual([]);
    expect(mapReports({ entry: 'nope' })).toEqual([]);
    expect(mapReports({ entry: [null, 3, {}] })).toEqual([]);
  });
});

describe('search helpers', () => {
  it('reads loose observations, ignoring other resources', () => {
    expect(
      mapObservations(bundle(GLUCOSE, { resourceType: 'Patient', id: 'p' })),
    ).toHaveLength(1);
  });

  it('indexes by type and id and by full URL', () => {
    const { byReference } = indexBundle({
      entry: [{ fullUrl: 'https://h/O/1', resource: GLUCOSE }],
    });
    expect(byReference.has('Observation/obs1')).toBe(true);
    expect(byReference.has('https://h/O/1')).toBe(true);
  });

  it('finds the next page', () => {
    expect(
      nextPage({
        link: [
          { relation: 'self', url: 'a' },
          { relation: 'next', url: 'b' },
        ],
      }),
    ).toBe('b');
    expect(nextPage({ link: [{ relation: 'self', url: 'a' }] })).toBeNull();
    expect(nextPage({})).toBeNull();
  });
});
