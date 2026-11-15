import { describe, expect, it, vi } from 'vitest';
import {
  RequestMethod,
  VERSION_NEUTRAL,
  VersioningType,
  type Logger,
  type VersioningOptions,
} from '@nestjs/common';
import { RouteConflictDetector } from '../../router/route-conflict-detector.js';
import { RouteConflictException } from '../../errors/exceptions/route-conflict.exception.js';

type Route = Parameters<typeof RouteConflictDetector.detect>[0][number];
type Conflict = ReturnType<typeof RouteConflictDetector.detect>[number];
type Kind = Conflict['kind'];
type RouteInput = Partial<
  Pick<Route, 'method' | 'host' | 'version' | 'methodName'>
>;

const RANDOM_SEED = 1808;

/** One-step LCG: deterministic, no Math.random or shared mutable seed. */
function label(salt: number): string {
  const value =
    (Math.imul(RANDOM_SEED ^ salt, 1664525) + 1013904223) >>> 0;
  return `item${100000 + (value % 900000)}`;
}

function route(path: string, input: RouteInput = {}): Route {
  return {
    method: input.method ?? RequestMethod.GET,
    path,
    host: input.host,
    version: input.version,
    methodVersion: undefined,
    controllerVersion: undefined,
    handler: () => undefined,
    targetCallback: () => undefined,
    methodName: input.methodName ?? label(4),
    // InstanceWrapper is a container object; the detector reads only `.name`
    // in describeConflict. Keep this narrow cast, without instantiating DI.
    instanceWrapper: { name: `Controller${label(3)}` } as Route['instanceWrapper'],
  };
}

function detectPair(
  left: Route,
  right: Route,
  options?: VersioningOptions,
): Conflict[] {
  return RouteConflictDetector.detect([left, right], options);
}

function loggerFixture(): { logger: Logger; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  // Logger is an I/O boundary here; handle() uses its warn method only.
  return { logger: { warn } as unknown as Logger, warn };
}

const HEADER: VersioningOptions = {
  type: VersioningType.HEADER,
  header: 'x-api-version',
};
const URI: VersioningOptions = { type: VersioningType.URI };

describe('RouteConflictDetector.tokenizePath / pathsHaveSameShape', () => {
  it('T01 tokenizes literal, param, named wildcard and mixed segments', () => {
    const literal = label(10);
    expect(RouteConflictDetector.tokenizePath(`/shop/${literal}/:id`)).toEqual([
      { kind: 'literal', value: 'shop' },
      { kind: 'literal', value: literal },
      { kind: 'param', value: 'id' },
    ]);
    expect(RouteConflictDetector.tokenizePath('/file/*rest')).toEqual([
      { kind: 'literal', value: 'file' },
      { kind: 'wildcard', value: 'rest' },
    ]);
    expect(RouteConflictDetector.tokenizePath('/avatar/:name.:ext')).toEqual([
      { kind: 'literal', value: 'avatar' },
      { kind: 'mixed', value: ':name.:ext' },
    ]);
  });

  it('T02 flattens optional and nested groups as present in tokenization', () => {
    expect(RouteConflictDetector.tokenizePath('/docs{/:id}')).toEqual([
      { kind: 'literal', value: 'docs' },
      { kind: 'param', value: 'id' },
    ]);
    expect(RouteConflictDetector.tokenizePath('/docs{/:id{.:ext}}')).toEqual([
      { kind: 'literal', value: 'docs' },
      { kind: 'mixed', value: ':id.:ext' },
    ]);
  });

  it('T03 falls back to splitPath for an invalid unnamed wildcard', () => {
    expect(RouteConflictDetector.tokenizePath('/files/*/:id/{*rest}')).toEqual([
      { kind: 'literal', value: 'files' },
      { kind: 'wildcard', value: '' },
      { kind: 'param', value: 'id' },
      { kind: 'wildcard', value: 'rest' },
    ]);
  });

  it('T04 treats malformed fallback braces as literals', () => {
    expect(RouteConflictDetector.tokenizePath('/files/{*unfinished')).toEqual([
      { kind: 'literal', value: 'files' },
      { kind: 'literal', value: '{*unfinished' },
    ]);
    expect(RouteConflictDetector.tokenizePath('/')).toEqual([]);
  });

  it('T05 ignores parameter and wildcard names when comparing shapes', () => {
    expect(
      RouteConflictDetector.pathsHaveSameShape('/users/:id', '/users/:username'),
    ).toBe(true);
    expect(
      RouteConflictDetector.pathsHaveSameShape('/files/*path', '/files/*rest'),
    ).toBe(true);
    expect(
      RouteConflictDetector.pathsHaveSameShape(
        '/docs{/:id}',
        '/docs{/:slug}',
      ),
    ).toBe(true);
    expect(
      RouteConflictDetector.pathsHaveSameShape('/files/:id', '/files/:id.:ext'),
    ).toBe(false);
  });

  it('T06 returns false from pathsHaveSameShape when path parsing throws', () => {
    expect(
      RouteConflictDetector.pathsHaveSameShape('/files/*', '/files/*rest'),
    ).toBe(false);
  });
});

