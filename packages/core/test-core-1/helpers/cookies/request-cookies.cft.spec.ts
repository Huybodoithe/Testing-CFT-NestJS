import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieSigner } from '../../../helpers/cookies/cookie-signer.js';
import {
  getRequestCookie,
  getRequestCookies,
  getRequestSignedCookie,
  getRequestSignedCookies,
} from '../../../helpers/cookies/request-cookies.js';

/** Reproducible, non-boundary sample values: xorshift32, base seed 1808. */
const RANDOM_SEED = 1808;
function sampleWord(salt: number): string {
  let state = (RANDOM_SEED + Math.imul(salt, 0x9e3779b9)) >>> 0;
  let result = '';
  for (let i = 0; i < 14; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result += String.fromCharCode(97 + ((state >>> 0) % 26));
  }
  return result;
}

const NAME_A = `session_${sampleWord(1)}`;
const NAME_B = `identity_${sampleWord(2)}`;
const NAME_C = `pref_${sampleWord(3)}`;
const VALUE_A = sampleWord(11);
const VALUE_B = sampleWord(12);
const VALUE_C = sampleWord(13);
const createSigner = () => new CookieSigner(sampleWord(20));
const headerPair = (name: string, value: string) =>
  `${name}=${encodeURIComponent(value)}`;
const requestWithHeader = (cookie: string) => ({ headers: { cookie } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request-cookies.ts / getRequestCookies and getRequestCookie', () => {
  it('T01 - uses middleware cookies instead of a conflicting Cookie header (B3 true)', () => {
    const cookies = { [NAME_A]: VALUE_A };
    const req = {
      cookies,
      headers: { cookie: headerPair(NAME_A, VALUE_B) },
    };

    expect(getRequestCookies(req)).toBe(cookies);
    expect(getRequestCookie(req, NAME_A)).toBe(VALUE_A);
  });

  it('T02 - parses once on a cache miss, reuses it on a hit, and keys the cache by request (B1)', () => {
    const req = requestWithHeader(headerPair(NAME_A, VALUE_A));
    const parsed = getRequestCookies(req);
    expect(parsed[NAME_A]).toBe(VALUE_A);
    expect(Object.getPrototypeOf(parsed)).toBeNull();

    req.headers.cookie = headerPair(NAME_A, VALUE_B);
    expect(getRequestCookies(req)).toBe(parsed);
    expect(getRequestCookie(req, NAME_A)).toBe(VALUE_A);

    const other = getRequestCookies(requestWithHeader(headerPair(NAME_A, VALUE_B)));
    expect(other).not.toBe(parsed);
    expect(other[NAME_A]).toBe(VALUE_B);
  });

  it('T03 - handles null middleware cookies and absent headers via optional chaining (B2/B3 false)', () => {
    const req = { cookies: null };
    const cookies = getRequestCookies(req);

    expect(Object.keys(cookies)).toEqual([]);
    expect(Object.getPrototypeOf(cookies)).toBeNull();
    expect(getRequestCookie(req, NAME_A)).toBeUndefined();
  });

  it('T04 - rejects a non-object middleware value and parses the header (B3 false)', () => {
    const req = {
      cookies: () => VALUE_B,
      headers: { cookie: headerPair(NAME_A, VALUE_A) },
    };

    expect(getRequestCookies(req)[NAME_A]).toBe(VALUE_A);
  });

  it('T05 - returns an own middleware cookie (B4 true)', () => {
    const req = { cookies: { [NAME_A]: VALUE_A } };
    expect(getRequestCookie(req, NAME_A)).toBe(VALUE_A);
  });

  it('T06 - does not expose inherited middleware properties, including constructor (B4 false)', () => {
    const inherited = { [NAME_A]: VALUE_A, constructor: VALUE_B };
    const req = { cookies: Object.create(inherited) as Record<string, string> };

    expect(getRequestCookie(req, NAME_A)).toBeUndefined();
    expect(getRequestCookie(req, 'constructor')).toBeUndefined();
  });

  it('T07 - reads own constructor and __proto__ names from a parsed null-prototype header (B4 true)', () => {
    const req = requestWithHeader(
      `${headerPair('constructor', VALUE_A)}; ${headerPair('__proto__', VALUE_B)}`,
    );

    expect(getRequestCookie(req, 'constructor')).toBe(VALUE_A);
    expect(getRequestCookie(req, '__proto__')).toBe(VALUE_B);
  });

  it('T08 - returns undefined for a missing ordinary name (B4 false)', () => {
    expect(
      getRequestCookie(requestWithHeader(headerPair(NAME_A, VALUE_A)), NAME_B),
    ).toBeUndefined();
  });
});

