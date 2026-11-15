import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scope, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/internal';
import { ApplicationConfig } from '../../application-config.js';
import { ExternalExceptionFilterContext } from '../../exceptions/external-exception-filter-context.js';
import { ExternalExceptionsHandler } from '../../exceptions/external-exceptions-handler.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type { NestContainer } from '../../injector/container.js';
import {
  InstanceWrapper,
  type ContextId,
} from '../../injector/instance-wrapper.js';

const RANDOM_SEED = 1808;

// A fixed-seed, bounded integer generator; salt is local to each case.
function sampledId(salt: number): number {
  const mixed = (Math.imul(RANDOM_SEED ^ salt, 1664525) + 1013904223) >>> 0;
  return 100_000 + (mixed % 800_000);
}

type ModuleEntry = {
  injectables: Map<Function, InstanceWrapper<ExceptionFilter>>;
};

function createHarness(
  config?: ApplicationConfig,
  modules = new Map<string, ModuleEntry>(),
) {
  // Minimal NestContainer contract used by BaseExceptionFilterContext.
  const getModules = vi.fn(() => modules);
  const container = { getModules } as unknown as NestContainer;
  return {
    sut: new ExternalExceptionFilterContext(container, config),
    getModules,
  };
}

function controllerFixture() {
  class ControllerFixture {
    callback(): void {}
  }
  const controller = new ControllerFixture();
  return { controller, callback: controller.callback, controllerType: ControllerFixture };
}

type ScopedHost = { instance: ExceptionFilter; isResolved: boolean } | null;

function scopedWrapper(host: ScopedHost, salt: number) {
  // An InstanceWrapper-like dependency boundary, not a mock of the SUT.
  const token = Symbol(`filter-${sampledId(salt)}`);
  const getInstanceByContextId = vi.fn(
    (_contextId: ContextId, _inquirerId?: string) => host,
  );
  const isDependencyTreeDurable = vi.fn(() => true);
  const wrapper = {
    token,
    getInstanceByContextId,
    isDependencyTreeDurable,
  } as unknown as InstanceWrapper<ExceptionFilter>;
  return { wrapper, token, getInstanceByContextId, isDependencyTreeDurable };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExternalExceptionFilterContext.create', () => {
  it('T1 returns a new handler without custom filters for empty metadata (default context)', () => {
    const { controller, callback } = controllerFixture();
    const { sut } = createHarness();
    const setFilters = vi.spyOn(ExternalExceptionsHandler.prototype, 'setCustomFilters');

    const handler = sut.create(controller, callback, `module-${sampledId(1)}`);

    expect(handler).toBeInstanceOf(ExternalExceptionsHandler);
    expect(setFilters).not.toHaveBeenCalled();
    expect(
      handler.invokeCustomFilters(new Error('unhandled'), {} as ArgumentsHost),
    ).toBeUndefined();
  });

  it('T2 installs nonempty global/class/method filters in reverse precedence order', () => {
    const config = new ApplicationConfig();
    const globalFilter = { catch: vi.fn(() => 'global') };
    const classFilter = { catch: vi.fn(() => 'class') };
    const methodFilter = { catch: vi.fn(() => 'method') };
    config.addGlobalFilter(globalFilter);

    const { controller, callback, controllerType } = controllerFixture();
    Reflect.defineMetadata(EXCEPTION_FILTERS_METADATA, [classFilter], controllerType);
    Reflect.defineMetadata(EXCEPTION_FILTERS_METADATA, [methodFilter], callback);

    const { sut } = createHarness(config);
    const setFilters = vi.spyOn(ExternalExceptionsHandler.prototype, 'setCustomFilters');
    const handler = sut.create(controller, callback, `module-${sampledId(2)}`);

    expect(handler).toBeInstanceOf(ExternalExceptionsHandler);
    expect(setFilters).toHaveBeenCalledTimes(1);
    const filters = setFilters.mock.calls[0][0];
    expect(filters).toHaveLength(3);
    const exception = new Error('expected');
    const host = {} as ArgumentsHost;
    expect(filters.map(filter => filter.func(exception, host))).toEqual([
      'method',
      'class',
      'global',
    ]);
    expect(methodFilter.catch).toHaveBeenCalledWith(exception, host);
    expect(classFilter.catch).toHaveBeenCalledWith(exception, host);
    expect(globalFilter.catch).toHaveBeenCalledWith(exception, host);
  });

  it('T3 accepts explicit context and inquirer, resolving a scoped filter via its parent context', () => {
    const config = new ApplicationConfig();
    const filter = { catch: vi.fn(() => 'scoped') };
    const scoped = scopedWrapper({ instance: filter, isResolved: true }, 3);
    config.addGlobalRequestFilter(scoped.wrapper);
    const parentContext: ContextId = { id: sampledId(4) };
    const getParent = vi.fn(() => parentContext);
    const contextId: ContextId = { id: sampledId(5), getParent };
    const inquirerId = `inquirer-${sampledId(6)}`;
    const { controller, callback } = controllerFixture();
    const { sut } = createHarness(config);

    const handler = sut.create(
      controller,
      callback,
      `module-${sampledId(7)}`,
      contextId,
      inquirerId,
    );

    expect(getParent).toHaveBeenCalledWith({
      token: scoped.token,
      isTreeDurable: true,
    });
    expect(scoped.isDependencyTreeDurable).toHaveBeenCalledTimes(1);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledWith(parentContext, inquirerId);
    expect(handler.invokeCustomFilters(new Error('scoped'), {} as ArgumentsHost)).toBe(
      'scoped',
    );
  });

  it('T10 resolves class metadata through the module injector and installs the result', () => {
    class InjectableFilter implements ExceptionFilter {
      catch(): string {
        return 'injected';
      }
    }
    const { controller, callback, controllerType } = controllerFixture();
    Reflect.defineMetadata(EXCEPTION_FILTERS_METADATA, [InjectableFilter], controllerType);
    const scoped = scopedWrapper(
      { instance: new InjectableFilter(), isResolved: true },
      10,
    );
    const moduleKey = `module-${sampledId(11)}`;
    const modules = new Map<string, ModuleEntry>([
      [
        moduleKey,
        { injectables: new Map<Function, InstanceWrapper<ExceptionFilter>>([
          [InjectableFilter, scoped.wrapper],
        ]) },
      ],
    ]);
    const { sut, getModules } = createHarness(undefined, modules);

    const handler = sut.create(controller, callback, moduleKey);

    expect(getModules).toHaveBeenCalledTimes(1);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledWith(STATIC_CONTEXT, undefined);
    expect(handler.invokeCustomFilters(new Error('injectable'), {} as ArgumentsHost)).toBe(
      'injected',
    );
  });
});

