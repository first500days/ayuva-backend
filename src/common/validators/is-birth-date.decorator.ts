import { registerDecorator, ValidationOptions } from 'class-validator';
import { ageFromDateOfBirth } from '../utils/age.util';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AGE_YEARS = 120;

/**
 * A real calendar date (YYYY-MM-DD) that is not in the future and no more
 * than 120 years ago — the age the platform shows is derived from it.
 */
export function IsBirthDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBirthDate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a real date (YYYY-MM-DD) in the past, within ${MAX_AGE_YEARS} years`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
          const date = new Date(`${value}T00:00:00.000Z`);
          // Rejects rollovers such as 2026-02-30 becoming 2 March.
          if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
          if (date.getTime() > Date.now()) return false;
          return ageFromDateOfBirth(date) <= MAX_AGE_YEARS;
        },
      },
    });
  };
}