describe('request-cookies.ts / getRequestSignedCookies', () => {
  it('T09 - signer with no header entries takes zero loop iterations (B5/B6)', () => {
    const signer = createSigner();
    const unsign = vi.spyOn(signer, 'unsign');
    const signedCookies = getRequestSignedCookies({ headers: {} }, signer);

    expect(Object.keys(signedCookies)).toEqual([]);
    expect(Object.getPrototypeOf(signedCookies)).toBeNull();
    expect(unsign).not.toHaveBeenCalled();
  });

  it('T10 - signer with one valid cookie keeps its unsigned value (B6 one / B7 true)', () => {
    const signer = createSigner();
    const req = requestWithHeader(headerPair(NAME_A, signer.sign(VALUE_A)));

    const cookies = getRequestSignedCookies(req, signer);
    expect(Object.keys(cookies)).toEqual([NAME_A]);
    expect(cookies[NAME_A]).toBe(VALUE_A);
  });

  it('T11 - signer processes multiple cookies, dropping invalid and keeping empty unsigned values (B6 many / B7 both)', () => {
    const signer = createSigner();
    const invalidSignature = `${signer.sign(VALUE_B)}corrupt`;
    const req = {
      headers: {
        cookie: [
          headerPair(NAME_A, signer.sign(VALUE_A)),
          headerPair(NAME_B, invalidSignature),
          headerPair(NAME_C, signer.sign('')),
        ].join('; '),
      },
      // With a signer, middleware cookie stores must not replace raw header data.
      cookies: { [NAME_A]: VALUE_C },
      signedCookies: { [NAME_B]: VALUE_B },
    };
    const unsign = vi.spyOn(signer, 'unsign');

    const cookies = getRequestSignedCookies(req, signer);
    expect(Object.keys(cookies)).toEqual([NAME_A, NAME_C]);
    expect(cookies[NAME_A]).toBe(VALUE_A);
    expect(cookies[NAME_C]).toBe('');
    expect(Object.getPrototypeOf(cookies)).toBeNull();
    expect(unsign).toHaveBeenCalledTimes(3);
    expect(unsign).toHaveBeenNthCalledWith(2, invalidSignature);
  });

  it('T12 - absent signer accepts empty middleware signedCookies with zero iterations (B5 false / B8 true / B9 zero)', () => {
    const cookies = getRequestSignedCookies({ signedCookies: {} }, undefined);
    expect(Object.keys(cookies)).toEqual([]);
    expect(Object.getPrototypeOf(cookies)).toBeNull();
  });

  it('T13 - absent signer retains a single valid middleware entry (B9 one / B10 true)', () => {
    const cookies = getRequestSignedCookies(
      { signedCookies: { [NAME_A]: VALUE_A } },
      undefined,
    );

    expect(Object.keys(cookies)).toEqual([NAME_A]);
    expect(cookies[NAME_A]).toBe(VALUE_A);
  });

  it('T14 - absent signer drops false, preserves other values, and excludes inherited entries (B9 many / B10 both)', () => {
    const jsonValue = { nested: VALUE_C };
    const middleware = Object.assign(
      Object.create({ inheritedOnly: VALUE_B }),
      {
        [NAME_A]: VALUE_A,
        [NAME_B]: false,
        [NAME_C]: jsonValue,
        nullish: null,
        numeric: 0,
        empty: '',
      },
    );

    const cookies = getRequestSignedCookies(
      { signedCookies: middleware },
      undefined,
    );
    expect(Object.keys(cookies)).toEqual([
      NAME_A,
      NAME_C,
      'nullish',
      'numeric',
      'empty',
    ]);
    expect(cookies[NAME_A]).toBe(VALUE_A);
    expect(cookies[NAME_C]).toBe(jsonValue);
    expect(cookies['nullish']).toBeNull();
    expect(cookies['numeric']).toBe(0);
    expect(cookies['empty']).toBe('');
    expect(Object.getPrototypeOf(cookies)).toBeNull();
  });

  it('T15 - without signer or middleware signedCookies it throws the configuration error (B8 false)', () => {
    expect(() => getRequestSignedCookies({ headers: {} }, undefined)).toThrow(
      'Cannot read signed cookies: no cookie secret is configured.',
    );
  });

  it('T16 - non-object middleware values also follow the error branch (B8 false)', () => {
    for (const invalid of [null, false, VALUE_A]) {
      expect(() => getRequestSignedCookies({ signedCookies: invalid }, undefined)).toThrow(
        'Cannot read signed cookies: no cookie secret is configured.',
      );
    }
  });
});

