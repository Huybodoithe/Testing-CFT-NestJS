import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsHandler } from '../../exceptions/exceptions-handler.js';
import { ExecutionContextHost } from '../../helpers/execution-context-host.js';
import { RouterProxy } from '../../router/router-proxy.js';

// PRNG xorshift32: seed co dinh 1808, moi test dung salt rieng.
// Du lieu sinh ra nam trong mien noi; nhanh loi duoc kich hoat chu dong.
function seededId(salt: number): number {
  let state = (1808 + salt) >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return 1500 + ((state >>> 0) % 7000);
}

function makeHttpArguments(salt: number) {
  const id = seededId(salt);
  const request = { id, path: `/cft/${id}` };
  const response = { id: id + 17, sent: false };
  const next = vi.fn((): void => undefined);
  return { request, response, next };
}

function makeExceptionsHandler() {
  // Instance that matches the real dependency contract; only its I/O boundary
  // method is intercepted so the proxy is tested without sending HTTP replies.
  const handler = new ExceptionsHandler();
  const nextSpy = vi.spyOn(handler, 'next').mockImplementation(() => undefined);
  return { handler, nextSpy };
}

function expectHttpHost(
  host: Parameters<ExceptionsHandler['next']>[1],
  request: unknown,
  response: unknown,
  next: () => void,
) {
  expect(host).toBeInstanceOf(ExecutionContextHost);
  expect(host.getType()).toBe('http');
  expect(host.getArgs()).toEqual([request, response, next]);
  expect(host.switchToHttp().getRequest()).toBe(request);
  expect(host.switchToHttp().getResponse()).toBe(response);
  expect(host.switchToHttp().getNext()).toBe(next);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouterProxy.createProxy', () => {
  it('T1 B1/P1 - forwards the arguments and next on a synchronous completion', async () => {
    const { request, response, next } = makeHttpArguments(1);
    const { handler, nextSpy } = makeExceptionsHandler();
    const target = vi.fn(
      (_request: unknown, _response: unknown, callbackNext: () => void): void => {
        callbackNext();
      },
    );

    const proxy = new RouterProxy().createProxy(target, handler);
    await expect(proxy(request, response, next)).resolves.toBeUndefined();

    expect(target).toHaveBeenCalledTimes(1);
    expect(target).toHaveBeenCalledWith(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('T2 B1/P2 - awaits a fulfilled Promise without dispatching an exception', async () => {
    const { request, response, next } = makeHttpArguments(2);
    const { handler, nextSpy } = makeExceptionsHandler();
    const target = vi.fn(
      async (_request: unknown, _response: unknown, callbackNext: () => void): Promise<void> => {
        await Promise.resolve();
        callbackNext();
      },
    );

    const proxy = new RouterProxy().createProxy(target, handler);
    await expect(proxy(request, response, next)).resolves.toBeUndefined();

    expect(target).toHaveBeenCalledWith(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('T3 B1/P3 - catches a synchronous throw and returns the original response', async () => {
    const { request, response, next } = makeHttpArguments(3);
    const { handler, nextSpy } = makeExceptionsHandler();
    const thrown = new Error('route synchronous failure');
    const target = vi.fn(
      (_request: unknown, _response: unknown, _next: () => void): void => {
        throw thrown;
      },
    );

    const proxy = new RouterProxy().createProxy(target, handler);
    await expect(proxy(request, response, next)).resolves.toBe(response);

    expect(target).toHaveBeenCalledWith(request, response, next);
    expect(next).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).toHaveBeenCalledWith(thrown, expect.any(ExecutionContextHost));
    expectHttpHost(nextSpy.mock.calls[0][1], request, response, next);
  });

  it('T4 B1/P4 - catches a rejected Promise and forwards its rejection reason', async () => {
    const { request, response, next } = makeHttpArguments(4);
    const { handler, nextSpy } = makeExceptionsHandler();
    const rejected = new Error('route asynchronous failure');
    const target = vi.fn(
      (_request: unknown, _response: unknown, _next: () => void): Promise<void> =>
        Promise.reject(rejected),
    );

    const proxy = new RouterProxy().createProxy(target, handler);
    await expect(proxy(request, response, next)).resolves.toBe(response);

    expect(target).toHaveBeenCalledWith(request, response, next);
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).toHaveBeenCalledWith(rejected, expect.any(ExecutionContextHost));
    expectHttpHost(nextSpy.mock.calls[0][1], request, response, next);
  });

  it('T5 B1/P5 - rejects when the exception handler itself throws', async () => {
    const { request, response, next } = makeHttpArguments(5);
    const { handler, nextSpy } = makeExceptionsHandler();
    const thrown = new Error('original route error');
    const handlerFailure = new Error('exception dispatch failed');
    nextSpy.mockImplementation((): void => {
      throw handlerFailure;
    });
    const target = vi.fn(
      (_request: unknown, _response: unknown, _next: () => void): void => {
        throw thrown;
      },
    );

    const proxy = new RouterProxy().createProxy(target, handler);
    await expect(proxy(request, response, next)).rejects.toBe(handlerFailure);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).toHaveBeenCalledWith(thrown, expect.any(ExecutionContextHost));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('RouterProxy.createExceptionLayerProxy', () => {
  it('T6 B2/P6 - passes the incoming error and HTTP arguments on a synchronous completion', async () => {
    const { request, response, next } = makeHttpArguments(6);
    const { handler, nextSpy } = makeExceptionsHandler();
    const incomingError = new Error('incoming route error');
    const target = vi.fn(
      (
        _error: unknown,
        _request: unknown,
        _response: unknown,
        callbackNext: () => void,
      ): void => {
        callbackNext();
      },
    );

    const proxy = new RouterProxy().createExceptionLayerProxy(target, handler);
    await expect(proxy(incomingError, request, response, next)).resolves.toBeUndefined();

    expect(target).toHaveBeenCalledTimes(1);
    expect(target).toHaveBeenCalledWith(incomingError, request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('T7 B2/P7 - awaits a fulfilled Promise without calling the handler', async () => {
    const { request, response, next } = makeHttpArguments(7);
    const { handler, nextSpy } = makeExceptionsHandler();
    const incomingError = new Error('incoming asynchronous route error');
    const target = vi.fn(
      async (
        _error: unknown,
        _request: unknown,
        _response: unknown,
        callbackNext: () => void,
      ): Promise<void> => {
        await Promise.resolve();
        callbackNext();
      },
    );

    const proxy = new RouterProxy().createExceptionLayerProxy(target, handler);
    await expect(proxy(incomingError, request, response, next)).resolves.toBeUndefined();

    expect(target).toHaveBeenCalledWith(incomingError, request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('T8 B2/P8 - catches a synchronous throw, not the incoming error', async () => {
    const { request, response, next } = makeHttpArguments(8);
    const { handler, nextSpy } = makeExceptionsHandler();
    const incomingError = new Error('incoming failure');
    const thrown = new Error('exception-layer callback failure');
    const target = vi.fn(
      (_error: unknown, _request: unknown, _response: unknown, _next: () => void): void => {
        throw thrown;
      },
    );

    const proxy = new RouterProxy().createExceptionLayerProxy(target, handler);
    await expect(proxy(incomingError, request, response, next)).resolves.toBe(response);

    expect(target).toHaveBeenCalledWith(incomingError, request, response, next);
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).toHaveBeenCalledWith(thrown, expect.any(ExecutionContextHost));
    expect(nextSpy.mock.calls[0][0]).not.toBe(incomingError);
    expectHttpHost(nextSpy.mock.calls[0][1], request, response, next);
  });

  it('T9 B2/P9 - catches a rejected Promise from the exception-layer callback', async () => {
    const { request, response, next } = makeHttpArguments(9);
    const { handler, nextSpy } = makeExceptionsHandler();
    const incomingError = new Error('preexisting error');
    const rejected = new Error('exception-layer asynchronous failure');
    const target = vi.fn(
      (
        _error: unknown,
        _request: unknown,
        _response: unknown,
        _next: () => void,
      ): Promise<void> => Promise.reject(rejected),
    );

    const proxy = new RouterProxy().createExceptionLayerProxy(target, handler);
    await expect(proxy(incomingError, request, response, next)).resolves.toBe(response);

    expect(target).toHaveBeenCalledWith(incomingError, request, response, next);
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).toHaveBeenCalledWith(rejected, expect.any(ExecutionContextHost));
    expectHttpHost(nextSpy.mock.calls[0][1], request, response, next);
  });

  it('T10 B2/P10 - propagates an exception thrown by exception dispatch', async () => {
    const { request, response, next } = makeHttpArguments(10);
    const { handler, nextSpy } = makeExceptionsHandler();
    const incomingError = new Error('incoming exception');
    const thrown = new Error('exception-layer target error');
    const handlerFailure = new Error('exception-layer dispatch failed');
    nextSpy.mockImplementation((): void => {
      throw handlerFailure;
    });
    const target = vi.fn(
      (_error: unknown, _request: unknown, _response: unknown, _next: () => void): void => {
        throw thrown;
      },
    );

    const proxy = new RouterProxy().createExceptionLayerProxy(target, handler);
    await expect(proxy(incomingError, request, response, next)).rejects.toBe(handlerFailure);

    expect(target).toHaveBeenCalledWith(incomingError, request, response, next);
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).toHaveBeenCalledWith(thrown, expect.any(ExecutionContextHost));
    expect(next).not.toHaveBeenCalled();
  });
});
