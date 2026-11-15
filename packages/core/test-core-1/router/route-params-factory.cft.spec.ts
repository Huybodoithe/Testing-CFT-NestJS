import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteParamtypes } from '@nestjs/common/internal';

import type { ApplicationConfig } from '../../application-config.js';
import { CookieSigner } from '../../helpers/cookies/cookie-signer.js';
import { RouteParamsFactory } from '../../router/route-params-factory.js';

// The cookie helpers are a dependency boundary. The target factory remains real.
const cookieMocks = vi.hoisted(() => ({
  getRequestCookie: vi.fn(),
  getRequestCookies: vi.fn(),
  getRequestSignedCookie: vi.fn(),
  getRequestSignedCookies: vi.fn(),
}));

vi.mock(
  '../../helpers/cookies/request-cookies.js',
  () => cookieMocks,
);

// Local deterministic LCG: no Math.random, clock, network, or test-order state.
const RANDOM_SEED = 1808;

function seededNumber(salt: number): number {
  return (
    Math.imul(1664525, (RANDOM_SEED ^ salt) >>> 0) + 1013904223
  ) >>> 0;
}

function seededText(salt: number): string {
  return `v_${seededNumber(salt).toString(36)}`;
}

function seededByte(salt: number): number {
  return 16 + (seededNumber(salt) % 224);
}

function makeContext(req: Record<string, unknown> = {}) {
  return {
    req,
    res: { marker: seededText(1000) },
    next: vi.fn(),
  };
}

function select(
  key: RouteParamtypes | string,
  data: string,
  context: ReturnType<typeof makeContext>,
  factory: RouteParamsFactory = new RouteParamsFactory(),
) {
  return factory.exchangeKeyForValue(key, data, context);
}

function configReturning(signer: CookieSigner | undefined) {
  const getCookieSigner = vi.fn(() => signer);
  // RouteParamsFactory only reads this one public ApplicationConfig method.
  const config = { getCookieSigner } as unknown as ApplicationConfig;
  return { config, getCookieSigner };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RouteParamsFactory.exchangeKeyForValue - direct switch results', () => {
  it('T01 returns the exact next callback for NEXT', () => {
    const context = makeContext();
    expect(select(RouteParamtypes.NEXT, seededText(1), context)).toBe(
      context.next,
    );
  });

  it('T02 returns the exact request for REQUEST', () => {
    const context = makeContext({ id: seededText(2) });
    expect(select(RouteParamtypes.REQUEST, seededText(2), context)).toBe(
      context.req,
    );
  });

  it('T03 returns the exact response for RESPONSE', () => {
    const context = makeContext();
    expect(select(RouteParamtypes.RESPONSE, seededText(3), context)).toBe(
      context.res,
    );
  });

  it('T04 returns rawBody for RAW_BODY', () => {
    const rawBody = Buffer.from(seededText(4));
    const context = makeContext({ rawBody });
    expect(select(RouteParamtypes.RAW_BODY, '', context)).toBe(rawBody);
  });

  it('T05 returns session for SESSION', () => {
    const session = { sessionId: seededText(5) };
    expect(
      select(RouteParamtypes.SESSION, '', makeContext({ session })),
    ).toBe(session);
  });

  it('T06 returns files for FILES', () => {
    const files = [{ originalname: seededText(6) }];
    expect(select(RouteParamtypes.FILES, '', makeContext({ files }))).toBe(
      files,
    );
  });

  it('T07 returns ip for IP', () => {
    const ip = `10.18.${seededNumber(7) % 200 + 1}.72`;
    expect(select(RouteParamtypes.IP, '', makeContext({ ip }))).toBe(ip);
  });

  it('T08 returns null for a defined but unsupported enum member ACK', () => {
    expect(select(RouteParamtypes.ACK, '', makeContext())).toBeNull();
  });

  it('T09 returns null for an unknown string key', () => {
    expect(
      select(`unknown_${seededText(9)}`, '', makeContext()),
    ).toBeNull();
  });
});

