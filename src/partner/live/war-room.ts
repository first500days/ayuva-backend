/**
 * "War room": colleagues in one organisation looking at the same scan
 * together. The server only passes each person's scroll, zoom and pointer to
 * the others in the room. It stores nothing and never sees an image, and what
 * it forwards is rebuilt from known fields, so a client can't relay anything else.
 */

const MAX_ROOM_ID = 128;
const MAX_ROOM_SIZE = 8;
/** More than a screen can draw; anything past it is dropped, not queued. */
const MAX_SYNCS_PER_SECOND = 40;

export interface RoomPerson {
  id: string;
  name: string;
}

export type RoomSync =
  | {
      kind: 'view';
      series: string;
      index: number;
      zoom?: number;
      pan?: [number, number];
      rotation?: number;
      flipH?: boolean;
      voi?: [number, number];
    }
  | { kind: 'pointer'; series: string; world: [number, number, number] }
  | { kind: 'pointer-off' };

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function numbers<N extends number>(v: unknown, length: N): number[] | null {
  return Array.isArray(v) && v.length === length && v.every(finite) ? v : null;
}

const seriesId = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ROOM_ID ? v : null;

/** Keeps only the fields that belong in a sync message; null if it isn't one. */
export function cleanSync(raw: unknown): RoomSync | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.kind === 'pointer-off') return { kind: 'pointer-off' };
  const series = seriesId(m.series);
  if (!series) return null;
  if (m.kind === 'pointer') {
    const world = numbers(m.world, 3);
    return world
      ? { kind: 'pointer', series, world: world as [number, number, number] }
      : null;
  }
  if (m.kind !== 'view' || !finite(m.index) || m.index < 0) return null;
  const pan = numbers(m.pan, 2);
  const voi = numbers(m.voi, 2);
  return {
    kind: 'view',
    series,
    index: Math.floor(m.index),
    ...(finite(m.zoom) && m.zoom > 0 && { zoom: m.zoom }),
    ...(pan && { pan: pan as [number, number] }),
    ...(finite(m.rotation) && { rotation: m.rotation }),
    ...(typeof m.flipH === 'boolean' && { flipH: m.flipH }),
    ...(voi && { voi: voi as [number, number] }),
  };
}

export function validRoomId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ROOM_ID;
}

interface Seat<C> {
  conn: C;
  person: RoomPerson;
  windowStart: number;
  sent: number;
}

export class WarRooms<C> {
  private readonly rooms = new Map<string, Map<C, Seat<C>>>();
  private readonly seatOf = new Map<C, string>();

  constructor(
    private readonly deliver: (conn: C, msg: unknown) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** `scope` is the organisation, so a room name can never cross into another one. */
  join(conn: C, scope: string, room: string, person: RoomPerson): boolean {
    this.leave(conn);
    const key = `${scope}:${room}`;
    let seats = this.rooms.get(key);
    if (!seats) this.rooms.set(key, (seats = new Map()));
    if (seats.size >= MAX_ROOM_SIZE) {
      if (!seats.size) this.rooms.delete(key);
      return false;
    }
    seats.set(conn, { conn, person, windowStart: this.now(), sent: 0 });
    this.seatOf.set(conn, key);
    this.announce(key);
    return true;
  }

  leave(conn: C): void {
    const key = this.seatOf.get(conn);
    if (!key) return;
    this.seatOf.delete(conn);
    const seats = this.rooms.get(key);
    seats?.delete(conn);
    if (seats?.size) this.announce(key);
    else this.rooms.delete(key);
  }

  /** Passes a cleaned-up view change or pointer to everyone else in the room. */
  relay(conn: C, raw: unknown): void {
    const key = this.seatOf.get(conn);
    const seats = key ? this.rooms.get(key) : undefined;
    const seat = seats?.get(conn);
    if (!seats || !seat) return;
    const sync = cleanSync(raw);
    if (!sync || !this.allowed(seat)) return;
    const msg = { t: 'room.sync', from: seat.person, sync };
    for (const other of seats.values())
      if (other.conn !== conn) this.deliver(other.conn, msg);
  }

  private allowed(seat: Seat<C>): boolean {
    const now = this.now();
    if (now - seat.windowStart >= 1000) {
      seat.windowStart = now;
      seat.sent = 0;
    }
    seat.sent += 1;
    return seat.sent <= MAX_SYNCS_PER_SECOND;
  }

  private announce(key: string): void {
    const seats = this.rooms.get(key);
    if (!seats) return;
    const people = [...seats.values()].map((s) => s.person);
    for (const seat of seats.values())
      this.deliver(seat.conn, { t: 'room.presence', people });
  }
}
