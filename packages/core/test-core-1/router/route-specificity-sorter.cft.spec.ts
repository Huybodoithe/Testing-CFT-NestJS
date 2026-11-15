import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteSpecificitySorter } from '../../router/route-specificity-sorter.js';
import {
  RouteConflictDetector,
  type PathSegment,
} from '../../router/route-conflict-detector.js';

// Only the collaborating tokenizer is mocked. The sorter under test is real.
vi.mock('../../router/route-conflict-detector.js', () => ({
  RouteConflictDetector: {
    tokenizePath: vi.fn(),
  },
}));

type ResolvedRoute = Parameters<typeof RouteSpecificitySorter.sort>[0][number];

// The sorter reads only `path`. A limited cast avoids constructing unrelated
// runtime controller/handler/injector fixtures that this unit never accesses.
const route = (path: string): ResolvedRoute => ({ path }) as ResolvedRoute;

const kinds = (...values: PathSegment['kind'][]): PathSegment[] =>
  values.map((kind, index) => ({ kind, value: `${kind}-${index + 17}` }));

const tokenizePath = vi.mocked(RouteConflictDetector.tokenizePath);

function useTokenization(
  cases: ReadonlyArray<readonly [string, PathSegment[]]>,
): void {
  const byPath = new Map<string, PathSegment[]>(cases);
  tokenizePath.mockImplementation(path => {
    const segments = byPath.get(path);
    if (segments === undefined) {
      throw new Error(`No tokenizer fixture for ${path}`);
    }
    // Return a fresh list, just as a tokenizer would, on every invocation.
    return segments.map(segment => ({ ...segment }));
  });
}

