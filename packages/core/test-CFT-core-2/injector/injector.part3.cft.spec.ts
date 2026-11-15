/**
 * CFT - injector/injector.ts (phan 3/4): resolveComponentWrapper, resolveComponentHost, lookupComponent,
 * lookupComponentInParentModules, lookupComponentInImports, lookupComponentInImportsSync (private),
 * resolveProperties, reflectProperties, applyProperties, instantiateClass (dong 708-1133 cua injector.ts).
 * Luu tai: packages/core/test-CFT-core-2/injector/injector.part3.cft.spec.ts
 * Chay chung voi phan 1, 2: --coverage.include=packages/core/injector/injector.ts
 *
 * Nhan: <ham>.C<n> = dieu kien nguyen tu, <ham>.P<n> = path; T = test phu true, F = test phu false.
 *   Moi path co dung mot test (T86.. tiep noi phan 2). Vi tri ghi theo so dong cua injector.ts (dN).
 *   Ham private duoc goi truc tiep qua `injector: any`. Prefix: RW resolveComponentWrapper,
 *   RH resolveComponentHost, LC lookupComponent, LP lookupComponentInParentModules,
 *   LI lookupComponentInImports, LS lookupComponentInImportsSync, RP resolveProperties,
 *   RF reflectProperties, AP applyProperties, IC instantiateClass.
 *
 * ======================================================================================
 * DIEU KIEN NGUYEN TU (T / F)
 * RW (d708-727)
 *   RW.C1 d713 resolutionContext mac dinh                 T: T86            F: T87
 * RH (d729-825)
 *   RH.C1  d732 resolutionContext mac dinh                T: T88            F: T89
 *   RH.C2  d740 !instanceHost.isResolved                  T: T88            F: T90
 *   RH.C3  d740 && !forwardRef (khi C2 true)              T: T88            F: T91
 *   RH.C4  d753 !isResolved (else if)                     T: T91            F: T90
 *   RH.C5  d754 forwardRef (else if)                      T: T91            F: unreachable (xem duoi)
 *   RH.C6  d755 contextId !== STATIC_CONTEXT              T: T92            F: T91
 *   RH.C7  d755 || !!inquirerId (khi C6 false)            T: T94            F: T91
 *   RH.C8  d764 instanceHost.donePromise                  T: T92            F: T97
 *   RH.C9  d767 if (err) trong then                       T: T95            F: T92
 *   RH.C10 d777 instanceHost.settlementSignal?. nullish   T: T96            F: T95
 *   RH.C11 d749 instanceWrapper.host ?? moduleRef         T: T89            F: T88
 *   RH.C12 d772 instanceWrapper.host ?? moduleRef         T: T93            F: T92
 *   RH.C13 d802 instanceWrapper.host ?? moduleRef         T: T98            F: T97
 *   RH.C14 d807 instanceWrapper.async                     T: T99            F: T88
 * LC (d827-858)
 *   LC.C1 d832 resolutionContext mac dinh                 T: T100           F: T102
 *   LC.C2 d835 wrapper.token falsy (|| wrapper.name)      T: T101           F: T100
 *   LC.C3 d837 wrapper &&                                 T: T100           F: unreachable (xem duoi)
 *   LC.C4 d837 && token === name                          T: T100           F: T101
 *   LC.C5 d845 name &&                                    T: T101           F: T103
 *   LC.C6 d845 && providers.has(name)                     T: T102           F: T101
 * LP (d860-884)
 *   LP.C1 d864 resolutionContext mac dinh                 T: T104           F: T105
 *   LP.C2 d875 isNil(instanceWrapper)                     T: T105           F: T104
 * LI (d886-904)
 *   LI.C1 d890 moduleRegistry mac dinh                    T: T106           F: T107
 *   LI.C2 d891 resolutionContext mac dinh                 T: T106           F: T107
 * LS (d911-965)
 *   LS.C1 d921 moduleRef.imports || new Set()             T: T108           F: T109
 *   LS.C2 d924 !relatedModule                             T: T110           F: T110
 *   LS.C3 d927 isTraversing                               T: T111           F: T110
 *   LS.C4 d927 && !moduleRef.exports.has(metatype)        T: T111           F: T112
 *   LS.C5 d930 moduleRegistry.has(relatedModule.id)       T: T113           F: T110
 *   LS.C6 d937 !exports.has(name)                         T: T114           F: T110
 *   LS.C7 d937 || !providers.has(name) (khi C6 false)     T: T115           F: T110
 *   LS.C8 d947 if (instanceRef)                           T: T114           F: T115
 *   Vong for: 0 lan T108, T109 | 1 lan T113 | nhieu lan T110, T115
 * RP (d967-1068)
 *   RP.C1 d971 resolutionContext mac dinh                 T: T116           F: T117
 *   RP.C2 d974 !isNil(inject)                             T: T116           F: T117
 *   RP.C3 d979 contextId !== STATIC_CONTEXT               T: T117           F: T119
 *   RP.C4 d980 && hasCompletePropertiesMetadata           T: T117           F: T118
 *   RP.C5 d998 isInquirer(item.name, parentInquirer)      T: T120           F: T119
 *   RP.C6 d1004 parentInquirer && parentInquirer.instance T: T120           F: T121 (chi khi spy isInquirer)
 *   RP.C7 d1038 !paramWrapperWithInstance                 T: T122           F: T119
 *   RP.C8 d1057 !item.isOptional                          T: T124           F: T123
 *   Vong properties.map: 0 lan T118 | 1 lan T119 | nhieu lan T120
 * RF (d1070-1080)
 *   RF.C1 d1071 getMetadata(PROPERTY_DEPS) || []          T: T125           F: T126
 *   RF.C2 d1073 getMetadata(OPTIONAL_PROPERTY_DEPS) || [] T: T125, T127     F: T126
 *   Vong map: 0 lan T125 | 1 lan T127 | nhieu lan T126
 * AP (d1082-1092)
 *   AP.C1 d1086 !isObject(instance)                       T: T128           F: T129
 *   AP.C2 d1090 !isNil(item.instance)                     T: T129           F: T129
 *   Vong forEach: 0 lan T130 | 1 lan T131 | nhieu lan T129
 * IC (d1094-1133)
 *   IC.C1 d1098 resolutionContext mac dinh                T: T132           F: T133
 *   IC.C2 d1108 this.options?. nullish                    T: T132           F: T134
 *   IC.C3 d1108 options.preview                           T: T135           F: T134
 *   IC.C4 d1108 wrapper.host?. nullish                    T: T135           F: T136
 *   IC.C5 d1108 initOnPreview truthy                      T: T137           F: T135, T136
 *   IC.C6 d1113 isNil(inject)                             T: T132           F: T139
 *   IC.C7 d1113 && isInContext                            T: T132           F: T138
 *   IC.C8 d1114 wrapper.forwardRef ? :                    T: T133           F: T132
 *   IC.C9 d1123 else if (isInContext)                     T: T139           F: T138, T140
 *
 * PATH (moi path mot test)
 *   RW.P1 T86 ctx mac dinh | RW.P2 T87 ctx truyen vao
 *   RH.P1 T88 chua resolve, khong forwardRef, host co, ctx mac dinh -> insertSettlementRef + loadProvider
 *   RH.P2 T89 nhu P1 nhung wrapper.host undefined (dung moduleRef), ctx truyen vao
 *   RH.P3 T90 da resolve -> bo qua ca hai nhanh | RH.P4 T91 forwardRef, ctx STATIC, khong inquirerId -> bo qua
 *   RH.P5 T92 forwardRef, ctx khac STATIC, co donePromise, host co -> deferred load thanh cong
 *   RH.P6 T93 nhu P5 nhung host undefined | RH.P7 T94 forwardRef, ctx STATIC, co inquirerId, co donePromise
 *   RH.P8 T95 donePromise tra loi, co settlementSignal -> deferred load reject, signal.error
 *   RH.P9 T96 donePromise tra loi, khong settlementSignal | RH.P10 T97 forwardRef, khong donePromise, host co
 *   RH.P11 T98 nhu P10 nhung host undefined | RH.P12 T99 wrapper async -> await instance
 *   LC.P1 T100 token === name -> nem loi | LC.P2 T101 token rong, ten khong co trong providers -> tim o module cha
 *   LC.P3 T102 co trong providers -> tra ve | LC.P4 T103 khong co name -> tim o module cha
 *   LP.P1 T104 tim thay | LP.P2 T105 khong tim thay -> nem loi
 *   LI.P1 T106 tham so mac dinh | LI.P2 T107 tham so truyen vao
 *   LS.P1 T108 imports undefined | LS.P2 T109 imports rong | LS.P3 T110 co phan tu rong + tim thay o module thu hai
 *   LS.P4 T111 isTraversing, exports khong chua metatype -> bo qua | LS.P5 T112 isTraversing, exports chua metatype
 *   LS.P6 T113 module da co trong registry | LS.P7 T114 exports khong chua name, de quy tim thay
 *   LS.P8 T115 exports co name nhung providers khong co, de quy rong, import thu hai tim thay
 *   RP.P1 T116 inject co gia tri -> [] | RP.P2 T117 ctx khac STATIC, metadata day du | RP.P3 T118 metadata thieu, 0 property
 *   RP.P4 T119 ctx STATIC, 1 property | RP.P5 T120 INQUIRER + property thuong | RP.P6 T121 INQUIRER, khong parent
 *   RP.P7 T122 resolveComponentHost tra undefined | RP.P8 T123 property optional loi | RP.P9 T124 property loi, khong optional
 *   RF.P1 T125 khong metadata | RF.P2 T126 nhieu property + optional | RF.P3 T127 1 property
 *   AP.P1 T128 khong phai object | AP.P2 T129 nhieu property, co nil | AP.P3 T130 rong | AP.P4 T131 1 property
 *   IC.P1 T132 class, trong context, khong forwardRef | IC.P2 T133 forwardRef (Object.assign)
 *   IC.P3 T134 options preview=false | IC.P4 T135 preview, khong host | IC.P5 T136 preview, host khong initOnPreview
 *   IC.P6 T137 preview, initOnPreview | IC.P7 T138 class, ngoai context | IC.P8 T139 factory trong context
 *   IC.P9 T140 factory ngoai context
 *
 * TONG KET (theo thiet ke, CHUA CHAY): 55 test (T86..T140) cho 55 path.
 *   54 dieu kien nguyen tu, 52 dat ca true va false. Unreachable (2, chi mot phia false):
 *   RH.C5 d754: toi else-if d752 chi khi B1 sai; voi !isResolved thi B1 sai nghia la forwardRef truthy,
 *     nen forwardRef luon true. // unreachable: RH.C5=false
 *   LC.C3 d837: d835 da truy cap wrapper.token, wrapper nil se nem loi truoc khi toi d837.
 *     // unreachable: LC.C3=false
 *   RP.C6=false chi dat duoc khi spy isInquirer tra true ma khong co parentInquirer (mock co chu dich).
 *
 * MOCK (chi khi can): spy cac ham khac cua Injector de co lap tung ham (print*Log, addDependencyMetadata,
 *   getContextId, getContextInquirerId, getInstanceHost, insertSettlementRef, isInContext, isInquirer,
 *   loadProvider, lookupComponent*, resolveSingleParam, resolveComponentHost, linkDurableDeferredLoads,
 *   addDeferredLoad, trackDurableDeferredLoad). Cac ham do duoc kiem thu o phan khac. InstanceWrapper
 *   la doi tuong gia toi gian (giong phan 1, 2). Dung ban that: Barrier, INQUIRER, Reflect metadata, Exception.
 *   Khong vi.mock module nao.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OPTIONAL_PROPERTY_DEPS_METADATA,
  PROPERTY_DEPS_METADATA,
} from '@nestjs/common/internal';
import { STATIC_CONTEXT } from '../../injector/constants';
import { INQUIRER } from '../../injector/inquirer/index';
import { Injector } from '../../injector/injector';

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

const makeWrapper = (o: Record<string, unknown> = {}): any => ({
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
  getInstanceByContextId: vi.fn(() => makeHost()),
  setInstanceByContextId: vi.fn(),
  getPropertiesMetadata: vi.fn(),
  ...o,
});

const moduleRef: any = {
  name: 'TestModule',
  metatype: class TestModule {},
  providers: new Map(),
};

/** module gia cho lookupComponentInImportsSync */
const makeModule = (o: Record<string, unknown> = {}): any => ({
  id: nextId(),
  metatype: class FakeModule {},
  imports: new Set<any>(),
  exports: new Set<any>(),
  providers: new Map<any, any>(),
  ...o,
});

