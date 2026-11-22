import { parseCv } from './cv-parse';

const CV = `Dr. Anita Rao
Consultant Cardiologist
MBBS (Bangalore Medical College), MD (General Medicine), DM (Cardiology)
KMC Reg. No. 54321
Professional experience
Senior Consultant, City Heart Hospital 2015 - Present
Registrar, St Johns 2011 - 2015
Languages: English, Kannada, Hindi`;

describe('parseCv', () => {
  const now = new Date('2026-11-14T00:00:00Z');

  it('reads degrees, specialty, registration and languages with their source lines', () => {
    const r = parseCv(CV, now);
    expect(r.textRead).toBe(true);
    expect(r.qualifications.map((q) => q.value)).toEqual(['MBBS', 'MD', 'DM']);
    expect(r.specialty.map((s) => s.value)).toEqual(
      expect.arrayContaining(['Cardiology', 'General Medicine']),
    );
    expect(r.registrationNumber?.value).toBe('54321');
    expect(r.languages.map((l) => l.value)).toEqual([
      'English',
      'Hindi',
      'Kannada',
    ]);
    expect(r.qualifications[0].from).toContain('Bangalore Medical College');
  });

  it('works out experience from the earliest role when no years are stated', () => {
    expect(parseCv(CV, now).experienceYears).toEqual({
      value: 15,
      from: 'Registrar, St Johns 2011 - 2015',
    });
  });

  it('prefers stated years of experience', () => {
    expect(
      parseCv('MBBS\n12+ years of clinical experience in ENT', now)
        .experienceYears?.value,
    ).toBe(12);
  });

  it('returns nothing it cannot read', () => {
    const r = parseCv('', now);
    expect(r).toEqual({
      textRead: false,
      qualifications: [],
      specialty: [],
      experienceYears: null,
      registrationNumber: null,
      languages: [],
    });
  });
});
