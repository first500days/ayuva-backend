/**
 * The key registration QR codes are sealed with: INTAKE_QR_SECRET when set,
 * otherwise derived from the access-token secret (rotating that one also
 * voids outstanding QR codes, which only live 10 minutes anyway).
 */
export function intakeSecret(): string {
  return (
    process.env.INTAKE_QR_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    'dev-access-secret'
  );
}
