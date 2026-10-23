/** Whole years between a date of birth and `now` (UTC calendar dates). */
export function ageFromDateOfBirth(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type AgeSource = 'dob' | 'self_reported' | 'missing';

/**
 * The age to show for a patient: from their date of birth when known (so it
 * stays right after birthdays), else a self-reported age from older app
 * builds. A self-reported 0 is what a skipped age field used to save, so it
 * counts as missing rather than a newborn.
 */
export function patientAge(profile?: { dateOfBirth?: Date | null; age?: number | null } | null): {
  age?: number;
  source: AgeSource;
} {
  if (profile?.dateOfBirth) {
    return { age: ageFromDateOfBirth(profile.dateOfBirth), source: 'dob' };
  }
  if (profile?.age && profile.age > 0) return { age: profile.age, source: 'self_reported' };
  return { source: 'missing' };
}
