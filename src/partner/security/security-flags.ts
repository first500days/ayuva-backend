/**
 * Spots activity worth a second look in the security log: a burst of record
 * downloads, a sign-in from an unfamiliar network, or repeated wrong
 * passwords. It only flags; a person decides whether to freeze the account.
 */

export type FlagKind = 'bulk_download' | 'new_ip' | 'failed_signins';

export interface FlaggableRow {
  id: string;
  at: string;
  action: string;
  actorUserId: string | null;
  actorName: string;
  ip: string | null;
}

export interface SecurityFlag<R> {
  kind: FlagKind;
  actorUserId: string;
  actorName: string;
  at: string;
  message: string;
  rowIds: string[];
  /** The latest row behind the flag, which the freeze action works from. */
  row: R;
}

const HOUR = 3_600_000;
const BULK_WINDOW_MS = HOUR;
export const BULK_DOWNLOADS = 20;
const FAILED_WINDOW_MS = 15 * 60_000;
export const FAILED_SIGNINS = 5;
/** Sign-ins with a known address before a new one means anything. */
const SIGNINS_BEFORE_NEW_IP = 3;
const SHOW_FLAGS_FOR_MS = 7 * 24 * HOUR;

/**
 * The network rather than the exact address: mobile and broadband users move
 * around within their provider's range all day, which isn't suspicious.
 */
export function networkOf(ip: string): string {
  const plain = ip.replace(/^::ffff:/, '');
  if (plain.includes('.')) return plain.split('.').slice(0, 3).join('.');
  return plain.split(':').slice(0, 3).join(':');
}

function byActor<R extends FlaggableRow>(rows: R[]) {
  const groups = new Map<string, R[]>();
  for (const r of rows) {
    if (!r.actorUserId) continue;
    groups.set(r.actorUserId, [...(groups.get(r.actorUserId) ?? []), r]);
  }
  return groups;
}

const oldestFirst = <R extends FlaggableRow>(rows: R[]) =>
  [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** Runs of at least `min` rows within `windowMs`; overlapping runs merge into one. */
function bursts<R extends FlaggableRow>(
  rows: R[],
  windowMs: number,
  min: number,
): R[][] {
  const sorted = oldestFirst(rows);
  const out: R[][] = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (Date.parse(sorted[end].at) - Date.parse(sorted[start].at) > windowMs)
      start++;
    if (end - start + 1 < min) continue;
    const run = sorted.slice(start, end + 1);
    const last = out[out.length - 1];
    if (last && Date.parse(run[0].at) <= Date.parse(last[last.length - 1].at)) {
      const seen = new Set(last.map((r) => r.id));
      last.push(...run.filter((r) => !seen.has(r.id)));
    } else out.push(run);
  }
  return out;
}

export function findFlags<R extends FlaggableRow>(
  rows: R[],
  now: number = Date.now(),
): SecurityFlag<R>[] {
  const flags: SecurityFlag<R>[] = [];
  const flag = (kind: FlagKind, message: string, involved: R[]) => {
    const row = involved[involved.length - 1];
    flags.push({
      kind,
      actorUserId: row.actorUserId as string,
      actorName: row.actorName,
      at: row.at,
      message,
      rowIds: involved.map((r) => r.id),
      row,
    });
  };

  for (const [, own] of byActor(rows)) {
    const name = own[0].actorName;
    for (const run of bursts(
      own.filter((r) => r.action === 'record_downloaded'),
      BULK_WINDOW_MS,
      BULK_DOWNLOADS,
    ))
      flag(
        'bulk_download',
        `${name} downloaded ${run.length} patient records within an hour`,
        run,
      );

    for (const run of bursts(
      own.filter((r) => r.action === 'login_failed'),
      FAILED_WINDOW_MS,
      FAILED_SIGNINS,
    ))
      flag(
        'failed_signins',
        `${run.length} failed sign-ins for ${name} within 15 minutes`,
        run,
      );

    const networks = new Set<string>();
    let signIns = 0;
    for (const r of oldestFirst(own.filter((x) => x.action === 'login'))) {
      if (!r.ip) continue;
      const network = networkOf(r.ip);
      if (signIns >= SIGNINS_BEFORE_NEW_IP && !networks.has(network))
        flag('new_ip', `${name} signed in from a new network (${r.ip})`, [r]);
      networks.add(network);
      signIns++;
    }
  }

  return flags
    .filter((f) => now - Date.parse(f.at) <= SHOW_FLAGS_FOR_MS)
    .sort((a, b) => b.at.localeCompare(a.at));
}