describe('RouteParamsFactory.exchangeKeyForValue - BODY and getBodyProperty', () => {
  it('T10 returns the whole body when data is empty, without property selection', () => {
    const body = { [seededText(10)]: seededText(101) };
    expect(select(RouteParamtypes.BODY, '', makeContext({ body }))).toBe(body);
  });

  it('T11 returns undefined when data is truthy but the body is undefined', () => {
    expect(
      select(
        RouteParamtypes.BODY,
        seededText(11),
        makeContext({ body: undefined }),
      ),
    ).toBeUndefined();
  });

  it('T12 returns null when data is truthy but the body is null', () => {
    expect(
      select(RouteParamtypes.BODY, seededText(12), makeContext({ body: null })),
    ).toBeNull();
  });

  it('T13 reads an own property from a regular object body', () => {
    const key = `field_${seededText(13)}`;
    const value = seededText(131);
    expect(
      select(RouteParamtypes.BODY, key, makeContext({ body: { [key]: value } })),
    ).toBe(value);
  });

  it('T14 permits inherited methods of a class-instance body', () => {
    class CustomBody {
      readonly own = seededText(14);

      inheritedMethod() {
        return this.own;
      }
    }

    const body = new CustomBody();
    expect(
      select(
        RouteParamtypes.BODY,
        'inheritedMethod',
        makeContext({ body }),
      ),
    ).toBe(body.inheritedMethod);
  });

  it('T15 returns undefined for a missing property of a regular object', () => {
    expect(
      select(
        RouteParamtypes.BODY,
        `missing_${seededText(15)}`,
        makeContext({ body: { present: seededText(151) } }),
      ),
    ).toBeUndefined();
  });

  it('T16 allows an array own numeric index', () => {
    const body = [seededText(161), seededText(162), seededText(163)];
    expect(select(RouteParamtypes.BODY, '1', makeContext({ body }))).toBe(
      body[1],
    );
  });

  it('T17 rejects an inherited Array.prototype member', () => {
    const body = [seededText(17)];
    expect(
      select(RouteParamtypes.BODY, 'map', makeContext({ body })),
    ).toBeUndefined();
  });

  it('T18 allows the own length property of an array', () => {
    const body = [seededText(181), seededText(182), seededText(183)];
    expect(select(RouteParamtypes.BODY, 'length', makeContext({ body }))).toBe(
      body.length,
    );
  });

  it('T19 allows a Buffer own numeric index via the view branch', () => {
    const body = Buffer.from([seededByte(191), seededByte(192)]);
    expect(select(RouteParamtypes.BODY, '1', makeContext({ body }))).toBe(
      body[1],
    );
  });

  it('T20 rejects Buffer.prototype.parent rather than exposing shared memory', () => {
    const body = Buffer.from([seededByte(20), seededByte(201)]);
    expect(
      select(RouteParamtypes.BODY, 'parent', makeContext({ body })),
    ).toBeUndefined();
  });

  it('T21 allows a typed-array own numeric index', () => {
    const body = Uint8Array.of(seededByte(211), seededByte(212));
    expect(select(RouteParamtypes.BODY, '0', makeContext({ body }))).toBe(
      body[0],
    );
  });

  it('T22 allows an own character index of a primitive string body', () => {
    const body = seededText(22);
    expect(select(RouteParamtypes.BODY, '2', makeContext({ body }))).toBe(
      body[2],
    );
  });

  it('T23 rejects an inherited string primitive method', () => {
    const body = seededText(23);
    expect(
      select(RouteParamtypes.BODY, 'toString', makeContext({ body })),
    ).toBeUndefined();
  });

  it('T24 returns undefined for a non-own property of a truthy number', () => {
    const body = 100 + (seededNumber(24) % 900);
    expect(
      select(RouteParamtypes.BODY, 'toString', makeContext({ body })),
    ).toBeUndefined();
  });

  it('T25 allows a function body own property through the Object.hasOwn branch', () => {
    const payload = seededText(25);
    const body = Object.assign(() => seededText(251), { payload });
    expect(select(RouteParamtypes.BODY, 'payload', makeContext({ body }))).toBe(
      payload,
    );
  });

  it('T26 rejects an inherited function method', () => {
    const body = () => seededText(26);
    expect(
      select(RouteParamtypes.BODY, 'call', makeContext({ body })),
    ).toBeUndefined();
  });
});

