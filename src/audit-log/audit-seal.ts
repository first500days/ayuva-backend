import { createHash, createHmac } from 'node:crypto';

/**
 * The maths behind tamper-evident logs. A batch of rows is hashed in order,
 * and each batch's seal is keyed and includes the previous seal, so changing,
 * removing or inserting a row anywhere breaks the chain from that point on.
 */

export const GENESIS = 'genesis';

/** The same value always gives the same text, whatever order its keys are in. */
export function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    // ObjectId and the other BSON value types.
    if (typeof (value as { _bsontype?: unknown })._bsontype === 'string')
      return JSON.stringify(String(value));
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digestRows(rows: unknown[]): string {
  const all = createHash('sha256');
  for (const row of rows) {
    all.update(createHash('sha256').update(canonical(row)).digest('hex'));
    all.update('\n');
  }
  return all.digest('hex');
}

export interface SealFields {
  source: string;
  seq: number;
  fromId: string;
  toId: string;
  count: number;
  rowsDigest: string;
  prevHash: string;
}

export function sealHash(secret: string, f: SealFields): string {
  return createHmac('sha256', secret)
    .update(
      [f.source, f.seq, f.fromId, f.toId, f.count, f.rowsDigest, f.prevHash].join(
        '|',
      ),
    )
    .digest('hex');
}