describe('RouteConflictDetector.pathsCanOverlap', () => {
  const cases: ReadonlyArray<{
    id: string;
    left: string;
    right: string;
    overlap: boolean;
  }> = [
    { id: 'T07 equal literal paths', left: '/catalog/readme', right: '/catalog/readme', overlap: true },
    { id: 'T08 disjoint leading text', left: '/alpha/readme', right: '/beta/readme', overlap: false },
    { id: 'T09 incompatible later literal stops the scan', left: '/:a/red/end', right: '/:b/blue/end', overlap: false },
    { id: 'T10 matching later literal after params', left: '/:a/same/end', right: '/:b/same/end', overlap: true },
    { id: 'T11 left param matches literal', left: '/x/:id', right: '/x/actual', overlap: true },
    { id: 'T12 right param matches literal', left: '/x/actual', right: '/x/:id', overlap: true },
    { id: 'T13 left wildcard matches equal-length literal', left: '/x/*rest', right: '/x/actual', overlap: true },
    { id: 'T14 right wildcard matches equal-length literal', left: '/x/actual', right: '/x/*rest', overlap: true },
    { id: 'T15 shorter left trailing wildcard absorbs segments', left: '/x/*rest', right: '/x/a/b/c', overlap: true },
    { id: 'T16 shorter right trailing wildcard absorbs segments', left: '/x/a/b/c', right: '/x/*rest', overlap: true },
    { id: 'T17 shorter left without wildcard cannot overlap', left: '/x/a', right: '/x/a/b', overlap: false },
    { id: 'T18 shorter right without wildcard cannot overlap', left: '/x/a/b', right: '/x/a', overlap: false },
    { id: 'T19 a wildcard on the longer left side does not help', left: '/x/a/*rest', right: '/x/a', overlap: false },
    { id: 'T20 a wildcard on the longer right side does not help', left: '/x/a', right: '/x/a/*rest', overlap: false },
    { id: 'T21 optional group omitted', left: '/users{/:id}', right: '/users', overlap: true },
    { id: 'T22 optional group present', left: '/users{/:id}', right: '/users/member', overlap: true },
    { id: 'T23 two optional groups expand into matching variant', left: '/v{/:a}{/:b}', right: '/v/one/two', overlap: true },
    { id: 'T24 root vs root has zero segments', left: '/', right: '/', overlap: true },
    { id: 'T25 zero segments cannot match a nonempty path', left: '/', right: '/x', overlap: false },
    { id: 'T26 left mixed matches literal segment', left: '/:tenant/file-:id.csv', right: '/:other/file-123.csv', overlap: true },
    { id: 'T27 left mixed rejects a mismatching literal', left: '/:tenant/file-:id.csv', right: '/:other/file-123.txt', overlap: false },
    { id: 'T28 right mixed matches literal segment', left: '/:other/file-123.csv', right: '/:tenant/file-:id.csv', overlap: true },
    { id: 'T29 right mixed rejects a mismatching literal', left: '/:other/file-123.txt', right: '/:tenant/file-:id.csv', overlap: false },
    { id: 'T30 mixed/mixed equal required prefix and suffix', left: '/:a/x-:id.json', right: '/:b/x-:slug.json', overlap: true },
    { id: 'T31 mixed/mixed left start is prefix', left: '/:a/x-:id.json', right: '/:b/x-long-:slug.json', overlap: true },
    { id: 'T32 mixed/mixed right start is prefix', left: '/:a/x-long-:id.json', right: '/:b/x-:slug.json', overlap: true },
    { id: 'T33 mixed/mixed incompatible required starts', left: '/:a/x-:id.json', right: '/:b/y-:slug.json', overlap: false },
    { id: 'T34 mixed/mixed incompatible required ends', left: '/:a/x-:id.json', right: '/:b/x-:slug.xml', overlap: false },
    { id: 'T35 mixed/mixed left end has right suffix', left: '/:a/x-:id.long.json', right: '/:b/x-:slug.json', overlap: true },
    { id: 'T36 mixed/mixed right end has left suffix', left: '/:a/x-:id.json', right: '/:b/x-:slug.long.json', overlap: true },
    { id: 'T37 fallback wildcard absorbs segments', left: '/legacy/*', right: '/legacy/one/two', overlap: true },
    { id: 'T38 fallback for adjacent legacy parameters', left: '/legacy/:name:ext', right: '/legacy/:name:ext', overlap: true },
    {
      id: 'T39 more than six groups uses conservative fallback',
      left: '/p{/:a}{/:b}{/:c}{/:d}{/:e}{/:f}{/:g}',
      right: '/p{/:a}{/:b}{/:c}{/:d}{/:e}{/:f}{/:g}',
      overlap: true,
    },
    { id: 'T40 longer left path with no shorter wildcard', left: '/api/:id', right: '/api', overlap: false },
    { id: 'T41 longer right path with no shorter wildcard', left: '/api', right: '/api/:id', overlap: false },
  ];

  it.each(cases)('$id', ({ left, right, overlap }) => {
    expect(RouteConflictDetector.pathsCanOverlap(left, right)).toBe(overlap);
  });

  it('T42 uses generated non-boundary literal names reproducibly', () => {
    const first = label(55);
    const second = label(56);
    expect(first).not.toBe(second);
    expect(
      RouteConflictDetector.pathsCanOverlap(
        `/:category/${first}/end`,
        `/:group/${second}/end`,
      ),
    ).toBe(false);
    expect(
      RouteConflictDetector.pathsCanOverlap(
        `/:category/${first}/end`,
        `/:group/${first}/end`,
      ),
    ).toBe(true);
  });
});

