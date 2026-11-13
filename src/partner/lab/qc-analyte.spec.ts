import { sameAnalyte } from './partner-qc.service';

describe('sameAnalyte', () => {
  it('matches a control to the report parameters it covers', () => {
    expect(sameAnalyte('Glucose', 'Glucose')).toBe(true);
    expect(sameAnalyte('Glucose', 'Glucose, fasting')).toBe(true);
    expect(sameAnalyte('HbA1c', 'HbA1c (glycated haemoglobin)')).toBe(true);
    expect(sameAnalyte('Creatinine', 'Serum creatinine')).toBe(true);
  });

  it('does not hold unrelated tests', () => {
    expect(sameAnalyte('Glucose', 'Cholesterol')).toBe(false);
    expect(sameAnalyte('Na', 'Haemoglobin')).toBe(false);
    expect(sameAnalyte('', 'Glucose')).toBe(false);
  });
});