// Fixed-seed LCG: never depends on Math.random, Date.now, or external state.
function seededNumbers(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

describe('RouteSpecificitySorter.sort (single-file CFT)', () => {
  beforeEach(() => {
    tokenizePath.mockReset();
  });

  it('T1: returns a fresh empty array without tokenizing for zero routes', () => {
    const input: ResolvedRoute[] = [];
    const actual = RouteSpecificitySorter.sort(input);

    expect(actual).toEqual([]);
    expect(actual).not.toBe(input);
    expect(tokenizePath).not.toHaveBeenCalled();
  });

  it('T2: preserves a singleton without invoking the comparator', () => {
    const single = route('/catalog');
    useTokenization([['/catalog', kinds('literal')]]);

    const actual = RouteSpecificitySorter.sort([single]);

    expect(actual).toEqual([single]);
    expect(actual[0]).toBe(single);
    expect(tokenizePath).toHaveBeenCalledTimes(1);
    expect(tokenizePath).toHaveBeenCalledWith('/catalog');
  });

  it('T3: uses declaration order for equal empty segment lists (zero comparison iterations)', () => {
    const first = route('/');
    const second = route('/');
    useTokenization([['/', []]]);

    const actual = RouteSpecificitySorter.sort([first, second]);

    expect(actual[0]).toBe(first);
    expect(actual[1]).toBe(second);
    expect(tokenizePath).toHaveBeenCalledTimes(2);
  });

  it('T4: ranks literal, end, mixed, param and wildcard; keeps the input untouched', () => {
    const literal = route('/flights/confirmed');
    const end = route('/flights');
    const mixed = route('/flights/v:edition');
    const param = route('/flights/:flight');
    const wildcard = route('/flights/*rest');
    useTokenization([
      [literal.path, kinds('literal', 'literal')],
      [end.path, kinds('literal')],
      [mixed.path, kinds('literal', 'mixed')],
      [param.path, kinds('literal', 'param')],
      [wildcard.path, kinds('literal', 'wildcard')],
    ]);
    const input = [wildcard, param, mixed, end, literal];
    const inputBefore = [...input];

    const actual = RouteSpecificitySorter.sort(input);

    expect(actual).toEqual([literal, end, mixed, param, wildcard]);
    expect(actual).not.toBe(input);
    expect(input).toEqual(inputBefore);
    expect(tokenizePath.mock.calls.map(([path]) => path)).toEqual(
      input.map(item => item.path),
    );
  });

  it('T5: retains declaration order when all compared segment ranks are equal', () => {
    const a = route('/teams/:captain/score');
    const b = route('/teams/:player/result');
    const c = route('/teams/:runner/latest');
    useTokenization([
      [a.path, kinds('literal', 'param', 'literal')],
      [b.path, kinds('literal', 'param', 'literal')],
      [c.path, kinds('literal', 'param', 'literal')],
    ]);

    const actual = RouteSpecificitySorter.sort([b, c, a]);

    expect(actual[0]).toBe(b);
    expect(actual[1]).toBe(c);
    expect(actual[2]).toBe(a);
  });

  it('T6: the first differing segment wins even if later ranks would reverse it', () => {
    const stronger = route('/rivers/summit/:name/:region');
    const weaker = route('/rivers/:river/summit/peak');
    useTokenization([
      [stronger.path, kinds('literal', 'literal', 'param', 'param')],
      [weaker.path, kinds('literal', 'param', 'literal', 'literal')],
    ]);

    expect(RouteSpecificitySorter.sort([weaker, stronger])).toEqual([
      stronger,
      weaker,
    ]);
    expect(RouteSpecificitySorter.sort([stronger, weaker])).toEqual([
      stronger,
      weaker,
    ]);
  });

  it('T7: an absent no-wildcard segment (end) loses to a literal on either side', () => {
    const shorter = route('/topics');
    const longer = route('/topics/trending');
    useTokenization([
      [shorter.path, kinds('literal')],
      [longer.path, kinds('literal', 'literal')],
    ]);

    expect(RouteSpecificitySorter.sort([shorter, longer])).toEqual([
      longer,
      shorter,
    ]);
    expect(RouteSpecificitySorter.sort([longer, shorter])).toEqual([
      longer,
      shorter,
    ]);
  });

  it('T8: an absent no-wildcard segment (end) beats mixed, param and wildcard', () => {
    const end = route('/store');
    const mixed = route('/store/v:version');
    const param = route('/store/:sku');
    const wildcard = route('/store/*path');
    useTokenization([
      [end.path, kinds('literal')],
      [mixed.path, kinds('literal', 'mixed')],
      [param.path, kinds('literal', 'param')],
      [wildcard.path, kinds('literal', 'wildcard')],
    ]);

    expect(
      RouteSpecificitySorter.sort([wildcard, param, mixed, end]),
    ).toEqual([end, mixed, param, wildcard]);
  });

  it('T9: a missing position after a wildcard loses to a longer literal in both orders', () => {
    const shorter = route('/archive/*rest');
    const longer = route('/archive/*rest/readme');
    useTokenization([
      [shorter.path, kinds('literal', 'wildcard')],
      [longer.path, kinds('literal', 'wildcard', 'literal')],
    ]);

    expect(RouteSpecificitySorter.sort([shorter, longer])).toEqual([
      longer,
      shorter,
    ]);
    expect(RouteSpecificitySorter.sort([longer, shorter])).toEqual([
      longer,
      shorter,
    ]);
  });

  it('T10: a wildcard anywhere in the shorter path selects missing, not end', () => {
    const shorter = route('/archive/*rest/public');
    const longer = route('/archive/*rest/public/:format');
    useTokenization([
      [shorter.path, kinds('literal', 'wildcard', 'literal')],
      [longer.path, kinds('literal', 'wildcard', 'literal', 'param')],
    ]);

    expect(RouteSpecificitySorter.sort([shorter, longer])).toEqual([
      longer,
      shorter,
    ]);
    expect(RouteSpecificitySorter.sort([longer, shorter])).toEqual([
      longer,
      shorter,
    ]);
  });

  it('T11: an end after a named parameter beats a further named parameter', () => {
    const shorter = route('/members/:id');
    const longer = route('/members/:id/:role');
    useTokenization([
      [shorter.path, kinds('literal', 'param')],
      [longer.path, kinds('literal', 'param', 'param')],
    ]);

    expect(RouteSpecificitySorter.sort([longer, shorter])).toEqual([
      shorter,
      longer,
    ]);
    expect(RouteSpecificitySorter.sort([shorter, longer])).toEqual([
      shorter,
      longer,
    ]);
  });

  it('T12: propagates a synchronous tokenizer error and stops mapping further routes', () => {
    const error = new Error('tokenization rejected this route');
    const first = route('/ready');
    const invalid = route('/invalid');
    const untouched = route('/unvisited');
    tokenizePath.mockImplementation(path => {
      if (path === invalid.path) throw error;
      return kinds('literal');
    });

    expect(() =>
      RouteSpecificitySorter.sort([first, invalid, untouched]),
    ).toThrow(error);
    expect(tokenizePath.mock.calls.map(([path]) => path)).toEqual([
      first.path,
      invalid.path,
    ]);
  });

  it('T13: fixed-seed generated, non-boundary routes sort by rank and preserve ties', () => {
    const next = seededNumbers(1808);
    const literalRoutes: ResolvedRoute[] = [];
    const endRoutes: ResolvedRoute[] = [];
    const mixedRoutes: ResolvedRoute[] = [];
    const paramRoutes: ResolvedRoute[] = [];
    const wildcardRoutes: ResolvedRoute[] = [];
    const input: ResolvedRoute[] = [];
    const cases: Array<readonly [string, PathSegment[]]> = [];

    for (let index = 0; index < 12; index++) {
      const prefix = `collection${index}_${10000 + (next() % 90000)}`;
      const base = `/${prefix}`;
      const literal = route(`${base}/item${10000 + (next() % 90000)}`);
      const end = route(base);
      const mixed = route(`${base}/v:edition${10000 + (next() % 90000)}`);
      const param = route(`${base}/:code${10000 + (next() % 90000)}`);
      const wildcard = route(`${base}/*tail${10000 + (next() % 90000)}`);

      cases.push(
        [literal.path, kinds('literal', 'literal')],
        [end.path, kinds('literal')],
        [mixed.path, kinds('literal', 'mixed')],
        [param.path, kinds('literal', 'param')],
        [wildcard.path, kinds('literal', 'wildcard')],
      );
      literalRoutes.push(literal);
      endRoutes.push(end);
      mixedRoutes.push(mixed);
      paramRoutes.push(param);
      wildcardRoutes.push(wildcard);
      input.push(wildcard, param, mixed, end, literal);
    }
    useTokenization(cases);

    const actual = RouteSpecificitySorter.sort(input);

    expect(actual).toEqual([
      ...literalRoutes,
      ...endRoutes,
      ...mixedRoutes,
      ...paramRoutes,
      ...wildcardRoutes,
    ]);
    expect(tokenizePath).toHaveBeenCalledTimes(60);
  });
});
