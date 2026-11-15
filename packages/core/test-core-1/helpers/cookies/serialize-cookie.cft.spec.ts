import { describe, expect, it } from 'vitest';
import { serializeCookie } from '../../../helpers/cookies/serialize-cookie.js';

type CookieOptions = NonNullable<Parameters<typeof serializeCookie>[2]>;

// Fixed-seed LCG: predictable, valid in-class data; no Math.random or clock.
const RANDOM_SEED = 1808;
const LETTERS = 'abcdefghijkmnopqrstuvwxyz';

function seededWord(salt: number, length = 10): string {
  let state = (RANDOM_SEED ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  let result = '';
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    result += LETTERS[state % LETTERS.length];
  }
  return result;
}

const NAME = seededWord(11);
const VALUE = seededWord(23);

// Only for deliberately malformed runtime values: the public TS type is stricter.
function runtimeOptions(properties: Record<string, unknown>): CookieOptions {
  return properties as unknown as CookieOptions;
}

// The target is pure: checking both error class and message can invoke it twice.
function expectTypeError(invoke: () => string, message: string): void {
  expect(invoke).toThrow(TypeError);
  expect(invoke).toThrow(message);
}

describe('serializeCookie - CFT', () => {
  it('T01 defaults options and path, omitting absent attributes', () => {
    expect(serializeCookie(NAME, VALUE)).toBe(`${NAME}=${VALUE}; Path=/`);
  });

  it('T02 accepts an empty value/path and explicit false flags', () => {
    expect(
      serializeCookie(NAME, '', {
        path: '',
        httpOnly: false,
        secure: false,
        partitioned: false,
      }),
    ).toBe(`${NAME}=; Path=`);
  });

  it('T03 percent-encodes reserved/non-ASCII value and uses supplied path', () => {
    const path = `/${seededWord(31)}/${seededWord(32)}`;
    expect(serializeCookie(NAME, 'hello; world/é', { path })).toBe(
      `${NAME}=hello%3B%20world%2F%C3%A9; Path=${path}`,
    );
  });

  it('T04 rejects a non-string cookie name before testing its pattern', () => {
    expectTypeError(
      () => serializeCookie(42 as unknown as string, VALUE),
      'Invalid cookie name: 42',
    );
  });

  it('T05 rejects a string name with forbidden token characters', () => {
    expectTypeError(
      () => serializeCookie('bad;name', VALUE),
      'Invalid cookie name:',
    );
  });

  it('T06 rejects a non-string cookie value', () => {
    expectTypeError(
      () => serializeCookie(NAME, 19 as unknown as string),
      `Invalid value for cookie "${NAME}": expected a string, received number`,
    );
  });

  it('T07 converts a URIError from an unpaired surrogate into TypeError', () => {
    expectTypeError(
      () => serializeCookie(NAME, 'broken\uD800'),
      `Invalid value for cookie "${NAME}": not a well-formed string`,
    );
  });

  it('T08 falls back to / when path is explicitly null', () => {
    expect(serializeCookie(NAME, VALUE, runtimeOptions({ path: null }))).toBe(
      `${NAME}=${VALUE}; Path=/`,
    );
  });

  it('T09 rejects a non-string path without evaluating the path regex', () => {
    expectTypeError(
      () => serializeCookie(NAME, VALUE, runtimeOptions({ path: 17 })),
      `Invalid path for cookie "${NAME}"`,
    );
  });

  it('T10 rejects semicolon and CRLF in a string path', () => {
    for (const path of ['/user; Secure', '/user\r\nX-Injected: yes']) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, { path }),
        `Invalid path for cookie "${NAME}"`,
      );
    }
  });

  it('T11 accepts a well-formed mixed-case domain with leading dot', () => {
    const domain = '.Sub.Example-Host.com';
    expect(serializeCookie(NAME, VALUE, { domain })).toBe(
      `${NAME}=${VALUE}; Path=/; Domain=${domain}`,
    );
  });

  it('T12 rejects non-string and null domain values', () => {
    for (const domain of [false, null]) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, runtimeOptions({ domain })),
        `Invalid domain for cookie "${NAME}"`,
      );
    }
  });

  it('T13 rejects malformed or header-injecting domain strings', () => {
    for (const domain of ['example..org', 'example.org; Secure', '-host.org']) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, { domain }),
        `Invalid domain for cookie "${NAME}"`,
      );
    }
  });

  it('T14 accepts positive, zero, and negative safe-integer Max-Age', () => {
    for (const maxAge of [3600, 0, -1800]) {
      expect(serializeCookie(NAME, VALUE, { maxAge })).toBe(
        `${NAME}=${VALUE}; Path=/; Max-Age=${maxAge}`,
      );
    }
  });

  it('T15 rejects fractional, unsafe, non-finite, and non-number Max-Age', () => {
    for (const maxAge of [1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '60', null]) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, runtimeOptions({ maxAge })),
        `Invalid maxAge for cookie "${NAME}": expected an integer number of seconds`,
      );
    }
  });

  it('T16 serializes a valid Date to an Expires UTC attribute', () => {
    const expires = new Date('2031-07-08T10:20:30.000Z');
    expect(serializeCookie(NAME, VALUE, { expires })).toBe(
      `${NAME}=${VALUE}; Path=/; Expires=Tue, 08 Jul 2031 10:20:30 GMT`,
    );
  });

  it('T17 rejects non-Date and null expires without calling getTime', () => {
    for (const expires of ['2031-07-08T10:20:30Z', null]) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, runtimeOptions({ expires })),
        `Invalid expires date for cookie "${NAME}"`,
      );
    }
  });

  it('T18 rejects a Date whose getTime is NaN', () => {
    expectTypeError(
      () => serializeCookie(NAME, VALUE, { expires: new Date(Number.NaN) }),
      `Invalid expires date for cookie "${NAME}"`,
    );
  });

  it('T19 serializes all allowed attributes in source order', () => {
    const expires = new Date('2035-01-02T03:04:05.000Z');
    const options: CookieOptions = {
      path: '/account',
      domain: 'example.com',
      maxAge: 2700,
      expires,
      httpOnly: true,
      secure: true,
      partitioned: true,
      priority: 'high',
      sameSite: 'none',
    };
    expect(serializeCookie(NAME, VALUE, options)).toBe(
      `${NAME}=${VALUE}; Path=/account; Domain=example.com; Max-Age=2700` +
        '; Expires=Tue, 02 Jan 2035 03:04:05 GMT; HttpOnly; Secure' +
        '; Partitioned; Priority=High; SameSite=None',
    );
  });

  it('T20 throws if partitioned is true and secure is false', () => {
    expectTypeError(
      () => serializeCookie(NAME, VALUE, { partitioned: true, secure: false }),
      `"partitioned" requires "secure: true"`,
    );
  });

  it('T21 includes Partitioned when secure is true', () => {
    expect(serializeCookie(NAME, VALUE, { partitioned: true, secure: true })).toBe(
      `${NAME}=${VALUE}; Path=/; Secure; Partitioned`,
    );
  });

  it('T22 maps each supported priority to canonical casing', () => {
    const cases: Array<['low' | 'medium' | 'high', string]> = [
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
    ];
    for (const [priority, canonical] of cases) {
      expect(serializeCookie(NAME, VALUE, { priority })).toBe(
        `${NAME}=${VALUE}; Path=/; Priority=${canonical}`,
      );
    }
  });

  it('T23 normalizes a mixed-case runtime priority', () => {
    expect(
      serializeCookie(NAME, VALUE, runtimeOptions({ priority: 'MeDiUm' })),
    ).toBe(`${NAME}=${VALUE}; Path=/; Priority=Medium`);
  });

  it('T24 rejects unrecognized priority values', () => {
    for (const priority of ['urgent', null]) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, runtimeOptions({ priority })),
        `Invalid priority for cookie "${NAME}"`,
      );
    }
  });

  it('T25 accepts Strict and Lax without secure (short-circuit)', () => {
    for (const [sameSite, canonical] of [
      ['strict', 'Strict'],
      ['lax', 'Lax'],
    ] as const) {
      expect(serializeCookie(NAME, VALUE, { sameSite, secure: false })).toBe(
        `${NAME}=${VALUE}; Path=/; SameSite=${canonical}`,
      );
    }
  });

  it('T26 normalizes a mixed-case runtime SameSite value', () => {
    expect(
      serializeCookie(NAME, VALUE, runtimeOptions({ sameSite: 'LaX' })),
    ).toBe(`${NAME}=${VALUE}; Path=/; SameSite=Lax`);
  });

  it('T27 rejects unrecognized SameSite values', () => {
    for (const sameSite of ['sometimes', null]) {
      expectTypeError(
        () => serializeCookie(NAME, VALUE, runtimeOptions({ sameSite })),
        `Invalid sameSite for cookie "${NAME}"`,
      );
    }
  });

  it('T28 throws for SameSite=None with secure false', () => {
    expectTypeError(
      () => serializeCookie(NAME, VALUE, { sameSite: 'none', secure: false }),
      `"sameSite: 'none'" requires "secure: true"`,
    );
  });

  it('T29 accepts SameSite=None when secure is true', () => {
    expect(serializeCookie(NAME, VALUE, { sameSite: 'none', secure: true })).toBe(
      `${NAME}=${VALUE}; Path=/; Secure; SameSite=None`,
    );
  });

  it('T30 treats HttpOnly and Secure as independent flags', () => {
    expect(serializeCookie(NAME, VALUE, { httpOnly: true, secure: false })).toBe(
      `${NAME}=${VALUE}; Path=/; HttpOnly`,
    );
    expect(serializeCookie(NAME, VALUE, { httpOnly: false, secure: true })).toBe(
      `${NAME}=${VALUE}; Path=/; Secure`,
    );
  });

  it('T31 accepts all RFC token punctuation allowed by the name regex', () => {
    const punctuationName = "A!#$%&'*+-.^_`|~9";
    expect(serializeCookie(punctuationName, VALUE)).toBe(
      `${punctuationName}=${VALUE}; Path=/`,
    );
  });
});