describe('RouteConflictDetector.detect method, pair order and path gates', () => {
  it('T43 visits zero and one route without producing pairs', () => {
    expect(RouteConflictDetector.detect([], undefined)).toEqual([]);
    expect(RouteConflictDetector.detect([route('/x')], undefined)).toEqual([]);
  });

  it('T44 records a duplicate with original references in declaration order', () => {
    const a = route('/api/items', { methodName: 'first' });
    const b = route('/api/items', { methodName: 'second' });
    expect(detectPair(a, b)).toEqual([
      { winner: a, shadowed: b, kind: 'duplicate' },
    ]);
  });

  it('T45 treats overlapping but different paths as a shadow', () => {
    const a = route('/items/:id');
    const b = route('/items/selected');
    expect(detectPair(a, b)).toEqual([
      { winner: a, shadowed: b, kind: 'shadow' },
    ]);
  });

  it('T46 rejects different non-ALL methods', () => {
    expect(
      detectPair(
        route('/items', { method: RequestMethod.GET }),
        route('/items', { method: RequestMethod.POST }),
      ),
    ).toEqual([]);
  });

  it('T47 accepts ALL in either operand, without calling it a duplicate', () => {
    const get = route('/items', { method: RequestMethod.GET });
    const all = route('/items', { method: RequestMethod.ALL });
    expect(detectPair(all, get).map(c => c.kind)).toEqual(['shadow']);
    expect(detectPair(get, all).map(c => c.kind)).toEqual(['shadow']);
  });

  it('T48 rules out paths after method/version/host gates accept them', () => {
    expect(
      detectPair(route('/api/first'), route('/api/second')),
    ).toEqual([]);
  });

  it('T49 enumerates each unique pair exactly once', () => {
    const a = route('/items/:a');
    const b = route('/items/:b');
    const c = route('/items/selected');
    const conflicts = RouteConflictDetector.detect([a, b, c], undefined);
    expect(conflicts).toEqual([
      { winner: a, shadowed: b, kind: 'shadow' },
      { winner: a, shadowed: c, kind: 'shadow' },
      { winner: b, shadowed: c, kind: 'shadow' },
    ]);
  });
});

