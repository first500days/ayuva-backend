import { parseMedication, structureConsultation } from './scribe-structurer';

const LABELLED = `C/O: Fever and sore throat x 3 days
H/O: Known hypertensive on Tab Amlodipine 5 mg OD. No drug allergies.
O/E: Temp 100.4 F, BP 130/80, pulse 96, SpO2 98%. Throat congested, chest clear.
Impression: Acute pharyngitis
Rx:
Tab Paracetamol 650 mg 1-0-1 x 3 days after food
Cap Amoxicillin 500mg TDS x 5 days
Betadine gargles twice daily
Advice: Warm saline gargles, plenty of fluids
Review after 5 days or earlier if fever persists`;

const DICTATED =
  'Patient complains of headache since 2 days. BP 150/90. Likely tension headache. ' +
  'Advised CBC and lipid profile. Tab Paracetamol 500 mg SOS. Follow up in 1 week.';

describe('AYUVA Scribe structurer (mock)', () => {
  it('sorts a labelled note into sections, vitals and prescription lines', () => {
    const r = structureConsultation(LABELLED);
    expect(r.sections.chiefComplaint).toBe('Fever and sore throat x 3 days');
    expect(r.sections.history).toContain(
      'Known hypertensive on Tab Amlodipine 5 mg OD.',
    );
    expect(r.sections.history).toContain('No drug allergies.');
    expect(r.sections.examination).toContain('Throat congested, chest clear.');
    expect(r.sections.assessment).toBe('Acute pharyngitis');
    expect(r.sections.advice).toBe('Warm saline gargles, plenty of fluids');
    expect(r.sections.followUp).toBe(
      'Review after 5 days or earlier if fever persists',
    );
    expect(r.vitals).toEqual({
      temperature: '100.4 °F',
      bp: '130/80 mmHg',
      pulse: '96 /min',
      spo2: '98%',
    });

    expect(r.medications).toHaveLength(3);
    expect(r.medications[0]).toMatchObject({
      form: 'Tablet',
      medicine: 'Paracetamol',
      strength: '650 mg',
      frequency: '1-0-1',
      duration: '3 days',
      instructions: 'after food',
    });
    expect(r.medications[1]).toMatchObject({
      form: 'Capsule',
      medicine: 'Amoxicillin',
      strength: '500mg',
      frequency: 'tds',
      duration: '5 days',
    });
    expect(r.medications[2]).toMatchObject({
      medicine: 'Betadine gargles',
      frequency: 'twice daily',
    });
    expect(r.medications[2].form).toBeUndefined();
  });

  it('classifies free dictation without headings', () => {
    const r = structureConsultation(DICTATED);
    expect(r.sections.chiefComplaint).toBe(
      'Patient complains of headache since 2 days.',
    );
    expect(r.sections.examination).toBe('BP 150/90.');
    expect(r.sections.assessment).toBe('Likely tension headache.');
    expect(r.sections.plan).toBe('Advised CBC and lipid profile.');
    expect(r.sections.followUp).toBe('Follow up in 1 week.');
    expect(r.medications).toEqual([
      expect.objectContaining({
        form: 'Tablet',
        medicine: 'Paracetamol',
        strength: '500 mg',
        frequency: 'sos',
      }),
    ]);
    expect(r.investigations).toEqual(['CBC', 'Lipid profile']);
  });

  it('never invents content: every structured line is taken from the input', () => {
    for (const input of [LABELLED, DICTATED]) {
      const r = structureConsultation(input);
      const lines = (Object.values(r.sections) as string[])
        .flatMap((s) => s.split('\n'))
        .filter(Boolean);
      for (const line of lines) expect(input).toContain(line);
      for (const m of r.medications) expect(input).toContain(m.medicine);
    }
  });

  it('returns empty sections for empty input', () => {
    const r = structureConsultation('   ');
    expect(Object.values(r.sections).every((s) => s === '')).toBe(true);
    expect(r.medications).toEqual([]);
  });

  it('parses common Indian prescription shorthand', () => {
    expect(parseMedication('Syp Ascoril 5 ml TDS x 5 days')).toMatchObject({
      form: 'Syrup',
      medicine: 'Ascoril',
      strength: '5 ml',
      frequency: 'tds',
      duration: '5 days',
    });
    expect(
      parseMedication('Tab. Pantoprazole 40mg OD before breakfast for 2 weeks'),
    ).toMatchObject({
      form: 'Tablet',
      medicine: 'Pantoprazole',
      strength: '40mg',
      frequency: 'od',
      duration: '2 weeks',
      instructions: 'before breakfast',
    });
    expect(parseMedication('Inj Ceftriaxone 1 g IV BD x 3 days')).toMatchObject(
      {
        form: 'Injection',
        medicine: 'Ceftriaxone',
        strength: '1 g',
        route: 'IV',
        frequency: 'bd',
      },
    );
    expect(parseMedication('Paracetamol 500 mg')).toBeNull();
  });
});
