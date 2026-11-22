import { cleanSync, validRoomId, WarRooms } from './war-room';

const ASHA = { id: 'm1', name: 'Dr Asha' };
const RAVI = { id: 'm2', name: 'Dr Ravi' };

function setup() {
  const inbox = new Map<string, unknown[]>();
  let clock = 1000;
  const rooms = new WarRooms<string>(
    (conn, msg) => inbox.set(conn, [...(inbox.get(conn) ?? []), msg]),
    () => clock,
  );
  return {
    rooms,
    inbox,
    of: (conn: string) => inbox.get(conn) ?? [],
    clear: () => inbox.clear(),
    tick: (ms: number) => (clock += ms),
  };
}

const VIEW = { kind: 'view', series: 's1', index: 12, zoom: 2 };

describe('cleanSync', () => {
  it('keeps a full view change', () => {
    const full = {
      kind: 'view',
      series: 's1',
      index: 3,
      zoom: 1.5,
      pan: [1, -2],
      rotation: 90,
      flipH: true,
      voi: [-160, 240],
    };
    expect(cleanSync(full)).toEqual(full);
  });

  it('keeps a pointer', () => {
    const p = { kind: 'pointer', series: 's1', world: [1, 2, 3] };
    expect(cleanSync(p)).toEqual(p);
  });

  it('forwards only known fields, so nothing else can ride along', () => {
    expect(
      cleanSync({ ...VIEW, patientName: 'Secret', token: 'abc' }),
    ).toEqual(VIEW);
  });

  it.each([
    [null],
    ['text'],
    [{ kind: 'nope', series: 's' }],
    [{ kind: 'view', series: 's' }],
    [{ kind: 'view', series: 's', index: -1 }],
    [{ kind: 'view', series: 's', index: 'a' }],
    [{ kind: 'view', series: '', index: 1 }],
    [{ kind: 'view', series: 'x'.repeat(200), index: 1 }],
    [{ kind: 'pointer', series: 's', world: [1, 2] }],
    [{ kind: 'pointer', series: 's', world: [1, 2, NaN] }],
  ])('rejects %j', (raw) => {
    expect(cleanSync(raw)).toBeNull();
  });

  it('drops bad optional values but keeps the rest', () => {
    expect(
      cleanSync({ ...VIEW, zoom: -1, pan: ['a', 2], voi: [1] }),
    ).toEqual({ kind: 'view', series: 's1', index: 12 });
  });
});

describe('validRoomId', () => {
  it('accepts a study UID and refuses anything odd', () => {
    expect(validRoomId('1.2.840.113619.2.55')).toBe(true);
    expect(validRoomId('')).toBe(false);
    expect(validRoomId(5)).toBe(false);
    expect(validRoomId('x'.repeat(129))).toBe(false);
  });
});

describe('WarRooms', () => {
  it('tells everyone who is in the room', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study', ASHA);
    t.rooms.join('b', 'org1', 'study', RAVI);
    expect(t.of('a').at(-1)).toEqual({
      t: 'room.presence',
      people: [ASHA, RAVI],
    });
    expect(t.of('b').at(-1)).toEqual({
      t: 'room.presence',
      people: [ASHA, RAVI],
    });
  });

  it('passes a change to the others, not back to the sender', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study', ASHA);
    t.rooms.join('b', 'org1', 'study', RAVI);
    t.clear();
    t.rooms.relay('a', VIEW);
    expect(t.of('b')).toEqual([{ t: 'room.sync', from: ASHA, sync: VIEW }]);
    expect(t.of('a')).toEqual([]);
  });

  it('keeps different studies apart', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study-1', ASHA);
    t.rooms.join('b', 'org1', 'study-2', RAVI);
    t.clear();
    t.rooms.relay('a', VIEW);
    expect(t.of('b')).toEqual([]);
  });

  it('never crosses between organisations, even with the same study', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study', ASHA);
    t.rooms.join('b', 'org2', 'study', RAVI);
    t.clear();
    t.rooms.relay('a', VIEW);
    expect(t.of('b')).toEqual([]);
  });

  it('ignores someone who has not joined', () => {
    const t = setup();
    t.rooms.join('b', 'org1', 'study', RAVI);
    t.clear();
    t.rooms.relay('stranger', VIEW);
    expect(t.of('b')).toEqual([]);
  });

  it('does not forward a malformed message', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study', ASHA);
    t.rooms.join('b', 'org1', 'study', RAVI);
    t.clear();
    t.rooms.relay('a', { kind: 'view', series: 's' });
    expect(t.of('b')).toEqual([]);
  });

  it('updates the others when someone leaves, and forgets an empty room', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study', ASHA);
    t.rooms.join('b', 'org1', 'study', RAVI);
    t.clear();
    t.rooms.leave('a');
    expect(t.of('b')).toEqual([{ t: 'room.presence', people: [RAVI] }]);
    t.rooms.leave('b');
    t.clear();
    t.rooms.join('c', 'org1', 'study', ASHA);
    expect(t.of('c')).toEqual([{ t: 'room.presence', people: [ASHA] }]);
  });

  it('moves someone who joins a different room', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study-1', ASHA);
    t.rooms.join('b', 'org1', 'study-1', RAVI);
    t.rooms.join('a', 'org1', 'study-2', ASHA);
    t.clear();
    t.rooms.relay('b', VIEW);
    expect(t.of('a')).toEqual([]);
  });

  it('caps the size of a room', () => {
    const t = setup();
    for (let i = 0; i < 8; i++)
      expect(t.rooms.join(`c${i}`, 'org1', 'study', ASHA)).toBe(true);
    expect(t.rooms.join('late', 'org1', 'study', RAVI)).toBe(false);
  });

  it('drops a flood from one person, then lets them through again', () => {
    const t = setup();
    t.rooms.join('a', 'org1', 'study', ASHA);
    t.rooms.join('b', 'org1', 'study', RAVI);
    t.clear();
    for (let i = 0; i < 100; i++) t.rooms.relay('a', VIEW);
    expect(t.of('b')).toHaveLength(40);
    t.tick(1000);
    t.rooms.relay('a', VIEW);
    expect(t.of('b')).toHaveLength(41);
  });
});
