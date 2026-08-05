import { registerDecorator, ValidationOptions } from 'class-validator';

// PRD FR-1.4: minimum-strength validation — at least 8 chars, mixing letters and numbers.
const STRONG_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'password must be at least 8 characters and include both letters and numbers',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' && STRONG_PASSWORD_PATTERN.test(value)
          );
        },
      },
    });
  };
}
