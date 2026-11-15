import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Logger,
  NotFoundException,
  RequestMethod,
  VersioningType,
  type HttpServer,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
  type VersionValue,
} from '@nestjs/common/internal';
import { ApplicationConfig } from '../../application-config.js';
import { UnknownRequestMappingException } from '../../errors/exceptions/unknown-request-mapping.exception.js';
import { ContextIdFactory } from '../../helpers/context-id-factory.js';
import type { Injector } from '../../injector/injector.js';
import type { NestContainer } from '../../injector/container.js';
import type {
  ContextId,
  InstanceWrapper,
} from '../../injector/instance-wrapper.js';
import type { Module } from '../../injector/module.js';
import type { GraphInspector } from '../../inspector/graph-inspector.js';
import { MetadataScanner } from '../../metadata-scanner.js';
import type { ExceptionsFilter } from '../../router/interfaces/exceptions-filter.interface.js';
import type { ResolvedRoute } from '../../router/interfaces/resolved-route.interface.js';
import type { RoutePathMetadata } from '../../router/interfaces/route-path-metadata.interface.js';
import type { RouteResolutionOptions } from '../../router/interfaces/route-resolution-options.interface.js';
import { REQUEST_CONTEXT_ID } from '../../router/request/request-constants.js';
import { RoutePathFactory } from '../../router/route-path-factory.js';
import { RouterExecutionContext } from '../../router/router-execution-context.js';
import {
  RouterProxy,
  type RouterProxyCallback,
} from '../../router/router-proxy.js';
import {
  RouterExplorer,
  type RouteDefinition,
} from '../../router/router-explorer.js';

const RANDOM_SEED = 1808;
const MODULE_KEY = 'cft-module';

// LCG cố định: tránh Math.random, thời gian thực và dữ liệu mạng.
function label(index: number): string {
  let state = RANDOM_SEED;
  for (let i = 0; i <= index; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  }
  return `item${1000 + (state % 8000)}`;
}

type HostRequest = {
  hostname?: string;
  hosts?: Record<string, string | undefined>;
  [key: string]: unknown;
  [key: symbol]: unknown;
};
type RegisteredHandler = (
  req: HostRequest,
  res: object,
  next?: () => void,
) => unknown;
type ControllerInstance = { handle: RouterProxyCallback };
type HostSpec = string | RegExp | Array<string | RegExp>;

function createBed(
  instance: ControllerInstance = {
    handle: vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    ),
  },
) {
  const onRouteTriggered = vi.fn<
    () => ((method: RequestMethod, path: string) => void) | undefined
  >(() => undefined);
  const adapter = {
    getOnRouteTriggered: onRouteTriggered,
    getRequestHostname: vi.fn(
      (req: HostRequest): string | undefined => req.hostname,
    ),
    getRequestMethod: vi.fn((_req: HostRequest) => 'GET'),
    getRequestUrl: vi.fn((_req: HostRequest) => '/not-matched'),
  };
  const moduleRef = { controllers: new Map() };
  const container = {
    getHttpAdapterRef: vi.fn(() => adapter),
    getModuleByKey: vi.fn((_key: string) => moduleRef),
    registerRequestProvider: vi.fn(),
  };
  const injector = { loadPerContext: vi.fn(async () => instance) };
  const filterNext = vi.fn();
  const filters = {
    create: vi.fn(() => ({ next: filterNext })),
  };
  const router = {
    get: vi.fn(),
    post: vi.fn(),
    use: vi.fn(),
    normalizePath: vi.fn((path: string) => `/normalized${path}`),
    applyVersionFilter: vi.fn(
      (handler: Function, _version: VersionValue, _options: unknown) =>
        handler,
    ),
  };
  const graph = { insertEntrypointDefinition: vi.fn() };
  const wrapper = {
    id: `node-${label(0)}`,
    name: 'CftController',
    instance,
    isDependencyTreeStatic: vi.fn(() => true),
    isDependencyTreeDurable: vi.fn(() => false),
  };
  const config = new ApplicationConfig();
  const explorer = new RouterExplorer(
    new MetadataScanner(),
    container as unknown as NestContainer,
    injector as unknown as Injector,
    new RouterProxy(),
    filters as unknown as ExceptionsFilter,
    config,
    new RoutePathFactory(config),
    graph as unknown as GraphInspector,
  );
  return {
    explorer,
    instance,
    wrapper,
    moduleRef,
    container,
    injector,
    filters,
    filterNext,
    router,
    adapter,
    graph,
  };
}

