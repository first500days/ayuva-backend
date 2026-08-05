import { validate } from 'class-validator';
import { IsStrongPassword } from './is-strong-password.decorator';

class Dummy {
  @IsStrongPassword()
  password: string;
}

async function errorsFor(password: string) {
  const dto = new Dummy();
  dto.password = password;
  return validate(dto);
}

describe('IsStrongPassword', () => {
  it('accepts a password with letters and numbers, 8+ chars', async () => {
    expect(await errorsFor('Password123')).toHaveLength(0);
  });

  it('rejects a password shorter than 8 characters', async () => {
    expect(await errorsFor('Pass1')).not.toHaveLength(0);
  });

  it('rejects a password with only letters', async () => {
    expect(await errorsFor('Passwordonly')).not.toHaveLength(0);
  });

  it('rejects a password with only numbers', async () => {
    expect(await errorsFor('12345678')).not.toHaveLength(0);
  });
});