describe('RouteParamsFactory.exchangeKeyForValue - keyed request sources', () => {
  it('T27 returns the complete params object when data is empty', () => {
    const params = { id: seededText(27) };
    expect(
      select(RouteParamtypes.PARAM, '', makeContext({ params })),
    ).toBe(params);
  });

  it('T28 returns a named route param when data is truthy', () => {
    const name = `key_${seededText(28)}`;
    const value = seededText(281);
    expect(
      select(
        RouteParamtypes.PARAM,
        name,
        makeContext({ params: { [name]: value } }),
      ),
    ).toBe(value);
  });

  it('T29 returns an empty object if hosts is missing and data is empty', () => {
    expect(select(RouteParamtypes.HOST, '', makeContext())).toEqual({});
  });

  it('T30 returns the original hosts object if present and data is empty', () => {
    const hosts = { api: seededText(30) };
    expect(select(RouteParamtypes.HOST, '', makeContext({ hosts }))).toBe(
      hosts,
    );
  });

  it('T31 returns a named host from a present hosts object', () => {
    const name = `sub_${seededText(31)}`;
    const value = seededText(311);
    expect(
      select(
        RouteParamtypes.HOST,
        name,
        makeContext({ hosts: { [name]: value } }),
      ),
    ).toBe(value);
  });

  it('T32 returns undefined for a named host when hosts is missing', () => {
    expect(
      select(RouteParamtypes.HOST, seededText(32), makeContext()),
    ).toBeUndefined();
  });

  it('T33 returns the whole query object when data is empty', () => {
    const query = { filter: seededText(33) };
    expect(select(RouteParamtypes.QUERY, '', makeContext({ query }))).toBe(
      query,
    );
  });

  it('T34 returns a named query entry when data is truthy', () => {
    const name = `filter_${seededText(34)}`;
    const value = seededText(341);
    expect(
      select(
        RouteParamtypes.QUERY,
        name,
        makeContext({ query: { [name]: value } }),
      ),
    ).toBe(value);
  });

  it('T35 returns the complete headers object when data is empty', () => {
    const headers = { 'x-id': seededText(35) };
    expect(
      select(RouteParamtypes.HEADERS, '', makeContext({ headers })),
    ).toBe(headers);
  });

  it('T36 lowercases a named header key before looking it up', () => {
    const name = `X-Id-${seededText(36).toUpperCase()}`;
    const value = seededText(361);
    const headers = { [name.toLowerCase()]: value };
    expect(
      select(RouteParamtypes.HEADERS, name, makeContext({ headers })),
    ).toBe(value);
  });

  it('T37 uses the default file property when data is empty', () => {
    const file = { originalname: seededText(37) };
    expect(select(RouteParamtypes.FILE, '', makeContext({ file }))).toBe(file);
  });

  it('T38 uses data as the file property when nonempty', () => {
    const name = `upload_${seededText(38)}`;
    const file = { originalname: seededText(381) };
    expect(
      select(RouteParamtypes.FILE, name, makeContext({ [name]: file })),
    ).toBe(file);
  });
});

