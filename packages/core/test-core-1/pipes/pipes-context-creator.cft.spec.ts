import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PIPES_METADATA } from '@nestjs/common/internal';
import type { PipeTransform } from '@nestjs/common';
import { ApplicationConfig } from '../../application-config.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type { NestContainer } from '../../injector/container.js';
import type {
  ContextId,
  InstanceWrapper,
} from '../../injector/instance-wrapper.js';
import { PipesContextCreator } from '../../pipes/pipes-context-creator.js';

// Deterministic, order-independent LCG samples: seed = 1808.
// Salt is fixed per input; no dependence on Math.random(), clocks, or test order.
const seededInt = (salt: number): number => {
  const state = (Math.imul(1808 ^ salt, 1664525) + 1013904223) >>> 0;
  return 100 + (state % 9000);
};

const moduleKey = `module-${seededInt(1)}`;
const inquirerId = `inquirer-${seededInt(2)}`;

function makePipe(): PipeTransform {
  return { transform: vi.fn((value: unknown) => value) };
}

/**
 * Only the DI wrapper boundary is replaced. In real NestJS, a wrapper normally
 * returns an instance host; nullish hosts in specific tests are artificial states.
 */
function makeWrapper(
  host: { instance: PipeTransform | null } | null | undefined,
  token: string | Function = `token-${seededInt(3)}`,
  durable = false,
) {
  const getInstanceByContextId = vi.fn(() => host);
  const isDependencyTreeDurable = vi.fn(() => durable);
  const wrapper = {
    token,
    getInstanceByContextId,
    isDependencyTreeDurable,
  } as unknown as InstanceWrapper<PipeTransform>;
  return { wrapper, getInstanceByContextId, isDependencyTreeDurable };
}

/**
 * The source accesses only container.getModules() and module.injectables.get().
 * Narrow structural stand-ins avoid instantiating the entire DI container.
 */
