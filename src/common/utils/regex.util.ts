/** Escapes user input for safe use inside a MongoDB/RegExp pattern (prevents regex-injection/ReDoS via crafted input). */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSafeRegex(input: string): RegExp {
  return new RegExp(escapeRegExp(input.trim()), 'i');
}