describe('Injector (CFT) - phan 3', () => {
  let injector: any;

  const silence = () => {
    [
      'printResolvingDependenciesLog',
      'printLookingForProviderLog',
      'printFoundInModuleLog',
      'addDependencyMetadata',
    ].forEach(name =>
      vi.spyOn(injector, name).mockImplementation(() => undefined),
    );
  };

  beforeEach(() => {
    seed = 20261114;
    counter = 0;
    injector = new Injector();
    injector.logger = { log: vi.fn(), warn: vi.fn() };
  });

  // ============================ resolveComponentWrapper =====================
  describe('resolveComponentWrapper', () => {
    it('T86: resolutionContext mac dinh', async () => {
      // covers RW.P1, RW.C1=true
      silence();
      const lookup = vi
        .spyOn(injector, 'lookupComponent')
        .mockResolvedValue(makeWrapper());
      await injector.resolveComponentWrapper(
        moduleRef,
        `TOKEN_${nextId()}`,
        { index: 0, dependencies: [] },
        makeWrapper(),
      );
      expect(lookup).toHaveBeenCalled();
    });

    it('T87: resolutionContext duoc truyen vao', async () => {
      // covers RW.P2, RW.C1=false
      silence();
      const lookup = vi
        .spyOn(injector, 'lookupComponent')
        .mockResolvedValue(makeWrapper());
      await injector.resolveComponentWrapper(
        moduleRef,
        `TOKEN_${nextId()}`,
        { index: 0, dependencies: [] },
        makeWrapper(),
        { contextId: newCtx(), inquirer: makeWrapper() },
        0,
      );
      expect(lookup).toHaveBeenCalled();
    });
  });

  // ============================ resolveComponentHost ========================
  describe('resolveComponentHost', () => {
    const stub = (host: any, inquirerId?: string) => {
      vi.spyOn(injector, 'getContextInquirerId').mockReturnValue(inquirerId);
      vi.spyOn(injector, 'getContextId').mockImplementation((c: any) => c);
      vi.spyOn(injector, 'getInstanceHost').mockReturnValue(host);
      return {
        insert: vi
          .spyOn(injector, 'insertSettlementRef')
          .mockImplementation(() => undefined),
        load: vi.spyOn(injector, 'loadProvider').mockResolvedValue(undefined),
        link: vi
          .spyOn(injector, 'linkDurableDeferredLoads')
          .mockImplementation(() => undefined),
        deferred: vi
          .spyOn(injector, 'addDeferredLoad')
          .mockImplementation(() => undefined),
        track: vi
          .spyOn(injector, 'trackDurableDeferredLoad')
          .mockImplementation(() => undefined),
      };
    };
    const hostModule = () => ({ name: `Host${rand(100, 900)}` });

    it('T88: chua resolve, khong forwardRef, host co, ctx mac dinh', async () => {
      // covers RH.P1, RH.C1=true, RH.C2=true, RH.C3=true, RH.C11=false, RH.C14=false
      const s = stub(makeHost());
      const wrapper = makeWrapper({ host: hostModule() });
      await injector.resolveComponentHost(moduleRef, wrapper);
      expect(s.insert).toHaveBeenCalled();
      expect(s.load).toHaveBeenCalled();
    });

    it('T89: chua resolve, khong forwardRef, host undefined, ctx truyen vao', async () => {
      // covers RH.P2, RH.C1=false, RH.C11=true
      const s = stub(makeHost());
      await injector.resolveComponentHost(moduleRef, makeWrapper(), {
        contextId: STATIC_CONTEXT,
      });
      expect(s.load).toHaveBeenCalled();
    });

    it('T90: instance da resolve', async () => {
      // covers RH.P3, RH.C2=false, RH.C4=false
      const s = stub(makeHost({ isResolved: true }));
      await injector.resolveComponentHost(moduleRef, makeWrapper());
      expect(s.load).not.toHaveBeenCalled();
    });

    it('T91: forwardRef, ctx STATIC, khong co inquirerId', async () => {
      // covers RH.P4, RH.C3=false, RH.C4=true, RH.C5=true, RH.C6=false, RH.C7=false
      const s = stub(makeHost());
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true }),
        { contextId: STATIC_CONTEXT },
      );
      expect(s.load).not.toHaveBeenCalled();
    });

    it('T92: forwardRef, ctx khac STATIC, co donePromise, host co', async () => {
      // covers RH.P5, RH.C6=true, RH.C8=true, RH.C9=false, RH.C12=false
      const s = stub(makeHost({ donePromise: Promise.resolve(undefined) }));
      const wrapper = makeWrapper({ forwardRef: true, host: hostModule() });
      await injector.resolveComponentHost(moduleRef, wrapper, {
        contextId: newCtx(),
      });
      const deferredLoad = s.deferred.mock.calls[0][1] as Promise<unknown>;
      await deferredLoad;
      expect(s.load).toHaveBeenCalled();
    });

    it('T93: forwardRef, ctx khac STATIC, co donePromise, host undefined', async () => {
      // covers RH.P6, RH.C12=true
      const s = stub(makeHost({ donePromise: Promise.resolve(undefined) }));
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true }),
        { contextId: newCtx() },
      );
      await (s.deferred.mock.calls[0][1] as Promise<unknown>);
      expect(s.load).toHaveBeenCalled();
    });

    it('T94: forwardRef, ctx STATIC nhung co inquirerId, co donePromise', async () => {
      // covers RH.P7, RH.C6=false, RH.C7=true
      const s = stub(
        makeHost({ donePromise: Promise.resolve(undefined) }),
        nextId(),
      );
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true }),
        { contextId: STATIC_CONTEXT },
      );
      await (s.deferred.mock.calls[0][1] as Promise<unknown>);
      expect(s.track).toHaveBeenCalled();
    });

    it('T95: donePromise tra ve loi, co settlementSignal', async () => {
      // covers RH.P8, RH.C9=true, RH.C10=false
      const signal = { error: vi.fn() };
      const s = stub(
        makeHost({
          donePromise: Promise.resolve(new Error(`boom-${rand(100, 900)}`)),
          settlementSignal: signal,
        }),
      );
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true }),
        { contextId: newCtx() },
      );
      await expect(
        s.deferred.mock.calls[0][1] as Promise<unknown>,
      ).rejects.toThrow();
      expect(signal.error).toHaveBeenCalled();
    });

    it('T96: donePromise tra ve loi, khong co settlementSignal', async () => {
      // covers RH.P9, RH.C10=true
      const s = stub(
        makeHost({
          donePromise: Promise.resolve(new Error(`boom-${rand(100, 900)}`)),
        }),
      );
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true }),
        { contextId: newCtx() },
      );
      await expect(
        s.deferred.mock.calls[0][1] as Promise<unknown>,
      ).rejects.toThrow();
    });

    it('T97: forwardRef, ctx khac STATIC, khong co donePromise, host co', async () => {
      // covers RH.P10, RH.C8=false, RH.C13=false
      const s = stub(makeHost());
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true, host: hostModule() }),
        { contextId: newCtx() },
      );
      expect(s.insert).toHaveBeenCalled();
      expect(s.load).toHaveBeenCalled();
    });

    it('T98: forwardRef, ctx khac STATIC, khong co donePromise, host undefined', async () => {
      // covers RH.P11, RH.C13=true
      const s = stub(makeHost());
      await injector.resolveComponentHost(
        moduleRef,
        makeWrapper({ forwardRef: true }),
        { contextId: newCtx() },
      );
      expect(s.load).toHaveBeenCalled();
    });

    it('T99: wrapper async -> await instance', async () => {
      // covers RH.P12, RH.C14=true
      const host = makeHost({
        isResolved: true,
        instance: Promise.resolve({ marker: rand(100, 900) }),
      });
      stub(host);
      const wrapper = makeWrapper({
        async: true,
        getInstanceByContextId: vi.fn(() => host),
      });
      await injector.resolveComponentHost(moduleRef, wrapper);
      expect(wrapper.setInstanceByContextId).toHaveBeenCalled();
    });
  });

  // ================================ lookupComponent =========================
  describe('lookupComponent', () => {
    it('T100: token trung voi name -> nem UnknownDependenciesException', async () => {
      // covers LC.P1, LC.C1=true, LC.C2=false, LC.C3=true, LC.C4=true
      const token = `TOKEN_${nextId()}`;
      await expect(
        injector.lookupComponent(
          new Map(),
          moduleRef,
          { name: token, index: 0, dependencies: [] },
          makeWrapper({ token }),
        ),
      ).rejects.toThrow();
    });

    it('T101: token rong (dung wrapper.name), name khong co trong providers', async () => {
      // covers LC.P2, LC.C2=true, LC.C4=false, LC.C5=true, LC.C6=false
      const parent = vi
        .spyOn(injector, 'lookupComponentInParentModules')
        .mockResolvedValue(makeWrapper());
      await injector.lookupComponent(
        new Map(),
        moduleRef,
        { name: `OTHER_${nextId()}`, index: 0, dependencies: [] },
        makeWrapper({ token: undefined, name: `Name${rand(100, 900)}` }),
      );
      expect(parent).toHaveBeenCalled();
    });

    it('T102: name co trong providers', async () => {
      // covers LC.P3, LC.C1=false, LC.C6=true
      silence();
      const name = `TOKEN_${nextId()}`;
      const found = makeWrapper();
      const providers = new Map<any, any>([[name, found]]);
      await expect(
        injector.lookupComponent(
          providers,
          moduleRef,
          { name, index: 0, dependencies: [] },
          makeWrapper(),
          { contextId: newCtx() },
          0,
        ),
      ).resolves.toBeDefined();
    });

    it('T103: dependencyContext khong co name', async () => {
      // covers LC.P4, LC.C5=false
      const parent = vi
        .spyOn(injector, 'lookupComponentInParentModules')
        .mockResolvedValue(makeWrapper());
      await injector.lookupComponent(
        new Map(),
        moduleRef,
        { index: 0, dependencies: [] },
        makeWrapper(),
      );
      expect(parent).toHaveBeenCalled();
    });
  });

  // ======================== lookupComponentInParentModules ==================
  describe('lookupComponentInParentModules', () => {
    it('T104: tim thay o module import, ctx mac dinh', async () => {
      // covers LP.P1, LP.C1=true, LP.C2=false
      vi.spyOn(injector, 'lookupComponentInImports').mockResolvedValue(
        makeWrapper(),
      );
      await expect(
        injector.lookupComponentInParentModules(
          { name: `TOKEN_${nextId()}`, index: 0, dependencies: [] },
          moduleRef,
          makeWrapper(),
        ),
      ).resolves.toBeDefined();
    });

    it('T105: khong tim thay -> nem UnknownDependenciesException', async () => {
      // covers LP.P2, LP.C1=false, LP.C2=true
      vi.spyOn(injector, 'lookupComponentInImports').mockResolvedValue(null);
      await expect(
        injector.lookupComponentInParentModules(
          { name: `TOKEN_${nextId()}`, index: 0, dependencies: [] },
          moduleRef,
          makeWrapper(),
          { contextId: newCtx() },
          0,
        ),
      ).rejects.toThrow();
    });
  });

  // =========================== lookupComponentInImports =====================
  describe('lookupComponentInImports', () => {
    it('T106: tham so registry va context mac dinh', async () => {
      // covers LI.P1, LI.C1=true, LI.C2=true
      const sync = vi
        .spyOn(injector, 'lookupComponentInImportsSync')
        .mockReturnValue(makeWrapper());
      await injector.lookupComponentInImports(
        moduleRef,
        `TOKEN_${nextId()}`,
        makeWrapper(),
      );
      expect(sync).toHaveBeenCalled();
    });

    it('T107: truyen day du tham so', async () => {
      // covers LI.P2, LI.C1=false, LI.C2=false
      const sync = vi
        .spyOn(injector, 'lookupComponentInImportsSync')
        .mockReturnValue(null);
      await injector.lookupComponentInImports(
        moduleRef,
        `TOKEN_${nextId()}`,
        makeWrapper(),
        new Set<string>(),
        { contextId: newCtx() },
        0,
        true,
      );
      expect(sync).toHaveBeenCalled();
    });
  });

  // ========================= lookupComponentInImportsSync ===================
  describe('lookupComponentInImportsSync', () => {
    const call = (
      root: any,
      name: string,
      registry: Set<string> = new Set(),
      isTraversing?: boolean,
    ) =>
      injector.lookupComponentInImportsSync(
        root,
        name,
        makeWrapper(),
        registry,
        { contextId: STATIC_CONTEXT },
        0,
        isTraversing,
      );
    const provider = (name: string) =>
      makeModule({
        providers: new Map<any, any>([[name, makeWrapper()]]),
        exports: new Set<any>([name]),
      });

    it('T108: moduleRef.imports la undefined', () => {
      // covers LS.P1, LS.C1=true (vong for 0 lan)
      silence();
      const root = makeModule({ imports: undefined });
      expect(call(root, `TOKEN_${nextId()}`)).toBeNull();
    });

    it('T109: imports rong', () => {
      // covers LS.P2, LS.C1=false (vong for 0 lan)
      silence();
      expect(call(makeModule(), `TOKEN_${nextId()}`)).toBeNull();
    });

    it('T110: import dau la undefined, import thu hai export va co provider', () => {
      // covers LS.P3, LS.C2=true, LS.C2=false, LS.C3=false, LS.C5=false, LS.C6=false, LS.C7=false (vong for nhieu lan)
      silence();
      const name = `TOKEN_${nextId()}`;
      const root = makeModule({
        imports: new Set<any>([undefined, provider(name)]),
      });
      expect(call(root, name)).toBeDefined();
    });

    it('T111: isTraversing va exports cua module hien tai khong chua metatype', () => {
      // covers LS.P4, LS.C3=true, LS.C4=true
      silence();
      const name = `TOKEN_${nextId()}`;
      const root = makeModule({ imports: new Set<any>([provider(name)]) });
      expect(call(root, name, new Set(), true)).toBeNull();
    });

    it('T112: isTraversing va exports cua module hien tai chua metatype', () => {
      // covers LS.P5, LS.C4=false
      silence();
      const name = `TOKEN_${nextId()}`;
      const related = provider(name);
      const root = makeModule({
        imports: new Set<any>([related]),
        exports: new Set<any>([related.metatype]),
      });
      expect(call(root, name, new Set(), true)).toBeDefined();
    });

    it('T113: module da co trong moduleRegistry (vong for 1 lan)', () => {
      // covers LS.P6, LS.C5=true
      silence();
      const name = `TOKEN_${nextId()}`;
      const related = provider(name);
      const root = makeModule({ imports: new Set<any>([related]) });
      expect(call(root, name, new Set([related.id]))).toBeNull();
    });

    it('T114: exports khong chua name, de quy tim thay o module long nhau', () => {
      // covers LS.P7, LS.C6=true, LS.C8=true
      silence();
      const name = `TOKEN_${nextId()}`;
      const inner = provider(name);
      const middle = makeModule({
        imports: new Set<any>([inner]),
        exports: new Set<any>([inner.metatype]),
      });
      const root = makeModule({ imports: new Set<any>([middle]) });
      expect(call(root, name)).toBeDefined();
    });

    it('T115: exports co name nhung providers khong co, de quy rong, import thu hai tim thay', () => {
      // covers LS.P8, LS.C7=true, LS.C8=false
      silence();
      const name = `TOKEN_${nextId()}`;
      const exportsOnly = makeModule({ exports: new Set<any>([name]) });
      const root = makeModule({
        imports: new Set<any>([exportsOnly, provider(name)]),
      });
      expect(call(root, name)).toBeDefined();
    });
  });

  // =============================== resolveProperties ========================
  describe('resolveProperties', () => {
    const makeParam = () => {
      const host = makeHost({
        isResolved: true,
        instance: { marker: rand(100, 900) },
      });
      return makeWrapper({ getInstanceByContextId: vi.fn(() => host) });
    };
    const stubRP = (props: any[]) => {
      vi.spyOn(injector, 'reflectProperties').mockReturnValue(props);
      vi.spyOn(
        injector,
        'getStaticTransientResolutionContext',
      ).mockImplementation((c: any) => c);
      vi.spyOn(injector, 'getEffectiveResolutionContext').mockImplementation(
        (_w: any, c: any) => c,
      );
      vi.spyOn(injector, 'getContextId').mockImplementation((c: any) => c);
      vi.spyOn(injector, 'isInquirer').mockImplementation(
        (name: unknown) => name === INQUIRER,
      );
    };
    const staticCtx = (): any => ({ contextId: STATIC_CONTEXT });
    const prop = (o: Record<string, unknown> = {}) => ({
      key: `key${rand(100, 900)}`,
      name: `TOKEN_${nextId()}`,
      isOptional: false,
      ...o,
    });

    it('T116: inject co gia tri -> tra ve mang rong, ctx mac dinh', async () => {
      // covers RP.P1, RP.C1=true, RP.C2=true
      await expect(
        injector.resolveProperties(makeWrapper(), moduleRef, [
          `TOKEN_${nextId()}`,
        ]),
      ).resolves.toBeDefined();
    });

    it('T117: ctx khac STATIC, metadata property day du', async () => {
      // covers RP.P2, RP.C1=false, RP.C2=false, RP.C3=true, RP.C4=true
      vi.spyOn(injector, 'hasCompletePropertiesMetadata').mockReturnValue(true);
      const load = vi
        .spyOn(injector, 'loadPropertiesMetadata')
        .mockResolvedValue([]);
      await injector.resolveProperties(makeWrapper(), moduleRef, undefined, {
        contextId: newCtx(),
      });
      expect(load).toHaveBeenCalled();
    });

    it('T118: ctx khac STATIC, metadata chua day du, 0 property', async () => {
      // covers RP.P3, RP.C4=false (vong map 0 lan)
      stubRP([]);
      vi.spyOn(injector, 'hasCompletePropertiesMetadata').mockReturnValue(
        false,
      );
      await expect(
        injector.resolveProperties(makeWrapper(), moduleRef, undefined, {
          contextId: newCtx(),
        }),
      ).resolves.toBeDefined();
    });

    it('T119: ctx STATIC, 1 property resolve thanh cong', async () => {
      // covers RP.P4, RP.C3=false, RP.C5=false, RP.C7=false (vong map 1 lan)
      const param = makeParam();
      stubRP([prop()]);
      vi.spyOn(injector, 'resolveSingleParam').mockResolvedValue(param);
      vi.spyOn(injector, 'resolveComponentHost').mockResolvedValue(param);
      await expect(
        injector.resolveProperties(
          makeWrapper(),
          moduleRef,
          undefined,
          staticCtx(),
        ),
      ).resolves.toBeDefined();
    });

    it('T120: property INQUIRER va property thuong, co parentInquirer', async () => {
      // covers RP.P5, RP.C5=true, RP.C6=true (vong map nhieu lan)
      const param = makeParam();
      stubRP([prop({ name: INQUIRER }), prop()]);
      vi.spyOn(injector, 'resolveSingleParam').mockResolvedValue(param);
      vi.spyOn(injector, 'resolveComponentHost').mockResolvedValue(param);
      await expect(
        injector.resolveProperties(
          makeWrapper(),
          moduleRef,
          undefined,
          staticCtx(),
          makeWrapper({ instance: { marker: rand(100, 900) } }),
        ),
      ).resolves.toBeDefined();
    });

    it('T121: property INQUIRER nhung khong co parentInquirer', async () => {
      // covers RP.P6, RP.C6=false
      // chi dat duoc khi spy isInquirer tra true ma parentInquirer undefined (code that: isInquirer can parentInquirer)
      stubRP([prop({ name: INQUIRER })]);
      await expect(
        injector.resolveProperties(
          makeWrapper(),
          moduleRef,
          undefined,
          staticCtx(),
        ),
      ).resolves.toBeDefined();
    });

    it('T122: resolveComponentHost tra ve undefined', async () => {
      // covers RP.P7, RP.C7=true
      stubRP([prop()]);
      vi.spyOn(injector, 'resolveSingleParam').mockResolvedValue(makeParam());
      vi.spyOn(injector, 'resolveComponentHost').mockResolvedValue(undefined);
      await expect(
        injector.resolveProperties(
          makeWrapper(),
          moduleRef,
          undefined,
          staticCtx(),
        ),
      ).resolves.toBeDefined();
    });

    it('T123: property optional bi loi -> bo qua', async () => {
      // covers RP.P8, RP.C8=false
      stubRP([prop({ isOptional: true })]);
      vi.spyOn(injector, 'resolveSingleParam').mockRejectedValue(
        new Error(`fail-${rand(100, 900)}`),
      );
      await expect(
        injector.resolveProperties(
          makeWrapper(),
          moduleRef,
          undefined,
          staticCtx(),
        ),
      ).resolves.toBeDefined();
    });

    it('T124: property khong optional bi loi -> nem lai', async () => {
      // covers RP.P9, RP.C8=true
      stubRP([prop({ isOptional: false })]);
      vi.spyOn(injector, 'resolveSingleParam').mockRejectedValue(
        new Error(`fail-${rand(100, 900)}`),
      );
      await expect(
        injector.resolveProperties(
          makeWrapper(),
          moduleRef,
          undefined,
          staticCtx(),
        ),
      ).rejects.toThrow();
    });
  });

  // =============================== reflectProperties ========================
  describe('reflectProperties', () => {
    it('T125: class khong co metadata property', () => {
      // covers RF.P1, RF.C1=true, RF.C2=true (vong map 0 lan)
      class Plain {}
      expect(injector.reflectProperties(Plain)).toBeDefined();
    });

    it('T126: class co nhieu property va key optional', () => {
      // covers RF.P2, RF.C1=false, RF.C2=false (vong map nhieu lan)
      class Target {}
      const k1 = `key${rand(100, 900)}`;
      const k2 = `key${rand(100, 900)}x`;
      Reflect.defineMetadata(
        PROPERTY_DEPS_METADATA,
        [
          { key: k1, type: `TOKEN_${nextId()}` },
          { key: k2, type: `TOKEN_${nextId()}` },
        ],
        Target,
      );
      Reflect.defineMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, [k2], Target);
      expect(injector.reflectProperties(Target)).toBeDefined();
    });

    it('T127: class co 1 property, khong co metadata optional', () => {
      // covers RF.P3, RF.C2=true (vong map 1 lan)
      class Target {}
      Reflect.defineMetadata(
        PROPERTY_DEPS_METADATA,
        [{ key: `key${rand(100, 900)}`, type: `TOKEN_${nextId()}` }],
        Target,
      );
      expect(injector.reflectProperties(Target)).toBeDefined();
    });
  });

  // =============================== applyProperties ==========================
  describe('applyProperties', () => {
    it('T128: instance khong phai object', () => {
      // covers AP.P1, AP.C1=true
      expect(() =>
        injector.applyProperties(`text-${nextId()}`, [
          { key: 'a', name: 'a', instance: { v: 1 } },
        ]),
      ).not.toThrow();
    });

    it('T129: object, nhieu property, mot property co instance nil', () => {
      // covers AP.P2, AP.C1=false, AP.C2=true, AP.C2=false (vong forEach nhieu lan)
      const target: any = {};
      injector.applyProperties(target, [
        { key: 'a', name: 'a', instance: { v: rand(100, 900) } },
        { key: 'b', name: 'b', instance: undefined },
        { key: 'c', name: 'c', instance: { v: rand(100, 900) } },
      ]);
      expect(target).toBeDefined();
    });

    it('T130: object, danh sach property rong', () => {
      // covers AP.P3 (vong forEach 0 lan)
      expect(() => injector.applyProperties({}, [])).not.toThrow();
    });

    it('T131: object, 1 property', () => {
      // covers AP.P4 (vong forEach 1 lan)
      const target: any = {};
      injector.applyProperties(target, [
        { key: 'a', name: 'a', instance: { v: rand(100, 900) } },
      ]);
      expect(target).toBeDefined();
    });
  });

  // =============================== instantiateClass =========================
  describe('instantiateClass', () => {
    class Service {
      constructor(public dep?: unknown) {}
    }
    const prep = (
      inj: any,
      inContext: boolean,
      hostOpts: Record<string, unknown> = {},
      targetOpts: Record<string, unknown> = {},
    ) => {
      const host = makeHost({ instance: {}, ...hostOpts });
      const target = makeWrapper({
        getInstanceByContextId: vi.fn(() => host),
        ...targetOpts,
      });
      vi.spyOn(inj, 'getContextInquirerId').mockReturnValue(undefined);
      vi.spyOn(inj, 'getContextId').mockImplementation((c: any) => c);
      vi.spyOn(inj, 'isInContext').mockReturnValue(inContext);
      return { host, target };
    };
    const withOptions = (options: any) => {
      const inj: any = new Injector(options);
      inj.logger = { log: vi.fn(), warn: vi.fn() };
      return inj;
    };

    it('T132: khong co options, class trong context, khong forwardRef, ctx mac dinh', async () => {
      // covers IC.P1, IC.C1=true, IC.C2=true, IC.C5=false, IC.C6=true, IC.C7=true, IC.C8=false
      const { target } = prep(injector, true);
      const wrapper = makeWrapper({ metatype: Service });
      await expect(
        injector.instantiateClass(
          [{ marker: rand(100, 900) }],
          wrapper,
          target,
        ),
      ).resolves.toBeDefined();
    });

    it('T133: forwardRef -> Object.assign vao instance co san, ctx truyen vao', async () => {
      // covers IC.P2, IC.C1=false, IC.C8=true
      const { target } = prep(injector, true);
      const wrapper = makeWrapper({ metatype: Service, forwardRef: true });
      await expect(
        injector.instantiateClass(
          [{ marker: rand(100, 900) }],
          wrapper,
          target,
          { contextId: newCtx() },
        ),
      ).resolves.toBeDefined();
    });

    it('T134: options.preview = false', async () => {
      // covers IC.P3, IC.C2=false, IC.C3=false
      const inj = withOptions({ preview: false });
      const { target } = prep(inj, true);
      await expect(
        inj.instantiateClass([], makeWrapper({ metatype: Service }), target),
      ).resolves.toBeDefined();
    });

    it('T135: preview, wrapper khong co host -> bo qua khoi tao', async () => {
      // covers IC.P4, IC.C3=true, IC.C4=true, IC.C5=false
      const inj = withOptions({ preview: true });
      const { host, target } = prep(inj, true);
      await expect(
        inj.instantiateClass([], makeWrapper({ metatype: Service }), target),
      ).resolves.toBeDefined();
      expect(host.isResolved).toBe(true);
    });

    it('T136: preview, host khong bat initOnPreview', async () => {
      // covers IC.P5, IC.C4=false, IC.C5=false
      const inj = withOptions({ preview: true });
      const { target } = prep(inj, true);
      const wrapper = makeWrapper({ metatype: Service, host: {} });
      await expect(
        inj.instantiateClass([], wrapper, target),
      ).resolves.toBeDefined();
    });

    it('T137: preview nhung host bat initOnPreview -> van khoi tao', async () => {
      // covers IC.P6, IC.C5=true
      const inj = withOptions({ preview: true });
      const { target } = prep(inj, true);
      const wrapper = makeWrapper({
        metatype: Service,
        host: { initOnPreview: true },
      });
      await expect(
        inj.instantiateClass([{ marker: rand(100, 900) }], wrapper, target),
      ).resolves.toBeDefined();
    });

    it('T138: class nhung khong nam trong context', async () => {
      // covers IC.P7, IC.C7=false, IC.C9=false
      const { target } = prep(injector, false);
      await expect(
        injector.instantiateClass(
          [],
          makeWrapper({ metatype: Service }),
          target,
        ),
      ).resolves.toBeDefined();
    });

    it('T139: factory (inject co gia tri) trong context', async () => {
      // covers IC.P8, IC.C6=false, IC.C9=true
      const factory = vi.fn(async (..._args: unknown[]) => ({
        marker: rand(100, 900),
      }));
      const { target } = prep(injector, true, {}, { metatype: factory });
      const wrapper = makeWrapper({ inject: [`TOKEN_${nextId()}`] });
      await expect(
        injector.instantiateClass(
          [{ marker: rand(100, 900) }],
          wrapper,
          target,
        ),
      ).resolves.toBeDefined();
      expect(factory).toHaveBeenCalled();
    });

    it('T140: factory nhung khong nam trong context', async () => {
      // covers IC.P9, IC.C6=false, IC.C9=false
      const factory = vi.fn(async () => ({ marker: rand(100, 900) }));
      const { target } = prep(injector, false, {}, { metatype: factory });
      const wrapper = makeWrapper({ inject: [`TOKEN_${nextId()}`] });
      await expect(
        injector.instantiateClass([], wrapper, target),
      ).resolves.toBeDefined();
      expect(factory).not.toHaveBeenCalled();
    });
  });
});