describe('ExternalExceptionFilterContext.getGlobalMetadata', () => {
  it('T4 returns an empty list without configuration, with default and explicit parameters', () => {
    const { sut } = createHarness();

    expect(sut.getGlobalMetadata<ExceptionFilter[]>()).toEqual([]);
    expect(
      sut.getGlobalMetadata<ExceptionFilter[]>(
        { id: sampledId(12) },
        `inquirer-${sampledId(13)}`,
      ),
    ).toEqual([]);
  });

  it('T5 returns the original global array for static context without inquirer', () => {
    const config = new ApplicationConfig();
    const globalFilter = { catch: vi.fn() };
    config.addGlobalFilter(globalFilter);
    const getScoped = vi.spyOn(config, 'getGlobalRequestFilters');
    const { sut } = createHarness(config);

    const result = sut.getGlobalMetadata<ExceptionFilter[]>();

    expect(result).toBe(config.getGlobalFilters());
    expect(result).toEqual([globalFilter]);
    expect(getScoped).not.toHaveBeenCalled();
  });

  it('T6 evaluates the second short-circuit condition and includes scoped filters for a static inquirer', () => {
    const config = new ApplicationConfig();
    const globalFilter = { catch: vi.fn() };
    const requestFilter = { catch: vi.fn() };
    config.addGlobalFilter(globalFilter);
    const scoped = scopedWrapper({ instance: requestFilter, isResolved: true }, 14);
    config.addGlobalRequestFilter(scoped.wrapper);
    const { sut } = createHarness(config);
    const inquirerId = `inquirer-${sampledId(15)}`;

    const result = sut.getGlobalMetadata<ExceptionFilter[]>(STATIC_CONTEXT, inquirerId);

    expect(result).toEqual([globalFilter, requestFilter]);
    expect(result).not.toBe(config.getGlobalFilters());
    expect(scoped.getInstanceByContextId).toHaveBeenCalledWith(STATIC_CONTEXT, inquirerId);
    expect(scoped.isDependencyTreeDurable).not.toHaveBeenCalled();
  });

  it('T7 handles zero scoped wrappers for a non-static context (short-circuited right operand)', () => {
    const config = new ApplicationConfig();
    const globalFilter = { catch: vi.fn() };
    config.addGlobalFilter(globalFilter);
    const getScoped = vi.spyOn(config, 'getGlobalRequestFilters');
    const { sut } = createHarness(config);

    const result = sut.getGlobalMetadata<ExceptionFilter[]>({ id: sampledId(16) });

    expect(result).toEqual([globalFilter]);
    expect(result).not.toBe(config.getGlobalFilters());
    expect(getScoped).toHaveBeenCalledTimes(1);
  });

  it('T8 traverses several wrappers and rejects a falsy host (artificial_state)', () => {
    const config = new ApplicationConfig();
    const globalFilter = { catch: vi.fn() };
    const first = { catch: vi.fn() };
    const last = { catch: vi.fn() };
    config.addGlobalFilter(globalFilter);
    const firstWrapper = scopedWrapper({ instance: first, isResolved: true }, 17);
    const absentWrapper = scopedWrapper(null, 18);
    const lastWrapper = scopedWrapper({ instance: last, isResolved: true }, 19);
    for (const entry of [firstWrapper, absentWrapper, lastWrapper]) {
      config.addGlobalRequestFilter(entry.wrapper);
    }
    const requestContext: ContextId = { id: sampledId(20) };
    const { sut } = createHarness(config);

    const result = sut.getGlobalMetadata<ExceptionFilter[]>(requestContext);

    expect(result).toEqual([globalFilter, first, last]);
    for (const entry of [firstWrapper, absentWrapper, lastWrapper]) {
      expect(entry.getInstanceByContextId).toHaveBeenCalledWith(
        requestContext,
        undefined,
      );
    }
  });

  it('T9 reads an actual request-scoped InstanceWrapper host', () => {
    class RealRequestFilter implements ExceptionFilter {
      catch(): void {}
    }
    const config = new ApplicationConfig();
    const requestContext: ContextId = { id: sampledId(21) };
    const instance = new RealRequestFilter();
    const wrapper = new InstanceWrapper<ExceptionFilter>({
      token: RealRequestFilter,
      name: RealRequestFilter.name,
      metatype: RealRequestFilter,
      scope: Scope.REQUEST,
    });
    wrapper.setInstanceByContextId(requestContext, { instance, isResolved: true });
    config.addGlobalRequestFilter(wrapper);
    const { sut } = createHarness(config);

    const result = sut.getGlobalMetadata<ExceptionFilter[]>(requestContext);

    expect(result).toEqual([instance]);
  });
});
