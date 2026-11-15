import 'reflect-metadata';

import {
  Logger,
  NotFoundException,
  RequestMethod,
  VersioningType,
  type VersioningOptions,
} from '@nestjs/common';
import {
  HOST_METADATA,
  MODULE_PATH,
  VERSION_METADATA,
} from '@nestjs/common/internal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutesResolver } from '../../router/routes-resolver.js';

/**
 * CFT of RoutesResolver only. Dependencies that perform separate routing,
 * path composition and exception-filter logic are replaced with observables.
 * The real RoutesResolver implementation is always invoked.
 */
const collaborators = vi.hoisted(() => ({
  extractRouterPath: vi.fn(),
  explore: vi.fn(),
  registerResolvedRoute: vi.fn(),
  createPaths: vi.fn(),
  getExcludedRoutePaths: vi.fn(),
  createExceptionFilter: vi.fn(),
  createProxy: vi.fn(),
  createExceptionLayerProxy: vi.fn(),
}));

vi.mock('../../router/router-explorer.js', () => ({
  RouterExplorer: class {
    extractRouterPath = collaborators.extractRouterPath;
    explore = collaborators.explore;
    registerResolvedRoute = collaborators.registerResolvedRoute;
  },
}));

vi.mock('../../router/route-path-factory.js', () => ({
  RoutePathFactory: class {
    create = collaborators.createPaths;
    getExcludedRoutePaths = collaborators.getExcludedRoutePaths;
  },
}));

vi.mock(
  '../../router/router-exception-filters.js',
  () => ({
    RouterExceptionFilters: class {
      create = collaborators.createExceptionFilter;
    },
  }),
));

vi.mock('../../router/router-proxy.js', () => ({
  RouterProxy: class {
    createProxy = collaborators.createProxy;
    createExceptionLayerProxy = collaborators.createExceptionLayerProxy;
  },
}));

type ControllerMap = Parameters<RoutesResolver['registerRouters']>[0];
type ControllerWrapper =
  ControllerMap extends Map<infer _Key, infer Value> ? Value : never;
type HttpAdapter = Parameters<RoutesResolver['resolve']>[0];
type ResolvedRoute = Parameters<RoutesResolver['registerResolvedRoute']>[1];
type ControllerType = new () => object;
type ModuleEntry = {
  metatype: ControllerType;
  controllers: ControllerMap;
};

/** Seeded LCG, reset for each harness; produces non-boundary integers. */
function seededNumbers(seed = 1808): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 1000 + (state % 8000);
  };
}

/**
 * Only `metatype` is consumed by the target source; other InstanceWrapper
 * fields are intentionally absent because RouterExplorer is mocked.
 */
function controllerMap(...types: ControllerType[]): ControllerMap {
  const result: ControllerMap = new Map();
  types.forEach((metatype, index) => {
    result.set(`controller-${index}`, {
      metatype,
    } as unknown as ControllerWrapper);
  });
  return result;
}