describe('RouteConflictDetector.detect version overlap and identity', () => {
  const cases: ReadonlyArray<{
    id: string;
    left: Route['version'];
    right: Route['version'];
    versioning: VersioningOptions | undefined;
    kind: Kind | null;
  }> = [
    { id: 'T50 no versioning ignores different version labels', left: 'v1', right: 'v2', versioning: undefined, kind: 'duplicate' },
    { id: 'T51 URI versioning ignores different version labels', left: 'v1', right: 'v2', versioning: URI, kind: 'duplicate' },
    { id: 'T52 HEADER disjoint scalars do not overlap', left: 'v1', right: 'v2', versioning: HEADER, kind: null },
    { id: 'T53 HEADER equal scalar versions are identical', left: 'v1', right: 'v1', versioning: HEADER, kind: 'duplicate' },
    { id: 'T54 HEADER left unspecified matches any but is not identical', left: undefined, right: 'v2', versioning: HEADER, kind: 'shadow' },
    { id: 'T55 HEADER right unspecified matches any but is not identical', left: 'v2', right: undefined, versioning: HEADER, kind: 'shadow' },
    { id: 'T56 HEADER left neutral matches any', left: VERSION_NEUTRAL, right: 'v2', versioning: HEADER, kind: 'shadow' },
    { id: 'T57 HEADER right neutral matches any', left: 'v2', right: VERSION_NEUTRAL, versioning: HEADER, kind: 'shadow' },
    { id: 'T58 HEADER array on left includes scalar right', left: ['v1', 'v2'], right: 'v2', versioning: HEADER, kind: 'shadow' },
    { id: 'T59 HEADER array on right includes scalar left', left: 'v2', right: ['v1', 'v2'], versioning: HEADER, kind: 'shadow' },
    { id: 'T60 HEADER disjoint arrays do not overlap', left: ['v1', 'v2'], right: ['v3', 'v4'], versioning: HEADER, kind: null },
    { id: 'T61 HEADER arrays with same members in reverse order are identical', left: ['v1', 'v2'], right: ['v2', 'v1'], versioning: HEADER, kind: 'duplicate' },
    { id: 'T62 HEADER arrays with a shared member but differing others shadow', left: ['v1', 'v2'], right: ['v2', 'v3'], versioning: HEADER, kind: 'shadow' },
    { id: 'T63 HEADER arrays with different lengths shadow', left: ['v1'], right: ['v1', 'v2'], versioning: HEADER, kind: 'shadow' },
    { id: 'T64 HEADER two undefined values are identical', left: undefined, right: undefined, versioning: HEADER, kind: 'duplicate' },
    { id: 'T65 HEADER two neutral values are identical', left: VERSION_NEUTRAL, right: VERSION_NEUTRAL, versioning: HEADER, kind: 'duplicate' },
    { id: 'T66 HEADER scalar vs nonmatching array cannot overlap', left: 'v9', right: ['v1', 'v2'], versioning: HEADER, kind: null },
  ];

  it.each(cases)('$id', ({ left, right, versioning, kind }) => {
    const conflicts = detectPair(
      route('/health', { version: left }),
      route('/health', { version: right }),
      versioning,
    );
    expect(conflicts.map(conflict => conflict.kind)).toEqual(
      kind === null ? [] : [kind],
    );
  });
});

