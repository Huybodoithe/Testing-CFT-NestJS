import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpException,
  HttpStatus,
  IntrinsicException,
  Logger,
  type ArgumentsHost,
  type HttpServer,
} from '@nestjs/common';
import type { AbstractHttpAdapter } from '../../adapters/index.js';
import { HttpAdapterHost } from '../../helpers/http-adapter-host.js';
import { BaseExceptionFilter } from '../../exceptions/base-exception-filter.js';

// A one-step LCG fixture generator: each input salt is independent of test order.
const RANDOM_SEED = 1808;
function seededInt(salt: number, min: number, max: number): number {
  const value = (Math.imul(RANDOM_SEED ^ salt, 1664525) + 1013904223) >>> 0;
  return min + (value % (max - min + 1));
}
function textFor(salt: number): string {
  return `cft-${seededInt(salt, 1000, 9999)}`;
}
function validHttpStatus(): number {
  return seededInt(20, 410, 490);
}

function createHarness(headersSent = false) {
  const response = { requestId: textFor(80) };
  const adapter = {
    isHeadersSent: vi.fn((_response: unknown) => headersSent),
    reply: vi.fn((_response: unknown, _body: unknown, _status: number) => undefined),
    end: vi.fn((_response: unknown) => undefined),
  };
  // ArgumentsHost/HttpServer expose additional framework methods that this
  // particular target never calls. Only the three adapter methods are stubbed.
  const host = {
    getArgByIndex: vi.fn((index: number) => (index === 1 ? response : undefined)),
  } as unknown as ArgumentsHost;
  return { response, adapter, host };
}

type Harness = ReturnType<typeof createHarness>;
function makeFilter(harness: Harness): BaseExceptionFilter<unknown> {
  return new BaseExceptionFilter<unknown>(
    harness.adapter as unknown as HttpServer,
  );
}

function injectAdapterHost(
  filter: BaseExceptionFilter<unknown>,
  adapter?: Harness['adapter'],
): void {
  const holder = new HttpAdapterHost();
  if (adapter !== undefined) {
    holder.httpAdapter = adapter as unknown as AbstractHttpAdapter;
  }
  // Simulates Nest's @Inject property assignment; does not replace any target method.
  Reflect.set(filter, 'httpAdapterHost', holder);
}

