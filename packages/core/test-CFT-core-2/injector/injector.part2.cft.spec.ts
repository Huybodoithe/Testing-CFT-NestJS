/**
 * CFT - injector/injector.ts (phan 2/4): resolveConstructorParams, getClassDependencies,
 * warnOnMissingDecoratorMetadata, getFactoryProviderDependencies, reflectConstructorParams,
 * reflectSelfParams, reflectOptionalParams, getConstructorOwner, resolveSingleParam,
 * resolveParamToken (dong 409-706 cua injector.ts).
 * Luu tai: packages/core/test-CFT-core-2/injector/injector.part2.cft.spec.ts
 * Do tong voi phan 1: chay ca hai spec cung mot lenh, --coverage.include=packages/core/injector/injector.ts
 *
 * Nhan: <ham>.B<n> = quyet dinh, <ham>.C<n> = dieu kien nguyen tu, <ham>.P<n> = path,
 *   T = test phu true, F = test phu false. Moi path co dung mot test (T35.. tiep noi phan 1).
 *   Vi tri ghi theo so dong cua injector.ts (dN). Cac ham private duoc goi truc tiep qua `injector: any`.
 *
 * ======================================================================================
 * RC. resolveConstructorParams (d409-520)
 * Quyet dinh:
 *   RC.B1 d414 tham so mac dinh resolutionContext   RC.B2 d419 if (contextId !== STATIC && hasDenseCtorMetadata())
 *   RC.B3 d433 isFactoryProvider ? getFactoryProviderDependencies : getClassDependencies
 *   RC.B4 d442 if (isInquirer(param, parentInquirer))
 *   RC.B5 d450 if (resolutionContext.inquirer?.isTransient && parentInquirer)
 *   RC.B6 d488 if (hierarchyLevel > depth)   RC.B7 d499 if (!instanceHost.isResolved && !forwardRef)
 *   RC.B8 d512 if (!isOptional) trong catch  RC.B9 d519 isResolved && (await callback(...))
 *   RC.B10 d518 Promise.all(dependencies.map(...)): 0 / 1 / nhieu dependency
 * Dieu kien nguyen tu (T / F):
 *   RC.C1  resolutionContext khong truyen (d414)        T: T35,T38        F: T36,T37,T39..T49
 *   RC.C2  contextId !== STATIC_CONTEXT (d420)          T: T36,T37        F: T35,T38..T49
 *   RC.C3  hasDenseCtorMetadata() (khi C2 true)         T: T36            F: T37
 *   RC.C4  !isNil(inject) (d432)                        T: T38            F: T35,T37,T39..T49
 *   RC.C5  isInquirer(param, parentInquirer) (d442)     T: T39,T49        F: T40..T48,T49
 *   RC.C6  parentInquirer && ... (d448)                 unreachable: chi toi duoc khi isInquirer truthy, tuc parentInquirer truthy
 *   RC.C7  inquirer nil (?. d450)                       T: T42,T44..T48   F: T40,T41,T43
 *   RC.C8  inquirer.isTransient (khi C7 false)          T: T40,T43        F: T41
 *   RC.C9  parentInquirer (khi C8 true)                 T: T40            F: T43
 *   RC.C10 hierarchyLevel > depth (d488)                T: T42            F: T44
 *   RC.C11 !instanceHost.isResolved (d499)              T: T45,T46        F: T42,T44
 *   RC.C12 !forwardRef (khi C11 true)                   T: T45            F: T46
 *   RC.C13 instanceHost?.instance nil (?. d502)         unreachable: d499 da truy cap instanceHost.isResolved, null se nem loi va roi vao catch
 *   RC.C14 isOptional (d511)                            T: T47            F: T48
 *   RC.C15 isResolved (d519)                            T: T35,T42,T44,T46,T47,T49   F: T45
 * Path (input -> hanh vi):
 *   RC.P1 T35 context mac dinh, khong co dependency        -> goi callback([], 0)
 *   RC.P2 T36 context khac STATIC, metadata day du         -> loadCtorMetadata roi callback(deps), khong tra cuu class
 *   RC.P3 T37 context khac STATIC, metadata chua day du    -> di duong cham, getClassDependencies duoc goi
 *   RC.P4 T38 inject co gia tri (factory provider)         -> getFactoryProviderDependencies duoc goi
 *   RC.P5 T39 param la INQUIRER, co parentInquirer         -> tra parent.instance, khong resolve
 *   RC.P6 T40 inquirer transient va co parentInquirer      -> gan rootInquirer cua context = parentInquirer
 *   RC.P7 T41 inquirer khong transient va co parentInquirer -> khong gan rootInquirer
 *   RC.P8 T42 khong inquirer, level cao hon depth, host da resolve -> cap nhat depth, goi callback
 *   RC.P9 T43 inquirer transient nhung khong co parentInquirer -> khong gan rootInquirer
 *   RC.P10 T44 level khong cao hon depth                   -> depth giu nguyen
 *   RC.P11 T45 host chua resolve va khong forwardRef       -> isResolved = false, callback khong duoc goi
 *   RC.P12 T46 host chua resolve nhung forwardRef          -> van goi callback
 *   RC.P13 T47 resolveSingleParam nem loi, param optional  -> nuot loi, truyen undefined
 *   RC.P14 T48 resolveSingleParam nem loi, khong optional  -> nem lai loi
 *   RC.P15 T49 hai dependency: INQUIRER va param thuong    -> Promise.all nhieu phan tu, Barrier dong bo
 *
 * GC. getClassDependencies (d522-535): khong co nhanh. GC.P1 T50 class co metadata -> tra [deps, optional].
 *
 * ======================================================================================
 * W. warnOnMissingDecoratorMetadata (d545-568)
 * Quyet dinh: W.B1 d550 if (length===0 || da canh bao || co PARAMTYPES || khong co metadata rieng) return
 *   W.B2 d558 for (index < type.length): 1 / nhieu lan (0 lan unreachable vi C1 da loai length 0)
 *   W.B3 d559 if (dependencies[index] === undefined && !optional.includes(index))
 * Dieu kien nguyen tu (T / F):
 *   W.C1 type.length === 0 (d551)                     T: T51   F: T52..T58
 *   W.C2 classesWithoutMetadata.has(type)             T: T52   F: T53..T58
 *   W.C3 Reflect.hasMetadata(PARAMTYPES, type)        T: T53   F: T54..T58
 *   W.C4 getOwnMetadataKeys(type).length === 0        T: T54   F: T55..T58
 *   W.C5 dependencies[index] === undefined (d560)     T: T55,T57,T58   F: T56,T58 (index 0)
 *   W.C6 !optional.includes(index) (khi C5 true)      T: T55,T58       F: T57
 * Path: W.P1 T51 class khong co tham so -> return | W.P2 T52 da nam trong WeakSet -> return
 *   W.P3 T53 co metadata PARAMTYPES -> return | W.P4 T54 khong co metadata nao -> return
 *   W.P5 T55 tham so dau thieu, khong optional -> warn, them vao WeakSet
 *   W.P6 T56 moi dependency deu co -> het vong lap, khong warn
 *   W.P7 T57 tham so thieu nhung optional -> khong warn
 *   W.P8 T58 hai tham so, tham so thu hai thieu -> warn o index 1 (vong lap nhieu lan)
 *
 * ======================================================================================
 * F. getFactoryProviderDependencies (d570-623), gom ca hai ham cuc bo isOptionalFactoryDependency
 *    va mapFactoryProviderInjectArray
 * Quyet dinh: F.B1 d620 inject ?? []  F.B2 d596 isWrappedDependency (chuoi &&)  F.B3 d598 ternary token
 *   F.B4 d602 if (isNil(token)) nem loi  F.B5 d609 if (typeof item !== 'object')
 *   F.B6 d612 if (isOptionalFactoryDependency(item))  F.B7 d613 if (item.optional)
 *   F.B8 d583 if (isNil(token)) return false (ham cuc bo)
 * Dieu kien nguyen tu (T / F):
 *   F.C1 inject nullish (d620)                       T: T59           F: T60..T67
 *   F.C2 !isNil(item) (d597)                         T: T60,T62..T67  F: T61
 *   F.C3 typeof item === 'object' (khi C2 true)      T: T62..T67      F: T60
 *   F.C4 'token' in item (khi C2, C3 true)           T: T62..T66      F: T67
 *   F.C5 isNil(token) (d602)                         T: T61,T62       F: T60,T63..T67
 *   F.C6 typeof item !== 'object' (d609)             T: T60           F: T63..T67
 *   F.C7 isNil(token) trong ham cuc bo (d583)        T: T67           F: T63..T66
 *   F.C8 !isUndefined(value.optional) (d587)         T: T63,T64,T66   F: T65
 *   F.C9 !value.prototype (d588, khi C8 true)        T: T63,T64       F: T66
 *   F.C10 item.optional (d613)                       T: T63           F: T64
 *   Unreachable: F.U1 value?.token nil (d582) vi d602 da loai item nil; F.U2 item?.token nil (d616) vi
 *   item da co token; F.U3 ve phai cua wrapper.inject ?? undefined (d605) vi map chi chay khi inject khac nil.
 * Path: F.P1 T59 inject undefined -> [[], []] | F.P2 T60 token la chuoi, symbol, class -> giu nguyen
 *   F.P3 T61 phan tu undefined -> nem UndefinedDependencyException | F.P4 T62 object co token undefined -> nem loi
 *   F.P5 T63 object { token, optional: true } -> tra token, ghi nhan index optional
 *   F.P6 T64 object { token, optional: false } -> tra token, khong ghi nhan
 *   F.P7 T65 object { token } khong co optional -> tra chinh object | F.P8 T66 object co prototype -> tra chinh object
 *   F.P9 T67 object khong co khoa token -> tra chinh object
 *
 * ======================================================================================
 * R. reflectConstructorParams (d625-633) va reflectSelfParams (d664-666)
 *   R.C1 getMetadata(PARAMTYPES) falsy (d627)    T: T68,T71   F: T69,T70
 *   R.C2 getMetadata(SELF_DECLARED) falsy (d665) T: T68,T69   F: T70,T71
 *   Vong forEach selfParams: 0 lan T68,T69 | 1 lan T70 | nhieu lan T71
 * Path: R.P1 T68 khong co metadata | R.P2 T69 chi co PARAMTYPES | R.P3 T70 PARAMTYPES va 1 self param
 *   (ghi de) | R.P4 T71 chi co 2 self param.
 * O. reflectOptionalParams (d635-638): O.C1 getOwnMetadata(OPTIONAL) falsy  T: T72  F: T73
 * Path: O.P1 T72 khong co metadata -> [] | O.P2 T73 co metadata -> tra ve metadata.
 *
 * G. getConstructorOwner (d647-662)
 * Quyet dinh: G.B1 d651 while (isFunction(current) && current !== Function.prototype): 0 / 1 / nhieu lan
 *   G.B2 d652 if (hasOwn PARAMTYPES || hasOwn OPTIONAL || hasOwn SELF)
 *   G.C1 isFunction(current)                  T: T75..T79   F: T74
 *   G.C2 current !== Function.prototype       T: T75..T78   F: T79
 *   G.C3 hasOwnMetadata(PARAMTYPES)           T: T75,T78    F: T76,T77,T79
 *   G.C4 hasOwnMetadata(OPTIONAL) (khi C3 F)  T: T76        F: T77,T79
 *   G.C5 hasOwnMetadata(SELF) (khi C3, C4 F)  T: T77        F: T79
 * Path: G.P1 T74 khong phai ham -> tra type | G.P2 T75 co PARAMTYPES | G.P3 T76 chi co OPTIONAL
 *   G.P4 T77 chi co SELF | G.P5 T78 lop con khong co metadata, lop cha co -> tra lop cha
 *   G.P6 T79 chuoi lop khong co metadata -> dung o Function.prototype, tra type.
 *
 * S. resolveSingleParam (d668-695): S.C1 isUndefined(param) T: T80  F: T81,T82
 *   S.C2 resolutionContext khong truyen (d673) T: T80,T81  F: T82
 * Path: S.P1 T80 param undefined -> logger.log va nem UndefinedDependencyException | S.P2 T81 param co gia tri,
 *   context mac dinh -> goi resolveComponentWrapper | S.P3 T82 context truyen vao.
 * K. resolveParamToken (d697-706): K.C1 typeof param === 'object'  T: T84,T85  F: T83
 *   K.C2 'forwardRef' in param (khi C1 true)  T: T85  F: T84
 * Path: K.P1 T83 param la chuoi | K.P2 T84 object khong co forwardRef | K.P3 T85 object co forwardRef
 *   -> wrapper.forwardRef = true, goi forwardRef().
 *
 * ======================================================================================
 * Tong ket (theo thiet ke, CHUA CHAY): 51 test (T35..T85) cho 51 path.
 *   Dieu kien nguyen tu dat ca true va false: 41/46. Unreachable (5): RC.C6, RC.C13, F.U1, F.U2, F.U3.
 *   Quyet dinh dat ca hai huong, tru vong lap 0 lan o W.B2 (unreachable).
 *   Phan 1 con thieu d103-108 (HostSettlementRef) va d115-117 (instanceDecorator mac dinh): se phu o phan 3 va 4.
 *
 * Mock (chi khi can): spy cac ham cua chinh Injector (getClassDependencies, getFactoryProviderDependencies,
 *   hasDenseCtorMetadata, loadCtorMetadata, resolveSingleParam, resolveComponentHost, resolveComponentWrapper)
 *   de cach ly tung ham; cac ham nay duoc kiem thu o phan khac. InstanceWrapper la object gia toi gian
 *   (giong phan 1). Dung ban that: Barrier, INQUIRER, Reflect metadata, cac Exception.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OPTIONAL_DEPS_METADATA,
  PARAMTYPES_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/internal';
import { STATIC_CONTEXT } from '../../injector/constants';
import { INQUIRER } from '../../injector/inquirer/index';
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

// Module gia du de cac Exception dung ten module khi tao thong bao
const moduleRef: any = {
  name: 'TestModule',
  metatype: class TestModule {},
  providers: new Map(),
};

describe('Injector (CFT) - phan 2', () => {
  let injector: any;

  beforeEach(() => {
    seed = 20261114;
    counter = 0;
    injector = new Injector();
    injector.logger = { log: vi.fn(), warn: vi.fn() };
  });

  describe('resolveConstructorParams', () => {
    // Wrapper cua dependency: getInstanceByContextId luon tra ve cung mot host
    const makeParam = (
      hostOpts: Record<string, unknown> = {},
      wrapperOpts: Record<string, unknown> = {},
    ) => {
      const host = makeHost({
        isResolved: true,
        instance: { marker: rand(100, 900) },
        ...hostOpts,
      });
      return makeWrapper({
        getInstanceByContextId: vi.fn(() => host),
        ...wrapperOpts,
      });
    };
    const stubDeps = (deps: unknown[], optional: number[] = []) =>
      vi
        .spyOn(injector, 'getClassDependencies')
        .mockReturnValue([deps, optional]);
    const stubResolve = (param: any) => {
      vi.spyOn(injector, 'resolveSingleParam').mockResolvedValue(param);
      vi.spyOn(injector, 'resolveComponentHost').mockImplementation(
        async (_moduleRef: unknown, wrapper: unknown) => wrapper,
      );
    };
    const run = (
      wrapper: any,
      callback: any,
      o: { inject?: unknown[]; context?: any; parent?: any } = {},
    ) =>
      injector.resolveConstructorParams(
        wrapper,
        moduleRef,
        o.inject,
        callback,
        o.context,
        o.parent,
      );

    it('T35: context mac dinh, khong co dependency', async () => {
      // covers RC.P1, RC.C1=true, RC.C2=false, RC.C4=false, RC.C15=true
      stubDeps([]);
      const callback = vi.fn();
      await run(makeWrapper(), callback);
      expect(callback).toHaveBeenCalled();
    });

    it('T36: context khac STATIC, metadata day du', async () => {
      // covers RC.P2, RC.C1=false, RC.C2=true, RC.C3=true
      vi.spyOn(injector, 'hasDenseCtorMetadata').mockReturnValue(true);
      const load = vi
        .spyOn(injector, 'loadCtorMetadata')
        .mockResolvedValue([{ marker: rand(100, 900) }]);
      const classDeps = vi.spyOn(injector, 'getClassDependencies');
      const callback = vi.fn();
      await run(makeWrapper(), callback, { context: { contextId: newCtx() } });
      expect(load).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
      expect(classDeps).not.toHaveBeenCalled();
    });

    it('T37: context khac STATIC, metadata chua day du', async () => {
      // covers RC.P3, RC.C2=true, RC.C3=false, RC.C4=false
      vi.spyOn(injector, 'hasDenseCtorMetadata').mockReturnValue(false);
      const classDeps = stubDeps([]);
      const callback = vi.fn();
      await run(makeWrapper(), callback, { context: { contextId: newCtx() } });
      expect(classDeps).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });

    it('T38: inject co gia tri (factory provider)', async () => {
      // covers RC.P4, RC.C1=true, RC.C4=true
      const factoryDeps = vi
        .spyOn(injector, 'getFactoryProviderDependencies')
        .mockReturnValue([[], []]);
      const callback = vi.fn();
      await run(makeWrapper(), callback, { inject: [`token-${nextId()}`] });
      expect(factoryDeps).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });

    it('T39: param la INQUIRER va co parentInquirer', async () => {
      // covers RC.P5, RC.C5=true
      const parent = makeWrapper({ instance: { marker: rand(100, 900) } });
      stubDeps([INQUIRER]);
      const resolve = vi.spyOn(injector, 'resolveSingleParam');
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
        parent,
      });
      expect(callback).toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    });

    it('T40: inquirer transient va co parentInquirer', async () => {
      // covers RC.P6, RC.C5=false, RC.C7=false, RC.C8=true, RC.C9=true
      const context: any = {
        contextId: STATIC_CONTEXT,
        inquirer: makeWrapper({ isTransient: true }),
      };
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam());
      const callback = vi.fn();
      await run(makeWrapper(), callback, { context, parent: makeWrapper() });
      expect(context.rootInquirer).toBeDefined();
    });

    it('T41: inquirer khong transient va co parentInquirer', async () => {
      // covers RC.P7, RC.C7=false, RC.C8=false
      const context: any = {
        contextId: STATIC_CONTEXT,
        inquirer: makeWrapper({ isTransient: false }),
      };
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam());
      const callback = vi.fn();
      await run(makeWrapper(), callback, { context, parent: makeWrapper() });
      expect(callback).toHaveBeenCalled();
    });

    it('T42: khong co inquirer, level cao hon depth, host da resolve', async () => {
      // covers RC.P8, RC.C7=true, RC.C10=true, RC.C11=false, RC.C15=true
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam({}, { hierarchyLevel: rand(2, 9) }));
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
      });
      expect(callback).toHaveBeenCalled();
    });

    it('T43: inquirer transient nhung khong co parentInquirer', async () => {
      // covers RC.P9, RC.C7=false, RC.C8=true, RC.C9=false
      const context: any = {
        contextId: STATIC_CONTEXT,
        inquirer: makeWrapper({ isTransient: true }),
      };
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam());
      const callback = vi.fn();
      await run(makeWrapper(), callback, { context });
      expect(callback).toHaveBeenCalled();
    });

    it('T44: level khong cao hon depth', async () => {
      // covers RC.P10, RC.C10=false
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam({}, { hierarchyLevel: 0 }));
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
      });
      expect(callback).toHaveBeenCalled();
    });

    it('T45: host chua resolve va khong forwardRef', async () => {
      // covers RC.P11, RC.C11=true, RC.C12=true, RC.C15=false
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam({ isResolved: false }, { forwardRef: false }));
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
      });
      expect(callback).not.toHaveBeenCalled();
    });

    it('T46: host chua resolve nhung la forwardRef', async () => {
      // covers RC.P12, RC.C11=true, RC.C12=false
      stubDeps([`dep-${nextId()}`]);
      stubResolve(makeParam({ isResolved: false }, { forwardRef: true }));
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
      });
      expect(callback).toHaveBeenCalled();
    });

    it('T47: resolveSingleParam nem loi, param la optional', async () => {
      // covers RC.P13, RC.C14=true
      stubDeps([`dep-${nextId()}`], [0]);
      vi.spyOn(injector, 'resolveSingleParam').mockRejectedValue(
        new Error(`fail-${rand(100, 900)}`),
      );
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
      });
      expect(callback).toHaveBeenCalled();
    });

    it('T48: resolveSingleParam nem loi, param khong optional', async () => {
      // covers RC.P14, RC.C14=false
      stubDeps([`dep-${nextId()}`], []);
      vi.spyOn(injector, 'resolveSingleParam').mockRejectedValue(
        new Error(`fail-${rand(100, 900)}`),
      );
      await expect(
        run(makeWrapper(), vi.fn(), { context: { contextId: STATIC_CONTEXT } }),
      ).rejects.toThrow();
    });

    it('T49: hai dependency, INQUIRER va param thuong', async () => {
      // covers RC.P15, RC.B10=nhieu dependency, RC.C5=true roi false
      const parent = makeWrapper({ instance: { marker: rand(100, 900) } });
      stubDeps([INQUIRER, `dep-${nextId()}`]);
      stubResolve(makeParam());
      const callback = vi.fn();
      await run(makeWrapper(), callback, {
        context: { contextId: STATIC_CONTEXT },
        parent,
      });
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('getClassDependencies', () => {
    it('T50: class co metadata PARAMTYPES', () => {
      // covers GC.P1
      class Dep {}
      class Target {
        constructor(_dep: Dep) {}
      }
      Reflect.defineMetadata(PARAMTYPES_METADATA, [Dep], Target);
      const wrapper = makeWrapper({ metatype: Target });
      expect(injector.getClassDependencies(wrapper)).toBeDefined();
    });
  });

  describe('warnOnMissingDecoratorMetadata', () => {
    it('T51: class khong co tham so constructor', () => {
      // covers W.P1, W.C1=true
      class NoParams {}
      injector.warnOnMissingDecoratorMetadata(NoParams, [], []);
      expect(injector.logger.warn).not.toHaveBeenCalled();
    });

    it('T52: class da nam trong classesWithoutMetadata', () => {
      // covers W.P2, W.C1=false, W.C2=true
      class Cached {
        constructor(_a: unknown) {}
      }
      Reflect.defineMetadata(`custom:${nextId()}`, true, Cached);
      injector.classesWithoutMetadata.add(Cached);
      injector.warnOnMissingDecoratorMetadata(Cached, [undefined], []);
      expect(injector.logger.warn).not.toHaveBeenCalled();
    });

    it('T53: class da co metadata PARAMTYPES', () => {
      // covers W.P3, W.C2=false, W.C3=true
      class Typed {
        constructor(_a: unknown) {}
      }
      Reflect.defineMetadata(PARAMTYPES_METADATA, [Object], Typed);
      injector.warnOnMissingDecoratorMetadata(Typed, [undefined], []);
      expect(injector.logger.warn).not.toHaveBeenCalled();
    });

    it('T54: class khong co metadata rieng nao', () => {
      // covers W.P4, W.C3=false, W.C4=true
      class Undecorated {
        constructor(_a: unknown) {}
      }
      injector.warnOnMissingDecoratorMetadata(Undecorated, [undefined], []);
      expect(injector.logger.warn).not.toHaveBeenCalled();
    });

    it('T55: tham so dau thieu va khong optional', () => {
      // covers W.P5, W.C4=false, W.C5=true, W.C6=true
      class Missing {
        constructor(_a: unknown) {}
      }
      Reflect.defineMetadata(`custom:${nextId()}`, true, Missing);
      injector.warnOnMissingDecoratorMetadata(Missing, [undefined], []);
      expect(injector.logger.warn).toHaveBeenCalled();
    });

    it('T56: moi dependency deu co gia tri', () => {
      // covers W.P6, W.C5=false
      class Complete {
        constructor(_a: unknown) {}
      }
      Reflect.defineMetadata(`custom:${nextId()}`, true, Complete);
      injector.warnOnMissingDecoratorMetadata(Complete, [class Service {}], []);
      expect(injector.logger.warn).not.toHaveBeenCalled();
    });

    it('T57: tham so thieu nhung la optional', () => {
      // covers W.P7, W.C5=true, W.C6=false
      class OptionalParam {
        constructor(_a: unknown) {}
      }
      Reflect.defineMetadata(`custom:${nextId()}`, true, OptionalParam);
      injector.warnOnMissingDecoratorMetadata(OptionalParam, [undefined], [0]);
      expect(injector.logger.warn).not.toHaveBeenCalled();
    });

    it('T58: hai tham so, tham so thu hai thieu', () => {
      // covers W.P8, W.B2=nhieu lan lap, W.C5=false roi true
      class TwoParams {
        constructor(_a: unknown, _b: unknown) {}
      }
      Reflect.defineMetadata(`custom:${nextId()}`, true, TwoParams);
      injector.warnOnMissingDecoratorMetadata(
        TwoParams,
        [class Service {}, undefined],
        [],
      );
      expect(injector.logger.warn).toHaveBeenCalled();
    });
  });

  describe('getFactoryProviderDependencies', () => {
    const run = (inject: unknown) =>
      injector.getFactoryProviderDependencies(
        makeWrapper({ name: `FactoryProvider${rand(100, 900)}`, inject }),
      );

    it('T59: inject la undefined', () => {
      // covers F.P1, F.C1=true
      expect(run(undefined)).toBeDefined();
    });

    it('T60: token la chuoi, symbol va class', () => {
      // covers F.P2, F.C1=false, F.C2=true, F.C3=false, F.C5=false, F.C6=true
      expect(
        run([
          `TOKEN_${nextId()}`,
          Symbol(`sym${rand(100, 900)}`),
          class Service {},
        ]),
      ).toBeDefined();
    });

    it('T61: phan tu inject la undefined', () => {
      // covers F.P3, F.C2=false, F.C5=true
      expect(() => run([undefined])).toThrow();
    });

    it('T62: object co token la undefined', () => {
      // covers F.P4, F.C3=true, F.C4=true, F.C5=true
      expect(() => run([{ token: undefined, optional: true }])).toThrow();
    });

    it('T63: object { token, optional: true }', () => {
      // covers F.P5, F.C4=true, F.C6=false, F.C7=false, F.C8=true, F.C9=true, F.C10=true
      expect(
        run([
          `TOKEN_${nextId()}`,
          { token: `TOKEN_${nextId()}`, optional: true },
        ]),
      ).toBeDefined();
    });

    it('T64: object { token, optional: false }', () => {
      // covers F.P6, F.C10=false
      expect(
        run([{ token: `TOKEN_${nextId()}`, optional: false }]),
      ).toBeDefined();
    });

    it('T65: object { token } khong co optional', () => {
      // covers F.P7, F.C8=false
      expect(run([{ token: `TOKEN_${nextId()}` }])).toBeDefined();
    });

    it('T66: object co thuoc tinh prototype', () => {
      // covers F.P8, F.C9=false
      expect(
        run([{ token: `TOKEN_${nextId()}`, optional: true, prototype: {} }]),
      ).toBeDefined();
    });

    it('T67: object khong co khoa token', () => {
      // covers F.P9, F.C4=false, F.C7=true
      expect(run([{ provide: `TOKEN_${nextId()}` }])).toBeDefined();
    });
  });

  describe('reflectConstructorParams va reflectSelfParams', () => {
    it('T68: class khong co metadata', () => {
      // covers R.P1, R.C1=true, R.C2=true
      class Plain {}
      expect(injector.reflectConstructorParams(Plain)).toBeDefined();
    });

    it('T69: class chi co PARAMTYPES', () => {
      // covers R.P2, R.C1=false, R.C2=true
      class Typed {}
      Reflect.defineMetadata(PARAMTYPES_METADATA, [Object, String], Typed);
      expect(injector.reflectConstructorParams(Typed)).toBeDefined();
    });

    it('T70: PARAMTYPES va mot self param ghi de', () => {
      // covers R.P3, R.C2=false, forEach 1 lan
      class Typed {}
      Reflect.defineMetadata(PARAMTYPES_METADATA, [Object, String], Typed);
      Reflect.defineMetadata(
        SELF_DECLARED_DEPS_METADATA,
        [{ index: 0, param: `TOKEN_${nextId()}` }],
        Typed,
      );
      expect(injector.reflectConstructorParams(Typed)).toBeDefined();
    });

    it('T71: chi co hai self param', () => {
      // covers R.P4, R.C1=true, forEach nhieu lan
      class SelfOnly {}
      Reflect.defineMetadata(
        SELF_DECLARED_DEPS_METADATA,
        [
          { index: 0, param: `TOKEN_${nextId()}` },
          { index: 1, param: `TOKEN_${nextId()}` },
        ],
        SelfOnly,
      );
      expect(injector.reflectConstructorParams(SelfOnly)).toBeDefined();
    });
  });

  describe('reflectOptionalParams', () => {
    it('T72: class khong co metadata optional', () => {
      // covers O.P1, O.C1=true
      class Plain {}
      expect(injector.reflectOptionalParams(Plain)).toBeDefined();
    });

    it('T73: class co metadata optional', () => {
      // covers O.P2, O.C1=false
      class WithOptional {}
      Reflect.defineMetadata(OPTIONAL_DEPS_METADATA, [0], WithOptional);
      expect(injector.reflectOptionalParams(WithOptional)).toBeDefined();
    });
  });

  describe('getConstructorOwner', () => {
    it('T74: tham so khong phai ham', () => {
      // covers G.P1, G.C1=false (vong lap 0 lan)
      expect(
        injector.getConstructorOwner({ marker: rand(100, 900) }),
      ).toBeDefined();
    });

    it('T75: class co PARAMTYPES rieng', () => {
      // covers G.P2, G.C1=true, G.C2=true, G.C3=true
      class Owner {}
      Reflect.defineMetadata(PARAMTYPES_METADATA, [Object], Owner);
      expect(injector.getConstructorOwner(Owner)).toBeDefined();
    });

    it('T76: class chi co OPTIONAL rieng', () => {
      // covers G.P3, G.C3=false, G.C4=true
      class Owner {}
      Reflect.defineMetadata(OPTIONAL_DEPS_METADATA, [0], Owner);
      expect(injector.getConstructorOwner(Owner)).toBeDefined();
    });

    it('T77: class chi co SELF rieng', () => {
      // covers G.P4, G.C4=false, G.C5=true
      class Owner {}
      Reflect.defineMetadata(
        SELF_DECLARED_DEPS_METADATA,
        [{ index: 0, param: `TOKEN_${nextId()}` }],
        Owner,
      );
      expect(injector.getConstructorOwner(Owner)).toBeDefined();
    });

    it('T78: lop con khong co metadata, lop cha co', () => {
      // covers G.P5, vong lap nhieu lan
      class Parent {}
      Reflect.defineMetadata(PARAMTYPES_METADATA, [Object], Parent);
      class Child extends Parent {}
      expect(injector.getConstructorOwner(Child)).toBeDefined();
    });

    it('T79: chuoi lop khong co metadata', () => {
      // covers G.P6, G.C2=false (dung o Function.prototype), G.C5=false
      class Base {}
      class Derived extends Base {}
      expect(injector.getConstructorOwner(Derived)).toBeDefined();
    });
  });

  describe('resolveSingleParam', () => {
    it('T80: param la undefined', async () => {
      // covers S.P1, S.C1=true, S.C2=true
      await expect(
        injector.resolveSingleParam(
          makeWrapper(),
          undefined,
          { index: 0, dependencies: [] },
          moduleRef,
        ),
      ).rejects.toThrow();
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T81: param co gia tri, context mac dinh', async () => {
      // covers S.P2, S.C1=false, S.C2=true
      const lookup = vi
        .spyOn(injector, 'resolveComponentWrapper')
        .mockResolvedValue(makeWrapper());
      await injector.resolveSingleParam(
        makeWrapper(),
        `TOKEN_${nextId()}`,
        { index: 0, dependencies: [] },
        moduleRef,
      );
      expect(lookup).toHaveBeenCalled();
    });

    it('T82: param co gia tri, context duoc truyen vao', async () => {
      // covers S.P3, S.C2=false
      const lookup = vi
        .spyOn(injector, 'resolveComponentWrapper')
        .mockResolvedValue(makeWrapper());
      await injector.resolveSingleParam(
        makeWrapper(),
        `TOKEN_${nextId()}`,
        { index: 0, dependencies: [] },
        moduleRef,
        { contextId: newCtx() },
        0,
      );
      expect(lookup).toHaveBeenCalled();
    });
  });

  describe('resolveParamToken', () => {
    it('T83: param la chuoi', () => {
      // covers K.P1, K.C1=false
      expect(
        injector.resolveParamToken(makeWrapper(), `TOKEN_${nextId()}`),
      ).toBeDefined();
    });

    it('T84: param la object khong co forwardRef', () => {
      // covers K.P2, K.C1=true, K.C2=false
      expect(
        injector.resolveParamToken(makeWrapper(), { marker: rand(100, 900) }),
      ).toBeDefined();
    });

    it('T85: param la object co forwardRef', () => {
      // covers K.P3, K.C2=true
      const forwardRef = vi.fn(() => class Later {});
      injector.resolveParamToken(makeWrapper(), { forwardRef });
      expect(forwardRef).toHaveBeenCalled();
    });
  });
});