type Bed = ReturnType<typeof createBed>;

function definition(
  bed: Bed,
  paths: string[] = [`/${label(1)}`],
  version?: VersionValue,
): RouteDefinition {
  return {
    path: paths,
    requestMethod: RequestMethod.GET,
    targetCallback: bed.instance.handle,
    methodName: 'handle',
    version,
  };
}

function apply(
  bed: Bed,
  routes: RouteDefinition[] | undefined = [definition(bed)],
  metadata: RoutePathMetadata = {},
  host: HostSpec = '',
  options?: RouteResolutionOptions,
): void {
  bed.explorer.applyPathsToRouterProxy(
    bed.router as unknown as HttpServer,
    routes as RouteDefinition[],
    bed.wrapper as unknown as InstanceWrapper,
    MODULE_KEY,
    metadata,
    host,
    options,
  );
}

function registered(bed: Bed, index = 0): RegisteredHandler {
  const callback = bed.router.get.mock.calls[index]?.[1] as
    | RegisteredHandler
    | undefined;
  expect(callback).toBeTypeOf('function');
  return callback!;
}

function resolvedRoute(
  bed: Bed,
  rawPath?: string,
  handler: (...args: unknown[]) => unknown = vi.fn(() => 'handled'),
): ResolvedRoute {
  return {
    method: RequestMethod.GET,
    path: `/resolved/${label(2)}`,
    rawPath,
    host: undefined,
    version: undefined,
    methodVersion: undefined,
    controllerVersion: undefined,
    handler,
    targetCallback: bed.instance.handle,
    methodName: 'handle',
    instanceWrapper: bed.wrapper as unknown as InstanceWrapper,
  };
}

function scopedHandler(bed: Bed) {
  return bed.explorer.createRequestScopedHandler(
    bed.wrapper as unknown as InstanceWrapper,
    RequestMethod.GET,
    bed.moduleRef as unknown as Module,
    MODULE_KEY,
    'handle',
  );
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  // Chỉ thay RouterExecutionContext (dependency): vẫn chạy RouterExplorer thật,
  // createCallbackProxy thật và RouterProxy thật.
  vi.spyOn(RouterExecutionContext.prototype, 'create').mockImplementation(
    (_instance, callback) =>
      callback as ReturnType<RouterExecutionContext['create']>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouterExplorer CFT — đường dẫn và quét controller', () => {
  it('T01 — thiếu PATH_METADATA ném UnknownRequestMappingException', () => {
    const bed = createBed();
    class Unmapped {}
    expect(() => bed.explorer.extractRouterPath(Unmapped)).toThrow(
      UnknownRequestMappingException,
    );
  });

  it('T02 — PATH_METADATA dạng chuỗi được thêm dấu /', () => {
    const bed = createBed();
    class SinglePath {}
    Reflect.defineMetadata(PATH_METADATA, label(3), SinglePath);
    expect(bed.explorer.extractRouterPath(SinglePath)).toEqual([
      `/${label(3)}`,
    ]);
  });

  it('T03 — PATH_METADATA dạng mảng đi qua nhiều phần tử', () => {
    const bed = createBed();
    class ManyPaths {}
    Reflect.defineMetadata(
      PATH_METADATA,
      [label(4), `/${label(5)}`],
      ManyPaths,
    );
    expect(bed.explorer.extractRouterPath(ManyPaths)).toEqual([
      `/${label(4)}`,
      `/${label(5)}`,
    ]);
  });

  it('T04 — PATH_METADATA là [] trả [] và không lặp', () => {
    const bed = createBed();
    class EmptyPaths {}
    Reflect.defineMetadata(PATH_METADATA, [], EmptyPaths);
    expect(bed.explorer.extractRouterPath(EmptyPaths)).toEqual([]);
  });

  it('T05 — danh sách route undefined hoặc [] không đăng ký', () => {
    const bed = createBed();
    apply(bed, undefined);
    apply(bed, []);
    expect(bed.router.get).not.toHaveBeenCalled();
    expect(bed.graph.insertEntrypointDefinition).not.toHaveBeenCalled();
  });

  it('T06 — explore quét metadata thật, bỏ method không có path và truyền options', () => {
    class Controller {
      handle(_req: unknown, _res: unknown, _next: () => void): void {}
      ignored(): void {}
    }
    Reflect.defineMetadata(
      PATH_METADATA,
      [label(6), label(7)],
      Controller.prototype.handle,
    );
    Reflect.defineMetadata(
      METHOD_METADATA,
      RequestMethod.GET,
      Controller.prototype.handle,
    );
    Reflect.defineMetadata(
      VERSION_METADATA,
      '7',
      Controller.prototype.handle,
    );
    const bed = createBed(new Controller());
    const onRouteResolved = vi.fn();
    bed.explorer.explore(
      bed.wrapper as unknown as InstanceWrapper,
      MODULE_KEY,
      bed.router as unknown as HttpServer,
      '',
      { ctrlPath: label(8) },
      { onRouteResolved },
    );
    expect(bed.router.get).toHaveBeenCalledTimes(2);
    expect(bed.router.get.mock.calls.map(call => call[0])).toEqual([
      `/normalized/${label(8)}/${label(6)}`,
      `/normalized/${label(8)}/${label(7)}`,
    ]);
    expect(onRouteResolved).toHaveBeenCalledTimes(2);
    expect(onRouteResolved.mock.calls[0][0]).toMatchObject({
      methodVersion: '7',
      methodName: 'handle',
    });
    expect(bed.graph.insertEntrypointDefinition).toHaveBeenCalledTimes(2);
  });

  it('T07 — explore với mặc định options và controller không có route', () => {
    class Controller {
      handle(_req: unknown, _res: unknown, _next: () => void): void {}
    }
    const bed = createBed(new Controller());
    bed.explorer.explore(
      bed.wrapper as unknown as InstanceWrapper,
      MODULE_KEY,
      bed.router as unknown as HttpServer,
      '',
      {},
    );
    expect(bed.router.get).not.toHaveBeenCalled();
  });
});

