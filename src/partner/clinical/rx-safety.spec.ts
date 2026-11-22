import { blocksSigning, checkPrescription, ingredientsOf } from './rx-safety';

const rx = (...medicines: string[]) =>
  medicines.map((medicine) => ({ medicine }));

describe('prescription safety checks', () => {
  it('resolves brands and generics to ingredients', () => {
    expect(ingredientsOf('Tab. Dolo 650')).toEqual(['paracetamol']);
    expect(ingredientsOf('Augmentin 625 Duo').sort()).toEqual([
      'amoxicillin',
      'clavulanic acid',
    ]);
    expect(ingredientsOf('Combiflam').sort()).toEqual([
      'ibuprofen',
      'paracetamol',
    ]);
    expect(ingredientsOf('Pantoprazole 40mg')).toEqual(['pantoprazole']);
    expect(ingredientsOf('Telma-H')).toEqual([
      'telmisartan',
      'hydrochlorothiazide',
    ]);
    expect(ingredientsOf('Vitamin D3 sachet')).toEqual([]);
  });

  it('blocks a penicillin for a penicillin-allergic patient, by brand too', () => {
    const r = checkPrescription({
      items: rx('Augmentin 625'),
      allergies: ['Penicillin'],
      activeMedicines: [],
    });
    expect(r.warnings[0]).toMatchObject({
      severity: 'contraindicated',
      kind: 'allergy',
      lines: [0],
    });
  });

  it('treats an allergy to one penicillin as the whole family, and warns on cephalosporins', () => {
    const r = checkPrescription({
      items: rx('Ampicillin 500', 'Cefixime 200'),
      allergies: ['amoxicillin (rash)'],
      activeMedicines: [],
    });
    expect(r.warnings.map((w) => [w.severity, w.lines[0]])).toEqual([
      ['contraindicated', 0],
      ['major', 1],
    ]);
  });

  it('flags sulfa and NSAID allergies', () => {
    const sulfa = checkPrescription({
      items: rx('Septran DS'),
      allergies: ['Sulfa drugs'],
      activeMedicines: [],
    });
    expect(sulfa.warnings[0].severity).toBe('contraindicated');
    const nsaid = checkPrescription({
      items: rx('Brufen 400'),
      allergies: ['Aspirin'],
      activeMedicines: [],
    });
    expect(nsaid.warnings[0]).toMatchObject({
      severity: 'major',
      kind: 'allergy',
    });
  });

  it('finds duplicate paracetamol across brands', () => {
    const r = checkPrescription({
      items: rx('Dolo 650', 'Combiflam'),
      allergies: [],
      activeMedicines: [],
    });
    expect(r.warnings[0]).toMatchObject({
      kind: 'duplicate',
      severity: 'major',
      lines: [0, 1],
    });
    expect(r.warnings[0].message).toMatch(/paracetamol/);
  });

  it('checks against active medicines', () => {
    const r = checkPrescription({
      items: rx('Brufen 400'),
      allergies: [],
      activeMedicines: [
        { medicine: 'Warfarin 5 mg', source: 'RX-1 by Dr Rao' },
      ],
    });
    expect(r.warnings[0]).toMatchObject({
      kind: 'interaction',
      severity: 'major',
      lines: [0],
    });
    expect(r.warnings[0].with).toMatch(/Warfarin/);
  });

  it('knows contraindicated pairs', () => {
    const r = checkPrescription({
      items: rx('Sildenafil 50', 'Isosorbide mononitrate 30'),
      allergies: [],
      activeMedicines: [],
    });
    expect(r.warnings[0].severity).toBe('contraindicated');
    expect(blocksSigning(r.warnings[0])).toBe(true);
  });

  it('reports a same-class pair once, as a duplicate', () => {
    const r = checkPrescription({
      items: rx('Sertraline 50', 'Escitalopram 10'),
      allergies: [],
      activeMedicines: [],
    });
    expect(
      r.warnings.filter((w) => w.lines.join() === '0,1').map((w) => w.kind),
    ).toEqual(['duplicate']);
  });

  it('stays quiet for a safe prescription and lists what it does not know', () => {
    const r = checkPrescription({
      items: rx('Paracetamol 650', 'Pantoprazole 40', 'Zincovit'),
      allergies: ['Dust'],
      activeMedicines: [],
    });
    expect(r.warnings).toEqual([]);
    expect(r.unrecognised).toEqual([2]);
  });

  it('lets moderate warnings through without acknowledgement', () => {
    const r = checkPrescription({
      items: rx('Clopidogrel 75', 'Omeprazole 20'),
      allergies: [],
      activeMedicines: [],
    });
    expect(r.warnings[0].severity).toBe('moderate');
    expect(blocksSigning(r.warnings[0])).toBe(false);
  });
});
