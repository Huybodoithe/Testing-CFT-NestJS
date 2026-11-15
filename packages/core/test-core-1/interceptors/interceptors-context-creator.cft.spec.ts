import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { INTERCEPTORS_METADATA } from '@nestjs/common/internal';
import type { NestInterceptor } from '@nestjs/common';
import { ApplicationConfig } from '../../application-config.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type { NestContainer } from '../../injector/container.js';
import type {
  ContextId,
  InstancePerContext,
  InstanceWrapper,
} from '../../injector/instance-wrapper.js';
import { InterceptorsContextCreator } from '../../interceptors/interceptors-context-creator.js';

const RANDOM_SEED = 1808;

// PRNG xorshift32: each test supplies its own salt, so the inputs are repeatable
// even when Vitest changes the order in which tests execute.
function seededNumber(salt: number): number {
  let state = (RANDOM_SEED ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return 1000 + ((state >>> 0) % 900000);
}

function moduleKey(salt: number): string {
  return `module-${seededNumber(salt)}`;
}

function requestContext(salt: number): ContextId {
  return { id: seededNumber(salt) };
}

function interceptor(salt: number): NestInterceptor {
  return { intercept: vi.fn(() => of(`result-${seededNumber(salt)}`)) };
}

type InjectableRegistry = Map<Function, InstanceWrapper<NestInterceptor>>;

function registryFor(
  token: Function,
  instanceWrapper: InstanceWrapper<NestInterceptor>,
): InjectableRegistry {
  return new Map([[token, instanceWrapper]]);
}

function setup(
  config?: ApplicationConfig,
  registries: ReadonlyMap<string, InjectableRegistry> = new Map(),
) {
  // Only the container boundary is substituted. The target and its inherited
  // ContextCreator implementation are never mocked.
  const modules = new Map(
    Array.from(registries, ([id, injectables]) => [id, { injectables }] as const),
  );
  const getModules = vi.fn(() => modules);
  const container = { getModules } as unknown as NestContainer;
  return {
    creator: new InterceptorsContextCreator(container, config),
    getModules,
  };
}

function wrapperFor(
  token: Function,
  host: InstancePerContext<NestInterceptor> | null | undefined,
  durable = false,
) {
  // A partial InstanceWrapper is sufficient because the target only consumes
  // token, isDependencyTreeDurable and getInstanceByContextId.
  // Undefined/null hosts are explicitly artificial for T13/T18.
  const getInstanceByContextId = vi.fn(
    (_contextId: ContextId, _inquirerId?: string) => host,
  );
  const isDependencyTreeDurable = vi.fn(() => durable);
  const wrapper = {
    token,
    getInstanceByContextId,
    isDependencyTreeDurable,
  } as unknown as InstanceWrapper<NestInterceptor>;
  return { wrapper, getInstanceByContextId, isDependencyTreeDurable };
}

function selectModule(
  creator: InterceptorsContextCreator,
  key: string,
): void {
  // Public create() is the only way the source sets its private moduleContext.
  class EmptyController {
    handle() {}
  }
  const controller = new EmptyController();
  expect(creator.create(controller, controller.handle, key)).toEqual([]);
}

describe('InterceptorsContextCreator CFT', () => {
  it('T01 - create() uses default static context and merges global/class/method metadata in order', () => {
    const config = new ApplicationConfig();
    const global = interceptor(101);
    const forClass = interceptor(102);
    const forMethod = interceptor(103);
    const scoped = wrapperFor(class Scoped {}, { instance: interceptor(104) });
    config.addGlobalInterceptor(global);
    config.addGlobalRequestInterceptor(scoped.wrapper);

    class TestController {
      handler() {}
    }
    const controller = new TestController();
    Reflect.defineMetadata(INTERCEPTORS_METADATA, [forClass], TestController);
    Reflect.defineMetadata(INTERCEPTORS_METADATA, [forMethod], controller.handler);

    const { creator, getModules } = setup(config);
    const actual = creator.create(controller, controller.handler, moduleKey(101));

    expect(actual).toEqual([global, forClass, forMethod]);
    expect(scoped.getInstanceByContextId).not.toHaveBeenCalled();
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T02 - create() passes explicit context/inquirer to scoped and injectable interceptors', () => {
    const config = new ApplicationConfig();
    const global = interceptor(201);
    const scopedInstance = interceptor(202);
    const injectedInstance = interceptor(203);
    const methodInstance = interceptor(204);
    const moduleId = moduleKey(201);
    const parent = requestContext(203);
    const getParent = vi.fn(() => parent);
    const context: ContextId = { id: seededNumber(202), getParent };
    const inquirerId = `inquirer-${seededNumber(204)}`;

    class InjectableInterceptor {
      intercept() {
        return of('never-invoked');
      }
    }
    const injected = wrapperFor(
      InjectableInterceptor,
      { instance: injectedInstance },
      true,
    );
    const scoped = wrapperFor(class Scoped {}, { instance: scopedInstance });
    config.addGlobalInterceptor(global);
    config.addGlobalRequestInterceptor(scoped.wrapper);

    class ControllerWithMetadata {
      handler() {}
    }
    const controller = new ControllerWithMetadata();
    Reflect.defineMetadata(
      INTERCEPTORS_METADATA,
      [InjectableInterceptor],
      ControllerWithMetadata,
    );
    Reflect.defineMetadata(
      INTERCEPTORS_METADATA,
      [methodInstance],
      controller.handler,
    );

    const registries = new Map<string, InjectableRegistry>([
      [moduleId, registryFor(InjectableInterceptor, injected.wrapper)],
    ]);
    const { creator, getModules } = setup(config, registries);

    expect(
      creator.create(controller, controller.handler, moduleId, context, inquirerId),
    ).toEqual([global, scopedInstance, injectedInstance, methodInstance]);
    expect(getModules).toHaveBeenCalledOnce();
    expect(scoped.getInstanceByContextId).toHaveBeenCalledTimes(1);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledWith(parent, inquirerId);
    expect(injected.getInstanceByContextId).toHaveBeenCalledTimes(1);
    expect(injected.getInstanceByContextId).toHaveBeenCalledWith(parent, inquirerId);
    expect(getParent).toHaveBeenCalledTimes(2);
    expect(getParent).toHaveBeenCalledWith({
      token: scoped.wrapper.token,
      isTreeDurable: false,
    });
    expect(getParent).toHaveBeenCalledWith({
      token: InjectableInterceptor,
      isTreeDurable: true,
    });
    expect(scoped.isDependencyTreeDurable).toHaveBeenCalledOnce();
    expect(injected.isDependencyTreeDurable).toHaveBeenCalledOnce();
  });

  it('T03 - create() with no config or metadata returns empty context', () => {
    class ControllerWithoutMetadata {
      handle() {}
    }
    const controller = new ControllerWithoutMetadata();
    const { creator, getModules } = setup();
    expect(creator.create(controller, controller.handle, moduleKey(301))).toEqual(
      [],
    );
    expect(creator.getGlobalMetadata()).toEqual([]);
    expect(creator.getGlobalMetadata(requestContext(302), 'requester')).toEqual([]);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T04 - createConcreteContext() exits early for empty, null and undefined metadata', () => {
    const { creator, getModules } = setup();
    expect(creator.createConcreteContext([])).toEqual([]);
    // Missing Reflect metadata is nullish at runtime even though the signature
    // declares an array; the same early return is exercised for both values.
    expect(
      creator.createConcreteContext(
        null as unknown as NestInterceptor[],
      ),
    ).toEqual([]);
    expect(
      creator.createConcreteContext(
        undefined as unknown as NestInterceptor[],
      ),
    ).toEqual([]);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T05 - createConcreteContext() filters falsy/non-callable inputs using short-circuit rules', () => {
    const directlyUsable = interceptor(501);
    const { creator, getModules } = setup();
    const metadata = [
      null,
      undefined,
      false,
      0,
      {},
      { intercept: seededNumber(502) },
      directlyUsable,
    ];
    expect(creator.createConcreteContext(metadata)).toEqual([directlyUsable]);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T06 - a callable metatype passes the first filter but is discarded if resolution fails', () => {
    class NotRegistered {}
    const { creator, getModules } = setup();
    expect(creator.createConcreteContext([NotRegistered])).toEqual([]);
    // moduleContext was never set: an accepted function resolves to null.
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T07 - getInterceptorInstance() returns an existing interceptor directly', () => {
    const object = interceptor(701);
    const { creator, getModules } = setup();
    expect(creator.getInterceptorInstance(object)).toBe(object);
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T08 - getInstanceByMetatype() stops before querying modules when moduleContext is missing', () => {
    class MissingContext {}
    const { creator, getModules } = setup();
    expect(creator.getInstanceByMetatype(MissingContext)).toBeUndefined();
    expect(creator.getInterceptorInstance(MissingContext)).toBeNull();
    expect(getModules).not.toHaveBeenCalled();
  });

  it('T09 - missing moduleRef ends metatype lookup without reading injectables', () => {
    class MissingModuleInterceptor {}
    const { creator, getModules } = setup();
    selectModule(creator, moduleKey(901));
    expect(creator.getInstanceByMetatype(MissingModuleInterceptor)).toBeUndefined();
    expect(creator.getInterceptorInstance(MissingModuleInterceptor)).toBeNull();
    expect(getModules).toHaveBeenCalledTimes(2);
  });

  it('T10 - present module but absent injectable wrapper returns no interceptor', () => {
    class NotInRegistry {}
    const moduleId = moduleKey(1001);
    const { creator, getModules } = setup(
      undefined,
      new Map([[moduleId, new Map<Function, InstanceWrapper<NestInterceptor>>()]]),
    );
    selectModule(creator, moduleId);
    expect(creator.getInstanceByMetatype(NotInRegistry)).toBeUndefined();
    expect(creator.getInterceptorInstance(NotInRegistry)).toBeNull();
    expect(getModules).toHaveBeenCalledTimes(2);
  });

  it('T11 - registered injectable returns instance via default STATIC_CONTEXT', () => {
    class RegisteredInterceptor {
      intercept() {
        return of('registered');
      }
    }
    const instance = new RegisteredInterceptor();
    const mockWrapper = wrapperFor(RegisteredInterceptor, { instance });
    const moduleId = moduleKey(1101);
    const { creator } = setup(
      undefined,
      new Map([
        [moduleId, registryFor(RegisteredInterceptor, mockWrapper.wrapper)],
      ]),
    );
    selectModule(creator, moduleId);

    expect(creator.getInstanceByMetatype(RegisteredInterceptor)).toBe(
      mockWrapper.wrapper,
    );
    expect(creator.getInterceptorInstance(RegisteredInterceptor)).toBe(instance);
    expect(mockWrapper.getInstanceByContextId).toHaveBeenCalledTimes(1);
    expect(mockWrapper.getInstanceByContextId).toHaveBeenCalledWith(
      STATIC_CONTEXT,
      undefined,
    );
  });

  it('T12 - an existing host with null instance is discarded after mapping', () => {
    class UnresolvedInterceptor {}
    const moduleId = moduleKey(1201);
    // A null instance is the real fallback of InstanceWrapper for an
    // uninitialized static-context provider.
    const unresolved = wrapperFor(UnresolvedInterceptor, {
      instance: null as unknown as NestInterceptor,
    });
    const { creator } = setup(
      undefined,
      new Map([
        [moduleId, registryFor(UnresolvedInterceptor, unresolved.wrapper)],
      ]),
    );
    selectModule(creator, moduleId);

    expect(creator.getInterceptorInstance(UnresolvedInterceptor)).toBeNull();
    expect(creator.createConcreteContext([UnresolvedInterceptor])).toEqual([]);
    expect(unresolved.getInstanceByContextId).toHaveBeenCalledTimes(2);
  });

  it('T13 - absent instance host returns undefined (artificial_state)', () => {
    class HostlessInterceptor {}
    const moduleId = moduleKey(1301);
    const hostless = wrapperFor(HostlessInterceptor, undefined);
    const { creator } = setup(
      undefined,
      new Map([
        [moduleId, registryFor(HostlessInterceptor, hostless.wrapper)],
      ]),
    );
    selectModule(creator, moduleId);

    expect(creator.getInterceptorInstance(HostlessInterceptor)).toBeUndefined();
    expect(creator.createConcreteContext([HostlessInterceptor])).toEqual([]);
    expect(hostless.getInstanceByContextId).toHaveBeenCalledTimes(2);
  });

  it('T14 - resolved host with non-function intercept fails the final filter (artificial_state)', () => {
    class WrongShapeInterceptor {}
    const moduleId = moduleKey(1401);
    const malformed = {
      intercept: seededNumber(1402),
    } as unknown as NestInterceptor;
    const wrapped = wrapperFor(WrongShapeInterceptor, { instance: malformed });
    const { creator } = setup(
      undefined,
      new Map([
        [moduleId, registryFor(WrongShapeInterceptor, wrapped.wrapper)],
      ]),
    );
    selectModule(creator, moduleId);

    expect(creator.createConcreteContext([WrongShapeInterceptor])).toEqual([]);
    expect(wrapped.getInstanceByContextId).toHaveBeenCalledTimes(1);
    expect(wrapped.getInstanceByContextId).toHaveBeenCalledWith(
      STATIC_CONTEXT,
      undefined,
    );
  });

  it('T15 - getGlobalMetadata() in static context without inquirer returns only the global array', () => {
    const config = new ApplicationConfig();
    const global = interceptor(1501);
    const scoped = wrapperFor(class Scoped {}, { instance: interceptor(1502) });
    config.addGlobalInterceptor(global);
    config.addGlobalRequestInterceptor(scoped.wrapper);
    const { creator } = setup(config);

    const result = creator.getGlobalMetadata();
    expect(result).toBe(config.getGlobalInterceptors());
    expect(result).toEqual([global]);
    expect(scoped.getInstanceByContextId).not.toHaveBeenCalled();
  });

  it('T16 - a static context with an inquirer includes scoped wrappers', () => {
    const config = new ApplicationConfig();
    const global = interceptor(1601);
    const scopedInstance = interceptor(1602);
    const scoped = wrapperFor(class Scoped {}, { instance: scopedInstance });
    config.addGlobalInterceptor(global);
    config.addGlobalRequestInterceptor(scoped.wrapper);
    const { creator } = setup(config);
    const inquirer = `inquiring-${seededNumber(1603)}`;

    expect(creator.getGlobalMetadata(STATIC_CONTEXT, inquirer)).toEqual([
      global,
      scopedInstance,
    ]);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledTimes(1);
    expect(scoped.getInstanceByContextId).toHaveBeenCalledWith(
      STATIC_CONTEXT,
      inquirer,
    );
  });

  it('T17 - non-static context with no inquirer enters scoped path even when it has zero wrappers', () => {
    const config = new ApplicationConfig();
    const global = interceptor(1701);
    config.addGlobalInterceptor(global);
    const { creator } = setup(config);

    const result = creator.getGlobalMetadata(requestContext(1702));
    expect(result).toEqual([global]);
    expect(result).not.toBe(config.getGlobalInterceptors());
  });

  it('T18 - scoped iteration keeps present hosts and skips a missing host (artificial_state)', () => {
    const config = new ApplicationConfig();
    const global = interceptor(1801);
    const first = interceptor(1802);
    const last = interceptor(1803);
    const firstWrapper = wrapperFor(class First {}, { instance: first });
    const missingWrapper = wrapperFor(class Missing {}, undefined);
    const lastWrapper = wrapperFor(class Last {}, { instance: last });
    config.addGlobalInterceptor(global);
    config.addGlobalRequestInterceptor(firstWrapper.wrapper);
    config.addGlobalRequestInterceptor(missingWrapper.wrapper);
    config.addGlobalRequestInterceptor(lastWrapper.wrapper);
    const { creator } = setup(config);
    const context = requestContext(1804);

    expect(creator.getGlobalMetadata(context)).toEqual([global, first, last]);
    for (const candidate of [firstWrapper, missingWrapper, lastWrapper]) {
      expect(candidate.getInstanceByContextId).toHaveBeenCalledTimes(1);
      expect(candidate.getInstanceByContextId).toHaveBeenCalledWith(
        context,
        undefined,
      );
    }
  });
});