describe('RouterExplorer CFT — đăng ký, version và metadata', () => {
  it('T08 — route tĩnh mặc định, router không normalizePath, không hook', async () => {
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    );
    const bed = createBed({ handle: callback });
    const bareRouter = { get: bed.router.get, use: bed.router.use };
    bed.explorer.applyPathsToRouterProxy(
      bareRouter as unknown as HttpServer,
      [definition(bed)],
      bed.wrapper as unknown as InstanceWrapper,
      MODULE_KEY,
      {},
      '',
    );
    expect(bed.router.get).toHaveBeenCalledWith(
      `/${label(1)}`,
      expect.any(Function),
    );
    const handler = registered(bed);
    const req = {};
    const res = {};
    const next = vi.fn();
    await handler(req, res, next);
    expect(callback).toHaveBeenCalledWith(req, res, next);
    expect(handler.name).toBe('CftController.handle');
    expect(bed.graph.insertEntrypointDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'http-endpoint',
        metadata: expect.objectContaining({
          path: `/${label(1)}`,
          requestMethod: 'GET',
        }),
      }),
      bed.wrapper.id,
    );
    expect(bed.router.applyVersionFilter).not.toHaveBeenCalled();
    expect(Logger.prototype.log).toHaveBeenCalled();
  });

  it('T09 — immediate registration + onRouteTriggered, thứ tự và copy metadata', async () => {
    const calls: string[] = [];
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => {
        calls.push('controller');
      },
    );
    Reflect.defineMetadata('cft:first', label(9), callback);
    Reflect.defineMetadata('cft:second', 1808, callback);
    const bed = createBed({ handle: callback });
    const onTrigger = vi.fn(() => calls.push('trigger'));
    bed.adapter.getOnRouteTriggered.mockReturnValue(onTrigger);
    apply(bed);
    expect(bed.router.get).toHaveBeenCalledWith(
      `/normalized/${label(1)}`,
      expect.any(Function),
    );
    const handler = registered(bed);
    expect(Reflect.getMetadata('cft:first', handler)).toBe(label(9));
    expect(Reflect.getMetadata('cft:second', handler)).toBe(1808);
    expect(handler.name).toBe('CftController.handle');
    const req = {};
    const res = {};
    const next = vi.fn();
    await handler(req, res, next);
    expect(onTrigger).toHaveBeenCalledWith(
      RequestMethod.GET,
      `/${label(1)}`,
    );
    expect(calls).toEqual(['trigger', 'controller']);
    expect(callback).toHaveBeenCalledWith(req, res, next);
  });

  it('T10 — deferRegistration bỏ adapter nhưng trả ResolvedRoute, dùng controllerVersion', () => {
    const bed = createBed();
    const onRouteResolved = vi.fn();
    apply(
      bed,
      [definition(bed)],
      {
        ctrlPath: label(10),
        controllerVersion: '5',
        versioningOptions: { type: VersioningType.URI },
      },
      '',
      { deferRegistration: true, onRouteResolved },
    );
    expect(bed.router.get).not.toHaveBeenCalled();
    expect(onRouteResolved).toHaveBeenCalledTimes(1);
    expect(onRouteResolved.mock.calls[0][0]).toMatchObject({
      path: `/normalized/v5/${label(10)}/${label(1)}`,
      rawPath: `/v5/${label(10)}/${label(1)}`,
      version: '5',
      methodVersion: undefined,
      controllerVersion: '5',
      handler: expect.any(Function),
    });
    expect(bed.graph.insertEntrypointDefinition).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.log).toHaveBeenCalled();
    expect(bed.router.applyVersionFilter).not.toHaveBeenCalled();
  });

  it('T11 — methodVersion ưu tiên, version khác URI áp filter trên nhiều path', () => {
    const bed = createBed();
    const onRouteResolved = vi.fn();
    apply(
      bed,
      [definition(bed, [`/${label(11)}`, `/${label(12)}`], '8')],
      {
        controllerVersion: '3',
        versioningOptions: {
          type: VersioningType.HEADER,
          header: 'x-api-version',
        },
      },
      '',
      { onRouteResolved },
    );
    expect(bed.router.applyVersionFilter).toHaveBeenCalledTimes(2);
    expect(bed.router.applyVersionFilter).toHaveBeenCalledWith(
      expect.any(Function),
      '8',
      expect.objectContaining({ type: VersioningType.HEADER }),
    );
    expect(bed.router.get).toHaveBeenCalledTimes(2);
    expect(onRouteResolved.mock.calls[0][0]).toMatchObject({
      methodVersion: '8',
      controllerVersion: '3',
      version: '8',
    });
    expect(Logger.prototype.log).toHaveBeenCalled();
  });

  it('T12 — có methodVersion nhưng không có versioningOptions: không filter', () => {
    const bed = createBed();
    apply(bed, [definition(bed, undefined, '2')]);
    expect(bed.router.applyVersionFilter).not.toHaveBeenCalled();
    expect(bed.router.get).toHaveBeenCalledTimes(1);
  });

  it('T13 — có versioningOptions nhưng không có version: không filter', () => {
    const bed = createBed();
    apply(bed, [definition(bed)], {
      versioningOptions: { type: VersioningType.URI },
    });
    expect(bed.router.applyVersionFilter).not.toHaveBeenCalled();
    expect(bed.router.get).toHaveBeenCalledTimes(1);
  });

  it('T14 — methodVersion chuỗi rỗng: ?? giữ giá trị, || dùng controllerVersion', () => {
    const bed = createBed();
    const onRouteResolved = vi.fn();
    apply(
      bed,
      [definition(bed, [`/${label(13)}`], '')],
      {
        controllerVersion: '6',
        versioningOptions: { type: VersioningType.URI },
      },
      '',
      { onRouteResolved },
    );
    expect(bed.router.get.mock.calls[0][0]).toBe(
      `/normalized/v6/${label(13)}`,
    );
    expect(onRouteResolved.mock.calls[0][0]).toMatchObject({
      version: '',
      methodVersion: '',
      controllerVersion: '6',
    });
    expect(bed.router.applyVersionFilter).not.toHaveBeenCalled();
  });

  it('T15 — vòng lặp path 0 lần: không gọi pathFactory hoặc đăng ký', () => {
    const bed = createBed();
    apply(bed, [definition(bed, [])]);
    expect(bed.router.get).not.toHaveBeenCalled();
    expect(bed.graph.insertEntrypointDefinition).not.toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('T16 — nhiều methodPath × nhiều URI versions tạo bốn đăng ký', () => {
    const bed = createBed();
    apply(
      bed,
      [definition(bed, [`/${label(14)}`, `/${label(15)}`])],
      {
        controllerVersion: ['1', '2'],
        versioningOptions: { type: VersioningType.URI },
      },
    );
    expect(bed.router.get).toHaveBeenCalledTimes(4);
    expect(bed.graph.insertEntrypointDefinition).toHaveBeenCalledTimes(4);
    expect(bed.router.get.mock.calls.map(call => call[0])).toEqual([
      `/normalized/v1/${label(14)}`,
      `/normalized/v2/${label(14)}`,
      `/normalized/v1/${label(15)}`,
      `/normalized/v2/${label(15)}`,
    ]);
  });

  it('T17 — mảng URI versions rỗng: 0 đăng ký nhưng vẫn tạo đường log', () => {
    const bed = createBed();
    apply(bed, [definition(bed)], {
      controllerVersion: [],
      versioningOptions: { type: VersioningType.URI },
    });
    expect(bed.router.get).not.toHaveBeenCalled();
    expect(bed.graph.insertEntrypointDefinition).not.toHaveBeenCalled();
    expect(Logger.prototype.log).toHaveBeenCalledTimes(1);
  });

  it('T18 — các route tuần tự ghi đè methodVersion trên metadata', () => {
    const bed = createBed();
    const metadata: RoutePathMetadata = {};
    const resolved = vi.fn();
    apply(
      bed,
      [
        definition(bed, [`/${label(18)}`], '1'),
        definition(bed, [`/${label(19)}`], '2'),
      ],
      metadata,
      '',
      { onRouteResolved: resolved },
    );
    expect(resolved.mock.calls.map(call => call[0].methodVersion)).toEqual([
      '1',
      '2',
    ]);
    expect(metadata.methodVersion).toBe('2');
    expect(bed.router.get).toHaveBeenCalledTimes(2);
  });

  it('T19 — registerResolvedRoute không có hook: dùng handler trực tiếp và rawPath fallback', () => {
    const bed = createBed();
    Reflect.defineMetadata('cft:source', label(20), bed.instance.handle);
    const fn = vi.fn(() => label(21));
    const resolved = resolvedRoute(bed, undefined, fn);
    bed.explorer.registerResolvedRoute(
      bed.router as unknown as HttpServer,
      resolved,
    );
    expect(bed.router.get).toHaveBeenCalledWith(resolved.path, fn);
    expect(Reflect.getMetadata('cft:source', fn)).toBe(label(20));
    expect(bed.adapter.getOnRouteTriggered).toHaveBeenCalled();
  });

  it('T20 — registerResolvedRoute có hook và rawPath: wrapper giữ metadata', () => {
    const bed = createBed();
    const trigger = vi.fn();
    bed.adapter.getOnRouteTriggered.mockReturnValue(trigger);
    Reflect.defineMetadata('cft:wrapped', { test: label(22) }, bed.instance.handle);
    const fn = vi.fn(() => label(23));
    const resolved = resolvedRoute(bed, `/raw/${label(24)}`, fn);
    bed.explorer.registerResolvedRoute(
      bed.router as unknown as HttpServer,
      resolved,
    );
    const handler = registered(bed);
    expect(handler).not.toBe(fn);
    expect(Reflect.getMetadata('cft:wrapped', handler)).toEqual({
      test: label(22),
    });
    const req = {};
    const res = {};
    const next = vi.fn();
    expect(handler(req, res, next)).toBe(label(23));
    expect(trigger).toHaveBeenCalledWith(
      RequestMethod.GET,
      `/raw/${label(24)}`,
    );
    expect(fn).toHaveBeenCalledWith(req, res, next);
  });

  it('T21 — registerResolvedRoute có hook nhưng không rawPath: dùng path', () => {
    const bed = createBed();
    const trigger = vi.fn();
    bed.adapter.getOnRouteTriggered.mockReturnValue(trigger);
    const route = resolvedRoute(bed);
    bed.explorer.registerResolvedRoute(bed.router as unknown as HttpServer, route);
    registered(bed)({}, {}, vi.fn());
    expect(trigger).toHaveBeenCalledWith(RequestMethod.GET, route.path);
  });
});

