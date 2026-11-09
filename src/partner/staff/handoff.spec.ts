import { spreadEvenly } from './handoff';

const person = (id: string, load: number) => ({ id, name: id, load });

describe('spreadEvenly', () => {
  it('fills the least-busy person first until everyone is level', () => {
    const shares = spreadEvenly([1, 2, 3, 4], [person('a', 3), person('b', 0)]);
    const of = (id: string) =>
      shares.find((s) => s.target.id === id)?.items ?? [];
    expect(of('b')).toEqual([1, 2, 3]);
    expect(of('a')).toEqual([4]);
  });

  it('shares evenly among people with equal work', () => {
    const shares = spreadEvenly([1, 2, 3, 4], [person('a', 1), person('b', 1)]);
    expect(shares.map((s) => s.items.length)).toEqual([2, 2]);
  });

  it('leaves out anyone who gets nothing', () => {
    const shares = spreadEvenly([1], [person('a', 0), person('b', 5)]);
    expect(shares.map((s) => s.target.id)).toEqual(['a']);
  });

  it('gives nothing when nobody can take it', () => {
    expect(spreadEvenly([1, 2], [])).toEqual([]);
  });

  it('handles no work at all', () => {
    expect(spreadEvenly([], [person('a', 0)])).toEqual([]);
  });
});
