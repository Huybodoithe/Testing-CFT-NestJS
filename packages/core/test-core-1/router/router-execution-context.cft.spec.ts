import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  ForbiddenException,
  RequestMethod,
  SSE_ABORT_CONTROLLER,
  StreamableFile,
  type PipeTransform,
} from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  PARAMTYPES_METADATA,
  REDIRECT_METADATA,
  RENDER_METADATA,
  RESPONSE_PASSTHROUGH_METADATA,
  ROUTE_ARGS_METADATA,
  RouteParamtypes,
  SSE_METADATA,
} from '@nestjs/common/internal';
import * as commonInternal from '@nestjs/common/internal';
import { EMPTY, Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RouterExecutionContext,
  type ParamProperties,
} from '../../router/router-execution-context.js';
import { RouterResponseController } from '../../router/router-response-controller.js';
import { isRejectedByPipes } from '../../router/rejected-by-pipes.js';

type ConstructorArgs = ConstructorParameters<typeof RouterExecutionContext>;
type BasicResponse = (
  result: unknown,
  response: unknown,
  request?: unknown,
  handlerObservable$?: Observable<unknown>,
  handlerStreams?: (StreamableFile | ReadableStream<unknown> | Readable)[],
) => Promise<unknown>;

function fixture(routeBody: (...args: unknown[]) => unknown = () => 'response') {
  // A fresh class also isolates Reflect metadata and the per-constructor cache.
  class RouteFixture {
    route(...args: unknown[]) {
      return routeBody(...args);
    }
  }
  const instance = new RouteFixture();
  const callback = instance.route;
  const paramsFactory = {
    exchangeKeyForValue: vi.fn((_type: number, _data: unknown, ctx: { req: unknown }) => ctx.req),
  };
  const pipesCreator = {
    create: vi.fn((): PipeTransform[] => []),
    setModuleContext: vi.fn(),
    createConcreteContext: vi.fn((items?: PipeTransform[]) => items ?? []),
  };
  const pipesConsumer = {
    apply: vi.fn(async (value: unknown) => value),
  };
  const guardsCreator = { create: vi.fn((): { canActivate: () => boolean }[] => []) };
  const guardsConsumer = { tryActivate: vi.fn(async () => true) };
  const interceptorsCreator = { create: vi.fn((): { intercept: () => void }[] => []) };
  const interceptorsConsumer = {
    intercept: vi.fn(
      async (
        _interceptors: unknown,
        _args: unknown,
        _instance: unknown,
        _callback: unknown,
        next: () => Promise<unknown>,
      ) => next(),
    ),
  };
  const adapter = {
    reply: vi.fn((_res: unknown, _body: unknown, _status?: number) => undefined),
    status: vi.fn(),
    setHeader: vi.fn(),
    render: vi.fn((_res: unknown, _template: string, _value: unknown) => undefined),
    redirect: vi.fn(),
  };
  const context = new RouterExecutionContext(
    paramsFactory as unknown as ConstructorArgs[0],
    pipesCreator as unknown as ConstructorArgs[1],
    pipesConsumer as unknown as ConstructorArgs[2],
    guardsCreator as unknown as ConstructorArgs[3],
    guardsConsumer as unknown as ConstructorArgs[4],
    interceptorsCreator as unknown as ConstructorArgs[5],
    interceptorsConsumer as unknown as ConstructorArgs[6],
    adapter as unknown as ConstructorArgs[7],
  );

  // These two response methods would otherwise open platform streams / sockets.
  const streamSpy = vi
    .spyOn(RouterResponseController.prototype, 'stream')
    .mockResolvedValue(undefined);
  const sseSpy = vi
    .spyOn(RouterResponseController.prototype, 'sse')
    .mockResolvedValue(undefined);
  return {
    context, instance, callback, paramsFactory, pipesCreator, pipesConsumer,
    guardsCreator, guardsConsumer, interceptorsCreator, interceptorsConsumer,
    adapter, streamSpy, sseSpy,
  };
}