function makeHarness(config?: ApplicationConfig) {
  const modules = new Map<
    string,
    { injectables: Map<Function, InstanceWrapper> }
  >();
  const getModules = vi.fn(
    () => modules as unknown as ReturnType<NestContainer['getModules']>,
  );
  const container = { getModules } as unknown as NestContainer;
  const creator = new PipesContextCreator(container, config);

  const registerModule = (key = moduleKey) => {
    const injectables = new Map<Function, InstanceWrapper>();
    modules.set(key, { injectables });
    return injectables;
  };

  return { creator, modules, getModules, registerModule };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PipesContextCreator - control-flow tests', () => {
  it('T01 create uses default static context and merges global, class, method pipes in order', () => {
    class ClassPipe {
      transform(value: unknown) {
        return value;
      }
    }
    class Controller {
      handle() {}
    }

    const config = new ApplicationConfig();
    const globalPipe = makePipe();
    const classPipe = new ClassPipe();
    const methodPipe = makePipe();
    config.addGlobalPipe(globalPipe);

    const controller = new Controller();
    Reflect.defineMetadata(PIPES_METADATA, [ClassPipe], Controller);
    Reflect.defineMetadata(PIPES_METADATA, [methodPipe], controller.handle);

    const { creator, registerModule } = makeHarness(config);
    const injectables = registerModule();
    const registered = makeWrapper({ instance: classPipe });
    injectables.set(ClassPipe, registered.wrapper);

    const result = creator.create(controller, controller.handle, moduleKey);

    expect(result).toEqual([globalPipe, classPipe, methodPipe]);
    expect(registered.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      STATIC_CONTEXT,
      undefined,
    );
  });

  it('T02 create forwards explicit request context and inquirer through parent resolution', () => {
    class RequestPipe {
      transform(value: unknown) {
        return value;
      }
    }
    class Controller {
      handle() {}
    }

    const parentContext: ContextId = { id: seededInt(4) };
    const getParent = vi.fn(() => parentContext);
    const requestContext: ContextId = { id: seededInt(5), getParent };
    const config = new ApplicationConfig();
    const globalPipe = makePipe();
    const scopedPipe = makePipe();
    const classPipe = new RequestPipe();
    config.addGlobalPipe(globalPipe);

    const scoped = makeWrapper({ instance: scopedPipe }, 'scoped-token', true);
    const registered = makeWrapper({ instance: classPipe }, RequestPipe, false);
    config.addGlobalRequestPipe(scoped.wrapper);

    const controller = new Controller();
    Reflect.defineMetadata(PIPES_METADATA, [RequestPipe], Controller);

    const { creator, registerModule } = makeHarness(config);
    registerModule().set(RequestPipe, registered.wrapper);

    const result = creator.create(
      controller,
      controller.handle,
      moduleKey,
      requestContext,
      inquirerId,
    );

    expect(result).toEqual([globalPipe, scopedPipe, classPipe]);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      parentContext,
      inquirerId,
    );
    expect(registered.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      parentContext,
      inquirerId,
    );
    expect(getParent).toHaveBeenNthCalledWith(1, {
      token: 'scoped-token',
      isTreeDurable: true,
    });
    expect(getParent).toHaveBeenNthCalledWith(2, {
      token: RequestPipe,
      isTreeDurable: false,
    });
  });

  it('T03 create without config or metadata yields no pipes', () => {
    class Controller {
      handle() {}
    }
    const controller = new Controller();
    const { creator, getModules } = makeHarness();

    expect(creator.create(controller, controller.handle, moduleKey)).toEqual([]);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T04 createConcreteContext returns immediately for an empty metadata array', () => {
    const { creator, getModules } = makeHarness();

    expect(creator.createConcreteContext([])).toEqual([]);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T05 createConcreteContext treats null and undefined metadata as empty', () => {
    const { creator, getModules } = makeHarness();

    // isEmpty explicitly accepts nullish runtime values despite its array type.
    expect(
      creator.createConcreteContext(null as unknown as unknown[]),
    ).toEqual([]);
    expect(
      creator.createConcreteContext(undefined as unknown as unknown[]),
    ).toEqual([]);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T06 createConcreteContext filters invalid entries and missing classes while keeping valid pipes', () => {
    class RegisteredPipe {
      transform(value: unknown) {
        return value;
      }
    }
    class UnregisteredPipe {
      transform(value: unknown) {
        return value;
      }
    }

    const direct = makePipe();
    const instance = new RegisteredPipe();
    const { creator, registerModule } = makeHarness();
    const registered = makeWrapper({ instance });
    registerModule().set(RegisteredPipe, registered.wrapper);
    creator.setModuleContext(moduleKey);

    const result = creator.createConcreteContext([
      null,
      undefined,
      false,
      0,
      { ignored: true },
      { transform: 'not-callable' },
      direct,
      RegisteredPipe,
      UnregisteredPipe,
    ]);

    expect(result).toEqual([direct, instance]);
    expect(registered.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      STATIC_CONTEXT,
      undefined,
    );
  });

  it('T07 getPipeInstance returns an existing pipe object without container lookup', () => {
    const direct = makePipe();
    const { creator, getModules } = makeHarness();

    expect(creator.getPipeInstance(direct)).toBe(direct);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T08 getPipeInstance only checks truthiness of transform on the direct-object branch', () => {
    const unusual = { transform: 'not-a-function' };
    const { creator, getModules } = makeHarness();

    expect(
      creator.getPipeInstance(unusual as unknown as PipeTransform),
    ).toBe(unusual);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T09 getPipeInstance returns null when module context has not been set', () => {
    class MissingPipe {}
    const { creator, getModules } = makeHarness();

    expect(creator.getPipeInstance(MissingPipe)).toBeNull();
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T10 getPipeInstance returns null when the selected module is missing', () => {
    class MissingModulePipe {}
    const { creator, getModules } = makeHarness();
    creator.setModuleContext(moduleKey);

    expect(creator.getPipeInstance(MissingModulePipe)).toBeNull();
    expect(getModules).toHaveBeenCalledTimes(1);
  });

  it('T11 getPipeInstance returns null when a module has no matching injectable', () => {
    class AbsentPipe {}
    const { creator, registerModule } = makeHarness();
    registerModule();
    creator.setModuleContext(moduleKey);

    expect(creator.getPipeInstance(AbsentPipe)).toBeNull();
  });

  it('T12 getPipeInstance resolves a registered class for an explicit context and inquirer', () => {
    class RegisteredPipe {}
    const pipe = makePipe();
    const contextId: ContextId = { id: seededInt(6) };
    const { creator, registerModule } = makeHarness();
    const registered = makeWrapper({ instance: pipe });
    registerModule().set(RegisteredPipe, registered.wrapper);
    creator.setModuleContext(moduleKey);

    expect(creator.getPipeInstance(RegisteredPipe, contextId, inquirerId)).toBe(
      pipe,
    );
    expect(registered.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      contextId,
      inquirerId,
    );
  });

  it('T13 excludes null and undefined hosts returned by artificial DI wrapper states', () => {
    class NullHostPipe {}
    class UndefinedHostPipe {}
    const { creator, registerModule } = makeHarness();
    const injectables = registerModule();
    const nullHost = makeWrapper(null);
    const undefinedHost = makeWrapper(undefined);
    injectables.set(NullHostPipe, nullHost.wrapper);
    injectables.set(UndefinedHostPipe, undefinedHost.wrapper);
    creator.setModuleContext(moduleKey);

    expect(creator.getPipeInstance(NullHostPipe)).toBeNull();
    expect(creator.getPipeInstance(UndefinedHostPipe)).toBeUndefined();
    expect(
      creator.createConcreteContext([NullHostPipe, UndefinedHostPipe]),
    ).toEqual([]);
    expect(nullHost.getInstanceByContextId).toHaveBeenCalledTimes(2);
    expect(undefinedHost.getInstanceByContextId).toHaveBeenCalledTimes(2);
  });

  it('T14 excludes resolved objects with missing or non-callable transform', () => {
    class NoTransformPipe {}
    class BadTransformPipe {}
    const missingTransform = { transform: undefined } as unknown as PipeTransform;
    const badTransform = { transform: 'non-callable' } as unknown as PipeTransform;
    const { creator, registerModule } = makeHarness();
    const injectables = registerModule();
    const missing = makeWrapper({ instance: missingTransform });
    const bad = makeWrapper({ instance: badTransform });
    injectables.set(NoTransformPipe, missing.wrapper);
    injectables.set(BadTransformPipe, bad.wrapper);
    creator.setModuleContext(moduleKey);

    expect(
      creator.createConcreteContext([NoTransformPipe, BadTransformPipe]),
    ).toEqual([]);
    expect(missing.getInstanceByContextId).toHaveBeenCalledTimes(1);
    expect(bad.getInstanceByContextId).toHaveBeenCalledTimes(1);
  });

  it('T15 getPipeInstance returns null when an existing host has a null instance', () => {
    class UnresolvedPipe {}
    const { creator, registerModule } = makeHarness();
    const unresolved = makeWrapper({ instance: null });
    registerModule().set(UnresolvedPipe, unresolved.wrapper);
    creator.setModuleContext(moduleKey);

    expect(creator.getPipeInstance(UnresolvedPipe)).toBeNull();
    expect(unresolved.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      STATIC_CONTEXT,
      undefined,
    );
  });

  it('T16 getInstanceByMetatype changes from missing context to registered module after setModuleContext', () => {
    class IndexedPipe {}
    const { creator, getModules, registerModule } = makeHarness();
    const wrapper = makeWrapper({ instance: makePipe() }).wrapper;

    expect(creator.getInstanceByMetatype(IndexedPipe)).toBeUndefined();
    expect(getModules).not.toHaveBeenCalled();

    registerModule().set(IndexedPipe, wrapper);
    creator.setModuleContext(moduleKey);

    expect(creator.getInstanceByMetatype(IndexedPipe)).toBe(wrapper);
    expect(getModules).toHaveBeenCalledTimes(1);
  });

  it('T17 getGlobalMetadata returns empty metadata when config is absent', () => {
    const { creator } = makeHarness();
    const requestContext: ContextId = { id: seededInt(7) };

    expect(creator.getGlobalMetadata()).toEqual([]);
    expect(creator.getGlobalMetadata(requestContext, inquirerId)).toEqual([]);
  });

  it('T18 static getGlobalMetadata with no inquirer returns only global pipes', () => {
    const config = new ApplicationConfig();
    const globalPipe = makePipe();
    config.addGlobalPipe(globalPipe);
    config.addGlobalRequestPipe(makeWrapper({ instance: makePipe() }).wrapper);
    const scopedLookup = vi.spyOn(config, 'getGlobalRequestPipes');
    const { creator } = makeHarness(config);

    expect(creator.getGlobalMetadata()).toEqual([globalPipe]);
    expect(creator.getGlobalMetadata(STATIC_CONTEXT)).toEqual([globalPipe]);
    expect(scopedLookup).not.toHaveBeenCalled();
  });

  it('T19 dynamic getGlobalMetadata handles multiple scoped hosts and filters an artificial null host', () => {
    const config = new ApplicationConfig();
    const globalPipe = makePipe();
    const scopedOne = makePipe();
    const scopedTwo = makePipe();
    const context: ContextId = { id: seededInt(8) };
    config.addGlobalPipe(globalPipe);

    const first = makeWrapper({ instance: scopedOne });
    const invalid = makeWrapper(null);
    const third = makeWrapper({ instance: scopedTwo });
    config.addGlobalRequestPipe(first.wrapper);
    config.addGlobalRequestPipe(invalid.wrapper);
    config.addGlobalRequestPipe(third.wrapper);
    const { creator } = makeHarness(config);

    expect(creator.getGlobalMetadata(context)).toEqual([
      globalPipe,
      scopedOne,
      scopedTwo,
    ]);
    for (const fixture of [first, invalid, third]) {
      expect(fixture.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
        context,
        undefined,
      );
    }
  });

  it('T20 static context with an inquirer also resolves request-scoped global pipes', () => {
    const config = new ApplicationConfig();
    const scopedPipe = makePipe();
    const scoped = makeWrapper({ instance: scopedPipe });
    config.addGlobalRequestPipe(scoped.wrapper);
    const { creator } = makeHarness(config);

    // undefined triggers the default STATIC_CONTEXT parameter.
    expect(creator.getGlobalMetadata(undefined, inquirerId)).toEqual([
      scopedPipe,
    ]);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledExactlyOnceWith(
      STATIC_CONTEXT,
      inquirerId,
    );
  });

  it('T21 dynamic context with zero request-scoped wrappers retains only global pipes', () => {
    const config = new ApplicationConfig();
    const pipe = makePipe();
    config.addGlobalPipe(pipe);
    const { creator } = makeHarness(config);

    expect(
      creator.getGlobalMetadata({ id: seededInt(9) }),
    ).toEqual([pipe]);
  });

  it('T22 propagates a synchronous wrapper lookup error instead of masking it', () => {
    class ThrowingPipe {}
    const { creator, registerModule } = makeHarness();
    const failure = new Error(`lookup-${seededInt(10)}`);
    const wrapper = makeWrapper({ instance: makePipe() });
    wrapper.getInstanceByContextId.mockImplementation(() => {
      throw failure;
    });
    registerModule().set(ThrowingPipe, wrapper.wrapper);
    creator.setModuleContext(moduleKey);

    expect(() => creator.getPipeInstance(ThrowingPipe)).toThrow(failure);
  });
});
