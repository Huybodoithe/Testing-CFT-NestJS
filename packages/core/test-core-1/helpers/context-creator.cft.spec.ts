import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextCreator } from '../../helpers/context-creator.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type {
  ContextId,
  HostComponentInfo,
  InstanceWrapper,
} from '../../injector/instance-wrapper.js';

interface ConcreteCall {
  metadata: unknown;
  contextId: ContextId | undefined;
  inquirerId: string | undefined;
}

/**
 * ContextCreator owns createContext, reflection and getContextId.
 * Its abstract concrete-context operation has no production implementation,
 * so this minimal subclass returns its input arrays without changing them.
 */
class ProbeContextCreator extends ContextCreator {
  readonly calls: ConcreteCall[] = [];

  public createConcreteContext<T extends unknown[], R extends unknown[]>(
    metadata: T,
    contextId?: ContextId,
    inquirerId?: string,
  ): R {
    this.calls.push({ metadata, contextId, inquirerId });
    // Concrete subclasses must tolerate absent class/method metadata.
    // This cast only bridges the abstract method's generic R return type.
    return (Array.isArray(metadata) ? [...metadata] : []) as unknown as R;
  }

  public resolveContextId(
    contextId: ContextId,
    wrapper: InstanceWrapper,
  ): ContextId {
    return this.getContextId(contextId, wrapper);
  }
}

// Repeatable LCG (Numerical Recipes constants), reset before each test.
let prngState = 1808;

function seededNumber(): number {
  prngState = (Math.imul(prngState, 1664525) + 1013904223) >>> 0;
  return 1000 + (prngState % 8000);
}

function seededLabel(prefix: string): string {
  return `${prefix}-${seededNumber()}`;
}

function makeFixture(withClass = true, withMethod = true) {
  class LocalController {}
  const instance = new LocalController();
  const callback = () => undefined;
  const metadataKey = seededLabel('cft-metadata');
  const classMetadata = [seededLabel('class'), seededLabel('class')];
  const methodMetadata = [seededLabel('method')];

  if (withClass) {
    Reflect.defineMetadata(metadataKey, classMetadata, LocalController);
  }
  if (withMethod) {
    Reflect.defineMetadata(metadataKey, methodMetadata, callback);
  }

  return {
    instance,
    callback,
    metadataKey,
    classMetadata,
    methodMetadata,
  };
}

/**
 * getGlobalMetadata is optional and has no implementation in the target.
 * Supplying an implementation here exercises createContext's real call site.
 * The cast is isolated at the generic interface of that optional hook.
 */
function installGlobalMetadata(
  creator: ProbeContextCreator,
  lookup: (contextId?: ContextId, inquirerId?: string) => unknown[] | undefined,
): void {
  creator.getGlobalMetadata = function <T extends unknown[]>(
    contextId?: ContextId,
    inquirerId?: string,
  ): T {
    return lookup(contextId, inquirerId) as unknown as T;
  };
}

/**
 * getContextId only reads these two properties of InstanceWrapper.
 * A minimal structural double avoids constructing the DI container.
 */
function makeWrapper(isDurable: boolean) {
  const token = seededLabel('provider-token');
  const isDependencyTreeDurable = vi.fn(() => isDurable);
  const wrapper = {
    token,
    isDependencyTreeDurable,
  } as unknown as InstanceWrapper;
  return { wrapper, token, isDependencyTreeDurable };
}

