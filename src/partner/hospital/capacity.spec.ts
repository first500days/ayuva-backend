import { BedStatus } from './schemas/ward.schema';
import { capacityScopes, CapacityWard } from './capacity';

const ward = (
  id: string,
  type: string,
  occupied: number,
  total: number,
): CapacityWard => ({
  id,
  name: `Ward ${id}`,
  type,
  beds: Array.from({ length: total }, (_, i) => ({
    status: i < occupied ? BedStatus.OCCUPIED : BedStatus.AVAILABLE,
  })),
});

const rule = (scope: string, thresholdPercent: number, enabled = true) => ({
  id: scope,
  scope,
  thresholdPercent,
  enabled,
});

describe('capacityScopes', () => {
  it('measures every ward on its own', () => {
    const s = capacityScopes(
      [rule('each_ward', 95)],
      [ward('a', 'general', 19, 20), ward('b', 'general', 10, 20)],
    );
    expect(s.map((x) => [x.key, x.percent, x.over])).toEqual([
      ['each_ward|ward:a', 95, true],
      ['each_ward|ward:b', 50, false],
    ]);
  });

  it('counts 19 of 20 beds as exactly 95%', () => {
    const [s] = capacityScopes(
      [rule('hospital', 95)],
      [ward('a', 'icu', 19, 20)],
    );
    expect(s.over).toBe(true);
    const [t] = capacityScopes(
      [rule('hospital', 96)],
      [ward('a', 'icu', 19, 20)],
    );
    expect(t.over).toBe(false);
  });

  it('pools all wards of a type, ignoring the others', () => {
    const [icu] = capacityScopes(
      [rule('icu', 90)],
      [
        ward('a', 'icu', 9, 10),
        ward('b', 'icu', 10, 10),
        ward('c', 'general', 0, 30),
      ],
    );
    expect(icu).toMatchObject({
      key: 'icu|type:icu',
      label: 'ICU',
      occupied: 19,
      total: 20,
      over: true,
    });
  });

  it('pools the whole hospital', () => {
    const [h] = capacityScopes(
      [rule('hospital', 90)],
      [ward('a', 'icu', 10, 10), ward('b', 'general', 10, 30)],
    );
    expect(h).toMatchObject({
      occupied: 20,
      total: 40,
      percent: 50,
      over: false,
    });
  });

  it('skips disabled rules and scopes without beds', () => {
    expect(
      capacityScopes(
        [rule('each_ward', 95, false), rule('maternity', 80)],
        [ward('a', 'general', 20, 20)],
      ),
    ).toEqual([]);
  });

  it('re-arms only well under the threshold', () => {
    const at = (occupied: number) =>
      capacityScopes(
        [rule('hospital', 95)],
        [ward('a', 'general', occupied, 100)],
      )[0];
    expect(at(94)).toMatchObject({ over: false, rearm: false });
    expect(at(89)).toMatchObject({ over: false, rearm: true });
  });
});
