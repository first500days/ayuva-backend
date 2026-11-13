import { pickForShift, weeklyHours } from './staffing-forecast';

const tech = (name: string, blocks: [string, string, string][]) => ({
  name,
  dutySchedule: blocks.map(([day, start, end]) => ({ day, start, end })),
});

describe('pickForShift', () => {
  const staff = [
    tech('Busy', [
      ['mon', '08:00', '16:00'],
      ['tue', '08:00', '16:00'],
    ]),
    tech('Light', [['wed', '09:00', '12:00']]),
    tech('OnAlready', [['mon', '09:00', '11:00']]),
    tech('Free', []),
  ];

  it('skips anyone already rostered in the window and prefers light loads', () => {
    const picked = pickForShift(staff, 0, '10:00', '13:00', 2).map(
      (s) => s.name,
    );
    expect(picked).toEqual(['Free', 'Light']);
  });

  it('allows back-to-back shifts and caps at the count', () => {
    expect(
      pickForShift(staff, 0, '16:00', '18:00', 5).map((s) => s.name),
    ).toEqual(['Free', 'OnAlready', 'Light', 'Busy']);
    expect(pickForShift(staff, 0, '16:00', '18:00', 0)).toEqual([]);
  });

  it('counts weekly hours', () => {
    expect(weeklyHours(staff[0].dutySchedule)).toBe(16);
    expect(weeklyHours([{ day: 'mon', start: '09:30', end: '12:00' }])).toBe(
      2.5,
    );
  });
});