describe('RouterExplorer CFT — host filter qua route công khai', () => {
  it('T22 — host chuỗi khớp; host không khớp thì next, hostname thiếu dùng chuỗi rỗng', async () => {
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    );
    const bed = createBed({ handle: callback });
    apply(bed, [definition(bed)], {}, 'api.example.test');
    const handler = registered(bed);
    const next = vi.fn();
    const matched: HostRequest = { hostname: 'api.example.test' };
    await handler(matched, {}, next);
    expect(matched.hosts).toEqual({});
    expect(callback).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    const unmatched: HostRequest = { hostname: 'other.example.test' };
    await handler(unmatched, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    const absent: HostRequest = {};
    await handler(absent, {}, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(bed.adapter.getRequestHostname).toHaveBeenCalledWith(absent);
  });

  it('T23 — host mảng: bỏ match đầu, match RegExp thứ hai và điền named groups', async () => {
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    );
    const bed = createBed({ handle: callback });
    apply(
      bed,
      [definition(bed)],
      {},
      [/^other\.example\.test$/, /^(?<tenant>north)\.(?<region>east)\.example\.test$/],
    );
    const req: HostRequest = { hostname: 'north.east.example.test' };
    const next = vi.fn();
    await registered(bed)(req, {}, next);
    expect(req.hosts).toEqual({ tenant: 'north', region: 'east' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('T24 — host mẫu chuỗi có :param điền req.hosts theo keys', async () => {
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    );
    const bed = createBed({ handle: callback });
    apply(bed, [definition(bed)], {}, ':tenant');
    const req: HostRequest = { hostname: label(25) };
    await registered(bed)(req, {}, vi.fn());
    expect(req.hosts).toEqual({ tenant: label(25) });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('T25 — RegExp match không có named groups vẫn gọi handler', async () => {
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    );
    const bed = createBed({ handle: callback });
    apply(bed, [definition(bed)], {}, /^site\.example\.test$/);
    const req: HostRequest = { hostname: 'site.example.test' };
    await registered(bed)(req, {}, vi.fn());
    expect(req.hosts).toEqual({});
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('T26 — host string sai cú pháp: TypeError và ghi logger.error', () => {
    const bed = createBed();
    expect(() => apply(bed, [definition(bed)], {}, ':')).toThrow(TypeError);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported host ":" syntax'),
    );
    expect(bed.router.get).not.toHaveBeenCalled();
  });

  it('T27 — host=[]: vòng lặp khớp chạy 0 lần và chuyển next', () => {
    const bed = createBed();
    apply(bed, [definition(bed)], {}, []);
    const next = vi.fn();
    registered(bed)({ hostname: label(26) }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('T28 — không có next, host đơn không khớp: 404 và cảnh báo đúng một lần', () => {
    const bed = createBed();
    apply(bed, [definition(bed)], {}, 'other.example.test');
    const handler = registered(bed);
    const req: HostRequest = { hostname: 'api.example.test' };
    expect(() => handler(req, {}, undefined)).toThrow(NotFoundException);
    expect(() => handler(req, {}, undefined)).toThrow('Cannot GET /not-matched');
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('filtering on host: "other.example.test"'),
    );
    expect(bed.adapter.getRequestMethod).toHaveBeenCalledTimes(2);
    expect(bed.adapter.getRequestUrl).toHaveBeenCalledTimes(2);
  });

  it('T29 — không có next, host mảng không khớp: cảnh báo số nhiều', () => {
    const bed = createBed();
    apply(
      bed,
      [definition(bed)],
      {},
      ['first.example.test', 'second.example.test'],
    );
    expect(() =>
      registered(bed)({ hostname: 'third.example.test' }, {}, undefined),
    ).toThrow(NotFoundException);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('filtering on hosts:'),
    );
  });
});

describe('RouterExplorer CFT — request scope, contextId và catch', () => {
  it('T30 — route request-scoped: loadPerContext resolve và context thường', async () => {
    const callback = vi.fn(
      (_req: unknown, _res: unknown, _next: () => void) => undefined,
    );
    const bed = createBed({ handle: callback });
    bed.wrapper.isDependencyTreeStatic.mockReturnValue(false);
    const payload = { tracking: label(27) };
    const id: ContextId = { id: RANDOM_SEED, payload };
    vi.spyOn(ContextIdFactory, 'getByRequest').mockReturnValue(id);
    apply(bed);
    expect(bed.container.getModuleByKey).toHaveBeenCalledWith(MODULE_KEY);
    const req: HostRequest = {};
    const res = {};
    const next = vi.fn();
    await registered(bed)(req, res, next);
    expect(bed.wrapper.isDependencyTreeDurable).toHaveBeenCalledTimes(1);
    expect(req[REQUEST_CONTEXT_ID]).toBe(id);
    expect(req.tracking).toBe(payload.tracking);
    expect(Object.getOwnPropertyDescriptor(req, REQUEST_CONTEXT_ID)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(bed.container.registerRequestProvider).toHaveBeenCalledWith(req, id);
    expect(bed.injector.loadPerContext).toHaveBeenCalledWith(
      bed.instance,
      bed.moduleRef,
      bed.moduleRef.controllers,
      id,
    );
    expect(callback).toHaveBeenCalledWith(req, res, next);
    expect(bed.filterNext).not.toHaveBeenCalled();
  });

  it('T31 — durable request scope: đăng ký payload thay cho request', async () => {
    const bed = createBed();
    bed.wrapper.isDependencyTreeDurable.mockReturnValue(true);
    const payload = { tenant: label(28) };
    const id: ContextId = { id: RANDOM_SEED + 1, payload };
    vi.spyOn(ContextIdFactory, 'getByRequest').mockReturnValue(id);
    const req: HostRequest = {};
    await scopedHandler(bed)(req, {}, vi.fn());
    expect(bed.container.registerRequestProvider).toHaveBeenCalledWith(
      payload,
      id,
    );
    expect(req.tenant).toBeUndefined();
    expect(req[REQUEST_CONTEXT_ID]).toBe(id);
  });

  it('T32 — request đã có context id: không đăng ký request provider lần nữa', async () => {
    const bed = createBed();
    const id: ContextId = { id: RANDOM_SEED + 2, payload: {} };
    const req: HostRequest = {};
    Object.defineProperty(req, REQUEST_CONTEXT_ID, { value: id });
    await scopedHandler(bed)(req, {}, vi.fn());
    expect(bed.container.registerRequestProvider).not.toHaveBeenCalled();
    expect(bed.injector.loadPerContext).toHaveBeenCalledWith(
      bed.instance,
      bed.moduleRef,
      bed.moduleRef.controllers,
      id,
    );
  });

  it('T33 — loadPerContext reject hai lần: catch dùng exceptionFilter cache', async () => {
    const bed = createBed();
    const id: ContextId = { id: RANDOM_SEED + 3, payload: {} };
    vi.spyOn(ContextIdFactory, 'getByRequest').mockReturnValue(id);
    const err = new Error(`load-${label(29)}`);
    bed.injector.loadPerContext.mockRejectedValue(err);
    const handler = scopedHandler(bed);
    const req1: HostRequest = {};
    const req2: HostRequest = {};
    const res = {};
    const next = vi.fn();
    await handler(req1, res, next);
    await handler(req2, res, next);
    expect(bed.filters.create).toHaveBeenCalledTimes(1);
    expect(bed.filterNext).toHaveBeenCalledTimes(2);
    expect(bed.filterNext.mock.calls[0][0]).toBe(err);
    expect(
      (bed.filterNext.mock.calls[0][1] as {
        getArgs: () => unknown[];
      }).getArgs(),
    ).toEqual([req1, res, next]);
    expect(
      (bed.filterNext.mock.calls[1][1] as {
        getArgs: () => unknown[];
      }).getArgs(),
    ).toEqual([req2, res, next]);
  });

  it('T34 — lỗi đồng bộ lấy context id cũng vào catch', async () => {
    const bed = createBed();
    const err = new Error(`context-${label(30)}`);
    vi.spyOn(ContextIdFactory, 'getByRequest').mockImplementation(() => {
      throw err;
    });
    await scopedHandler(bed)({}, {}, vi.fn());
    expect(bed.injector.loadPerContext).not.toHaveBeenCalled();
    expect(bed.filterNext).toHaveBeenCalledWith(err, expect.any(Object));
    expect(bed.filters.create).toHaveBeenCalledTimes(1);
  });

  it('T35 — lỗi bất đồng bộ ở callback được proxy dependency nhận', async () => {
    const err = new Error(`callback-${label(31)}`);
    const callback = vi.fn(async () => {
      throw err;
    });
    const bed = createBed({ handle: callback });
    apply(bed);
    const req = {};
    const res = {};
    const next = vi.fn();
    expect(await registered(bed)(req, res, next)).toBe(res);
    expect(bed.filterNext).toHaveBeenCalledWith(err, expect.any(Object));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