function createHarness(
  flags: { notFoundHandler?: boolean; errorHandler?: boolean } = {},
) {
  const next = seededNumbers();
  const prefix = `/api-${next()}`;
  const applicationId = `app-${next()}`;
  const modules = Object.assign(new Map<string, ModuleEntry>(), {
    applicationId,
  });

  const adapter = {
    getRequestMethod: vi.fn(() => 'PATCH'),
    getRequestUrl: vi.fn(() => `/missing-${next()}`),
    mapException: vi.fn((error: unknown) => error),
    setNotFoundHandler:
      flags.notFoundHandler === false ? undefined : vi.fn(),
    setErrorHandler: flags.errorHandler === false ? undefined : vi.fn(),
  };
  const config = {
    getVersioning: vi.fn<() => VersioningOptions | undefined>(
      () => undefined,
    ),
    getGlobalPrefix: vi.fn(() => prefix),
  };
  const container = {
    getModules: vi.fn(() => modules),
    getHttpAdapterRef: vi.fn(() => adapter),
  };
  const exceptionHandler = { next: vi.fn() };
  collaborators.createExceptionFilter.mockReturnValue(exceptionHandler);

  const resolver = new RoutesResolver(
    container as unknown as ConstructorParameters<typeof RoutesResolver>[0],
    config as unknown as ConstructorParameters<typeof RoutesResolver>[1],
    {} as ConstructorParameters<typeof RoutesResolver>[2],
    {} as ConstructorParameters<typeof RoutesResolver>[3],
  );
  const logs = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);

  return {
    resolver,
    adapter,
    app: adapter as unknown as HttpAdapter,
    config,
    container,
    modules,
    prefix,
    exceptionHandler,
    logs,
    next,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  collaborators.extractRouterPath.mockReturnValue(['/controller']);
  collaborators.createPaths.mockImplementation(
    ({ ctrlPath }: { ctrlPath: string }) => [`/composed${ctrlPath}`],
  );
  collaborators.getExcludedRoutePaths.mockReturnValue([]);
  // Surface the original callback so its throw branch can be asserted
  // directly without exercising RouterProxy / ExceptionsHandler internals.
  collaborators.createProxy.mockImplementation(callback => callback);
  collaborators.createExceptionLayerProxy.mockImplementation(
    callback => callback,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoutesResolver CFT', () => {
  describe('resolve and module path lookup', () => {
    it('T1 uses default options and performs zero iterations for no modules', () => {
      const h = createHarness();

      h.resolver.resolve(h.app, h.prefix);

      expect(h.container.getModules).toHaveBeenCalledOnce();
      expect(collaborators.extractRouterPath).not.toHaveBeenCalled();
      expect(collaborators.explore).not.toHaveBeenCalled();
    });

    it('T2 prefers application-scoped module metadata and delegates one route', () => {
      class PrimaryModule {}
      class PrimaryController {}
      const h = createHarness();
      const scopedPath = `/scoped-${h.next()}`;
      Reflect.defineMetadata(
        MODULE_PATH + h.modules.applicationId,
        scopedPath,
        PrimaryModule,
      );
      Reflect.defineMetadata(MODULE_PATH, '/fallback', PrimaryModule);
      h.modules.set('primary-module', {
        metatype: PrimaryModule,
        controllers: controllerMap(PrimaryController),
      });

      h.resolver.resolve(h.app, h.prefix);

      expect(collaborators.createPaths).toHaveBeenCalledWith({
        ctrlPath: '/controller',
        modulePath: scopedPath,
        globalPrefix: h.prefix,
      });
      expect(collaborators.explore).toHaveBeenCalledWith(
        expect.objectContaining({ metatype: PrimaryController }),
        'primary-module',
        h.app,
        undefined,
        expect.objectContaining({
          ctrlPath: '/controller',
          modulePath: scopedPath,
          globalPrefix: h.prefix,
          controllerVersion: undefined,
          versioningOptions: undefined,
        }),
        {},
      );
      expect(h.logs).toHaveBeenCalledWith(
        'PrimaryController {/composed/controller}:',
      );
    });

    it('T3 processes multiple modules using fallback or missing module paths and passes explicit options', () => {
      class FallbackModule {}
      class MissingModule {}
      class FallbackController {}
      class MissingController {}
      const h = createHarness();
      const fallbackPath = `/fallback-${h.next()}`;
      const options = {
        deferRegistration: true,
        onRouteResolved: vi.fn(),
      };
      Reflect.defineMetadata(MODULE_PATH, fallbackPath, FallbackModule);
      h.modules.set('fallback-module', {
        metatype: FallbackModule,
        controllers: controllerMap(FallbackController),
      });
      h.modules.set('missing-module', {
        metatype: MissingModule,
        controllers: controllerMap(MissingController),
      });

      h.resolver.resolve(h.app, h.prefix, options);

      expect(collaborators.explore).toHaveBeenCalledTimes(2);
      expect(collaborators.explore).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ metatype: FallbackController }),
        'fallback-module',
        h.app,
        undefined,
        expect.objectContaining({ modulePath: fallbackPath }),
        options,
      );
      expect(collaborators.explore).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ metatype: MissingController }),
        'missing-module',
        h.app,
        undefined,
        expect.objectContaining({ modulePath: undefined }),
        options,
      );
    });

    it('T4 falls back when application-scoped module metadata is explicitly null', () => {
      class NullScopedModule {}
      class NullScopedController {}
      const h = createHarness();
      const fallbackPath = `/fallback-${h.next()}`;
      Reflect.defineMetadata(
        MODULE_PATH + h.modules.applicationId,
        null,
        NullScopedModule,
      );
      Reflect.defineMetadata(MODULE_PATH, fallbackPath, NullScopedModule);
      h.modules.set('null-scoped-module', {
        metatype: NullScopedModule,
        controllers: controllerMap(NullScopedController),
      });

      h.resolver.resolve(h.app, h.prefix);

      expect(collaborators.explore).toHaveBeenCalledWith(
        expect.any(Object),
        'null-scoped-module',
        h.app,
        undefined,
        expect.objectContaining({ modulePath: fallbackPath }),
        {},
      );
    });
  });

  describe('registerRouters and controller version lookup', () => {
    it('T5 does no controller work for an empty route map', () => {
      const h = createHarness();

      h.resolver.registerRouters(
        new Map(),
        'empty-module',
        h.prefix,
        '/module',
        h.app,
      );

      expect(collaborators.extractRouterPath).not.toHaveBeenCalled();
      expect(collaborators.createPaths).not.toHaveBeenCalled();
      expect(collaborators.explore).not.toHaveBeenCalled();
    });

    it('T6 does not compose or explore routes when a controller has zero paths', () => {
      class EmptyPathsController {}
      const h = createHarness();
      collaborators.extractRouterPath.mockReturnValue([]);

      h.resolver.registerRouters(
        controllerMap(EmptyPathsController),
        'empty-paths-module',
        h.prefix,
        '/module',
        h.app,
      );

      expect(collaborators.extractRouterPath).toHaveBeenCalledWith(
        EmptyPathsController,
      );
      expect(collaborators.createPaths).not.toHaveBeenCalled();
      expect(collaborators.explore).not.toHaveBeenCalled();
      expect(h.logs).not.toHaveBeenCalled();
    });

    it('T7 logs unversioned paths, includes host metadata, and explores even when a path has zero log entries', () => {
      class MultiPathController {}
      const h = createHarness();
      const host = [`host-${h.next()}.example`, `alt-${h.next()}.example`];
      const paths = [`/first-${h.next()}`, `/second-${h.next()}`];
      const mappedPaths = [`/mapped-${h.next()}`, `/mapped-${h.next()}`];
      const options = { deferRegistration: true };
      Reflect.defineMetadata(HOST_METADATA, host, MultiPathController);
      // Without an active versioning config, even present version metadata
      // must not become controllerVersion.
      Reflect.defineMetadata(VERSION_METADATA, 'ignored', MultiPathController);
      collaborators.extractRouterPath.mockReturnValue(paths);
      collaborators.createPaths.mockImplementation(
        ({ ctrlPath }: { ctrlPath: string }) =>
          ctrlPath === paths[0] ? mappedPaths : [],
      );

      h.resolver.registerRouters(
        controllerMap(MultiPathController),
        'multi-path-module',
        h.prefix,
        '/module',
        h.app,
        options,
      );

      expect(collaborators.createPaths).toHaveBeenCalledTimes(2);
      expect(collaborators.createPaths).toHaveBeenNthCalledWith(1, {
        ctrlPath: paths[0],
        modulePath: '/module',
        globalPrefix: h.prefix,
      });
      expect(h.logs).toHaveBeenCalledTimes(2);
      expect(h.logs).toHaveBeenNthCalledWith(
        1,
        `MultiPathController {${mappedPaths[0]}}:`,
      );
      expect(h.logs).toHaveBeenNthCalledWith(
        2,
        `MultiPathController {${mappedPaths[1]}}:`,
      );
      expect(collaborators.explore).toHaveBeenCalledTimes(2);
      expect(collaborators.explore).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ metatype: MultiPathController }),
        'multi-path-module',
        h.app,
        host,
        expect.objectContaining({
          ctrlPath: paths[0],
          controllerVersion: undefined,
          versioningOptions: undefined,
        }),
        options,
      );
      expect(collaborators.explore).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        'multi-path-module',
        h.app,
        host,
        expect.objectContaining({ ctrlPath: paths[1] }),
        options,
      );
    });

    it('T8 uses version metadata when versioning is enabled and logs each composed versioned path', () => {
      class VersionedController {}
      const h = createHarness();
      const versions = [`${h.next()}`, `${h.next()}`];
      const path = `/versioned-${h.next()}`;
      const mappedPaths = [`/v${versions[0]}${path}`, `/v${versions[1]}${path}`];
      const versioning: VersioningOptions = {
        type: VersioningType.URI,
        defaultVersion: '99',
      };
      h.config.getVersioning.mockReturnValue(versioning);
      Reflect.defineMetadata(VERSION_METADATA, versions, VersionedController);
      collaborators.extractRouterPath.mockReturnValue([path]);
      collaborators.createPaths.mockReturnValue(mappedPaths);

      h.resolver.registerRouters(
        controllerMap(VersionedController),
        'versioned-module',
        h.prefix,
        '/module',
        h.app,
      );

      expect(h.logs).toHaveBeenCalledTimes(2);
      expect(h.logs).toHaveBeenNthCalledWith(
        1,
        `VersionedController {${mappedPaths[0]}} (version: ${versions.join(',')}):`,
      );
      expect(h.logs).toHaveBeenNthCalledWith(
        2,
        `VersionedController {${mappedPaths[1]}} (version: ${versions.join(',')}):`,
      );
      expect(collaborators.explore).toHaveBeenCalledWith(
        expect.any(Object),
        'versioned-module',
        h.app,
        undefined,
        expect.objectContaining({
          ctrlPath: path,
          controllerVersion: versions,
          versioningOptions: versioning,
        }),
        {},
      );
    });

    it('T9 uses defaultVersion for both null and absent version metadata across multiple controllers', () => {
      class NullVersionController {}
      class MissingVersionController {}
      const h = createHarness();
      const defaultVersion = `${h.next()}`;
      const versioning: VersioningOptions = {
        type: VersioningType.URI,
        defaultVersion,
      };
      h.config.getVersioning.mockReturnValue(versioning);
      Reflect.defineMetadata(
        VERSION_METADATA,
        null,
        NullVersionController,
      );

      h.resolver.registerRouters(
        controllerMap(NullVersionController, MissingVersionController),
        'defaults-module',
        h.prefix,
        '/module',
        h.app,
      );

      expect(collaborators.extractRouterPath).toHaveBeenCalledTimes(2);
      expect(collaborators.explore).toHaveBeenCalledTimes(2);
      for (const [index, metatype] of [
        NullVersionController,
        MissingVersionController,
      ].entries()) {
        expect(collaborators.explore).toHaveBeenNthCalledWith(
          index + 1,
          expect.objectContaining({ metatype }),
          'defaults-module',
          h.app,
          undefined,
          expect.objectContaining({
            controllerVersion: defaultVersion,
            versioningOptions: versioning,
          }),
          {},
        );
      }
      expect(h.logs).toHaveBeenCalledTimes(2);
      expect(h.logs).toHaveBeenCalledWith(
        `NullVersionController {/composed/controller} (version: ${defaultVersion}):`,
      );
      expect(h.logs).toHaveBeenCalledWith(
        `MissingVersionController {/composed/controller} (version: ${defaultVersion}):`,
      );
    });

    it('T10 takes the unversioned logging branch for explicitly empty version metadata', () => {
      class EmptyVersionController {}
      const h = createHarness();
      h.config.getVersioning.mockReturnValue({
        type: VersioningType.URI,
        defaultVersion: '5',
      });
      // Empty string is necessary to exercise `!controllerVersion`
      // with a versioning configuration that is otherwise enabled.
      Reflect.defineMetadata(
        VERSION_METADATA,
        '',
        EmptyVersionController,
      );

      h.resolver.registerRouters(
        controllerMap(EmptyVersionController),
        'empty-version-module',
        h.prefix,
        '/module',
        h.app,
      );

      expect(h.logs).toHaveBeenCalledWith(
        'EmptyVersionController {/composed/controller}:',
      );
      expect(collaborators.explore).toHaveBeenCalledWith(
        expect.any(Object),
        'empty-version-module',
        h.app,
        undefined,
        expect.objectContaining({ controllerVersion: '' }),
        {},
      );
    });
  });

  describe('route delegation and adapter handler registration', () => {
    it('T11 forwards a resolved route unchanged to RouterExplorer', () => {
      const h = createHarness();
      const route: ResolvedRoute = {
        method: RequestMethod.GET,
        path: `/resolved-${h.next()}`,
        host: undefined,
        version: undefined,
        methodVersion: undefined,
        controllerVersion: undefined,
        handler: () => undefined,
        targetCallback: () => undefined,
        methodName: 'handle',
        instanceWrapper: {
          metatype: class RoutedController {},
        } as unknown as ResolvedRoute['instanceWrapper'],
      };

      h.resolver.registerResolvedRoute(h.app, route);

      expect(collaborators.registerResolvedRoute).toHaveBeenCalledOnce();
      expect(collaborators.registerResolvedRoute).toHaveBeenCalledWith(
        h.app,
        route,
      );
    });

    it('T12 prepares not-found proxy but skips registration when adapter method is absent', () => {
      const h = createHarness({ notFoundHandler: false });
      const excludedRoutes = [{ path: '/excluded', method: RequestMethod.GET }];
      collaborators.getExcludedRoutePaths.mockReturnValue(excludedRoutes);

      h.resolver.registerNotFoundHandler();

      expect(collaborators.createExceptionFilter).toHaveBeenCalledWith(
        {},
        expect.any(Function),
        undefined,
      );
      expect(collaborators.createProxy).toHaveBeenCalledWith(
        expect.any(Function),
        h.exceptionHandler,
      );
      expect(h.config.getGlobalPrefix).toHaveBeenCalledOnce();
      expect(collaborators.getExcludedRoutePaths).toHaveBeenCalledOnce();
      expect(h.adapter.setNotFoundHandler).toBeUndefined();
    });

    it('T13 registers not-found handler with prefix and exclusions; callback throws NotFoundException', () => {
      const h = createHarness();
      const excludedRoutes = [
        { path: `/excluded-${h.next()}`, method: RequestMethod.GET },
      ];
      const missingUrl = `/missing-${h.next()}`;
      collaborators.getExcludedRoutePaths.mockReturnValue(excludedRoutes);
      h.adapter.getRequestUrl.mockReturnValue(missingUrl);

      h.resolver.registerNotFoundHandler();

      expect(h.adapter.setNotFoundHandler).toHaveBeenCalledOnce();
      const proxy = h.adapter.setNotFoundHandler?.mock.calls[0][0] as (
        req: object,
        res: object,
      ) => unknown;
      expect(h.adapter.setNotFoundHandler).toHaveBeenCalledWith(
        proxy,
        h.prefix,
        excludedRoutes,
      );
      const request = { requestId: h.next() };
      expect(() => proxy(request, {})).toThrow(NotFoundException);
      expect(() => proxy(request, {})).toThrow(
        `Cannot PATCH ${missingUrl}`,
      );
      expect(h.adapter.getRequestMethod).toHaveBeenCalledWith(request);
      expect(h.adapter.getRequestUrl).toHaveBeenCalledWith(request);
    });

    it('T14 prepares exception layer proxy but skips registration when adapter method is absent', () => {
      const h = createHarness({ errorHandler: false });

      h.resolver.registerExceptionHandler();

      expect(collaborators.createExceptionFilter).toHaveBeenCalledWith(
        {},
        expect.any(Function),
        undefined,
      );
      expect(collaborators.createExceptionLayerProxy).toHaveBeenCalledWith(
        expect.any(Function),
        h.exceptionHandler,
      );
      expect(h.config.getGlobalPrefix).toHaveBeenCalledOnce();
      expect(h.adapter.setErrorHandler).toBeUndefined();
    });

    it('T15 registers exception layer and throws mapped exception from its callback', () => {
      const h = createHarness();
      const original = new Error(`original-${h.next()}`);
      const mapped = new Error(`mapped-${h.next()}`);
      h.adapter.mapException.mockReturnValue(mapped);

      h.resolver.registerExceptionHandler();

      expect(h.adapter.setErrorHandler).toHaveBeenCalledOnce();
      const proxy = h.adapter.setErrorHandler?.mock.calls[0][0] as (
        error: Error,
        req: object,
        res: object,
        next: () => void,
      ) => unknown;
      expect(h.adapter.setErrorHandler).toHaveBeenCalledWith(
        proxy,
        h.prefix,
      );

      const request = { requestId: h.next() };
      expect(() => proxy(original, request, {}, vi.fn())).toThrow(mapped);
      expect(h.adapter.mapException).toHaveBeenCalledOnce();
      expect(h.adapter.mapException).toHaveBeenCalledWith(original);
      expect(h.container.getHttpAdapterRef).toHaveBeenCalledTimes(3);
    });
  });
});
