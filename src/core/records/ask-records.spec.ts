import { parseQuestion } from './ask-records';
import { MedicalRecordType } from './schemas/medical-record.schema';

const now = new Date('2026-11-05T10:00:00Z');

describe('parseQuestion', () => {
  it('asks for the latest record of a kind', () => {
    expect(parseQuestion('When was my last blood test?', now)).toEqual({
      kind: 'latest',
      type: MedicalRecordType.LAB_REPORT,
    });
    expect(parseQuestion('latest x-ray', now)).toEqual({
      kind: 'latest',
      type: MedicalRecordType.SCAN,
    });
    expect(parseQuestion('When did I last check my sugar?', now)).toEqual({
      kind: 'latest',
      type: MedicalRecordType.LAB_REPORT,
    });
  });

  it('asks for the first one', () => {
    expect(parseQuestion('my first vaccination', now)).toEqual({
      kind: 'earliest',
      type: MedicalRecordType.VACCINATION,
    });
  });

  it('counts, optionally over a period', () => {
    expect(parseQuestion('How many scans did I have this year?', now)).toEqual({
      kind: 'count',
      type: MedicalRecordType.SCAN,
      since: new Date('2026-01-01T00:00:00Z'),
    });
    const sixMonths = parseQuestion(
      'how many prescriptions in the last 6 months',
      now,
    );
    expect(sixMonths).toMatchObject({
      kind: 'count',
      type: MedicalRecordType.PRESCRIPTION,
    });
    expect((sixMonths as { since: Date }).since.toISOString().slice(0, 7)).toBe(
      '2026-05',
    );
  });

  it('asks for a value from the lab reports', () => {
    expect(parseQuestion('What was my TSH?', now)).toMatchObject({
      kind: 'value',
      marker: { label: 'TSH' },
    });
    expect(parseQuestion('my HbA1c', now)).toMatchObject({
      kind: 'value',
      marker: { label: 'HbA1c' },
    });
    expect(parseQuestion('how is my thyroid result', now)).toMatchObject({
      kind: 'value',
      marker: { label: 'TSH' },
    });
    expect(
      parseQuestion('What was my LDL cholesterol level', now),
    ).toMatchObject({
      kind: 'value',
      marker: { label: 'LDL cholesterol' },
    });
  });

  it('searches for anything else', () => {
    expect(parseQuestion('reports from Thyrocare', now)).toEqual({
      kind: 'search',
      words: ['thyrocare'],
      type: MedicalRecordType.LAB_REPORT,
    });
    expect(parseQuestion('Apollo knee', now)).toEqual({
      kind: 'search',
      words: ['apollo', 'knee'],
    });
  });
});
