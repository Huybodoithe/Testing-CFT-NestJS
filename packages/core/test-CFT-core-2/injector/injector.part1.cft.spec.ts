/**
 * CFT - injector/injector.ts (phan 1/4): constructor, loadPrototype, loadInstance, loadMiddleware,
 * loadController, loadInjectable, loadProvider, applySettlementSignal.
 * Luu tai: packages/core/test-CFT-core-2/injector/injector.part1.cft.spec.ts
 *
 * Dung doi tuong gia (makeWrapper/makeHost) cho InstanceWrapper va spy cac ham cua chinh Injector
 * de cach ly tung ham. Lop that: Injector, SettlementSignal, cac Exception.
 * Nhan trong test: // covers P<n>, B<m>/C<k>=true|false (ID cuc bo theo tung ham).
 *
 * constructor      C1 options nullish        T:T1      F:T2,T3
 *                  C2 options.instanceDecorator truthy  T:T3  F:T1,T2
 * loadPrototype    B1 !collection            T:T4      F:T5,T6
 *                  B2 instance truthy        T:T6      F:T5
 *                  C3 contextId mac dinh     T:T4,T6   F:T5
 * loadInstance     B1 instanceHost.isPending T:T7-T12  F:T13-T18
 *                  C1 inquirer truthy        T:T8-T10  F:T7
 *                  C2 settlementSignal nullish (chi khi C1=T)  T:T9  F:T8,T10
 *                  C3 isCycle() (chi khi C2=F)   T:T8  F:T10
 *                  C4 err truthy             T:T11     F:T7
 *                  C5 failedInstances.has(host)  T:T12  F:T7
 *                  C6 wrapper.token falsy    T:T13     F:T14
 *                  B2 targetWrapper undefined  T:T13   F:T14-T18
 *                  B3 instanceHost.isResolved  T:T14   F:T15-T18
 *                  C7 callback depth mac dinh  T:T17   F:T15
 *                  C8 wrapper.isTransient    T:T17     F:T15
 *                  C9 getPropertiesMetadata() nullish  T:T15  F:T17
 *                  B4 !isResolved sau resolveConstructorParams  T:T16  F:T15,T17
 *                  B5 catch                  T:T18     F:T15
 *                  C10 resolutionContext mac dinh  T:T7,T13-T18  F:T8-T12
 * loadMiddleware   B1 instance cua target khac undefined  T:T19  F:T20,T21
 *                  C2 inquirer truthy        T:T21     F:T20
 *                  C3 contextId mac dinh     T:T20     F:T21
 * loadController   B1 isDependencyTreeStatic T:T22,T23  F:T24
 *                  C2 getEnhancersMetadata() falsy  T:T23  F:T22
 * loadInjectable   C1 contextId mac dinh T:T25 F:T26
 * loadProvider     B1 shouldSkipProviderLoading T:T27,T28  F:T29-T33
 *                  B2 !inquirer (khi skip)   T:T27     F:T28
 *                  C3 contextId === STATIC   T:T29-T32  F:T33
 *                  C4 !inquirer              T:T29-T31,T33  F:T32
 *                  C5 isDependencyTreeStatic T:T29,T30,T32,T33  F:T31
 *                  C6 getEnhancersMetadata() falsy  T:T30  F:T29
 *                  C7 resolutionContext mac dinh  T:T27,T29-T31  F:T28,T32,T33
 * Unreachable: khong co.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STATIC_CONTEXT } from '../../injector/constants';
import { Injector } from '../../injector/injector';

vi.mock('../../injector/helpers/is-debug-mode.util', () => ({
  isDebugMode: vi.fn(() => false),
}));

// Input ngau nhien co seed co dinh (seed = 20261114), reset truoc moi test
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};
let counter = 0;
const nextId = (): string => `id-${rand(100, 900)}-${counter++}`;
const newCtx = (): any => ({ id: rand(100, 900) });

const makeHost = (o: Record<string, unknown> = {}): any => ({
  isResolved: false,
  isPending: false,
  instance: undefined,
  donePromise: undefined,
  settlementSignal: undefined,
  ...o,
});

const makeWrapper = (o: Record<string, unknown> = {}): any => {
  const slots = new Map<unknown, Map<string, any>>();
  const slot = (ctx: unknown) => {
    if (!slots.has(ctx)) slots.set(ctx, new Map());
    return slots.get(ctx)!;
  };
  return {
    id: nextId(),
    name: `Provider${rand(100, 900)}`,
    token: `token-${nextId()}`,
    metatype: class Dummy {},
    inject: undefined,
    scope: undefined,
    isTransient: false,
    isAlias: false,
    forwardRef: false,
    async: false,
    host: undefined,
    instance: undefined,
    hierarchyLevel: 0,
    initTime: 0,
    settlementSignal: undefined,
    getInstanceByContextId: vi.fn((ctx: unknown, inq?: string) => {
      const m = slot(ctx);
      const k = inq ?? '';
      if (!m.has(k)) m.set(k, makeHost());
      return m.get(k);
    }),
    setInstanceByContextId: vi.fn((ctx: unknown, value: any, inq?: string) => {
      slot(ctx).set(inq ?? '', value);
    }),
    removeInstanceByContextId: vi.fn((ctx: unknown, inq?: string) => {
      slot(ctx).delete(inq ?? '');
    }),
    getExistingInstancesByContextId: vi.fn((ctx: unknown) =>
      Array.from(slot(ctx).values()),
    ),
    getCtorMetadata: vi.fn(),
    getPropertiesMetadata: vi.fn(),
    getEnhancersMetadata: vi.fn(),
    addCtorMetadata: vi.fn(),
    addPropertiesMetadata: vi.fn(),
    getDependents: vi.fn(() => []),
    isDependencyTreeStatic: vi.fn(() => true),
    isDependencyTreeDurable: vi.fn(() => false),
    isStatic: vi.fn(() => false),
    isInRequestScope: vi.fn(() => false),
    isLazyTransient: vi.fn(() => false),
    isExplicitlyRequested: vi.fn(() => false),
    createPrototype: vi.fn(),
    ...o,
  };
};

describe('Injector (CFT) - phan 1', () => {
  let injector: any;

  beforeEach(() => {
    seed = 20261114;
    counter = 0;
    injector = new Injector();
    injector.logger = { log: vi.fn(), warn: vi.fn() };
  });

  describe('constructor', () => {
    it('T1: khong truyen options', () => {
      // covers P1, C1=true, C2=false
      expect(new Injector()).toBeDefined();
    });

    it('T2: options khong co instanceDecorator', () => {
      // covers P2, C1=false, C2=false
      expect(new Injector({ preview: false })).toBeDefined();
    });

    it('T3: options co instanceDecorator', () => {
      // covers P3, C1=false, C2=true
      const decorator = vi.fn((target: unknown) => target);
      expect(
        new Injector({ preview: false, instanceDecorator: decorator }),
      ).toBeDefined();
    });
  });

  describe('loadPrototype', () => {
    it('T4: collection undefined, contextId mac dinh', () => {
      // covers P1, B1=true, C3=true
      expect(() =>
        injector.loadPrototype({ token: nextId() }, undefined),
      ).not.toThrow();
    });

    it('T5: createPrototype khong tra ve instance', () => {
      // covers P2, B1=false, B2=false, C3=false
      const token = nextId();
      const target = makeWrapper({ createPrototype: vi.fn() });
      injector.loadPrototype({ token }, new Map([[token, target]]), newCtx());
      expect(target.createPrototype).toHaveBeenCalled();
    });

    it('T6: createPrototype tra ve instance', () => {
      // covers P3, B1=false, B2=true, C3=true
      const token = nextId();
      const target = makeWrapper({
        createPrototype: vi.fn(() => ({ marker: rand(100, 900) })),
      });
      injector.loadPrototype({ token }, new Map([[token, target]]));
      expect(target.setInstanceByContextId).toHaveBeenCalled();
    });
  });

  describe('loadInstance', () => {
    const setup = (o: Record<string, unknown> = {}) => {
      const wrapper = makeWrapper(o);
      const collection = new Map([[wrapper.token || wrapper.name, wrapper]]);
      return { wrapper, collection, moduleRef: { providers: new Map() } };
    };
    const stubPending = () =>
      vi
        .spyOn(injector, 'linkDurableDeferredLoads')
        .mockImplementation(() => undefined);
    const stubBuild = (wrapper: any) => {
      const host = wrapper.getInstanceByContextId(STATIC_CONTEXT);
      vi.spyOn(injector, 'resolveProperties').mockResolvedValue([]);
      vi.spyOn(injector, 'applyProperties').mockImplementation(() => undefined);
      vi.spyOn(injector, 'instantiateClass').mockImplementation(async () => {
        host.isResolved = true;
        return {};
      });
      return host;
    };

    it('T7: host dang pending, khong co inquirer', async () => {
      // covers P1, B1=true, C1=false, C4=false, C5=false, C10=true
      const { wrapper, collection, moduleRef } = setup();
      const link = stubPending();
      wrapper.setInstanceByContextId(
        STATIC_CONTEXT,
        makeHost({ isPending: true, donePromise: Promise.resolve(undefined) }),
      );
      await injector.loadInstance(wrapper, collection, moduleRef);
      expect(link).toHaveBeenCalled();
    });

    it('T8: host pending, inquirer co chu trinh', async () => {
      // covers P2, C1=true, C2=false, C3=true
      const { wrapper, collection, moduleRef } = setup();
      const inquirer = makeWrapper();
      wrapper.setInstanceByContextId(
        STATIC_CONTEXT,
        makeHost({
          isPending: true,
          settlementSignal: { isCycle: vi.fn(() => true) },
          donePromise: Promise.resolve(undefined),
        }),
        inquirer.id,
      );
      await expect(
        injector.loadInstance(wrapper, collection, moduleRef, {
          contextId: STATIC_CONTEXT,
          inquirer,
        }),
      ).rejects.toThrow();
    });

    it('T9: host pending, inquirer nhung chua co settlementSignal', async () => {
      // covers P3, C1=true, C2=true
      const { wrapper, collection, moduleRef } = setup();
      const inquirer = makeWrapper();
      stubPending();
      wrapper.setInstanceByContextId(
        STATIC_CONTEXT,
        makeHost({ isPending: true, donePromise: Promise.resolve(undefined) }),
        inquirer.id,
      );
      await injector.loadInstance(wrapper, collection, moduleRef, {
        contextId: STATIC_CONTEXT,
        inquirer,
      });
      expect(injector.linkDurableDeferredLoads).toHaveBeenCalled();
    });

    it('T10: host pending, inquirer, khong co chu trinh', async () => {
      // covers P4, C1=true, C2=false, C3=false
      const { wrapper, collection, moduleRef } = setup();
      const inquirer = makeWrapper();
      stubPending();
      wrapper.setInstanceByContextId(
        STATIC_CONTEXT,
        makeHost({
          isPending: true,
          settlementSignal: { isCycle: vi.fn(() => false) },
          donePromise: Promise.resolve(undefined),
        }),
        inquirer.id,
      );
      await injector.loadInstance(wrapper, collection, moduleRef, {
        contextId: STATIC_CONTEXT,
        inquirer,
      });
      expect(injector.linkDurableDeferredLoads).toHaveBeenCalled();
    });

    it('T11: donePromise tra ve loi', async () => {
      // covers P5, C4=true
      const { wrapper, collection, moduleRef } = setup();
      wrapper.setInstanceByContextId(
        STATIC_CONTEXT,
        makeHost({
          isPending: true,
          donePromise: Promise.resolve(new Error(`boom-${rand(100, 900)}`)),
        }),
      );
      await expect(
        injector.loadInstance(wrapper, collection, moduleRef),
      ).rejects.toThrow();
    });

    it('T12: instance nam trong failedInstances', async () => {
      // covers P6, C4=false, C5=true
      const { wrapper, collection, moduleRef } = setup();
      const host = makeHost({
        isPending: true,
        donePromise: Promise.resolve(undefined),
      });
      wrapper.setInstanceByContextId(STATIC_CONTEXT, host);
      injector.failedInstances.set(host, new Error('failed'));
      await expect(
        injector.loadInstance(wrapper, collection, moduleRef),
      ).rejects.toThrow();
    });

    it('T13: khong co token va khong tim thay targetWrapper', async () => {
      // covers P7, B1=false, C6=true, B2=true
      const { wrapper, moduleRef } = setup({ token: undefined });
      await expect(
        injector.loadInstance(wrapper, new Map(), moduleRef),
      ).rejects.toThrow();
    });

    it('T14: instance da duoc resolve', async () => {
      // covers P8, C6=false, B2=false, B3=true
      const { wrapper, collection, moduleRef } = setup();
      wrapper.setInstanceByContextId(
        STATIC_CONTEXT,
        makeHost({ isResolved: true }),
      );
      const resolve = vi.spyOn(injector, 'resolveConstructorParams');
      await injector.loadInstance(wrapper, collection, moduleRef);
      expect(resolve).not.toHaveBeenCalled();
    });

    it('T15: resolve thanh cong, callback nhan depth', async () => {
      // covers P9, B3=false, C7=false, C8=false, C9=true, B4=false, B5=false
      const { wrapper, collection, moduleRef } = setup();
      stubBuild(wrapper);
      vi.spyOn(injector, 'resolveConstructorParams').mockImplementation(
        async (_w: unknown, _m: unknown, _i: unknown, cb: any) => {
          await cb([], rand(1, 5));
        },
      );
      await injector.loadInstance(wrapper, collection, moduleRef);
      expect(injector.instantiateClass).toHaveBeenCalled();
    });

    it('T16: callback khong duoc goi, host chua resolve', async () => {
      // covers P10, B4=true
      const { wrapper, collection, moduleRef } = setup();
      vi.spyOn(injector, 'resolveConstructorParams').mockResolvedValue(
        undefined,
      );
      await injector.loadInstance(wrapper, collection, moduleRef);
      expect(injector.resolveConstructorParams).toHaveBeenCalled();
    });

    it('T17: wrapper transient co property metadata, callback khong co depth', async () => {
      // covers P11, C7=true, C8=true, C9=false
      const { wrapper, collection, moduleRef } = setup({ isTransient: true });
      wrapper.getPropertiesMetadata = vi.fn(() => [
        { wrapper: { hierarchyLevel: rand(2, 6) } },
      ]);
      stubBuild(wrapper);
      vi.spyOn(injector, 'resolveConstructorParams').mockImplementation(
        async (_w: unknown, _m: unknown, _i: unknown, cb: any) => {
          await cb([]);
        },
      );
      await injector.loadInstance(wrapper, collection, moduleRef);
      expect(injector.instantiateClass).toHaveBeenCalled();
    });

    it('T18: resolveConstructorParams nem loi', async () => {
      // covers P12, B5=true
      const { wrapper, collection, moduleRef } = setup();
      vi.spyOn(injector, 'resolveConstructorParams').mockRejectedValue(
        new Error('resolve failed'),
      );
      await expect(
        injector.loadInstance(wrapper, collection, moduleRef),
      ).rejects.toThrow();
      expect(wrapper.removeInstanceByContextId).toHaveBeenCalled();
    });
  });

  describe('loadMiddleware', () => {
    const makeMiddleware = (instance?: unknown) => {
      const wrapper: any = { metatype: class Middleware {}, token: nextId() };
      const target = { instance };
      return {
        wrapper,
        target,
        collection: new Map([[wrapper.token, target]]),
      };
    };

    it('T19: target da co instance', async () => {
      // covers P1, B1=true
      const { wrapper, collection } = makeMiddleware({});
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadMiddleware(wrapper, collection, {} as any);
      expect(load).not.toHaveBeenCalled();
    });

    it('T20: target chua co instance, khong co inquirer, contextId mac dinh', async () => {
      // covers P2, B1=false, C2=false, C3=true
      const { wrapper, collection } = makeMiddleware();
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadMiddleware(wrapper, collection, {} as any);
      expect(load).toHaveBeenCalled();
    });

    it('T21: co inquirer va contextId ro rang', async () => {
      // covers P3, C2=true, C3=false
      const { wrapper, collection } = makeMiddleware();
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadMiddleware(
        wrapper,
        collection,
        {} as any,
        newCtx(),
        makeWrapper(),
      );
      expect(load).toHaveBeenCalled();
    });
  });

  describe('loadController', () => {
    const stubAll = () => ({
      enhancers: vi
        .spyOn(injector, 'loadEnhancers')
        .mockResolvedValue(undefined),
      perContext: vi
        .spyOn(injector, 'loadEnhancersPerContext')
        .mockResolvedValue(undefined),
      load: vi.spyOn(injector, 'loadInstance').mockResolvedValue(undefined),
    });
    const moduleRef: any = { controllers: new Map() };

    it('T22: controller static, co enhancers', async () => {
      // covers P1, B1=true, C2=false
      const { enhancers } = stubAll();
      const wrapper = makeWrapper();
      wrapper.getEnhancersMetadata = vi.fn(() => [makeWrapper()]);
      await injector.loadController(wrapper, moduleRef);
      expect(enhancers).toHaveBeenCalled();
    });

    it('T23: controller static, getEnhancersMetadata tra ve undefined', async () => {
      // covers P2, B1=true, C2=true
      const { enhancers } = stubAll();
      await injector.loadController(makeWrapper(), moduleRef);
      expect(enhancers).toHaveBeenCalled();
    });

    it('T24: controller khong static', async () => {
      // covers P3, B1=false
      const { perContext } = stubAll();
      const wrapper = makeWrapper({
        isDependencyTreeStatic: vi.fn(() => false),
      });
      await injector.loadController(wrapper, moduleRef, newCtx());
      expect(perContext).toHaveBeenCalled();
    });
  });

  describe('loadInjectable', () => {
    const moduleRef: any = { injectables: new Map() };

    it('T25: khong co inquirer, contextId mac dinh', async () => {
      // covers P1, C1=true
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadInjectable(makeWrapper(), moduleRef);
      expect(load).toHaveBeenCalled();
    });

    it('T26: co inquirer va contextId ro rang', async () => {
      // covers P2, C1=false
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadInjectable(
        makeWrapper(),
        moduleRef,
        newCtx(),
        makeWrapper(),
      );
      expect(load).toHaveBeenCalled();
    });
  });

  describe('loadProvider', () => {
    const moduleRef: any = { providers: new Map() };
    const stubAll = (skip: boolean) => ({
      skip: vi
        .spyOn(injector, 'shouldSkipProviderLoading')
        .mockReturnValue(skip),
      lookup: vi
        .spyOn(injector, 'lookupSkippedProviderDependencies')
        .mockResolvedValue(undefined),
      load: vi.spyOn(injector, 'loadInstance').mockResolvedValue(undefined),
      enhancers: vi
        .spyOn(injector, 'loadEnhancers')
        .mockResolvedValue(undefined),
      perContext: vi
        .spyOn(injector, 'loadEnhancersPerContext')
        .mockResolvedValue(undefined),
    });

    it('T27: bo qua provider, khong co inquirer', async () => {
      // covers P1, B1=true, B2=true, C7=true
      const { lookup } = stubAll(true);
      await injector.loadProvider(makeWrapper(), moduleRef);
      expect(lookup).toHaveBeenCalled();
    });

    it('T28: bo qua provider, co inquirer', async () => {
      // covers P2, B1=true, B2=false, C7=false
      const { lookup } = stubAll(true);
      await injector.loadProvider(makeWrapper(), moduleRef, {
        contextId: STATIC_CONTEXT,
        inquirer: makeWrapper(),
      });
      expect(lookup).not.toHaveBeenCalled();
    });

    it('T29: static, khong inquirer, cay static, co enhancers', async () => {
      // covers P3, B1=false, C3=true, C4=true, C5=true, C6=false, C7=true
      const { enhancers } = stubAll(false);
      const wrapper = makeWrapper();
      wrapper.getEnhancersMetadata = vi.fn(() => [
        { isTransient: true },
        { isTransient: false },
      ]);
      await injector.loadProvider(wrapper, moduleRef);
      expect(enhancers).toHaveBeenCalled();
    });

    it('T30: nhu T29 nhung getEnhancersMetadata tra ve undefined', async () => {
      // covers P4, C6=true
      const { enhancers } = stubAll(false);
      await injector.loadProvider(makeWrapper(), moduleRef);
      expect(enhancers).toHaveBeenCalled();
    });

    it('T31: cay dependency khong static', async () => {
      // covers P5, C5=false
      const { perContext } = stubAll(false);
      const wrapper = makeWrapper({
        isDependencyTreeStatic: vi.fn(() => false),
      });
      await injector.loadProvider(wrapper, moduleRef);
      expect(perContext).toHaveBeenCalled();
    });

    it('T32: static context nhung co inquirer', async () => {
      // covers P6, C3=true, C4=false, C7=false
      const { perContext } = stubAll(false);
      await injector.loadProvider(makeWrapper(), moduleRef, {
        contextId: STATIC_CONTEXT,
        inquirer: makeWrapper(),
      });
      expect(perContext).toHaveBeenCalled();
    });

    it('T33: context khong phai static', async () => {
      // covers P7, C3=false
      const { perContext } = stubAll(false);
      await injector.loadProvider(makeWrapper(), moduleRef, {
        contextId: newCtx(),
      });
      expect(perContext).toHaveBeenCalled();
    });
  });

  describe('applySettlementSignal', () => {
    it('T34: gan signal cho instance va wrapper', () => {
      // covers P1 (khong co nhanh)
      const host = makeHost();
      const wrapper = makeWrapper();
      expect(injector.applySettlementSignal(host, wrapper)).toBeDefined();
      expect(host.isPending).toBe(true);
    });
  });
});