describe('request-cookies.ts / getRequestSignedCookie', () => {
  it('T17 - signer with a missing key returns early without unsign (B11 true / B12 true)', () => {
    const signer = createSigner();
    const unsign = vi.spyOn(signer, 'unsign');
    const req = requestWithHeader(headerPair(NAME_A, signer.sign(VALUE_A)));

    expect(getRequestSignedCookie(req, NAME_B, signer)).toBeUndefined();
    expect(getRequestSignedCookie(req, 'constructor', signer)).toBeUndefined();
    expect(unsign).not.toHaveBeenCalled();
  });

  it('T18 - signer verifies a present cookie (B11 true / B12 false)', () => {
    const signer = createSigner();
    const req = requestWithHeader(headerPair(NAME_A, signer.sign(VALUE_A)));

    expect(getRequestSignedCookie(req, NAME_A, signer)).toBe(VALUE_A);
  });

  it('T19 - signer rejects an invalid signature rather than using signedCookies fallback (B12 false)', () => {
    const signer = createSigner();
    const req = {
      headers: { cookie: headerPair(NAME_A, `${signer.sign(VALUE_A)}corrupt`) },
      signedCookies: { [NAME_A]: VALUE_B },
    };

    expect(getRequestSignedCookie(req, NAME_A, signer)).toBeUndefined();
  });

  it('T20 - without signer reads a valid middleware signed cookie (B11 false)', () => {
    const req = { signedCookies: { [NAME_A]: VALUE_A } };
    expect(getRequestSignedCookie(req, NAME_A, undefined)).toBe(VALUE_A);
  });

  it('T21 - without signer returns undefined for invalid and absent keys (B11 false / B10 false)', () => {
    const req = { signedCookies: { [NAME_A]: false, [NAME_B]: VALUE_B } };

    expect(getRequestSignedCookie(req, NAME_A, undefined)).toBeUndefined();
    expect(getRequestSignedCookie(req, NAME_C, undefined)).toBeUndefined();
  });

  it('T22 - without signer propagates missing signedCookies configuration error (B11 false / B8 false)', () => {
    expect(() => getRequestSignedCookie({}, NAME_A, undefined)).toThrow(
      'Cannot read signed cookies: no cookie secret is configured.',
    );
  });

  it('T23 - all public header-reading APIs share the same parsed per-request cache (B1 hit)', () => {
    const signer = createSigner();
    const original = signer.sign(VALUE_A);
    const req = requestWithHeader(headerPair(NAME_A, original));

    expect(getRequestCookie(req, NAME_A)).toBe(original);
    req.headers.cookie = headerPair(NAME_A, signer.sign(VALUE_B));
    expect(getRequestSignedCookie(req, NAME_A, signer)).toBe(VALUE_A);
    expect(getRequestSignedCookies(req, signer)[NAME_A]).toBe(VALUE_A);
  });
});
