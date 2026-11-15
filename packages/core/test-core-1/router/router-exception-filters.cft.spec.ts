import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type ArgumentsHost, type ExceptionFilter, type HttpServer } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/internal';
import { ApplicationConfig } from '../../application-config.js';
import { ExceptionsHandler } from '../../exceptions/exceptions-handler.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type { NestContainer } from '../../injector/container.js';
import type {
  ContextId,
  InstancePerContext,
  InstanceWrapper,
} from '../../injector/instance-wrapper.js';
import { RouterExceptionFilters } from '../../router/router-exception-filters.js';
import type { RouterProxyCallback } from '../../router/router-proxy.js';

// Seed 1808; a one-step, per-case LCG avoids execution-order-dependent inputs.
const RANDOM_SEED = 1808;
function interiorId(caseId: number): number {
  const initial = (RANDOM_SEED ^ Math.imul(caseId, 0x9e3779b1)) >>> 0;
  const next = (Math.imul(initial, 1664525) + 1013904223) >>> 0;
  return 10_000 + (next % 900_000);
}
function requestContext(caseId: number): ContextId {
  return { id: interiorId(caseId) };
}
function inquirer(caseId: number): string {
  return `inquirer-${interiorId(caseId)}`;
}
function moduleKey(caseId: number): string {
  return `module-${interiorId(caseId)}`;
}

function filterFixture(onCatch?: () => void) {
  const catchFn = vi.fn((_error: unknown, _host: ArgumentsHost): void => {
    if (onCatch) onCatch();
  });
  const filter: ExceptionFilter = { catch: catchFn };
  return { filter, catchFn };
}

function hostOf(filter: ExceptionFilter): InstancePerContext<ExceptionFilter> {
  return { instance: filter, isResolved: true };
}

function scopedWrapper(
  token: string,
  host: InstancePerContext<ExceptionFilter> | null,
) {
  // Only the three members read by getGlobalMetadata/getContextId are stubbed.
  // A null host is used only in T10 and is an artificial_state: a real
  // InstanceWrapper.getInstanceByContextId normally returns a host object.
  const resolve = vi.fn((_id: ContextId, _inquirerId?: string) =>
    host as InstancePerContext<ExceptionFilter>,
  );
  const durable = vi.fn(() => false);
  const wrapper = {
    token,
    getInstanceByContextId: resolve,
    isDependencyTreeDurable: durable,
  } as unknown as InstanceWrapper<ExceptionFilter>;
  return { wrapper, resolve, durable };
}

function makeSubject(config: ApplicationConfig = new ApplicationConfig()) {
  // Object filter instances are used, so class-provider resolution and actual
  // HTTP I/O are not reached; these collaborators retain only used contracts.
  const container = { getModules: vi.fn(() => new Map()) } as unknown as NestContainer;
  const httpServer = {
    isHeadersSent: vi.fn(() => false),
    reply: vi.fn(),
    end: vi.fn(),
  } as unknown as HttpServer;
  return new RouterExceptionFilters(container, config, httpServer);
}

function controllerAndCallback() {
  class TestController {}
  const instance = new TestController();
  const callback: RouterProxyCallback = () => {};
  return { instance, callback, controllerType: TestController };
}

