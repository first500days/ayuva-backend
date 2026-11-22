import { longestLengthMm, regionOf, synthesise } from './imaging-synthesis';

const study = new Date('2026-11-10T10:00:00Z');
const daysFrom = (n: number) => new Date(study.getTime() + n * 86_400_000);

describe('imaging + lab synthesis', () => {
  it('works out the body region from test and series names', () => {
    expect(regionOf(['CT Chest (HRCT)'])).toBe('chest');
    expect(regionOf(['MRI Brain plain'])).toBe('head');
    expect(regionOf(['USG Whole Abdomen'])).toBe('abdomen');
    expect(regionOf(['X-ray Knee AP/LAT'])).toBe('spine_msk');
    expect(regionOf(['CT Coronary angiography'])).toBe('cardiac');
    expect(regionOf([null, 'Series 1'])).toBe('general');
  });

  it('flags a raised D-dimer beside a chest CT and kidney function before contrast', () => {
    const s = synthesise({
      region: 'chest',
      modality: 'CT',
      studyAt: study,
      studyLabel: 'CT Chest · LAB-261110-AB12',
      labs: [
        {
          test: 'D-Dimer',
          name: 'D-Dimer',
          value: '2.1',
          unit: 'µg/mL FEU',
          flag: 'high',
          at: daysFrom(-1),
        },
        {
          test: 'Renal Function Test',
          name: 'Creatinine',
          value: '2.4',
          unit: 'mg/dL',
          flag: 'high',
          at: daysFrom(-3),
        },
        {
          test: 'CBC',
          name: 'Haemoglobin',
          value: '13.5',
          unit: 'g/dL',
          flag: 'normal',
          at: daysFrom(-1),
        },
        {
          test: 'Lipid profile',
          name: 'LDL',
          value: '190',
          unit: 'mg/dL',
          flag: 'high',
          at: daysFrom(-2),
        },
      ],
      measurements: [],
    });
    const titles = s.alerts.map((a) => a.title);
    expect(titles[0]).toMatch(/contrast safety/);
    expect(titles.some((t) => t.startsWith('D-Dimer 2.1'))).toBe(true);
    // LDL isn't part of the chest panel, so it's not raised against a chest CT.
    expect(titles.some((t) => t.startsWith('LDL'))).toBe(false);
    expect(s.related.map((r) => r.name)).toEqual(
      expect.arrayContaining(['D-Dimer', 'Creatinine', 'Haemoglobin']),
    );
  });

  it('reads a measured lesion together with a raised tumour marker', () => {
    expect(
      longestLengthMm([
        { tool: 'Length', value: '2.3 cm' },
        { tool: 'Length', value: '8 mm' },
      ]),
    ).toBe(23);
    const s = synthesise({
      region: 'abdomen',
      modality: 'CT',
      studyAt: study,
      studyLabel: 'CECT Abdomen',
      labs: [
        {
          test: 'CEA',
          name: 'CEA',
          value: '9.8',
          unit: 'ng/mL',
          flag: 'high',
          at: daysFrom(-5),
        },
      ],
      measurements: [{ tool: 'Length', value: '23.4 mm' }],
    });
    expect(s.alerts[0].title).toBe(
      'Measured 23.4 mm on the images with a raised CEA',
    );
  });

  it('puts critical values first and says so when nothing is out of range', () => {
    const critical = synthesise({
      region: 'head',
      modality: 'MR',
      studyAt: study,
      studyLabel: 'MRI Brain',
      labs: [
        {
          test: 'Electrolytes',
          name: 'Potassium',
          value: '6.9',
          unit: 'mmol/L',
          flag: 'critical_high',
          at: daysFrom(1),
        },
      ],
      measurements: [],
    });
    expect(critical.alerts[0]).toMatchObject({
      level: 'critical',
      title: 'Critical value: Potassium 6.9 mmol/L',
    });

    const quiet = synthesise({
      region: 'chest',
      modality: 'DX',
      studyAt: study,
      studyLabel: 'X-ray Chest',
      labs: [
        {
          test: 'CBC',
          name: 'Haemoglobin',
          value: '14',
          unit: 'g/dL',
          flag: 'normal',
          at: daysFrom(-40),
        },
      ],
      measurements: [],
    });
    expect(quiet.alerts).toHaveLength(1);
    expect(quiet.alerts[0].title).toBe(
      'No lab results within 30 days of this study',
    );
  });
});