describe('ContextCreator CFT', () => {
  beforeEach(() => {
    prngState = 1808;
  });

  describe('createContext', () => {
    it('T1 uses STATIC_CONTEXT by default, skips the absent global hook, and preserves class-then-method order', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture();

      const result = creator.createContext<string[], string[]>(
        fixture.instance,
        fixture.callback,
        fixture.metadataKey,
      );

      expect(result).toEqual([
        ...fixture.classMetadata,
        ...fixture.methodMetadata,
      ]);
      expect(creator.calls).toHaveLength(3);
      expect(creator.calls.map(call => call.metadata)).toEqual([
        [],
        fixture.classMetadata,
        fixture.methodMetadata,
      ]);
      for (const call of creator.calls) {
        expect(call.contextId).toBe(STATIC_CONTEXT);
        expect(call.inquirerId).toBeUndefined();
      }
    });

    it('T2 calls the present global hook with explicit context and inquirer, then concatenates all three levels', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture();
      const contextId: ContextId = { id: seededNumber() };
      const inquirerId = seededLabel('inquirer');
      const globalMetadata = [seededLabel('global')];
      const lookup = vi.fn(() => globalMetadata);
      installGlobalMetadata(creator, lookup);

      const result = creator.createContext<string[], string[]>(
        fixture.instance,
        fixture.callback,
        fixture.metadataKey,
        contextId,
        inquirerId,
      );

      expect(lookup).toHaveBeenCalledOnce();
      expect(lookup).toHaveBeenCalledWith(contextId, inquirerId);
      expect(result).toEqual([
        ...globalMetadata,
        ...fixture.classMetadata,
        ...fixture.methodMetadata,
      ]);
      expect(creator.calls).toEqual([
        { metadata: globalMetadata, contextId, inquirerId },
        { metadata: fixture.classMetadata, contextId, inquirerId },
        { metadata: fixture.methodMetadata, contextId, inquirerId },
      ]);
    });

    it('T3 falls back to an empty global list when the installed hook returns undefined', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture();
      const lookup = vi.fn(() => undefined);
      installGlobalMetadata(creator, lookup);

      const result = creator.createContext<string[], string[]>(
        fixture.instance,
        fixture.callback,
        fixture.metadataKey,
      );

      expect(lookup).toHaveBeenCalledOnce();
      expect(lookup).toHaveBeenCalledWith(STATIC_CONTEXT, undefined);
      expect(creator.calls[0].metadata).toEqual([]);
      expect(result).toEqual([
        ...fixture.classMetadata,
        ...fixture.methodMetadata,
      ]);
    });

    it('T4 keeps an empty array returned by the global hook because it is truthy', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture();
      const emptyGlobalMetadata: string[] = [];
      const lookup = vi.fn(() => emptyGlobalMetadata);
      installGlobalMetadata(creator, lookup);

      const result = creator.createContext<string[], string[]>(
        fixture.instance,
        fixture.callback,
        fixture.metadataKey,
      );

      expect(lookup).toHaveBeenCalledOnce();
      expect(creator.calls[0].metadata).toBe(emptyGlobalMetadata);
      expect(result).toEqual([
        ...fixture.classMetadata,
        ...fixture.methodMetadata,
      ]);
    });

    it('T5 forwards missing class and method metadata to the concrete hook without inventing entries', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture(false, false);

      const result = creator.createContext<unknown[], unknown[]>(
        fixture.instance,
        fixture.callback,
        fixture.metadataKey,
      );

      expect(result).toEqual([]);
      expect(creator.calls.map(call => call.metadata)).toEqual([
        [],
        undefined,
        undefined,
      ]);
      expect(creator.calls).toHaveLength(3);
    });

    it('T10 propagates a synchronous global-hook error before any concrete-context call', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture();
      const error = new Error(seededLabel('global-error'));
      const lookup = vi.fn((): never => {
        throw error;
      });
      installGlobalMetadata(creator, lookup);

      expect(() =>
        creator.createContext(
          fixture.instance,
          fixture.callback,
          fixture.metadataKey,
        ),
      ).toThrow(error);
      expect(lookup).toHaveBeenCalledOnce();
      expect(creator.calls).toHaveLength(0);
    });
  });

  describe('reflection helpers', () => {
    it('T6 reads real class metadata from the constructor and method metadata from the callback', () => {
      const creator = new ProbeContextCreator();
      const fixture = makeFixture();

      expect(
        creator.reflectClassMetadata<string[]>(
          fixture.instance,
          fixture.metadataKey,
        ),
      ).toBe(fixture.classMetadata);
      expect(
        creator.reflectMethodMetadata<string[]>(
          fixture.callback,
          fixture.metadataKey,
        ),
      ).toBe(fixture.methodMetadata);
    });
  });

  describe('getContextId', () => {
    it('T7 returns the original context when getParent is absent without evaluating durability', () => {
      const creator = new ProbeContextCreator();
      const child: ContextId = { id: seededNumber() };
      const { wrapper, isDependencyTreeDurable } = makeWrapper(true);

      expect(creator.resolveContextId(child, wrapper)).toBe(child);
      expect(isDependencyTreeDurable).not.toHaveBeenCalled();
    });

    it('T8 returns the parent and forwards token plus durable=true to getParent', () => {
      const creator = new ProbeContextCreator();
      const parent: ContextId = { id: seededNumber() };
      const getParent = vi.fn((_info: HostComponentInfo) => parent);
      const child: ContextId = { id: seededNumber(), getParent };
      const { wrapper, token, isDependencyTreeDurable } = makeWrapper(true);

      expect(creator.resolveContextId(child, wrapper)).toBe(parent);
      expect(isDependencyTreeDurable).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledWith({
        token,
        isTreeDurable: true,
      });
    });

    it('T9 forwards durable=false to getParent when the dependency tree is not durable', () => {
      const creator = new ProbeContextCreator();
      const parent: ContextId = { id: seededNumber() };
      const getParent = vi.fn((_info: HostComponentInfo) => parent);
      const child: ContextId = { id: seededNumber(), getParent };
      const { wrapper, token, isDependencyTreeDurable } = makeWrapper(false);

      expect(creator.resolveContextId(child, wrapper)).toBe(parent);
      expect(isDependencyTreeDurable).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledWith({
        token,
        isTreeDurable: false,
      });
    });

    it('T11 propagates a durability-computation error before invoking getParent', () => {
      const creator = new ProbeContextCreator();
      const error = new Error(seededLabel('durability-error'));
      const getParent = vi.fn((_info: HostComponentInfo): ContextId => ({
        id: seededNumber(),
      }));
      const child: ContextId = { id: seededNumber(), getParent };
      const { wrapper, isDependencyTreeDurable } = makeWrapper(true);
      isDependencyTreeDurable.mockImplementation(() => {
        throw error;
      });

      expect(() => creator.resolveContextId(child, wrapper)).toThrow(error);
      expect(isDependencyTreeDurable).toHaveBeenCalledOnce();
      expect(getParent).not.toHaveBeenCalled();
    });

    it('T12 propagates a getParent error after computing durability', () => {
      const creator = new ProbeContextCreator();
      const error = new Error(seededLabel('parent-error'));
      const getParent = vi.fn((_info: HostComponentInfo): ContextId => {
        throw error;
      });
      const child: ContextId = { id: seededNumber(), getParent };
      const { wrapper, token, isDependencyTreeDurable } = makeWrapper(false);

      expect(() => creator.resolveContextId(child, wrapper)).toThrow(error);
      expect(isDependencyTreeDurable).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledWith({
        token,
        isTreeDurable: false,
      });
    });
  });
});