describe('BaseExceptionFilter CFT', () => {
  beforeEach(() => {
    // Suppress real logging while keeping the target's static Logger instance real.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('catch: HttpException and adapter selection', () => {
    it('T01 replies with a primitive HttpException response and omits absent errorCode', () => {
      const h = createHarness();
      const filter = makeFilter(h);
      const status = validHttpStatus();
      const message = textFor(1);
      filter.catch(new HttpException(message, status), h.host);
      expect(h.host.getArgByIndex).toHaveBeenCalledWith(1);
      expect(h.adapter.isHeadersSent).toHaveBeenCalledWith(h.response);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: status, message },
        status,
      );
      expect(h.adapter.end).not.toHaveBeenCalled();
    });

    it('T02 includes an explicitly defined HttpException errorCode', () => {
      const h = createHarness();
      const status = validHttpStatus();
      const message = textFor(2);
      const errorCode = textFor(3);
      makeFilter(h).catch(new HttpException(message, status, { errorCode }), h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: status, message, errorCode },
        status,
      );
    });

    it('T03 forwards an object response unchanged, even when errorCode exists', () => {
      const h = createHarness();
      const status = validHttpStatus();
      const payload = { message: textFor(4), details: { request: textFor(5) } };
      makeFilter(h).catch(
        new HttpException(payload, status, { errorCode: textFor(6) }),
        h.host,
      );
      expect(h.adapter.reply).toHaveBeenCalledWith(h.response, payload, status);
      expect(h.adapter.reply.mock.calls[0][1]).toBe(payload);
    });

    it('T04 ends an already-sent HttpException response without replying', () => {
      const h = createHarness(true);
      makeFilter(h).catch(new HttpException(textFor(7), validHttpStatus()), h.host);
      expect(h.adapter.end).toHaveBeenCalledWith(h.response);
      expect(h.adapter.reply).not.toHaveBeenCalled();
    });

    it('T05 falls back to the injected HttpAdapterHost when constructor adapter is absent', () => {
      const h = createHarness();
      const filter = new BaseExceptionFilter<unknown>();
      injectAdapterHost(filter, h.adapter);
      const status = validHttpStatus();
      filter.catch(new HttpException(textFor(8), status), h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: status, message: textFor(8) },
        status,
      );
    });

    it('T06 prefers the constructor adapter over a separately injected adapter', () => {
      const direct = createHarness();
      const injected = createHarness();
      const filter = makeFilter(direct);
      injectAdapterHost(filter, injected.adapter);
      filter.catch(new HttpException(textFor(9), validHttpStatus()), direct.host);
      expect(direct.adapter.reply).toHaveBeenCalledOnce();
      expect(injected.adapter.isHeadersSent).not.toHaveBeenCalled();
      expect(injected.adapter.reply).not.toHaveBeenCalled();
    });

    it('T07 throws on an HttpException when no constructor or injected adapter exists', () => {
      const h = createHarness();
      const filter = new BaseExceptionFilter<unknown>();
      expect(() =>
        filter.catch(new HttpException(textFor(10), validHttpStatus()), h.host),
      ).toThrow(TypeError);
      expect(h.host.getArgByIndex).toHaveBeenCalledWith(1);
    });

    it('T08 throws when HttpAdapterHost exists but has no httpAdapter', () => {
      const h = createHarness();
      const filter = new BaseExceptionFilter<unknown>();
      injectAdapterHost(filter);
      expect(() =>
        filter.catch(new HttpException(textFor(11), validHttpStatus()), h.host),
      ).toThrow(TypeError);
    });
  });

  describe('catch: unknown errors, response and logging', () => {
    it('T09 returns a generic 500 body and logs an ordinary Error', () => {
      const h = createHarness();
      const err = new Error(textFor(12));
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(Logger.prototype.error).toHaveBeenCalledWith(err);
      expect(h.adapter.end).not.toHaveBeenCalled();
    });

    it('T10 ends a previously-sent response for an unknown Error, but still logs it', () => {
      const h = createHarness(true);
      const err = new Error(textFor(13));
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).not.toHaveBeenCalled();
      expect(h.adapter.end).toHaveBeenCalledWith(h.response);
      expect(Logger.prototype.error).toHaveBeenCalledWith(err);
    });

    it('T11 replies with a valid plain HTTP-shaped error and logs it', () => {
      const h = createHarness();
      const err = { statusCode: validHttpStatus(), message: textFor(14) };
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: err.statusCode, message: err.message },
        err.statusCode,
      );
      expect(Logger.prototype.error).toHaveBeenCalledWith(err);
    });

    it('T12 suppresses logging for an IntrinsicException and uses the generic body', () => {
      const h = createHarness();
      const err = new IntrinsicException(textFor(15));
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: 500, message: 'Internal server error' },
        500,
      );
      expect(Logger.prototype.error).not.toHaveBeenCalled();
    });

    it('T13 hides an http-errors message when expose=false and status text exists', () => {
      const h = createHarness();
      const err = Object.assign(new Error(textFor(16)), {
        expose: false,
        statusCode: 503,
        status: 503,
      });
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: 503, message: 'Service Unavailable' },
        503,
      );
      expect(Logger.prototype.error).toHaveBeenCalledWith(err);
    });

    it('T14 substitutes the generic message when expose=false and status text is absent', () => {
      const h = createHarness();
      // Deliberately outside STATUS_CODES: the http-errors signature itself
      // does not validate a numeric status range.
      const err = Object.assign(new Error(textFor(17)), {
        expose: false,
        statusCode: 799,
        status: 799,
      });
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: 799, message: 'Internal server error' },
        799,
      );
    });

    it('T15 recognizes an Error whose constructor is named FastifyError', () => {
      class FastifyError extends Error {
        code = 'FST_ERR_VALIDATION';
        statusCode = validHttpStatus();
      }
      const h = createHarness();
      const err = new FastifyError(textFor(18));
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: err.statusCode, message: err.message },
        err.statusCode,
      );
    });

    it('T16 recognizes a plain Fastify validation error by its code', () => {
      const h = createHarness();
      const err = {
        code: 'FST_ERR_VALIDATION',
        statusCode: validHttpStatus(),
        message: textFor(19),
      };
      makeFilter(h).catch(err, h.host);
      expect(h.adapter.reply).toHaveBeenCalledWith(
        h.response,
        { statusCode: err.statusCode, message: err.message },
        err.statusCode,
      );
    });
  });

  describe('isExceptionObject: object and truthy message conditions', () => {
    const filter = new BaseExceptionFilter<unknown>();

    it('T17 rejects null before testing message truthiness', () => {
      expect(filter.isExceptionObject(null)).toBe(false);
    });
    it('T18 rejects an object whose message is empty', () => {
      expect(filter.isExceptionObject({ message: '' })).toBe(false);
    });
    it('T19 accepts an object with a non-empty string message', () => {
      expect(filter.isExceptionObject({ message: textFor(21) })).toBe(true);
    });
    it('T20 follows truthiness even when message is not a string', () => {
      expect(filter.isExceptionObject({ message: seededInt(22, 10, 90) })).toBe(true);
    });
  });

  describe('isHttpError: discriminators and short-circuit paths', () => {
    const filter = new BaseExceptionFilter<unknown>();

    it('T21 rejects falsy values via the first disjunct', () => {
      for (const value of [null, undefined, false, 0]) {
        expect(filter.isHttpError(value)).toBe(false);
      }
    });

    it('T22 rejects truthy primitives and functions via typeof', () => {
      for (const value of [seededInt(23, 11, 99), textFor(24), () => 1]) {
        expect(filter.isHttpError(value)).toBe(false);
      }
    });

    it('T23 rejects FastifyError when code is not a string', () => {
      class FastifyError extends Error {}
      const err = Object.assign(new FastifyError(textFor(25)), {
        code: seededInt(25, 11, 99),
        statusCode: validHttpStatus(),
      });
      expect(filter.isHttpError(err)).toBe(false);
    });

    it('T24 rejects FastifyError when statusCode is not a number', () => {
      class FastifyError extends Error {}
      const err = Object.assign(new FastifyError(textFor(26)), {
        code: 'FST_ERR_VALIDATION',
        statusCode: textFor(27),
      });
      expect(filter.isHttpError(err)).toBe(false);
    });

    it('T25 recognizes a named FastifyError with a non-validation string code', () => {
      class FastifyError extends Error {}
      const err = Object.assign(new FastifyError(textFor(28)), {
        code: 'FST_OTHER_CODE',
        statusCode: validHttpStatus(),
      });
      expect(filter.isHttpError(err)).toBe(true);
    });

    it('T26 rejects an ordinary Error without expose and stops at instanceof Error', () => {
      expect(filter.isHttpError(new Error(textFor(29)))).toBe(false);
    });

    it('T27 rejects the http-errors signature when statusCode is nonnumeric', () => {
      const err = Object.assign(new Error(textFor(30)), {
        expose: true,
        statusCode: 'bad-status',
        status: 'bad-status',
      });
      expect(filter.isHttpError(err)).toBe(false);
    });

    it('T28 rejects the http-errors signature when status and statusCode differ', () => {
      const statusCode = validHttpStatus();
      const err = Object.assign(new Error(textFor(31)), {
        expose: true,
        statusCode,
        status: statusCode + 1,
      });
      expect(filter.isHttpError(err)).toBe(false);
    });

    it('T29 continues to the plain-object fallback when the error is not instanceof Error', () => {
      const statusCode = validHttpStatus();
      const err = { expose: true, statusCode, status: statusCode, message: textFor(32) };
      expect(filter.isHttpError(err)).toBe(true);
    });

    it('T30 rejects a nonintegral plain-object status', () => {
      expect(filter.isHttpError({ statusCode: 431.5, message: textFor(33) })).toBe(false);
    });
    it('T31 rejects a plain-object status below 400', () => {
      expect(filter.isHttpError({ statusCode: 399, message: textFor(34) })).toBe(false);
    });
    it('T32 rejects a plain-object status of 600', () => {
      expect(filter.isHttpError({ statusCode: 600, message: textFor(35) })).toBe(false);
    });
    it('T33 rejects a non-string plain-object message', () => {
      expect(filter.isHttpError({ statusCode: validHttpStatus(), message: 23 })).toBe(false);
    });
    it('T34 rejects an empty plain-object message', () => {
      expect(filter.isHttpError({ statusCode: validHttpStatus(), message: '' })).toBe(false);
    });
    it('T35 supports a plain HTTP object without a constructor property', () => {
      const err = Object.assign(Object.create(null) as Record<string, unknown>, {
        statusCode: validHttpStatus(),
        message: textFor(36),
      });
      expect(filter.isHttpError(err)).toBe(true);
    });
    it('T39 accepts a validation code without a constructor property', () => {
      const err = Object.assign(Object.create(null) as Record<string, unknown>, {
        code: 'FST_ERR_VALIDATION',
        statusCode: validHttpStatus(),
        message: textFor(39),
      });
      expect(filter.isHttpError(err)).toBe(true);
    });
  });

  describe('getHttpErrorMessage: exposure and status-text fallback', () => {
    const filter = new BaseExceptionFilter<unknown>();

    it('T36 returns the original message with expose=true', () => {
      const message = textFor(37);
      expect(filter.getHttpErrorMessage({ statusCode: validHttpStatus(), message, expose: true })).toBe(message);
    });
    it('T37 returns the original message with expose undefined', () => {
      const message = textFor(38);
      expect(filter.getHttpErrorMessage({ statusCode: validHttpStatus(), message })).toBe(message);
    });
    it('T38 uses HTTP reason text with expose=false', () => {
      expect(filter.getHttpErrorMessage({ statusCode: 404, message: textFor(40), expose: false })).toBe('Not Found');
    });
  });
});
