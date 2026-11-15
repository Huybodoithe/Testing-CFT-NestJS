import { beforeEach, describe, expect, it } from 'vitest';
import { RequestMethod, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { ApplicationConfig } from '../../application-config.js';
import type { ExcludeRouteMetadata } from '../../router/interfaces/exclude-route-metadata.interface.js';
import { RoutePathFactory } from '../../router/route-path-factory.js';

const URI = { type: VersioningType.URI } as const;
const HEADER = { type: VersioningType.HEADER, header: 'X-Api-Version' } as const;

// LCG 32-bit, seed 1808; each test starts from the same seed.
// Identifiers are strictly alphanumeric, so they are safe in literal-path regexes.
function seededNames(seed: number): () => string {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return `segment${1000 + (state % 8000)}`;
  };
}

function excludedRoute(
  path: string,
  requestMethod: RequestMethod = RequestMethod.GET,
): ExcludeRouteMetadata {
  return {
    path,
    requestMethod,
    pathRegex: new RegExp(`^/${path}$`),
  };
}

describe('RoutePathFactory CFT (seed=1808)', () => {
  let config: ApplicationConfig;
  let factory: RoutePathFactory;
  let nextName: () => string;

  beforeEach(() => {
    config = new ApplicationConfig();
    factory = new RoutePathFactory(config);
    nextName = seededNames(1808);
  });

  describe('getVersion / getVersionPrefix', () => {
    it('T01: method version wins over controller version', () => {
      expect(factory.getVersion({
        methodVersion: '7',
        controllerVersion: '6',
      })).toBe('7');
    });

    it('T02: a falsy method version falls back to controller version', () => {
      expect(factory.getVersion({
        methodVersion: '',
        controllerVersion: '6',
      })).toBe('6');
    });

    it('T03: returns undefined when both versions are absent', () => {
      expect(factory.getVersion({})).toBeUndefined();
    });

    it('T04: URI versioning defaults to v when prefix is undefined', () => {
      expect(factory.getVersionPrefix(URI)).toBe('v');
    });

    it('T05: URI prefix false disables the version prefix', () => {
      expect(factory.getVersionPrefix({
        type: VersioningType.URI,
        prefix: false,
      })).toBe('');
    });

    it('T06: returns a custom URI prefix including an empty explicit prefix', () => {
      expect(factory.getVersionPrefix({
        type: VersioningType.URI,
        prefix: 'release',
      })).toBe('release');
      expect(factory.getVersionPrefix({
        type: VersioningType.URI,
        prefix: '',
      })).toBe('');
    });

    it('T07: non-URI versioning takes the default-prefix path', () => {
      expect(factory.getVersionPrefix(HEADER)).toBe('v');
    });
  });

  describe('appendToAllIfDefined', () => {
    it('T08: undefined fragment returns the same paths unchanged', () => {
      const paths = [`/${nextName()}`, `/${nextName()}`];
      expect(factory.appendToAllIfDefined(paths, undefined)).toBe(paths);
    });

    it('T09: an empty fragment returns the same paths unchanged', () => {
      const paths = [`/${nextName()}`];
      expect(factory.appendToAllIfDefined(paths, '')).toBe(paths);
    });

    it('T10: scalar fragment concatenates onto each path', () => {
      const a = nextName();
      const b = nextName();
      expect(factory.appendToAllIfDefined([`/${a}/`, ''], b)).toEqual([
        `/${a}/${b}`,
        `/${b}`,
      ]);
    });

    it('T11: array fragments produce an ordered flattened Cartesian product', () => {
      const a = nextName();
      const b = nextName();
      const c = nextName();
      const d = nextName();
      expect(factory.appendToAllIfDefined([`/${a}`, `/${b}`], [c, d])).toEqual([
        `/${a}/${c}`,
        `/${a}/${d}`,
        `/${b}/${c}`,
        `/${b}/${d}`,
      ]);
    });

    it('T12: an empty fragment array produces zero paths', () => {
      expect(factory.appendToAllIfDefined([`/${nextName()}`], [])).toEqual([]);
    });

    it('T13: an empty source-path array stays empty for a scalar fragment', () => {
      expect(factory.appendToAllIfDefined([], nextName())).toEqual([]);
    });
  });

  describe('create: URI versions, fragments and normalization', () => {
    it('T14: no metadata produces the root path', () => {
      expect(factory.create({})).toEqual(['/']);
    });

    it('T15: builds module/controller/method paths and strips trailing slash', () => {
      const mod = nextName();
      const ctrl = nextName();
      const method = nextName();
      expect(factory.create({
        modulePath: `${mod}/`,
        ctrlPath: `${ctrl}/`,
        methodPath: `${method}/`,
        globalPrefix: '/api/',
      })).toEqual([`/api/${mod}/${ctrl}/${method}`]);
    });

    it('T16: a falsy global prefix leaves the path unprefixed', () => {
      const name = nextName();
      expect(factory.create({ ctrlPath: `/${name}/`, globalPrefix: '' }))
        .toEqual([`/${name}`]);
    });

    it('T17: URI scalar version uses the method version and custom prefix', () => {
      const name = nextName();
      expect(factory.create({
        controllerVersion: '2',
        methodVersion: '3',
        versioningOptions: { type: VersioningType.URI, prefix: 'r' },
        ctrlPath: name,
      })).toEqual([`/r3/${name}`]);
    });

    it('T18: scalar VERSION_NEUTRAL omits the URI version segment', () => {
      const name = nextName();
      expect(factory.create({
        methodVersion: VERSION_NEUTRAL,
        versioningOptions: URI,
        ctrlPath: name,
      })).toEqual([`/${name}`]);
    });

    it('T19: an array of URI versions handles strings and VERSION_NEUTRAL', () => {
      const name = nextName();
      expect(factory.create({
        methodVersion: ['1', VERSION_NEUTRAL, '3'],
        versioningOptions: URI,
        ctrlPath: name,
      })).toEqual([`/v1/${name}`, `/${name}`, `/v3/${name}`]);
    });

    it('T20: HEADER versioning does not add a URI version', () => {
      const name = nextName();
      expect(factory.create({
        methodVersion: '9',
        versioningOptions: HEADER,
        ctrlPath: name,
      })).toEqual([`/${name}`]);
    });

    it('T21: missing versioning options does not add a URI version', () => {
      const name = nextName();
      expect(factory.create({
        methodVersion: '9',
        ctrlPath: name,
      })).toEqual([`/${name}`]);
    });

    it('T22: an empty version array yields no generated route paths', () => {
      expect(factory.create({
        methodVersion: [],
        versioningOptions: URI,
        ctrlPath: nextName(),
      })).toEqual([]);
    });

    it('T23: module, controller and method arrays form the ordered product', () => {
      const m1 = nextName();
      const m2 = nextName();
      const c1 = nextName();
      const c2 = nextName();
      const p1 = nextName();
      const p2 = nextName();
      expect(factory.create({
        modulePath: [m1, m2],
        ctrlPath: [c1, c2],
        methodPath: [p1, p2],
      })).toEqual([
        `/${m1}/${c1}/${p1}`, `/${m1}/${c1}/${p2}`,
        `/${m1}/${c2}/${p1}`, `/${m1}/${c2}/${p2}`,
        `/${m2}/${c1}/${p1}`, `/${m2}/${c1}/${p2}`,
        `/${m2}/${c2}/${p1}`, `/${m2}/${c2}/${p2}`,
      ]);
    });

    it('T24: an explicit slash remains the root rather than being stripped', () => {
      expect(factory.create({ methodPath: '/' })).toEqual(['/']);
    });

    it('T25: global prefix is applied when there are no exclusions', () => {
      const name = nextName();
      expect(factory.create({ ctrlPath: name, globalPrefix: 'api' }))
        .toEqual([`/api/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([]);
    });
  });

  describe('global-prefix exclusions and tracking', () => {
    it('T26: an undefined request method cannot match an exclusion', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.create({ ctrlPath: name, globalPrefix: '/api' }))
        .toEqual([`/api/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: name, method: RequestMethod.GET },
      ]);
    });

    it('T27: a matching route is excluded and its unversioned prefix tracked', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.create({ ctrlPath: name, globalPrefix: '/api/' }, RequestMethod.GET))
        .toEqual([`/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: name, method: RequestMethod.GET },
      ]);
    });

    it('T28: a mismatched HTTP method does not exclude a matching path', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name, RequestMethod.POST)] });
      expect(factory.create({ ctrlPath: name, globalPrefix: 'api' }, RequestMethod.GET))
        .toEqual([`/api/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: name, method: RequestMethod.POST },
      ]);
    });

    it('T29: a mismatched path does not exclude a matching HTTP method', () => {
      const name = nextName();
      const other = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(other)] });
      expect(factory.create({ ctrlPath: name, globalPrefix: 'api' }, RequestMethod.GET))
        .toEqual([`/api/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: other, method: RequestMethod.GET },
      ]);
    });

    it('T30: RequestMethod.ALL exclusion matches a concrete request method', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name, RequestMethod.ALL)] });
      expect(factory.create({ ctrlPath: name, globalPrefix: 'api' }, RequestMethod.POST))
        .toEqual([`/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: name, method: RequestMethod.ALL },
      ]);
    });

    it('T31: each matching URI version is recorded for one excluded route', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.create({
        ctrlPath: name,
        methodVersion: ['1', '2'],
        versioningOptions: URI,
        globalPrefix: '/api',
      }, RequestMethod.GET)).toEqual([`/v1/${name}`, `/v2/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: `/v1/${name}`, method: RequestMethod.GET },
        { path: `/v2/${name}`, method: RequestMethod.GET },
      ]);
    });

    it('T32: neutral and numbered versions track empty and nonempty prefixes', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.create({
        ctrlPath: name,
        methodVersion: [VERSION_NEUTRAL, '4'],
        versioningOptions: URI,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual([`/${name}`, `/v4/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: name, method: RequestMethod.GET },
        { path: `/v4/${name}`, method: RequestMethod.GET },
      ]);
    });

    it('T33: an excluded route not used by create remains as configured', () => {
      const name = nextName();
      const other = nextName();
      config.setGlobalPrefixOptions({
        exclude: [excludedRoute(name), excludedRoute(other)],
      });
      expect(factory.create({
        ctrlPath: name,
        methodVersion: '5',
        versioningOptions: URI,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual([`/v5/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: `/v5/${name}`, method: RequestMethod.GET },
        { path: other, method: RequestMethod.GET },
      ]);
    });

    it('T34: duplicate creates retain one tracked prefix per route', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      const meta = {
        ctrlPath: name,
        methodVersion: '2',
        versioningOptions: URI,
        globalPrefix: 'api',
      };
      expect(factory.create(meta, RequestMethod.GET)).toEqual([`/v2/${name}`]);
      expect(factory.create(meta, RequestMethod.GET)).toEqual([`/v2/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: `/v2/${name}`, method: RequestMethod.GET },
      ]);
    });

    it('T35: logging-style create without versioning options must not add an unversioned track', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      config.enableVersioning(URI);

      expect(factory.create({
        ctrlPath: name,
        methodVersion: '1',
        versioningOptions: URI,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual([`/v1/${name}`]);
      expect(factory.create({
        ctrlPath: name,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual([`/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: `/v1/${name}`, method: RequestMethod.GET },
      ]);
    });

    it('T36: absent application versioning allows tracking with missing route options', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(config.getVersioning()).toBeUndefined();
      expect(factory.create({ ctrlPath: name, globalPrefix: 'api' }, RequestMethod.GET))
        .toEqual([`/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: name, method: RequestMethod.GET },
      ]);
    });

    it('T37: multiple matching exclusions are each tracked; nonmatches are not', () => {
      const name = nextName();
      const other = nextName();
      config.setGlobalPrefixOptions({
        exclude: [
          excludedRoute(name, RequestMethod.GET),
          excludedRoute(name, RequestMethod.ALL),
          excludedRoute(other, RequestMethod.GET),
          excludedRoute(name, RequestMethod.POST),
        ],
      });
      expect(factory.create({
        ctrlPath: name,
        methodVersion: '8',
        versioningOptions: URI,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual([`/v8/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: `/v8/${name}`, method: RequestMethod.GET },
        { path: `/v8/${name}`, method: RequestMethod.ALL },
        { path: other, method: RequestMethod.GET },
        { path: name, method: RequestMethod.POST },
      ]);
    });
  });

  describe('isExcludedFromGlobalPrefix: short-circuit and URI prefix identification', () => {
    it('T38: missing exclusion list returns false', () => {
      expect(factory.isExcludedFromGlobalPrefix(`/${nextName()}`, RequestMethod.GET))
        .toBe(false);
      expect(factory.getExcludedRoutePaths()).toEqual([]);
    });

    it('T39: an array of exclusions with no matching entry returns false', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [] });
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET))
        .toBe(false);
    });

    it('T40: missing version and VERSION_NEUTRAL independently bypass URI prefix detection', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET, undefined, URI))
        .toBe(true);
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET, VERSION_NEUTRAL, URI))
        .toBe(true);
    });

    it('T41: absent or non-URI versioning options preserve the entire path', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET, '2'))
        .toBe(true);
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET, '2', HEADER))
        .toBe(true);
    });

    it('T42: an empty version array performs zero prefix-lookup iterations', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET, [], URI))
        .toBe(true);
    });

    it('T43: an unmatched version falls through without removing a prefix', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.isExcludedFromGlobalPrefix(`/${name}`, RequestMethod.GET, ['1', '2'], URI))
        .toBe(true);
      expect(factory.isExcludedFromGlobalPrefix(`/v1/${name}`, RequestMethod.GET, ['2'], URI))
        .toBe(false);
    });

    it('T44: a matching version root uses the exact-prefix equality branch', () => {
      const root: ExcludeRouteMetadata = {
        path: '',
        requestMethod: RequestMethod.GET,
        pathRegex: /^$/,
      };
      config.setGlobalPrefixOptions({ exclude: [root] });
      expect(factory.isExcludedFromGlobalPrefix('/v1', RequestMethod.GET, '1', URI))
        .toBe(true);
      expect(factory.create({
        methodVersion: '1',
        versioningOptions: URI,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual(['/v1']);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: '/v1', method: RequestMethod.GET },
      ]);
    });

    it('T45: version array skips non-string values and tries a later match', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.isExcludedFromGlobalPrefix(
        `/v3/${name}`, RequestMethod.GET, [VERSION_NEUTRAL, '1', '3'], URI,
      )).toBe(true);
    });

    it('T46: a URI prefix disabled with false is still correctly stripped', () => {
      const name = nextName();
      config.setGlobalPrefixOptions({ exclude: [excludedRoute(name)] });
      expect(factory.create({
        methodVersion: '6',
        versioningOptions: { type: VersioningType.URI, prefix: false },
        ctrlPath: name,
        globalPrefix: 'api',
      }, RequestMethod.GET)).toEqual([`/6/${name}`]);
      expect(factory.getExcludedRoutePaths()).toEqual([
        { path: `/6/${name}`, method: RequestMethod.GET },
      ]);
    });
  });
});