function seededInt(seed = 1808): number {
  // One LCG step, constrained to non-boundary positive integers.
  const state = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return 100 + (state % 8000);
}

function param(
  type: number | string,
  value: unknown,
  pipes: PipeTransform[] = [],
  index = 0,
): ParamProperties {
  return {
    index, type, data: 'field', pipes,
    extractValue: vi.fn(() => value),
  };
}

function basic(context: RouterExecutionContext, callback: () => unknown = () => undefined,
  handled = false): BasicResponse {
  // No RENDER / REDIRECT / SSE metadata: this is the basic response branch.
  return context.createHandleResponseFn(callback, handled) as BasicResponse;
}

function setRouteParams(
  fixtureValue: ReturnType<typeof fixture>,
  entries: Record<string, unknown>,
) {
  Reflect.defineMetadata(
    ROUTE_ARGS_METADATA,
    entries,
    fixtureValue.instance.constructor,
    'route',
  );
}

async function invoke(
  f: ReturnType<typeof fixture>,
  req: object = {},
  res: object = {},
  method: RequestMethod = RequestMethod.GET,
) {
  return f.context.create(f.instance, f.callback, 'route', 'mod-key', method)(
    req, res, () => undefined,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouterExecutionContext: metadata and argument extraction', () => {
  it('T01 B1/B2: computes default metadata once and caches it by instance constructor/method', () => {
    const f = fixture();
    const first = f.context.getMetadata(
      f.instance, f.callback, 'route', 'mod-key', RequestMethod.POST, 'http',
    );
    const second = f.context.getMetadata(
      f.instance, f.callback, 'route', 'mod-key', RequestMethod.GET, 'http',
    );
    expect(second).toBe(first);
    expect(first.argsLength).toBe(0);
    expect(first.getParamsMetadata('mod-key')).toEqual([]);
    expect(first.httpStatusCode).toBe(201);
    expect(first.responseHeaders).toEqual([]);
    expect(first.hasCustomHeaders).toBe(false);
  });

  it('T02 B2/B3/B4: reflects explicit status, headers and route parameter metatypes', async () => {
    const f = fixture((value: unknown) => value);
    const headers = [{ name: 'X-CFT', value: 'seed-1808' }];
    Reflect.defineMetadata(HTTP_CODE_METADATA, 207, f.callback);
    Reflect.defineMetadata(HEADERS_METADATA, headers, f.callback);
    Reflect.defineMetadata(PARAMTYPES_METADATA, [String], f.instance, 'route');
    setRouteParams(f, {
      [`${RouteParamtypes.BODY}:0`]: { index: 0, data: 'field', pipes: [] },
    });
    f.paramsFactory.exchangeKeyForValue.mockReturnValue('extracted');
    const req = {};
    const res = {};
    const metadata = f.context.getMetadata(
      f.instance, f.callback, 'route', 'mod-key', RequestMethod.GET, 'http',
    );
    expect(metadata.httpStatusCode).toBe(207);
    expect(metadata.argsLength).toBe(1);
    expect(metadata.getParamsMetadata('mod-key')[0].type).toBe(RouteParamtypes.BODY);
    await invoke(f, req, res);
    expect(f.adapter.status).toHaveBeenCalledWith(res, 207);
    expect(f.adapter.setHeader).toHaveBeenCalledWith(res, 'X-CFT', 'seed-1808');
    expect(f.paramsFactory.exchangeKeyForValue).toHaveBeenCalledWith(
      RouteParamtypes.BODY, 'field', { req, res, next: expect.any(Function) },
    );
    expect(f.adapter.reply).toHaveBeenCalledWith(res, 'extracted', undefined);
  });

  it('T03 B5: custom param factory receives data and real HTTP execution context', async () => {
    const custom = vi.fn((data: unknown, host: { getType: () => string }) =>
      `${String(data)}:${host.getType()}`);
    const f = fixture((value: unknown) => value);
    const key = `${CUSTOM_ROUTE_ARGS_METADATA}:0`;
    setRouteParams(f, {
      [key]: { index: 0, data: 'custom', factory: custom, pipes: [] },
    });
    const res = {};
    await invoke(f, {}, res);
    expect(custom).toHaveBeenCalledOnce();
    expect(f.adapter.reply).toHaveBeenCalledWith(res, 'custom:http', undefined);
    expect(f.paramsFactory.exchangeKeyForValue).not.toHaveBeenCalled();
    expect(f.pipesCreator.setModuleContext).toHaveBeenCalledWith('mod-key');
  });

  it('T04 B6: getParamValue returns plain values when pipes are empty', async () => {
    const f = fixture();
    const value = { n: 1808 };
    await expect(f.context.getParamValue(value, { type: 'body' }, [])).resolves.toBe(value);
    expect(f.pipesConsumer.apply).not.toHaveBeenCalled();
  });

  it('T05 B6: getParamValue delegates nonempty pipes with exact argument metadata', async () => {
    const f = fixture();
    const pipe: PipeTransform = { transform: (x: unknown) => x };
    f.pipesConsumer.apply.mockResolvedValue('mapped');
    await expect(f.context.getParamValue('input', { type: 'query' }, [pipe]))
      .resolves.toBe('mapped');
    expect(f.pipesConsumer.apply).toHaveBeenCalledWith(
      'input', { type: 'query' }, [pipe],
    );
  });

  it('T06 B7: only the eight built-in pipeable param kinds and strings pass', () => {
    const f = fixture();
    const positive = [
      RouteParamtypes.BODY, RouteParamtypes.RAW_BODY,
      RouteParamtypes.QUERY, RouteParamtypes.PARAM,
      RouteParamtypes.FILE, RouteParamtypes.FILES,
      RouteParamtypes.COOKIES, RouteParamtypes.SIGNED_COOKIES,
      'custom', '',
    ];
    for (const type of positive) expect(f.context.isPipeable(type)).toBe(true);
    for (const type of [
      RouteParamtypes.REQUEST, RouteParamtypes.RESPONSE, RouteParamtypes.NEXT,
      RouteParamtypes.HEADERS, RouteParamtypes.IP, RouteParamtypes.SESSION,
    ]) expect(f.context.isPipeable(type)).toBe(false);
  });
});