describe('RouterExceptionFilters — CFT n5/02', () => {
  beforeEach(() => {
    // Avoid emitting real warnings while observing the target warning path.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create()', () => {
    it('T01: returns an unconfigured handler for an empty context (default STATIC_CONTEXT)', () => {
      const subject = makeSubject();
      const { instance, callback } = controllerAndCallback();
      const setFilters = vi.spyOn(ExceptionsHandler.prototype, 'setCustomFilters');

      const handler = subject.create(instance, callback, undefined);

      expect(handler).toBeInstanceOf(ExceptionsHandler);
      expect(setFilters).not.toHaveBeenCalled();
      expect(handler.invokeCustomFilters(new Error('unmatched'), {} as ArgumentsHost)).toBe(false);
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T02: reverses combined global, class and method filters before installing them', () => {
      const config = new ApplicationConfig();
      const callOrder: string[] = [];
      const { filter: globalFilter } = filterFixture(() => callOrder.push('global'));
      const { filter: classFilter } = filterFixture(() => callOrder.push('class'));
      const { filter: methodFilter } = filterFixture(() => callOrder.push('method'));
      config.useGlobalFilters(globalFilter);
      const subject = makeSubject(config);
      const { instance, callback, controllerType } = controllerAndCallback();
      Reflect.defineMetadata(EXCEPTION_FILTERS_METADATA, [classFilter], controllerType);
      Reflect.defineMetadata(EXCEPTION_FILTERS_METADATA, [methodFilter], callback);
      const setFilters = vi.spyOn(ExceptionsHandler.prototype, 'setCustomFilters');

      const handler = subject.create(instance, callback, moduleKey(2), STATIC_CONTEXT);

      expect(handler).toBeInstanceOf(ExceptionsHandler);
      expect(setFilters).toHaveBeenCalledTimes(1);
      const installed = setFilters.mock.calls[0][0];
      expect(installed).toHaveLength(3);
      const error = new Error('verify filter precedence');
      const host = {} as ArgumentsHost;
      for (const filter of installed) filter.func(error, host);
      expect(callOrder).toEqual(['method', 'class', 'global']);
    });

    it('T03: forwards request context and inquirer when creating scoped custom filters', () => {
      const config = new ApplicationConfig();
      const { filter, catchFn } = filterFixture();
      const scoped = scopedWrapper('request-filter', hostOf(filter));
      config.addGlobalRequestFilter(scoped.wrapper);
      const subject = makeSubject(config);
      const { instance, callback } = controllerAndCallback();
      const id = requestContext(3);
      const requester = inquirer(3);

      const handler = subject.create(instance, callback, moduleKey(3), id, requester);
      const error = new Error('scoped filter');
      const host = {} as ArgumentsHost;

      expect(scoped.resolve).toHaveBeenCalledExactlyOnceWith(id, requester);
      expect(handler.invokeCustomFilters(error, host)).toBe(true);
      expect(catchFn).toHaveBeenCalledExactlyOnceWith(error, host);
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });
  });

  describe('getGlobalMetadata() / scoped warning', () => {
    it('T04: returns the identical global array without warning when scoped filters are empty', () => {
      const config = new ApplicationConfig();
      const { filter } = filterFixture();
      config.useGlobalFilters(filter);
      const subject = makeSubject(config);

      expect(subject.getGlobalMetadata<ExceptionFilter[]>()).toBe(config.getGlobalFilters());
      expect(subject.getGlobalMetadata<ExceptionFilter[]>(STATIC_CONTEXT)).toBe(config.getGlobalFilters());
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T05: warns once for a config with scoped filters on repeated static/no-inquirer paths', () => {
      const config = new ApplicationConfig();
      const { filter } = filterFixture();
      const scoped = scopedWrapper('scoped-warning', hostOf(filter));
      config.addGlobalRequestFilter(scoped.wrapper);
      const first = makeSubject(config);
      const second = makeSubject(config);

      expect(first.getGlobalMetadata<ExceptionFilter[]>()).toBe(config.getGlobalFilters());
      expect(first.getGlobalMetadata<ExceptionFilter[]>()).toBe(config.getGlobalFilters());
      expect(second.getGlobalMetadata<ExceptionFilter[]>()).toBe(config.getGlobalFilters());
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Global exception filters (APP_FILTER)'),
      );
      expect(scoped.resolve).not.toHaveBeenCalled();
    });

    it('T06: warns once for each different ApplicationConfig identity', () => {
      const configA = new ApplicationConfig();
      const configB = new ApplicationConfig();
      const { filter } = filterFixture();
      configA.addGlobalRequestFilter(scopedWrapper('a', hostOf(filter)).wrapper);
      configB.addGlobalRequestFilter(scopedWrapper('b', hostOf(filter)).wrapper);

      makeSubject(configA).getGlobalMetadata<ExceptionFilter[]>();
      makeSubject(configB).getGlobalMetadata<ExceptionFilter[]>();
      makeSubject(configA).getGlobalMetadata<ExceptionFilter[]>();

      expect(Logger.prototype.warn).toHaveBeenCalledTimes(2);
    });

    it('T07: a present inquirer resolves scoped filters even under STATIC_CONTEXT', () => {
      const config = new ApplicationConfig();
      const { filter: global } = filterFixture();
      const { filter: local } = filterFixture();
      config.useGlobalFilters(global);
      const scoped = scopedWrapper('static-with-inquirer', hostOf(local));
      config.addGlobalRequestFilter(scoped.wrapper);
      const requester = inquirer(7);

      const result = makeSubject(config).getGlobalMetadata<ExceptionFilter[]>(
        STATIC_CONTEXT,
        requester,
      );

      expect(result).toEqual([global, local]);
      expect(result).not.toBe(config.getGlobalFilters());
      expect(scoped.resolve).toHaveBeenCalledExactlyOnceWith(STATIC_CONTEXT, requester);
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T08: a nonstatic context with absent inquirer resolves scoped filters', () => {
      const config = new ApplicationConfig();
      const { filter } = filterFixture();
      const scoped = scopedWrapper('request-no-inquirer', hostOf(filter));
      config.addGlobalRequestFilter(scoped.wrapper);
      const id = requestContext(8);

      const result = makeSubject(config).getGlobalMetadata<ExceptionFilter[]>(id);

      expect(result).toEqual([filter]);
      expect(scoped.resolve).toHaveBeenCalledExactlyOnceWith(id, undefined);
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T09: zero scoped wrappers means zero iterations and a concatenated copy in request context', () => {
      const config = new ApplicationConfig();
      const { filter } = filterFixture();
      config.useGlobalFilters(filter);
      const id = requestContext(9);

      const result = makeSubject(config).getGlobalMetadata<ExceptionFilter[]>(id);

      expect(result).toEqual([filter]);
      expect(result).not.toBe(config.getGlobalFilters());
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T10: retains order with multiple wrappers and filters an artificial null host', () => {
      const config = new ApplicationConfig();
      const { filter: global } = filterFixture();
      const { filter: first } = filterFixture();
      const { filter: last } = filterFixture();
      config.useGlobalFilters(global);
      const a = scopedWrapper('first', hostOf(first));
      const missing = scopedWrapper('artificial-null-host', null);
      const c = scopedWrapper('last', hostOf(last));
      config.addGlobalRequestFilter(a.wrapper);
      config.addGlobalRequestFilter(missing.wrapper);
      config.addGlobalRequestFilter(c.wrapper);
      const id = requestContext(10);

      const result = makeSubject(config).getGlobalMetadata<ExceptionFilter[]>(id, inquirer(10));

      expect(result).toEqual([global, first, last]);
      expect(a.resolve).toHaveBeenCalledTimes(1);
      expect(missing.resolve).toHaveBeenCalledTimes(1);
      expect(c.resolve).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T11: forwards context parent and wrapper durability metadata to scoped resolution', () => {
      const config = new ApplicationConfig();
      const { filter } = filterFixture();
      const scoped = scopedWrapper('parent-aware-token', hostOf(filter));
      config.addGlobalRequestFilter(scoped.wrapper);
      const parentContext = requestContext(111);
      const getParent = vi.fn(() => parentContext);
      const childContext: ContextId = { id: interiorId(11), getParent };
      const requester = inquirer(11);

      const result = makeSubject(config).getGlobalMetadata<ExceptionFilter[]>(
        childContext,
        requester,
      );

      expect(result).toEqual([filter]);
      expect(scoped.durable).toHaveBeenCalledTimes(1);
      expect(getParent).toHaveBeenCalledExactlyOnceWith({
        token: 'parent-aware-token',
        isTreeDurable: false,
      });
      expect(scoped.resolve).toHaveBeenCalledExactlyOnceWith(parentContext, requester);
      expect(Logger.prototype.warn).not.toHaveBeenCalled();
    });

    it('T12: an explicitly empty inquirer ID takes the static/no-inquirer early return', () => {
      const config = new ApplicationConfig();
      const { filter } = filterFixture();
      const scoped = scopedWrapper('empty-inquirer', hostOf(filter));
      config.addGlobalRequestFilter(scoped.wrapper);

      const result = makeSubject(config).getGlobalMetadata<ExceptionFilter[]>(
        STATIC_CONTEXT,
        '',
      );

      expect(result).toBe(config.getGlobalFilters());
      expect(scoped.resolve).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    });
  });
});
