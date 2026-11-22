import { matchScore, strengthKey } from './medicine-match';

describe('medicine matching', () => {
  const para500 = {
    name: 'Paracetamol 500 mg tablet',
    genericName: 'Paracetamol',
    strength: '500 mg',
  };
  const para650 = {
    name: 'Dolo 650',
    genericName: 'Paracetamol',
    strength: '650 mg',
  };
  const amox = {
    name: 'Amoxicillin 500 mg capsule',
    genericName: 'Amoxicillin',
    strength: '500 mg',
  };

  it('matches the same medicine and strength best', () => {
    expect(matchScore('Paracetamol', '500 mg', para500)).toBe(3);
    expect(matchScore('Tab. Paracetamol 500mg', null, para500)).toBe(3);
  });

  it('matches on the generic name of a branded item', () => {
    expect(matchScore('Paracetamol', '650mg', para650)).toBe(3);
  });

  it('marks a different strength as a substitute', () => {
    expect(matchScore('Paracetamol', '650 mg', para500)).toBe(1);
  });

  it('ignores unrelated items', () => {
    expect(matchScore('Paracetamol', '500 mg', amox)).toBe(0);
    expect(matchScore('Tab', null, amox)).toBe(0);
  });

  it('normalises strengths across units', () => {
    expect(strengthKey('1 g')).toBe(strengthKey('1000 mg'));
    expect(strengthKey('250 mcg')).toBe('0.25');
    expect(strengthKey('amoxicillin 500 mg + clavulanate 125 mg')).toBe(
      '125/500',
    );
    expect(strengthKey(null)).toBeNull();
  });
});
