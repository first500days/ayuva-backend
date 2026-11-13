import { autoTags } from './auto-tags';

describe('autoTags', () => {
  it('tags a document with its facility, doctor, procedure and year', () => {
    expect(
      autoTags({
        providerName: 'Apollo Diagnostics',
        attendingPhysician: 'Anita Rao',
        procedureType: 'Lipid Profile',
        recordDate: new Date('2026-10-02T00:00:00Z'),
      }),
    ).toEqual(['apollo diagnostics', 'dr anita rao', 'lipid profile', '2026']);
  });

  it('keeps the patient’s own tags first and does not repeat', () => {
    expect(
      autoTags({
        existing: ['diabetes'],
        providerName: 'Diabetes',
        attendingPhysician: 'Dr. Mehta',
      }),
    ).toEqual(['diabetes', 'dr. mehta']);
  });

  it('adds nothing when nothing was read', () => {
    expect(autoTags({})).toEqual([]);
  });
});
