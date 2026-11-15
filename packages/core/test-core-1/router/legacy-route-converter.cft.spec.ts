import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyRouteConverter } from '../../router/legacy-route-converter.js';

const RANDOM_SEED = 1808;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz';

// Fixed-seed, seven-character path segments. Special route syntax is inserted
// deliberately, so no branch depends on a random draw.
function routeSegment(salt: number): string {
  let state = (RANDOM_SEED + salt) >>> 0;
  let result = '';
  for (let i = 0; i < 7; i++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    result += ALPHABET[state % ALPHABET.length];
  }
  return result;
}

describe('LegacyRouteConverter (single-file CFT)', () => {
  let warnings: unknown[];
  let errors: unknown[];

  beforeEach(() => {
    warnings = [];
    errors = [];
    // The real converter (including its private printWarning call) runs.
    // Only Logger's output boundary is intercepted to prevent console I/O.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(message => {
      warnings.push(message);
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation(message => {
      errors.push(message);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function expectConversionWarning(route: string, converted: string): void {
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual(
      expect.stringContaining(`Unsupported route path: "${route}".`),
    );
    expect(warnings[0]).toEqual(
      expect.stringContaining(` Attempting to auto-convert to "${converted}"...`),
    );
    expect(errors).toHaveLength(0);
  }

  describe('tryConvert', () => {
    it('T01 returns an ordinary path without leading/trailing slash unchanged (default logs)', () => {
      const route = `${routeSegment(11)}/${routeSegment(12)}`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(route);
      expect(warnings).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('T02 returns a slash-terminated ordinary path unchanged with logs disabled', () => {
      const route = `/${routeSegment(21)}/${routeSegment(22)}/`;
      expect(LegacyRouteConverter.tryConvert(route, { logs: false })).toBe(
        route,
      );
      expect(warnings).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('T03 converts a non-root (.*) suffix and warns when logs are explicitly enabled', () => {
      const prefix = routeSegment(31);
      const route = `/${prefix}/(.*)`;
      const expected = `/${prefix}/{*path}`;
      expect(LegacyRouteConverter.tryConvert(route, { logs: true })).toBe(
        expected,
      );
      expectConversionWarning(route, expected);
    });

    it('T04 converts the root (.*) wildcard without warning', () => {
      expect(LegacyRouteConverter.tryConvert('/(.*)')).toBe('/{*path}');
      expect(warnings).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('T05 preserves a trailing slash when converting a non-root (.*) suffix', () => {
      const prefix = routeSegment(51);
      const route = `${prefix}/(.*)/`;
      const expected = `${prefix}/{*path}/`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(expected);
      expectConversionWarning(route, expected);
    });

    it('T06 converts the root * wildcard without warning', () => {
      expect(LegacyRouteConverter.tryConvert('/*')).toBe('/{*path}');
      expect(warnings).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('T07 converts a non-root * suffix and defaults logs to true for an empty options object', () => {
      const prefix = routeSegment(71);
      const route = `/${prefix}/*`;
      const expected = `/${prefix}/{*path}`;
      expect(LegacyRouteConverter.tryConvert(route, {})).toBe(expected);
      expectConversionWarning(route, expected);
    });

    it('T08 converts an unprefixed root * with a trailing slash without warning', () => {
      expect(LegacyRouteConverter.tryConvert('*/')).toBe('{*path}/');
      expect(warnings).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('T09 converts a + suffix to the required named *path and warns', () => {
      const prefix = routeSegment(91);
      const route = `/${prefix}/+`;
      const expected = `/${prefix}/*path`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(expected);
      expectConversionWarning(route, expected);
    });

    it('T10 still converts a slash-terminated + suffix when logging is disabled', () => {
      const prefix = routeSegment(101);
      const route = `/${prefix}/+/`;
      expect(LegacyRouteConverter.tryConvert(route, { logs: false })).toBe(
        `/${prefix}/*path/`,
      );
      expect(warnings).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('T11 converts one interior * segment using the original match offset', () => {
      const prefix = routeSegment(111);
      const suffix = routeSegment(112);
      const route = `/${prefix}/*/${suffix}`;
      // The slash before the wildcard is at offset 8 (1 + 7).
      const expected = `/${prefix}/*path8/${suffix}`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(expected);
      expectConversionWarning(route, expected);
    });

    it('T12 converts multiple adjacent interior * segments independently', () => {
      const prefix = routeSegment(121);
      const suffix = routeSegment(122);
      const route = `/${prefix}/*/*/${suffix}`;
      // Two distinct original offsets, 8 and 10; the lookahead retains '/'.
      const expected = `/${prefix}/*path8/*path10/${suffix}`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(expected);
      expectConversionWarning(route, expected);
    });

    it('T13 gives the terminal (.*) branch precedence over interior * conversion', () => {
      const prefix = routeSegment(131);
      const route = `/${prefix}/*/(.*)`;
      const expected = `/${prefix}/*/{*path}`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(expected);
      expectConversionWarning(route, expected);
    });

    it('T14 gives the terminal * branch precedence over interior * conversion', () => {
      const prefix = routeSegment(141);
      const route = `/${prefix}/*/*`;
      // Current implementation uses replace('*', ...), not replaceAll, here.
      const expected = `/${prefix}/{*path}/*`;
      expect(LegacyRouteConverter.tryConvert(route)).toBe(expected);
      expectConversionWarning(route, expected);
    });
  });

  describe('diagnostic methods', () => {
    it('T15 printError reports the unsupported route through the logger', () => {
      const route = `/${routeSegment(151)}/:id?`;
      LegacyRouteConverter.printError(route);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual(
        expect.stringContaining(`Unsupported route path: "${route}".`),
      );
      expect(errors[0]).toEqual(
        expect.stringContaining('latest version of "path-to-regexp"'),
      );
      expect(warnings).toHaveLength(0);
    });

    it('T16 printWarning without a converted route uses the generic message', () => {
      const route = `/${routeSegment(161)}/:id?`;
      LegacyRouteConverter.printWarning(route);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toEqual(
        expect.stringContaining(`Unsupported route path: "${route}".`),
      );
      expect(warnings[0]).toMatch(/ Attempting to auto-convert\.\.\.$/);
      expect(errors).toHaveLength(0);
    });

    it('T17 printWarning with an explicitly empty conversion takes the falsy branch', () => {
      const route = `/${routeSegment(171)}/:id?`;
      LegacyRouteConverter.printWarning(route, '');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toEqual(
        expect.stringContaining(`Unsupported route path: "${route}".`),
      );
      expect(warnings[0]).toMatch(/ Attempting to auto-convert\.\.\.$/);
      expect(errors).toHaveLength(0);
    });
  });
});