describe('RouteConflictDetector.detect host overlap and identity', () => {
  const cases: ReadonlyArray<{
    id: string;
    left: Route['host'];
    right: Route['host'];
    kind: Kind | null;
  }> = [
    { id: 'T67 two unspecified hosts are identical', left: undefined, right: undefined, kind: 'duplicate' },
    { id: 'T68 unspecified left host overlaps named right host', left: undefined, right: 'api.local', kind: 'shadow' },
    { id: 'T69 unspecified right host overlaps named left host', left: 'api.local', right: undefined, kind: 'shadow' },
    { id: 'T70 equal literal hosts are identical', left: 'api.local', right: 'api.local', kind: 'duplicate' },
    { id: 'T71 different literal hosts do not overlap', left: 'api.local', right: 'admin.local', kind: null },
    { id: 'T72 host arrays with an intersection shadow', left: ['api.local', 'admin.local'], right: ['docs.local', 'admin.local'], kind: 'shadow' },
    { id: 'T73 host array ordering does not change identity', left: ['api.local', 'admin.local'], right: ['admin.local', 'api.local'], kind: 'duplicate' },
    { id: 'T74 duplicates in host arrays do not change identity', left: ['api.local', 'api.local'], right: ['api.local'], kind: 'duplicate' },
    { id: 'T75 host subset left is not a full identity', left: ['api.local'], right: ['api.local', 'docs.local'], kind: 'shadow' },
    { id: 'T76 host subset right is not a full identity', left: ['api.local', 'docs.local'], right: ['api.local'], kind: 'shadow' },
    { id: 'T77 equal regexp source and flags are identical', left: /^api[.]local$/i, right: /^api[.]local$/i, kind: 'duplicate' },
    { id: 'T78 different regexp sources conservatively overlap', left: /^api[.]local$/, right: /^docs[.]local$/, kind: 'shadow' },
    { id: 'T79 different regexp flags overlap but are not identical', left: /^api[.]local$/i, right: /^api[.]local$/, kind: 'shadow' },
    { id: 'T80 left regexp matches right string', left: /^api[.]local$/, right: 'api.local', kind: 'shadow' },
    { id: 'T81 right regexp matches left string', left: 'api.local', right: /^api[.]local$/, kind: 'shadow' },
    { id: 'T82 left regexp rejects right string', left: /^api[.]local$/, right: 'docs.local', kind: null },
    { id: 'T83 right regexp rejects left string', left: 'docs.local', right: /^api[.]local$/, kind: null },
    { id: 'T84 different-length host arrays can overlap', left: ['docs.local', 'api.local'], right: ['api.local'], kind: 'shadow' },
  ];

  it.each(cases)('$id', ({ left, right, kind }) => {
    const conflicts = detectPair(
      route('/health', { host: left }),
      route('/health', { host: right }),
    );
    expect(conflicts.map(conflict => conflict.kind)).toEqual(
      kind === null ? [] : [kind],
    );
  });

  it('T85 resets lastIndex on a reused left global regexp for every pair', () => {
    const pattern = /^node[.]local$/g;
    pattern.lastIndex = 999;
    const regexHost = route('/status', { host: pattern });
    const first = route('/status', { host: 'node.local' });
    const second = route('/status', { host: 'node.local' });
    expect(
      RouteConflictDetector.detect([regexHost, first, second], undefined)
        .map(conflict => conflict.kind),
    ).toEqual(['shadow', 'shadow', 'duplicate']);
  });

  it('T86 resets lastIndex on a reused right global regexp for every pair', () => {
    const pattern = /^node[.]local$/g;
    pattern.lastIndex = 999;
    const first = route('/status', { host: 'node.local' });
    const second = route('/status', { host: 'node.local' });
    const regexHost = route('/status', { host: pattern });
    expect(
      RouteConflictDetector.detect([first, second, regexHost], undefined)
        .map(conflict => conflict.kind),
    ).toEqual(['duplicate', 'shadow', 'shadow']);
  });

  it('T87 does not conflate method, path or version identity with overlap', () => {
    const first = route('/x/:id', { version: 'v1' });
    const second = route('/x/target', { version: 'v1' });
    expect(detectPair(first, second, HEADER).map(c => c.kind)).toEqual([
      'shadow',
    ]);
    expect(
      detectPair(
        route('/x/:id', { version: 'v1' }),
        route('/x/:id', { version: 'v2' }),
        HEADER,
      ),
    ).toEqual([]);
    expect(
      detectPair(
        route('/x/:id', { version: 'v1' }),
        route('/x/:id', { version: 'v2' }),
      ).map(c => c.kind),
    ).toEqual(['duplicate']);
  });
});