describe('RouterExecutionContext: guards and pipe scheduling', () => {
  it('T07 B8: empty guard array skips activation', () => {
    const f = fixture();
    expect(f.context.createGuardsFn([], f.instance, f.callback, 'http')).toBeNull();
    expect(f.guardsConsumer.tryActivate).not.toHaveBeenCalled();
  });

  it('T08 B8/B9: nonempty guards allow the request', async () => {
    const f = fixture();
    const guard = { canActivate: () => true };
    const run = f.context.createGuardsFn([guard], f.instance, f.callback, 'http');
    await expect(run!([{}, {}, () => undefined])).resolves.toBeUndefined();
    expect(f.guardsConsumer.tryActivate).toHaveBeenCalledWith(
      [guard], expect.any(Array), f.instance, f.callback, 'http',
    );
  });

  it('T09 B9: denial throws ForbiddenException and does not invoke handler', async () => {
    const handler = vi.fn(() => 'never');
    const f = fixture(handler);
    f.guardsCreator.create.mockReturnValue([{ canActivate: () => false }]);
    f.guardsConsumer.tryActivate.mockResolvedValue(false);
    await expect(invoke(f)).rejects.toBeInstanceOf(ForbiddenException);
    expect(handler).not.toHaveBeenCalled();
    expect(f.adapter.status).not.toHaveBeenCalled();
  });

  it('T10 B10: no parameters produces a null pipe function', () => {
    const f = fixture();
    expect(f.context.createPipesFn([], [])).toBeNull();
  });

  it('T11 B11/B12: no pipes and non-pipeable parameters assign immediately', () => {
    const f = fixture();
    const promise = Promise.resolve('not-unwrapped');
    const args: unknown[] = [];
    const run = f.context.createPipesFn([], [
      param(RouteParamtypes.BODY, null, [], 0),
      param(RouteParamtypes.HEADERS, promise, [], 1),
      param(RouteParamtypes.QUERY, { then: 1808 }, [], 2),
      param(RouteParamtypes.PARAM, 'inside', [], 3),
    ])!;
    expect(run(args, {}, {}, () => undefined)).toBeUndefined();
    expect(args).toEqual([null, promise, { then: 1808 }, 'inside']);
    expect(f.pipesConsumer.apply).not.toHaveBeenCalled();
  });

  it('T12 B11/B12/B13: mixed parameters schedule async pipes in extraction order', async () => {
    const f = fixture();
    const pipe: PipeTransform = { transform: (v: unknown) => v };
    const extraction: string[] = [];
    f.pipesConsumer.apply.mockImplementation(async (v: unknown) => `pipe:${String(v)}`);
    const p1 = param(RouteParamtypes.BODY, 'alpha', [pipe], 0);
    const p2 = param(RouteParamtypes.HEADERS, 'untouched', [pipe], 1);
    const p3 = param(RouteParamtypes.QUERY, Promise.resolve('beta'), [], 2);
    p1.extractValue = () => { extraction.push('first'); return 'alpha'; };
    p2.extractValue = () => { extraction.push('second'); return 'untouched'; };
    p3.extractValue = () => { extraction.push('third'); return Promise.resolve('beta'); };
    const args: unknown[] = [];
    const result = f.context.createPipesFn([], [p1, p2, p3])!(
      args, {}, {}, () => undefined,
    );
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(extraction).toEqual(['first', 'second', 'third']);
    expect(args).toEqual(['pipe:alpha', 'untouched', 'beta']);
    expect(f.pipesConsumer.apply).toHaveBeenCalledOnce();
  });

  it('T13 B12: a pipeable function thenable is assimilated; plain objects are not', async () => {
    const f = fixture();
    const callable = Object.assign(() => undefined, {
      then: (resolve: (value: string) => void) => resolve('function-value'),
    });
    const args: unknown[] = [];
    const run = f.context.createPipesFn([], [
      param(RouteParamtypes.BODY, callable, [], 0),
      param(RouteParamtypes.BODY, { value: 1808 }, [], 1),
      param(RouteParamtypes.BODY, undefined, [], 2),
    ])!;
    await run(args, {}, {}, () => undefined);
    expect(args).toEqual(['function-value', { value: 1808 }, undefined]);
  });

  it('T14 B14: synchronous extraction failure enters Promise.all rejection', async () => {
    const f = fixture();
    const failure = new Error('extractor');
    const broken = param(RouteParamtypes.BODY, null);
    broken.extractValue = () => { throw failure; };
    const args: unknown[] = [];
    const run = f.context.createPipesFn([], [broken])!;
    await expect(run(args, {}, {}, () => undefined)).rejects.toBe(failure);
    expect(f.pipesConsumer.apply).not.toHaveBeenCalled();
  });

  it('T15 B13: asynchronous pipe rejection propagates and marks the request in create()', async () => {
    const handler = vi.fn(() => 'not-executed');
    const f = fixture(handler);
    const failure = new Error('rejected by pipe');
    const pipe: PipeTransform = { transform: (v: unknown) => v };
    f.pipesCreator.create.mockReturnValue([pipe]);
    f.pipesConsumer.apply.mockRejectedValue(failure);
    setRouteParams(f, {
      [`${RouteParamtypes.BODY}:0`]: { index: 0, data: 'field', pipes: [] },
    });
    const req = {};
    await expect(invoke(f, req)).rejects.toBe(failure);
    expect(isRejectedByPipes(req)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(f.adapter.reply).not.toHaveBeenCalled();
  });

  it('T37 B13/B14: an extractor throw joins already pending pipe work', async () => {
    const f = fixture();
    const pipe: PipeTransform = { transform: (v: unknown) => v };
    const second = new Error('later extraction failure');
    f.pipesConsumer.apply.mockResolvedValue('mapped');
    const broken = param(RouteParamtypes.HEADERS, undefined, [], 1);
    broken.extractValue = () => { throw second; };
    const run = f.context.createPipesFn([], [
      param(RouteParamtypes.BODY, 'data', [pipe], 0), broken,
    ])!;
    await expect(run([], {}, {}, () => undefined)).rejects.toBe(second);
    expect(f.pipesConsumer.apply).toHaveBeenCalledOnce();
  });

  it('T38 B15: permitted guards run before response status and callback', async () => {
    const f = fixture();
    const guard = { canActivate: () => true };
    f.guardsCreator.create.mockReturnValue([guard]);
    const res = {};
    await invoke(f, {}, res);
    expect(f.guardsConsumer.tryActivate).toHaveBeenCalledWith(
      [guard], expect.any(Array), f.instance, f.callback, 'http',
    );
    expect(f.adapter.reply).toHaveBeenCalledOnce();
  });

});

describe('RouterExecutionContext: route invocation and response selection', () => {
  it('T16 B15/B16: normal request without interceptors sends the handler value', async () => {
    const sample = seededInt();
    const handler = vi.fn(() => sample);
    const f = fixture(handler);
    const req = {};
    const res = {};
    await invoke(f, req, res);
    expect(handler).toHaveBeenCalledOnce();
    expect(f.interceptorsConsumer.intercept).toHaveBeenCalledOnce();
    expect(f.adapter.status).toHaveBeenCalledWith(res, 200);
    expect(f.adapter.reply).toHaveBeenCalledWith(res, sample, undefined);
  });

  it('T17 B15/B16: a nonempty interceptor chain observes an Observable handler', async () => {
    const f = fixture(() => of('observed'));
    f.interceptorsCreator.create.mockReturnValue([{ intercept: () => undefined }]);
    const res = {};
    await invoke(f, { socket: new EventEmitter() }, res);
    expect(f.interceptorsConsumer.intercept).toHaveBeenCalledWith(
      expect.any(Array), expect.any(Array), f.instance, f.callback,
      expect.any(Function), 'http',
    );
    expect(f.adapter.reply).toHaveBeenCalledWith(res, 'observed', undefined);
  });

  it('T18 B17: render takes precedence over redirect and SSE', async () => {
    const f = fixture();
    Reflect.defineMetadata(RENDER_METADATA, 'template-cft', f.callback);
    Reflect.defineMetadata(REDIRECT_METADATA, { url: '/other', statusCode: 307 }, f.callback);
    Reflect.defineMetadata(SSE_METADATA, true, f.callback);
    const res = {};
    await invoke(f, {}, res);
    expect(f.adapter.render).toHaveBeenCalledWith(res, 'template-cft', 'response');
    expect(f.adapter.redirect).not.toHaveBeenCalled();
    expect(f.sseSpy).not.toHaveBeenCalled();
  });

  it('T19 B18: a valid redirect takes precedence over SSE', async () => {
    const f = fixture();
    Reflect.defineMetadata(REDIRECT_METADATA, { url: '/jump', statusCode: 307 }, f.callback);
    Reflect.defineMetadata(SSE_METADATA, true, f.callback);
    const res = {};
    await invoke(f, {}, res);
    expect(f.adapter.redirect).toHaveBeenCalledWith(res, 307, '/jump');
    expect(f.sseSpy).not.toHaveBeenCalled();
  });

  it('T20 B18: redirect without a string URL falls through to the basic branch', async () => {
    const f = fixture();
    Reflect.defineMetadata(REDIRECT_METADATA, { url: 1808 }, f.callback);
    const res = {};
    await invoke(f, {}, res);
    expect(f.adapter.reply).toHaveBeenCalledWith(res, 'response', undefined);
    expect(f.adapter.redirect).not.toHaveBeenCalled();
  });

  it('T21 B19/B20: SSE sets and reuses abort signal on wrapped/raw requests', async () => {
    const f = fixture(() => of({ data: 'event' }));
    Reflect.defineMetadata(SSE_METADATA, true, f.callback);
    if ('SSE_OPTIONS_METADATA' in commonInternal) {
      Reflect.defineMetadata(commonInternal.SSE_OPTIONS_METADATA,
        { maxPendingDataLength: 1808 }, f.callback);
    }
    const req: Record<PropertyKey, unknown> & { raw: Record<PropertyKey, unknown> } =
      { raw: {} };
    const res = {
      raw: { statusCode: 201 },
      statusCode: 202,
      getHeaders: () => ({ 'x-source': 'wrapped' }),
    };
    await invoke(f, req, res);
    const controller = req[SSE_ABORT_CONTROLLER] as AbortController;
    expect(controller).toBeInstanceOf(AbortController);
    expect(req.raw[SSE_ABORT_CONTROLLER]).toBe(controller);
    expect(f.sseSpy).toHaveBeenCalledWith(
      expect.any(Promise), res.raw, req.raw, expect.objectContaining({
        maxPendingDataLength: 'SSE_OPTIONS_METADATA' in commonInternal ? 1808 : undefined,
      }),
    );
    const options = f.sseSpy.mock.calls[0][3]!;
    expect(options.additionalHeaders!()).toEqual({ 'x-source': 'wrapped' });
    expect(options.statusCode!()).toBe(202);
    await invoke(f, req, res);
    expect(req[SSE_ABORT_CONTROLLER]).toBe(controller);
  });

  it('T22 B19/B20: SSE retains an existing raw controller and uses unwrapped req/res', async () => {
    const f = fixture();
    Reflect.defineMetadata(SSE_METADATA, true, f.callback);
    const raw = { [SSE_ABORT_CONTROLLER]: new AbortController() };
    const req = { raw };
    const res = { statusCode: 204 };
    await invoke(f, req, res);
    expect(raw[SSE_ABORT_CONTROLLER]).not.toBe(
      (req as Record<PropertyKey, unknown>)[SSE_ABORT_CONTROLLER],
    );
    expect(f.sseSpy).toHaveBeenCalledWith(
      expect.any(Promise), res, raw, expect.any(Object),
    );
    expect(f.sseSpy.mock.calls[0][3]!.statusCode!()).toBe(204);
  });

  it('T23 B21: response and next decorators suppress automatic send unless passthrough', async () => {
    for (const type of [RouteParamtypes.RESPONSE, RouteParamtypes.NEXT]) {
      const f = fixture(() => 'handled');
      setRouteParams(f, {
        [`${type}:0`]: { index: 0, data: undefined, pipes: [] },
      });
      await invoke(f);
      expect(f.adapter.reply).not.toHaveBeenCalled();
    }
    const f = fixture(() => 'passthrough');
    setRouteParams(f, {
      [`${RouteParamtypes.RESPONSE}:0`]: { index: 0, data: undefined, pipes: [] },
    });
    Reflect.defineMetadata(
      RESPONSE_PASSTHROUGH_METADATA, true, f.instance.constructor, 'route',
    );
    const res = {};
    await invoke(f, {}, res);
    expect(f.adapter.reply).toHaveBeenCalledWith(res, 'passthrough', undefined);
  });
});

describe('RouterExecutionContext: basic response, disconnect and streaming', () => {
  it('T24 B22/B23: basic handler applies plain and Observable results', async () => {
    const f = fixture();
    const handle = basic(f.context);
    const res = {};
    await expect(handle('plain', res, {})).resolves.toBe(res);
    await expect(handle(of('emitted'), res, {})).resolves.toBe(res);
    expect(f.adapter.reply).toHaveBeenNthCalledWith(1, res, 'plain', undefined);
    expect(f.adapter.reply).toHaveBeenNthCalledWith(2, res, 'emitted', undefined);
  });

  it('T25 B23: response already handled does not call reply or stream', async () => {
    const f = fixture();
    const res = {};
    await expect(basic(f.context, () => undefined, true)('value', res, {}))
      .resolves.toBe(res);
    expect(f.adapter.reply).not.toHaveBeenCalled();
    expect(f.streamSpy).not.toHaveBeenCalled();
  });

  it('T26 B24: direct async-iterable stream uses stream with no replacement', async () => {
    const f = fixture();
    const body = Readable.from(['data']);
    const req = {};
    const res = {};
    await basic(f.context)(body, res, req);
    expect(f.streamSpy).toHaveBeenCalledWith(
      body, res, req, { statusCode: undefined, replacement: undefined },
    );
    body.destroy();
  });

  it('T27 B24/B25: an intercepted wrapper sends the unconsumed handler stream', async () => {
    const f = fixture();
    const stream = Readable.from(['original']);
    const wrapped = { payload: 'new-value' };
    const req = {};
    const res = {};
    await basic(f.context)(wrapped, res, req, undefined, [stream]);
    expect(f.streamSpy).toHaveBeenCalledWith(
      stream, res, req, {
        statusCode: undefined,
        replacement: wrapped,
      },
    );
    stream.destroy();
  });

  it('T28 B25: a StreamableFile result is not replaced by an intercepted stream', async () => {
    const f = fixture();
    const previous = Readable.from(['previous']);
    const file = new StreamableFile(Readable.from(['file']));
    const res = {};
    await basic(f.context)(file, res, {}, undefined, [previous]);
    expect(f.streamSpy).not.toHaveBeenCalled();
    expect(f.adapter.reply).toHaveBeenCalledWith(res, file, undefined);
    previous.destroy();
    file.getStream().destroy();
  });

  it('T29 B25: a locked ReadableStream is not selected from handlerStreams', async () => {
    const f = fixture();
    const stream = new ReadableStream<string>({
      start(controller) { controller.enqueue('ready'); },
    });
    const reader = stream.getReader();
    const res = {};
    await basic(f.context)({ result: 'interceptor' }, res, {}, undefined, [stream]);
    expect(f.streamSpy).not.toHaveBeenCalled();
    expect(f.adapter.reply).toHaveBeenCalledOnce();
    reader.releaseLock();
    await stream.cancel();
  });

  it('T30 B26: transform rejection destroys an unsent StreamableFile', async () => {
    const f = fixture();
    const file = new StreamableFile(Readable.from(['unsent']));
    const error = new Error('interceptor failure');
    await expect(
      basic(f.context)(throwError(() => error), {}, {}, undefined, [file]),
    ).rejects.toBe(error);
    expect(file.getStream().destroyed).toBe(true);
    expect(f.adapter.reply).not.toHaveBeenCalled();
  });

  it('T31 B27: apply failure destroys the unsent response file and rethrows', async () => {
    const f = fixture();
    const file = new StreamableFile(Readable.from(['unsent']));
    const error = new Error('reply error');
    f.adapter.reply.mockImplementation(() => { throw error; });
    await expect(basic(f.context)(file, {}, {})).rejects.toBe(error);
    expect(file.getStream().destroyed).toBe(true);
  });

  it('T32 B27: stream failure rethrows after cleanup', async () => {
    const f = fixture();
    const body = Readable.from(['unsent']);
    const error = new Error('stream error');
    f.streamSpy.mockRejectedValue(error);
    await expect(basic(f.context)(body, {}, {})).rejects.toBe(error);
    body.destroy();
  });

  it('T33 B28: already-destroyed socket triggers disconnect and swallows EmptyError', async () => {
    const f = fixture();
    const socket = Object.assign(new EventEmitter(), { destroyed: true });
    const res = {};
    await expect(basic(f.context)(EMPTY, res, { socket })).resolves.toBe(res);
    expect(f.adapter.reply).not.toHaveBeenCalled();
  });

  it('T34 B28/B29: mid-flight close cancels Observable and destroys tracked files', async () => {
    const f = fixture();
    const socket = Object.assign(new EventEmitter(), { destroyed: false });
    const file = new StreamableFile(Readable.from(['discard']));
    const res = {};
    const subscription = basic(f.context)(
      new Observable<unknown>(() => () => undefined),
      res, { socket }, undefined, [file],
    );
    expect(socket.listenerCount('close')).toBe(1);
    socket.emit('close');
    await expect(subscription).resolves.toBe(res);
    expect(file.getStream().destroyed).toBe(true);
    expect(socket.listenerCount('close')).toBe(0);
    expect(f.adapter.reply).not.toHaveBeenCalled();
  });

  it('T35 B30: the disconnect watcher supports missing source and response fallback', () => {
    const f = fixture();
    // Focused access to a private lifecycle helper: it has no public surface
    // that allows asserting the no-source subscription teardown independently.
    const emptySink = vi.fn();
    const missing = f.context['fromClientDisconnect']({}, {}).subscribe(emptySink);
    expect(emptySink).not.toHaveBeenCalled();
    missing.unsubscribe();

    const res = Object.assign(new EventEmitter(), { destroyed: false });
    const observed = vi.fn();
    const sub = f.context['fromClientDisconnect']({ raw: {} }, { raw: res })
      .subscribe(observed);
    expect(res.listenerCount('close')).toBe(1);
    res.emit('close');
    expect(observed).toHaveBeenCalledOnce();
    sub.unsubscribe();
    expect(res.listenerCount('close')).toBe(0);
  });

  it('T36 B31: observes handler Observable, native Promise and ordinary return separately', async () => {
    const f = fixture();
    const signal = new Subject<void>();
    const next = vi.fn();
    const sub = signal.subscribe(next);
    const streams: (StreamableFile | Readable)[] = [];
    f.context['observeHandlerResult'](of('observable'), signal, streams);
    expect(next).toHaveBeenCalledOnce();

    const file = new StreamableFile(Readable.from(['file']));
    f.context['observeHandlerResult'](Promise.resolve(file), signal, streams);
    await Promise.resolve();
    expect(streams).toContain(file);

    f.context['observeHandlerResult'](Promise.resolve(of('later')), signal, streams);
    await Promise.resolve();
    expect(next).toHaveBeenCalledTimes(2);

    const nodeStream = Readable.from(['node']);
    f.context['observeHandlerResult'](nodeStream, signal, streams);
    expect(streams).toContain(nodeStream);

    const then = vi.fn();
    f.context['observeHandlerResult']({ then }, signal, streams);
    expect(then).not.toHaveBeenCalled();
    f.context['observeHandlerResult'](Promise.reject(new Error('observed rejection')),
      signal, streams);
    await Promise.resolve();
    sub.unsubscribe();
    signal.complete();
    file.getStream().destroy();
    nodeStream.destroy();
  });

  it('T39 B24: an explicit response status is carried into direct stream sending', async () => {
    const f = fixture();
    const stream = Readable.from(['body']);
    const handler = f.context.createHandleResponseFn(
      f.callback, false, undefined, 218,
    ) as BasicResponse;
    const req = {};
    const res = {};
    await handler(stream, res, req);
    expect(f.streamSpy).toHaveBeenCalledWith(stream, res, req, {
      statusCode: 218, replacement: undefined,
    });
    stream.destroy();
  });

  it('T40 B31: StreamableFile and nonstream values take separate observation paths', () => {
    const f = fixture();
    const signal = new Subject<void>();
    const values: (StreamableFile | Readable)[] = [];
    const file = new StreamableFile(Readable.from(['file']));
    f.context['observeHandlerResult'](file, signal, values);
    f.context['observeHandlerResult']('not-a-stream', signal, values);
    expect(values).toEqual([file]);
    file.getStream().destroy();
    signal.complete();
  });

});