describe('RouteParamsFactory.exchangeKeyForValue - cookie helper dispatch', () => {
  it('T39 delegates COOKIES without data to getRequestCookies', () => {
    const context = makeContext({ headers: { cookie: seededText(39) } });
    const cookies = { sid: seededText(391) };
    cookieMocks.getRequestCookies.mockReturnValue(cookies);

    expect(select(RouteParamtypes.COOKIES, '', context)).toBe(cookies);
    expect(cookieMocks.getRequestCookies).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestCookies).toHaveBeenCalledWith(context.req);
    expect(cookieMocks.getRequestCookie).not.toHaveBeenCalled();
  });

  it('T40 delegates named COOKIES to getRequestCookie', () => {
    const name = `sid_${seededText(40)}`;
    const value = seededText(401);
    const context = makeContext({ headers: {} });
    cookieMocks.getRequestCookie.mockReturnValue(value);

    expect(select(RouteParamtypes.COOKIES, name, context)).toBe(value);
    expect(cookieMocks.getRequestCookie).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestCookie).toHaveBeenCalledWith(
      context.req,
      name,
    );
    expect(cookieMocks.getRequestCookies).not.toHaveBeenCalled();
  });

  it('T41 passes an undefined signer for unkeyed SIGNED_COOKIES without config', () => {
    const context = makeContext({ headers: {} });
    const cookies = { sid: seededText(41) };
    cookieMocks.getRequestSignedCookies.mockReturnValue(cookies);

    expect(select(RouteParamtypes.SIGNED_COOKIES, '', context)).toBe(cookies);
    expect(cookieMocks.getRequestSignedCookies).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookies).toHaveBeenCalledWith(
      context.req,
      undefined,
    );
    expect(cookieMocks.getRequestSignedCookie).not.toHaveBeenCalled();
  });

  it('T42 passes an undefined signer for named SIGNED_COOKIES without config', () => {
    const context = makeContext({ headers: {} });
    const name = `signed_${seededText(42)}`;
    const value = seededText(421);
    cookieMocks.getRequestSignedCookie.mockReturnValue(value);

    expect(select(RouteParamtypes.SIGNED_COOKIES, name, context)).toBe(value);
    expect(cookieMocks.getRequestSignedCookie).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookie).toHaveBeenCalledWith(
      context.req,
      name,
      undefined,
    );
    expect(cookieMocks.getRequestSignedCookies).not.toHaveBeenCalled();
  });

  it('T43 gets the configured signer for unkeyed SIGNED_COOKIES', () => {
    const signer = new CookieSigner(seededText(43));
    const { config, getCookieSigner } = configReturning(signer);
    const factory = new RouteParamsFactory(config);
    const context = makeContext({ headers: {} });
    const cookies = { sid: seededText(431) };
    cookieMocks.getRequestSignedCookies.mockReturnValue(cookies);

    expect(select(RouteParamtypes.SIGNED_COOKIES, '', context, factory)).toBe(
      cookies,
    );
    expect(getCookieSigner).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookies).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookies).toHaveBeenCalledWith(
      context.req,
      signer,
    );
    expect(cookieMocks.getRequestSignedCookie).not.toHaveBeenCalled();
  });

  it('T44 gets the configured signer for named SIGNED_COOKIES', () => {
    const signer = new CookieSigner(seededText(44));
    const { config, getCookieSigner } = configReturning(signer);
    const factory = new RouteParamsFactory(config);
    const context = makeContext({ headers: {} });
    const name = `signed_${seededText(441)}`;
    const value = seededText(442);
    cookieMocks.getRequestSignedCookie.mockReturnValue(value);

    expect(
      select(RouteParamtypes.SIGNED_COOKIES, name, context, factory),
    ).toBe(value);
    expect(getCookieSigner).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookie).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookie).toHaveBeenCalledWith(
      context.req,
      name,
      signer,
    );
    expect(cookieMocks.getRequestSignedCookies).not.toHaveBeenCalled();
  });

  it('T45 passes undefined when a present config has no cookie signer', () => {
    const { config, getCookieSigner } = configReturning(undefined);
    const context = makeContext({ headers: {} });
    const cookies = { sid: seededText(45) };
    cookieMocks.getRequestSignedCookies.mockReturnValue(cookies);

    expect(
      select(
        RouteParamtypes.SIGNED_COOKIES,
        '',
        context,
        new RouteParamsFactory(config),
      ),
    ).toBe(cookies);
    expect(getCookieSigner).toHaveBeenCalledOnce();
    expect(cookieMocks.getRequestSignedCookies).toHaveBeenCalledWith(
      context.req,
      undefined,
    );
  });
});