describe('RouteConflictDetector.handle', () => {
  function sampleConflicts(): [Conflict, Conflict] {
    const a = route('/inventory', { methodName: 'early' });
    const b = route('/inventory', { methodName: 'late' });
    const c = route('/inventory/:id', { methodName: 'parameter' });
    return [
      { winner: a, shadowed: b, kind: 'duplicate' },
      { winner: c, shadowed: a, kind: 'shadow' },
    ];
  }

  it('T88 returns early for empty conflicts without consulting policy', () => {
    const { logger, warn } = loggerFixture();
    expect(() => RouteConflictDetector.handle([], undefined, logger)).not.toThrow();
    expect(() =>
      RouteConflictDetector.handle([], { duplicate: 'error' }, logger),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('T89 returns early when policy is undefined and conflicts exist', () => {
    const { logger, warn } = loggerFixture();
    expect(() =>
      RouteConflictDetector.handle(sampleConflicts(), undefined, logger),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('T90 treats absent policy entries as off via nullish coalescing', () => {
    const { logger, warn } = loggerFixture();
    expect(() =>
      RouteConflictDetector.handle(sampleConflicts(), {}, logger),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('T91 treats explicitly off duplicate and shadow as silent', () => {
    const { logger, warn } = loggerFixture();
    expect(() =>
      RouteConflictDetector.handle(
        sampleConflicts(),
        { duplicate: 'off', shadow: 'off' },
        logger,
      ),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('T92 warns once for each kind with accurately classified messages', () => {
    const { logger, warn } = loggerFixture();
    RouteConflictDetector.handle(
      sampleConflicts(),
      { duplicate: 'warn', shadow: 'warn' },
      logger,
    );
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Duplicate route: GET /inventory'),
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('is shadowed by GET /inventory/:id'),
    );
  });

  it('T93 aggregates both error kinds into RouteConflictException', () => {
    const { logger, warn } = loggerFixture();
    expect(() =>
      RouteConflictDetector.handle(
        sampleConflicts(),
        { duplicate: 'error', shadow: 'error' },
        logger,
      ),
    ).toThrow(RouteConflictException);
    expect(warn).not.toHaveBeenCalled();
  });

  it('T94 logs warnings before throwing an aggregated error', () => {
    const { logger, warn } = loggerFixture();
    expect(() =>
      RouteConflictDetector.handle(
        sampleConflicts(),
        { duplicate: 'warn', shadow: 'error' },
        logger,
      ),
    ).toThrow(/Route GET \/inventory/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate route: GET /inventory'),
    );
  });

  it('T95 does not throw if the only enabled kind is warn', () => {
    const { logger, warn } = loggerFixture();
    expect(() =>
      RouteConflictDetector.handle(
        sampleConflicts(),
        { duplicate: 'off', shadow: 'warn' },
        logger,
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('is shadowed'),
    );
  });
});

describe('RouteConflictDetector.filterSortResolvedShadows', () => {
  const conflict = (
    winner: Route,
    shadowed: Route,
    kind: Kind = 'shadow',
  ): Conflict => ({ winner, shadowed, kind });

  it('T96 returns an empty result for no conflicts', () => {
    expect(RouteConflictDetector.filterSortResolvedShadows([], [])).toEqual([]);
  });

  it('T97 preserves duplicates regardless of sorted declarations', () => {
    const a = route('/x');
    const b = route('/x');
    const duplicate = conflict(a, b, 'duplicate');
    expect(
      RouteConflictDetector.filterSortResolvedShadows([duplicate], [b, a]),
    ).toEqual([duplicate]);
  });

  it('T98 keeps genuine shadows with winner declared first', () => {
    const a = route('/x/:id');
    const b = route('/x/live');
    const shadow = conflict(a, b);
    expect(
      RouteConflictDetector.filterSortResolvedShadows([shadow], [a, b]),
    ).toEqual([shadow]);
  });

  it('T99 drops shadows resolved by promoting a later-declared winner', () => {
    const a = route('/x/:id');
    const b = route('/x/live');
    const shadow = conflict(b, a);
    expect(
      RouteConflictDetector.filterSortResolvedShadows([shadow], [a, b]),
    ).toEqual([]);
  });

  it('T100 filters multiple entries without mutating their inputs', () => {
    const earlier = route('/x/:id');
    const later = route('/x/live');
    const genuine = conflict(earlier, later);
    const resolved = conflict(later, earlier);
    const duplicate = conflict(earlier, earlier, 'duplicate');
    const all = [genuine, resolved, duplicate];
    const filtered = RouteConflictDetector.filterSortResolvedShadows(
      all,
      [earlier, later],
    );
    expect(filtered).toEqual([genuine, duplicate]);
    expect(all).toEqual([genuine, resolved, duplicate]);
  });

  it('T101 marks missing declaration indices as artificial_state only', () => {
    const a = route('/a');
    const b = route('/b');
    const absentWinner = conflict(a, b);
    const absentShadowed = conflict(b, a);
    // Both routes are intentionally absent from declarationOrder: this
    // exercises the `?? -1` fallbacks, not a realistic sort result.
    expect(
      RouteConflictDetector.filterSortResolvedShadows(
        [absentWinner, absentShadowed],
        [],
      ),
    ).toEqual([]);
    expect(
      RouteConflictDetector.filterSortResolvedShadows(
        [absentWinner],
        [b],
      ),
    ).toEqual([absentWinner]);
    expect(
      RouteConflictDetector.filterSortResolvedShadows(
        [absentShadowed],
        [b],
      ),
    ).toEqual([]);
  });
});
