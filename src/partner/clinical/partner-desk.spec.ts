import { hospitalPrefix } from './partner-desk.service';

describe('hospitalPrefix', () => {
  it('takes the initials of the organisation name', () => {
    expect(hospitalPrefix('Orange Blood Hospital')).toBe('OBH');
    expect(hospitalPrefix('St. Thomas Wing & Clinic Bengaluru')).toBe('STW');
  });

  it('skips words without letters and falls back to PT', () => {
    // "24x7" keeps only its letter: x.
    expect(hospitalPrefix('24x7 Care')).toBe('XC');
    expect(hospitalPrefix('123 456')).toBe('PT');
  });
});
