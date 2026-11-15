/**
 * CFT - injector/injector.ts (phan 4/4): loadPerContext, waitForDeferredLoads, loadEnhancersPerContext,
 * loadEnhancers, loadCtorMetadata, loadPropertiesMetadata, addDeferredLoad, trackDurableDeferredLoad,
 * linkDurableDeferredLoads, forEachDurableDependent, getInstanceHost, insertSettlementRef (+ HostSettlementRef),
 * getInquirerId, createResolutionContext, getContextInquirerId, isInContext, lookupSkippedProviderDependencies,
 * shouldSkipProviderLoading, getEffectiveInquirer(Id), getStaticTransientResolutionContext,
 * getEffectiveResolutionContext, hasDenseCtorMetadata, hasCompletePropertiesMetadata,
 * resolveScopedComponentHost, isInquirerRequest, isInquirer, addDependencyMetadata, getTokenName,
 * print*Log, getContextId, getNowTimestamp, instanceDecorator mac dinh (dong 103-108, 115-117, 1135-1818).
 * Luu tai: packages/core/test-CFT-core-2/injector/injector.part4.cft.spec.ts
 * Chay chung voi phan 1, 2, 3: --coverage.include=packages/core/injector/injector.ts
 *
 * Nhan: <ham>.C<n> = dieu kien nguyen tu, <ham>.P<n> = path (moi path dung mot test, T141.. tiep noi phan 3).
 *   T = test phu true, F = test phu false. Vi tri ghi theo so dong cua injector.ts (dN).
 *   Ham private/protected duoc goi truc tiep qua `injector: any`.
 *   Prefix: LPC loadPerContext, WD waitForDeferredLoads, LEP loadEnhancersPerContext, LE loadEnhancers,
 *   LCM loadCtorMetadata, LPM loadPropertiesMetadata, ADL addDeferredLoad, TD trackDurableDeferredLoad,
 *   LD linkDurableDeferredLoads, FE forEachDurableDependent, GH getInstanceHost, ISR insertSettlementRef,
 *   GI getInquirerId, CRC createResolutionContext, GCI getContextInquirerId, IIC isInContext,
 *   LSP lookupSkippedProviderDependencies, SSP shouldSkipProviderLoading, GEI getEffectiveInquirer,
 *   GEID getEffectiveInquirerId, GSTR getStaticTransientResolutionContext, GERC getEffectiveResolutionContext,
 *   HD hasDenseCtorMetadata, HCP hasCompletePropertiesMetadata, RSH resolveScopedComponentHost,
 *   IIR isInquirerRequest, II isInquirer, ADM addDependencyMetadata, GTN getTokenName,
 *   PRD printResolvingDependenciesLog, PLP printLookingForProviderLog, PFM printFoundInModuleLog,
 *   GCX getContextId, GNT getNowTimestamp, DEF instanceDecorator mac dinh.
 *
 * ======================================================================================
 * DIEU KIEN NGUYEN TU (T / F)
 * LPC (d1135-1167)
 *   LPC.C1 d1142 !wrapper                       T: T141,T142        F: T143,T144,T145
 *   LPC.C2 d1145 collection.get(ctor) nullish   T: T142             F: T141
 *   LPC.C3 d1148 !item.isAlias                  T: T142             F: T142 (item alias)
 *   LPC.C4 d1148 item.instance === instance     T: T142             F: T142 (item khac)
 *   LPC.C5 d1151 collection.get(token) nullish  T: T144             F: T143
 *   LPC.C6 d1166 host &&                        T: T141             F: T145
 *   Vong find: nhieu phan tu (alias, khac, khop) trong T142
 * WD (d1176-1185)
 *   WD.C1 d1177 !deferredLoads                  T: T146             F: T147..T150
 *   Vong for: 0 lan T147 | 1 lan T148 | nhieu lan T149 | await reject T150
 * LEP (d1187-1197)
 *   LEP.C1 d1191 enhancers khong truyen         T: T151,T153        F: T152
 *   LEP.C2 d1191 getEnhancersMetadata() falsy   T: T151             F: T153
 *   LEP.C3 d1193 ctx === STATIC_CONTEXT         T: T151             F: T152,T153
 * LE (d1199-1214): khong co nhanh. Vong map: 0 lan T154 | 1 lan T155 | nhieu lan T156
 * LCM (d1216-1245): vong map/Promise.all 0 lan T157 | 1 lan T158 | nhieu lan T159
 *   LCM.C1 d1240 item?. nullish                 T: T159             F: T158
 * LPM (d1247-1280): vong 0 lan T160 | 1 lan T161 | nhieu lan T162
 *   LPM.C1 d1274 host?. nullish                 T: T162             F: T161
 * ADL (d1282-1295)
 *   ADL.C1 d1286 contextId === STATIC           T: T163             F: T164,T165
 *   ADL.C2 d1290 !deferredLoads                 T: T164             F: T165
 * TD (d1306-1343)
 *   TD.C1 d1311 getContextId === contextId      T: T166             F: T167..T170
 *   TD.C2 d1317 get(dependent) nullish          T: T168             F: T169
 *   TD.C3 d1318 get(hostId) nullish             T: T168             F: T169
 *   TD.C4 d1325 loads.size === 0                T: T168,T169        F: T169
 *   TD.C5 d1338 host.isResolved                 T: T170             F: T170
 *   TD.C6 d1338 || host.isPending (C5 false)    T: T170             F: T170
 *   Nhanh then: resolve T167,T168,T169 | reject T170
 * LD (d1350-1362)
 *   LD.C1 d1355 hostContextId === contextId     T: T171             F: T172..T176
 *   LD.C2 d1359 get(wrapper)?. nullish          T: T172             F: T173..T176
 *   LD.C3 d1360 get(hostContextId)?. nullish    T: T173             F: T174..T176
 *   Vong forEach: 0 lan T174 | 1 lan T175 | nhieu lan T176
 * FE (d1364-1375)
 *   FE.C1 d1371 hostContextId !== contextId     T: T178,T179        F: T179
 *   Vong for: 0 lan T177 | 1 lan T178 | nhieu lan T179
 * GH (d1382-1393)
 *   GH.C1 d1388 !isResolved                     T: T180             F: T181,T182
 *   GH.C2 d1388 || !failedInstances.has (C1 false)  T: T181         F: T182
 * ISR (d1398-1408) + HostSettlementRef (d101-110)
 *   ISR.C1 d1403 inquirer nil (?.)              T: T183             F: T184,T185,T186
 *   ISR.C2 d1403 inquirer.isTransient           T: T184,T186        F: T185
 *   ISR.C3 d1407 inquirerSignal?. nullish       T: T183,T186        F: T184,T185
 * GI d1413 inquirer ? :                         T: T187             F: T188
 * GCI d1434 effectiveInquirerId ??              T(nullish): T191    F: T190
 * IIC (d1437-1460)
 *   IIC.C1 d1442 isStatic                       T: T192             F: T193..T196
 *   IIC.C2 d1447 isInRequestScope (C1 false)    T: T193             F: T194..T196
 *   IIC.C3 d1451 isLazyTransient                T: T194             F: T195,T196
 *   IIC.C4 d1455 isExplicitlyRequested          T: T195             F: T196
 * LSP (d1468-1528)
 *   LSP.C1 d1472 isFactoryProvider              T: T197,T198,T199   F: T200,T201
 *   LSP.C2 d1473 !isFactoryProvider             T: T200,T201        F: T197,T198,T199
 *   LSP.C3 d1473 && !isFunction(metatype)       T: T200             F: T201
 *   LSP.C4 d1476 isFactoryProvider ? :          T: T197..T199       F: T201
 *   LSP.C5 d1479 isFactoryProvider ? [] :       T: T197..T199       F: T201
 *   LSP.C6 d1499 !isOptional (catch)            T: T199             F: T198,T201
 *   LSP.C7 d1510 optionalDependenciesIds.includes(index)  T: T198,T201   F: T198,T201
 *   LSP.C8 d1518 !!isOptional (property)        T: T201             F: T201
 *   LSP.C9 d1523 status === 'rejected'          T: T199             F: T199
 *   LSP.C10 d1525 if (failure)                  T: T199             F: T197,T198,T201
 * SSP (d1530-1555)
 *   SSP.C1 d1534 contextId === STATIC           T: T202..T206       F: T207
 *   SSP.C2 d1535 !inquirer                      T: T202,T203,T204,T207   F: T205,T206
 *   SSP.C3 d1537 wrapper.isTransient (C2 true)  T: T202,T207       F: T203,T204
 *   SSP.C4 d1537 scope === REQUEST (C3 false)   T: T203             F: T204
 *   SSP.C5 d1539 !!inquirer                     T: T205,T206        F: T202,T203,T204,T207
 *   SSP.C6 d1540 !isInContext(inquirer) (C5 true)  T: T205          F: T206
 *   SSP.C7 d1550 isStaticContext                T: T202..T206       F: T207
 *   SSP.C8 d1551 top-level flag (C7 true)       T: T202,T203        F: T204,T205,T206
 *   SSP.C9 d1552 outside-context flag (C8 false)  T: T205           F: T204,T206
 * GEI (d1564-1577)
 *   GEI.C1 d1570 dependency?.isTransient        T: T210..T215       F: T208,T209
 *   GEI.C2 d1570 inquirer?.isTransient          T: T212..T215       F: T210,T211
 *   GEI.C3 d1570 parentInquirer                 T: T213,T214,T215   F: T212
 *   GEI.C4 d1571 contextId === STATIC           T: T213,T214        F: T215
 *   GEI.C5 d1572 rootInquirer ??                T(nullish): T214    F: T213
 * GEID (d1579-1602)
 *   GEID.C1 d1586 contextId === STATIC          T: T217..T222       F: T216
 *   GEID.C2 d1587 dependency?.isTransient       T: T219..T222       F: T217,T218
 *   GEID.C3 d1588 inquirer?.isTransient         T: T220,T221,T222   F: T219
 *   GEID.C4 d1589 parentInquirer                T: T221,T222        F: T220
 *   GEID.C5 d1592 effectiveInquirerId ??        T(nullish): T222    F: T221
 * GSTR (d1604-1623)
 *   GSTR.C1 d1610 contextId === STATIC          T: T224..T228       F: T223
 *   GSTR.C2 d1611 inquirer?.isTransient         T: T226,T227,T228   F: T224,T225
 *   GSTR.C3 d1612 parentInquirer                T: T227,T228        F: T226
 *   GSTR.C4 d1615 effectiveInquirerId ??        T(nullish): T228    F: T227
 * GERC d1644 effectiveInquirer === inquirer     T: T229             F: T230
 * HD (d1650-1679)
 *   HD.C1 d1655 !metadata                       T: T231             F: T232..T237
 *   HD.C2 d1662 !isNil(inject)                  T: T232..T235       F: T236,T237
 *   HD.C3 d1664 wrapper.metatype (C2 false)     T: T236             F: T237
 *   HD.C4 d1668 length !== expected             T: T232             F: T233..T237
 *   HD.C5 d1673 metadata[i] === undefined       T: T235             F: T234,T235,T236
 *   Vong for: 0 lan T233,T237 | 1 lan T234 | nhieu lan T235,T236
 * HCP (d1681-1699)
 *   HCP.C1 d1685 !metadata                      T: T238             F: T239..T242
 *   HCP.C2 d1692 wrapper.metatype ? :           T: T240,T241,T242   F: T239
 *   HCP.C3 d1697 item.key === key               T: T240,T241,T242   F: T241,T242
 *   Vong every: 0 lan T239 | 1 lan T240 | nhieu lan T241,T242
 * RSH d1707 isInquirerRequest ? :               T: T243             F: T244
 * IIR (d1724)  C1 isTransient T: T246,T247,T248 F: T245 | C2 name === INQUIRER T: T247,T248 F: T246
 *              C3 parentInquirer T: T248 F: T247
 * II (d1731)   C1 param === INQUIRER T: T250,T251 F: T249 | C2 parentInquirer T: T251 F: T250
 * ADM (d1739)  C1 isSymbol T: T252 F: T253,T254 | C2 isString (C1 false) T: T253 F: T254
 * GTN d1747 isFunction(token) ? :               T: T255             F: T256,T257
 * PRD (d1750-1769)
 *   PRD.C1 d1754 !isDebugMode()                 T: T258             F: T259..T263
 *   PRD.C2 d1759 inquirer?.name truthy          T: T260,T261,T262   F: T259,T263
 *   PRD.C3 d1759 name.toString?. ton tai        T: T260,T261        F: T262
 *   PRD.C4 d1759 ?? 'unknown' (nullish)         T: T259,T262        F: T260,T261,T263
 *   PRD.C5 d1760 dependentName === tokenName    T: T260             F: T259,T261,T262,T263
 * PLP (d1771-1785)
 *   PLP.C1 d1775 !isDebugMode()                 T: T264             F: T265..T268
 *   PLP.C2 d1779 moduleRef?. nil                T: T266             F: T265,T267,T268
 *   PLP.C3 d1779 metatype?. nil                 T: T267             F: T265,T268
 *   PLP.C4 d1779 name ?? 'unknown' (nullish)    T: T266,T267,T268   F: T265
 * PFM (d1787-1801): PFM.C1..C4 giong PLP (d1791, d1795), T269..T273 tuong ung T264..T268
 * GCX d1807 contextId.getParent ? :             T: T275             F: T274
 *
 * PATH (moi path mot test; so thu tu path = thu tu test trong tung nhom)
 *   LPC.P1 T141 khong wrapper, tim theo constructor | P2 T142 tim bang iterate (alias/khac/khop)
 *   LPC.P3 T143 wrapper co trong collection | P4 T144 wrapper khong co trong collection | P5 T145 host undefined
 *   WD.P1 T146 khong co tap | P2 T147 tap rong | P3 T148 1 load | P4 T149 nhieu load | P5 T150 load that bai
 *   LEP.P1 T151 ctx STATIC | P2 T152 ctx khac, truyen enhancers | P3 T153 ctx khac, enhancers mac dinh
 *   LE.P1 T154 0 | P2 T155 1 | P3 T156 nhieu     LCM.P1..P3 T157..T159     LPM.P1..P3 T160..T162
 *   ADL.P1 T163 STATIC | P2 T164 tao tap moi | P3 T165 dung tap co san
 *   TD.P1 T166 khong durable | P2 T167 khong dependent | P3 T168 1 dependent, resolve | P4 T169 2 load, resolve load sau
 *   TD.P5 T170 reject, danh dau failedInstances
 *   LD.P1..P6 T171..T176 | FE.P1..P3 T177..T179 | GH.P1..P3 T180..T182 | ISR.P1..P4 T183..T186
 *   GI.P1,P2 T187,T188 | CRC.P1 T189 | GCI.P1,P2 T190,T191 | IIC.P1..P5 T192..T196
 *   LSP.P1..P5 T197..T201 | SSP.P1..P6 T202..T207 | GEI.P1..P8 T208..T215 | GEID.P1..P7 T216..T222
 *   GSTR.P1..P6 T223..T228 | GERC.P1,P2 T229,T230 | HD.P1..P7 T231..T237 | HCP.P1..P5 T238..T242
 *   RSH.P1,P2 T243,T244 | IIR.P1..P4 T245..T248 | II.P1..P3 T249..T251 | ADM.P1..P3 T252..T254
 *   GTN.P1..P3 T255..T257 | PRD.P1..P6 T258..T263 | PLP.P1..P5 T264..T268 | PFM.P1..P5 T269..T273
 *   GCX.P1,P2 T274,T275 | GNT.P1 T276 | DEF.P1 T277 (instanceDecorator mac dinh, d115-117)
 *
 * TONG KET: 138 test (T141..T278). Lan chay 1: 277/277 pass, Branch 99.72% (sot d605); T278 bo sung vong 1.
 *   Moi dieu kien nguyen tu liet ke o tren co ca T va F; khong co nhanh unreachable trong phan 4.
 *   Phan nay phu them d103-108 (HostSettlementRef: T185) va d115-117 (instanceDecorator mac dinh: T277).
 *
 * MOCK (chi khi can):
 *   - vi.mock '../../injector/helpers/is-debug-mode.util': isDebugMode doc tu moi truong, can dat true/false
 *     de phu 3 ham print*Log; khong co ma nguon util nen khong chac bien moi truong nao dieu khien no.
 *     Cung cach voi phan 1, 2 (duong dan khop import cua injector.ts).
 *   - vi.spyOn cac ham khac cua Injector de co lap (loadInstance, loadEnhancers, loadEnhancersPerContext,
 *     waitForDeferredLoads, resolveScopedComponentHost, resolveSingleParam, getClassDependencies,
 *     reflectProperties, reflectConstructorParams, isInContext, addDeferredLoad, resolveComponentHost).
 *     Cac ham do duoc kiem thu o phan khac hoac o chinh file nay.
 *   - InstanceWrapper la doi tuong gia toi gian. Dung ban that: getContextId, getInquirerId,
 *     createResolutionContext, getEffective*, getFactoryProviderDependencies (T197..T199), INQUIRER, Scope, clc.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scope } from '@nestjs/common';
import { STATIC_CONTEXT } from '../../injector/constants';
import { INQUIRER } from '../../injector/inquirer/index';
import { isDebugMode } from '../../injector/helpers/is-debug-mode.util';
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
const ok = (fn: () => unknown) => expect(fn).not.toThrow();

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
  instance: undefined,
  host: undefined,
  getInstanceByContextId: vi.fn(() => makeHost()),
  removeInstanceByContextId: vi.fn(),
  getEnhancersMetadata: vi.fn(),
  getDependents: vi.fn(() => []),
  getExistingInstancesByContextId: vi.fn(() => []),
  isDependencyTreeDurable: vi.fn(() => false),
  isStatic: vi.fn(() => false),
  isInRequestScope: vi.fn(() => false),
  isLazyTransient: vi.fn(() => false),
  isExplicitlyRequested: vi.fn(() => false),
  addPropertiesMetadata: vi.fn(),
  addCtorMetadata: vi.fn(),
  ...o,
});

const moduleRef: any = {
  name: 'TestModule',
  metatype: class TestModule {},
  providers: new Map(),
};

/** contextId "durable": getParent tra ve context cha rieng cho tung token, khong co thi tra chinh no */
const makeDurableCtx = (parents: Map<unknown, any>): any => {
  const ctx: any = { id: rand(100, 900) };
  ctx.getParent = ({ token }: any) => parents.get(token) ?? ctx;
  return ctx;
};

describe('Injector (CFT) - phan 4', () => {
  let injector: any;

  beforeEach(() => {
    seed = 20261114;
    counter = 0;
    vi.mocked(isDebugMode).mockReturnValue(false);
    injector = new Injector();
    injector.logger = { log: vi.fn(), warn: vi.fn() };
  });

  // ============================ loadPerContext ==============================
  describe('loadPerContext', () => {
    class Svc {}
    const spyLoaders = () => ({
      load: vi.spyOn(injector, 'loadInstance').mockResolvedValue(undefined),
      enh: vi
        .spyOn(injector, 'loadEnhancersPerContext')
        .mockResolvedValue(undefined),
      wait: vi
        .spyOn(injector, 'waitForDeferredLoads')
        .mockResolvedValue(undefined),
    });

    it('T141: khong wrapper, tim theo constructor cua instance', async () => {
      // covers LPC.P1, LPC.C1=true, LPC.C2=false, LPC.C6=true
      const instance = new Svc();
      const wrapper = makeWrapper({
        getInstanceByContextId: vi.fn(() => makeHost({ instance })),
      });
      const s = spyLoaders();
      await expect(
        injector.loadPerContext(
          instance,
          moduleRef,
          new Map([[Svc, wrapper]]),
          newCtx(),
        ),
      ).resolves.toBeDefined();
      expect(s.load).toHaveBeenCalled();
    });

    it('T142: khong wrapper, tim bang iterate (alias, khac instance, khop)', async () => {
      // covers LPC.P2, LPC.C2=true, LPC.C3=true/false, LPC.C4=true/false
      const instance = new Svc();
      const alias = makeWrapper({ isAlias: true, instance });
      const other = makeWrapper({ instance: { marker: rand(100, 900) } });
      const match = makeWrapper({
        instance,
        getInstanceByContextId: vi.fn(() => makeHost({ instance })),
      });
      const collection = new Map<any, any>([
        [`k-${nextId()}`, alias],
        [`k-${nextId()}`, other],
        [`k-${nextId()}`, match],
      ]);
      const s = spyLoaders();
      await expect(
        injector.loadPerContext(instance, moduleRef, collection, newCtx()),
      ).resolves.toBeDefined();
      expect(s.wait).toHaveBeenCalled();
    });

    it('T143: co wrapper, collection chua token cua wrapper', async () => {
      // covers LPC.P3, LPC.C1=false, LPC.C5=false
      const given = makeWrapper();
      const inCollection = makeWrapper({
        getInstanceByContextId: vi.fn(() =>
          makeHost({ instance: { marker: rand(100, 900) } }),
        ),
      });
      const s = spyLoaders();
      await expect(
        injector.loadPerContext(
          {},
          moduleRef,
          new Map([[given.token, inCollection]]),
          newCtx(),
          given,
        ),
      ).resolves.toBeDefined();
      expect(s.enh).toHaveBeenCalled();
    });

    it('T144: co wrapper, collection khong chua token', async () => {
      // covers LPC.P4, LPC.C5=true
      const given = makeWrapper({
        getInstanceByContextId: vi.fn(() =>
          makeHost({ instance: { marker: rand(100, 900) } }),
        ),
      });
      const s = spyLoaders();
      await expect(
        injector.loadPerContext({}, moduleRef, new Map(), newCtx(), given),
      ).resolves.toBeDefined();
      expect(s.load).toHaveBeenCalled();
    });

    it('T145: host undefined thi tra ve undefined', async () => {
      // covers LPC.P5, LPC.C6=false
      const given = makeWrapper({
        getInstanceByContextId: vi.fn(() => undefined),
      });
      const s = spyLoaders();
      await injector.loadPerContext({}, moduleRef, new Map(), newCtx(), given);
      expect(s.wait).toHaveBeenCalled();
    });
  });

  // ============================ waitForDeferredLoads ========================
  describe('waitForDeferredLoads', () => {
    it('T146: khong co tap load cho context', async () => {
      // covers WD.P1, WD.C1=true
      await injector.waitForDeferredLoads(newCtx());
      expect(injector.deferredLoads).toBeDefined();
    });

    it('T147: tap load rong (vong 0 lan)', async () => {
      // covers WD.P2, WD.C1=false
      const ctx = newCtx();
      injector.deferredLoads.set(ctx, new Set());
      await injector.waitForDeferredLoads(ctx);
      expect(injector.deferredLoads.get(ctx)).toBeDefined();
    });

    it('T148: mot load (vong 1 lan)', async () => {
      // covers WD.P3
      const ctx = newCtx();
      injector.deferredLoads.set(ctx, new Set([Promise.resolve()]));
      await injector.waitForDeferredLoads(ctx);
      expect(injector.deferredLoads.get(ctx)).toBeDefined();
    });

    it('T149: nhieu load (vong nhieu lan)', async () => {
      // covers WD.P4
      const ctx = newCtx();
      injector.deferredLoads.set(
        ctx,
        new Set([Promise.resolve(), Promise.resolve(), Promise.resolve()]),
      );
      await injector.waitForDeferredLoads(ctx);
      expect(injector.deferredLoads.get(ctx)).toBeDefined();
    });

    it('T150: mot load that bai thi nem loi', async () => {
      // covers WD.P5
      const ctx = newCtx();
      injector.deferredLoads.set(
        ctx,
        new Set([Promise.reject(new Error(`load-${nextId()}`))]),
      );
      await expect(injector.waitForDeferredLoads(ctx)).rejects.toThrow();
    });
  });

  // ============================ loadEnhancersPerContext =====================
  describe('loadEnhancersPerContext', () => {
    it('T151: ctx STATIC, enhancers mac dinh va metadata undefined', async () => {
      // covers LEP.P1, LEP.C1=true, LEP.C2=true, LEP.C3=true
      const spy = vi
        .spyOn(injector, 'loadEnhancers')
        .mockResolvedValue(undefined);
      await injector.loadEnhancersPerContext(makeWrapper(), STATIC_CONTEXT);
      expect(spy).not.toHaveBeenCalled();
    });

    it('T152: ctx khac STATIC, enhancers duoc truyen vao', async () => {
      // covers LEP.P2, LEP.C1=false, LEP.C3=false
      const spy = vi
        .spyOn(injector, 'loadEnhancers')
        .mockResolvedValue(undefined);
      await injector.loadEnhancersPerContext(
        makeWrapper(),
        newCtx(),
        undefined,
        [makeWrapper()],
      );
      expect(spy).toHaveBeenCalled();
    });

    it('T153: ctx khac STATIC, enhancers lay tu getEnhancersMetadata', async () => {
      // covers LEP.P3, LEP.C1=true, LEP.C2=false
      const spy = vi
        .spyOn(injector, 'loadEnhancers')
        .mockResolvedValue(undefined);
      const wrapper = makeWrapper({
        getEnhancersMetadata: vi.fn(() => [makeWrapper()]),
      });
      await injector.loadEnhancersPerContext(wrapper, newCtx());
      expect(spy).toHaveBeenCalled();
    });
  });

  // ============================ loadEnhancers ===============================
  describe('loadEnhancers', () => {
    const enhancer = () => makeWrapper({ host: { injectables: new Map() } });

    it('T154: khong co enhancer', async () => {
      // covers LE.P1
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadEnhancers(newCtx(), undefined, []);
      expect(load).not.toHaveBeenCalled();
    });

    it('T155: mot enhancer', async () => {
      // covers LE.P2
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadEnhancers(newCtx(), makeWrapper(), [enhancer()]);
      expect(load).toHaveBeenCalled();
    });

    it('T156: nhieu enhancer', async () => {
      // covers LE.P3
      const load = vi
        .spyOn(injector, 'loadInstance')
        .mockResolvedValue(undefined);
      await injector.loadEnhancers(newCtx(), undefined, [
        enhancer(),
        enhancer(),
        enhancer(),
      ]);
      expect(load).toHaveBeenCalled();
    });
  });

  // ============================ loadCtorMetadata ============================
  describe('loadCtorMetadata', () => {
    const dep = (withInstance = true) =>
      makeWrapper({
        getInstanceByContextId: vi.fn(() =>
          makeHost({
            instance: withInstance ? { marker: rand(100, 900) } : undefined,
          }),
        ),
      });

    it('T157: metadata rong', async () => {
      // covers LCM.P1
      vi.spyOn(injector, 'resolveScopedComponentHost');
      await expect(
        injector.loadCtorMetadata([], newCtx()),
      ).resolves.toBeDefined();
    });

    it('T158: mot dependency co host', async () => {
      // covers LCM.P2, LCM.C1=false
      const item = dep();
      vi.spyOn(injector, 'resolveScopedComponentHost').mockResolvedValue(item);
      await expect(
        injector.loadCtorMetadata([item], newCtx()),
      ).resolves.toBeDefined();
    });

    it('T159: nhieu dependency, mot host undefined', async () => {
      // covers LCM.P3, LCM.C1=true
      const a = dep();
      const b = dep();
      const c = dep();
      const hosts = new Map<any, any>([
        [a, a],
        [b, undefined],
        [c, c],
      ]);
      vi.spyOn(injector, 'resolveScopedComponentHost').mockImplementation(
        async (item: any) => hosts.get(item),
      );
      await expect(
        injector.loadCtorMetadata([a, b, c], newCtx()),
      ).resolves.toBeDefined();
    });
  });

  // ============================ loadPropertiesMetadata ======================
  describe('loadPropertiesMetadata', () => {
    const prop = () => ({
      key: `prop${rand(100, 900)}-${counter++}`,
      wrapper: makeWrapper(),
    });
    const hostWith = () =>
      makeWrapper({
        getInstanceByContextId: vi.fn(() =>
          makeHost({ instance: { marker: rand(100, 900) } }),
        ),
      });

    it('T160: metadata rong', async () => {
      // covers LPM.P1
      vi.spyOn(injector, 'resolveScopedComponentHost');
      await expect(
        injector.loadPropertiesMetadata([], newCtx()),
      ).resolves.toBeDefined();
    });

    it('T161: mot property co host', async () => {
      // covers LPM.P2, LPM.C1=false
      vi.spyOn(injector, 'resolveScopedComponentHost').mockResolvedValue(
        hostWith(),
      );
      await expect(
        injector.loadPropertiesMetadata([prop()], newCtx()),
      ).resolves.toBeDefined();
    });

    it('T162: nhieu property, mot host undefined', async () => {
      // covers LPM.P3, LPM.C1=true
      const hosts = [hostWith(), undefined, hostWith()];
      let call = 0;
      vi.spyOn(injector, 'resolveScopedComponentHost').mockImplementation(
        async () => hosts[call++],
      );
      await expect(
        injector.loadPropertiesMetadata([prop(), prop(), prop()], newCtx()),
      ).resolves.toBeDefined();
    });
  });

  // ============================ addDeferredLoad =============================
  describe('addDeferredLoad', () => {
    it('T163: ctx STATIC thi khong luu', () => {
      // covers ADL.P1, ADL.C1=true
      ok(() => injector.addDeferredLoad(STATIC_CONTEXT, Promise.resolve()));
    });

    it('T164: ctx khac STATIC, chua co tap thi tao moi', () => {
      // covers ADL.P2, ADL.C1=false, ADL.C2=true
      const ctx = newCtx();
      injector.addDeferredLoad(ctx, Promise.resolve());
      expect(injector.deferredLoads.get(ctx)).toBeDefined();
    });

    it('T165: ctx khac STATIC, da co tap thi them vao', () => {
      // covers ADL.P3, ADL.C2=false
      const ctx = newCtx();
      injector.addDeferredLoad(ctx, Promise.resolve());
      injector.addDeferredLoad(ctx, Promise.resolve());
      expect(injector.deferredLoads.get(ctx)).toBeDefined();
    });
  });

  // ============================ trackDurableDeferredLoad ====================
  describe('trackDurableDeferredLoad', () => {
    /** wrapper durable (getParent tra ctx cha khac) voi danh sach dependents cho truoc */
    const setup = (dependents: any[]) => {
      const parents = new Map<unknown, any>();
      const ctx = makeDurableCtx(parents);
      const w = makeWrapper({ getDependents: vi.fn(() => dependents) });
      parents.set(w.token, { id: rand(100, 900) });
      return { ctx, w, parents };
    };

    it('T166: wrapper khong durable thi bo qua', () => {
      // covers TD.P1, TD.C1=true
      const forEach = vi.spyOn(injector, 'forEachDurableDependent');
      injector.trackDurableDeferredLoad(
        makeWrapper(),
        newCtx(),
        Promise.resolve(),
      );
      expect(forEach).not.toHaveBeenCalled();
    });

    it('T167: durable, khong co dependent, load thanh cong', async () => {
      // covers TD.P2, TD.C1=false
      const { ctx, w } = setup([]);
      const load = Promise.resolve();
      ok(() => injector.trackDurableDeferredLoad(w, ctx, load));
      await load;
    });

    it('T168: mot dependent durable, load thanh cong thi go khoi theo doi', async () => {
      // covers TD.P3, TD.C2=true, TD.C3=true, TD.C4=true
      const d = makeWrapper();
      const { ctx, w, parents } = setup([d]);
      parents.set(d.token, { id: rand(100, 900) });
      const load = Promise.resolve();
      injector.trackDurableDeferredLoad(w, ctx, load);
      expect(injector.durableDeferredLoads.get(d)).toBeDefined();
      await load;
    });

    it('T169: hai load cung dependent, load sau xong truoc', async () => {
      // covers TD.P4, TD.C2=false, TD.C3=false, TD.C4=false, TD.C4=true
      const d = makeWrapper();
      const { ctx, w, parents } = setup([d]);
      parents.set(d.token, { id: rand(100, 900) });
      let resolveFirst!: () => void;
      const first = new Promise<void>(resolve => (resolveFirst = resolve));
      const second = Promise.resolve();
      injector.trackDurableDeferredLoad(w, ctx, first);
      injector.trackDurableDeferredLoad(w, ctx, second);
      await second;
      resolveFirst();
      await first;
      expect(injector.durableDeferredLoads.get(d)).toBeDefined();
    });

    it('T170: load that bai thi danh dau cac instance da resolve/pending', async () => {
      // covers TD.P5, TD.C5=true, TD.C5=false, TD.C6=true, TD.C6=false
      const hostResolved = makeHost({ isResolved: true });
      const hostPending = makeHost({ isPending: true });
      const hostNeither = makeHost();
      const nonDurable = makeWrapper();
      const d = makeWrapper({
        getExistingInstancesByContextId: vi.fn(() => [
          hostResolved,
          hostPending,
          hostNeither,
        ]),
      });
      const { ctx, w, parents } = setup([nonDurable, d]);
      parents.set(d.token, { id: rand(100, 900) });
      const load = Promise.reject(new Error(`fail-${nextId()}`));
      injector.trackDurableDeferredLoad(w, ctx, load);
      await load.catch(() => undefined);
      expect(injector.failedInstances.get(hostResolved)).toBeDefined();
      expect(injector.failedInstances.get(hostPending)).toBeDefined();
    });
  });

  // ============================ linkDurableDeferredLoads ====================
  describe('linkDurableDeferredLoads', () => {
    it('T171: hostContextId trung contextId thi bo qua', () => {
      // covers LD.P1, LD.C1=true
      const add = vi
        .spyOn(injector, 'addDeferredLoad')
        .mockImplementation(() => undefined);
      const ctx = newCtx();
      injector.linkDurableDeferredLoads(makeWrapper(), ctx, ctx);
      expect(add).not.toHaveBeenCalled();
    });

    it('T172: khong co muc nao cua wrapper', () => {
      // covers LD.P2, LD.C1=false, LD.C2=true
      const add = vi
        .spyOn(injector, 'addDeferredLoad')
        .mockImplementation(() => undefined);
      injector.linkDurableDeferredLoads(makeWrapper(), newCtx(), newCtx());
      expect(add).not.toHaveBeenCalled();
    });

    it('T173: co muc cua wrapper nhung khong co muc cua hostContextId', () => {
      // covers LD.P3, LD.C2=false, LD.C3=true
      const add = vi
        .spyOn(injector, 'addDeferredLoad')
        .mockImplementation(() => undefined);
      const w = makeWrapper();
      injector.durableDeferredLoads.set(w, new WeakMap());
      injector.linkDurableDeferredLoads(w, newCtx(), newCtx());
      expect(add).not.toHaveBeenCalled();
    });

    it('T174: tap load rong (vong 0 lan)', () => {
      // covers LD.P4, LD.C3=false
      const add = vi
        .spyOn(injector, 'addDeferredLoad')
        .mockImplementation(() => undefined);
      const w = makeWrapper();
      const hostCtx = newCtx();
      injector.durableDeferredLoads.set(
        w,
        new WeakMap([[hostCtx, new Set<Promise<unknown>>()]]),
      );
      injector.linkDurableDeferredLoads(w, newCtx(), hostCtx);
      expect(add).not.toHaveBeenCalled();
    });

    it('T175: mot load (vong 1 lan)', () => {
      // covers LD.P5
      const add = vi
        .spyOn(injector, 'addDeferredLoad')
        .mockImplementation(() => undefined);
      const w = makeWrapper();
      const hostCtx = newCtx();
      injector.durableDeferredLoads.set(
        w,
        new WeakMap([[hostCtx, new Set([Promise.resolve()])]]),
      );
      injector.linkDurableDeferredLoads(w, newCtx(), hostCtx);
      expect(add).toHaveBeenCalled();
    });

    it('T176: nhieu load (vong nhieu lan)', () => {
      // covers LD.P6
      const add = vi
        .spyOn(injector, 'addDeferredLoad')
        .mockImplementation(() => undefined);
      const w = makeWrapper();
      const hostCtx = newCtx();
      injector.durableDeferredLoads.set(
        w,
        new WeakMap([
          [hostCtx, new Set([Promise.resolve(), Promise.resolve()])],
        ]),
      );
      injector.linkDurableDeferredLoads(w, newCtx(), hostCtx);
      expect(add).toHaveBeenCalled();
    });
  });

  // ============================ forEachDurableDependent =====================
  describe('forEachDurableDependent', () => {
    it('T177: khong co dependent', () => {
      // covers FE.P1
      const cb = vi.fn();
      const w = makeWrapper({ getDependents: vi.fn(() => []) });
      injector.forEachDurableDependent(w, newCtx(), cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it('T178: mot dependent durable', () => {
      // covers FE.P2, FE.C1=true
      const cb = vi.fn();
      const d = makeWrapper();
      const parents = new Map<unknown, any>([[d.token, newCtx()]]);
      const w = makeWrapper({ getDependents: vi.fn(() => [d]) });
      injector.forEachDurableDependent(w, makeDurableCtx(parents), cb);
      expect(cb).toHaveBeenCalled();
    });

    it('T179: nhieu dependent, mot cai khong durable bi bo qua', () => {
      // covers FE.P3, FE.C1=true, FE.C1=false
      const cb = vi.fn();
      const nonDurable = makeWrapper();
      const d = makeWrapper();
      const parents = new Map<unknown, any>([[d.token, newCtx()]]);
      const w = makeWrapper({ getDependents: vi.fn(() => [nonDurable, d]) });
      injector.forEachDurableDependent(w, makeDurableCtx(parents), cb);
      expect(cb).toHaveBeenCalled();
    });
  });

  // ============================ getInstanceHost =============================
  describe('getInstanceHost', () => {
    it('T180: instance chua resolve', () => {
      // covers GH.P1, GH.C1=true
      const host = makeHost();
      const w = makeWrapper({ getInstanceByContextId: vi.fn(() => host) });
      expect(injector.getInstanceHost(w, newCtx(), undefined)).toBeDefined();
    });

    it('T181: da resolve, khong nam trong failedInstances', () => {
      // covers GH.P2, GH.C1=false, GH.C2=true
      const host = makeHost({ isResolved: true });
      const w = makeWrapper({ getInstanceByContextId: vi.fn(() => host) });
      expect(injector.getInstanceHost(w, newCtx(), undefined)).toBeDefined();
      expect(w.removeInstanceByContextId).not.toHaveBeenCalled();
    });

    it('T182: da resolve nhung nam trong failedInstances thi xoa va lay lai', () => {
      // covers GH.P3, GH.C2=false
      const failed = makeHost({ isResolved: true });
      const fresh = makeHost();
      injector.failedInstances.set(failed, new Error(`fail-${nextId()}`));
      const w = makeWrapper({
        getInstanceByContextId: vi
          .fn()
          .mockReturnValueOnce(failed)
          .mockReturnValueOnce(fresh),
      });
      expect(injector.getInstanceHost(w, newCtx(), nextId())).toBeDefined();
      expect(w.removeInstanceByContextId).toHaveBeenCalled();
    });
  });

  // ============================ insertSettlementRef =========================
  describe('insertSettlementRef (+ HostSettlementRef)', () => {
    it('T183: khong co inquirer', () => {
      // covers ISR.P1, ISR.C1=true, ISR.C3=true
      ok(() =>
        injector.insertSettlementRef(
          { contextId: newCtx() },
          makeWrapper(),
          makeHost(),
        ),
      );
    });

    it('T184: inquirer transient, dung settlementSignal cua inquirer', () => {
      // covers ISR.P2, ISR.C1=false, ISR.C2=true, ISR.C3=false
      const insertRef = vi.fn();
      const inquirer = makeWrapper({
        isTransient: true,
        settlementSignal: { insertRef },
      });
      injector.insertSettlementRef(
        { contextId: newCtx(), inquirer },
        makeWrapper(),
        makeHost(),
      );
      expect(insertRef).toHaveBeenCalled();
    });

    it('T185: inquirer khong transient, dung signal cua instance host; HostSettlementRef doc signal cua host', () => {
      // covers ISR.P3, ISR.C2=false, ISR.C3=false, HostSettlementRef.id va getter settlementSignal (d103-108)
      const insertRef = vi.fn();
      const inquirer = makeWrapper({
        getInstanceByContextId: vi.fn(() =>
          makeHost({ settlementSignal: { insertRef } }),
        ),
      });
      const target = makeWrapper();
      const host = makeHost({ settlementSignal: { marker: rand(100, 900) } });
      injector.insertSettlementRef(
        { contextId: newCtx(), inquirer },
        target,
        host,
      );
      const ref = insertRef.mock.calls[0][0];
      expect(ref.id).toBeDefined();
      expect(ref.settlementSignal).toBeDefined();
    });

    it('T186: inquirer transient nhung chua co settlementSignal', () => {
      // covers ISR.P4, ISR.C2=true, ISR.C3=true
      const inquirer = makeWrapper({ isTransient: true });
      ok(() =>
        injector.insertSettlementRef(
          { contextId: newCtx(), inquirer },
          makeWrapper(),
          makeHost(),
        ),
      );
    });
  });

  // ============================ getInquirerId / createResolutionContext / getContextInquirerId
  describe('getInquirerId', () => {
    it('T187: co inquirer', () => {
      // covers GI.P1, GI.C1=true
      expect(injector.getInquirerId(makeWrapper())).toBeDefined();
    });

    it('T188: khong co inquirer', () => {
      // covers GI.P2, GI.C1=false
      ok(() => injector.getInquirerId(undefined));
    });
  });

  describe('createResolutionContext', () => {
    it('T189: tao context day du cac truong', () => {
      // covers CRC.P1
      expect(
        injector.createResolutionContext(
          newCtx(),
          makeWrapper(),
          nextId(),
          makeWrapper(),
        ),
      ).toBeDefined();
    });
  });

  describe('getContextInquirerId', () => {
    it('T190: co effectiveInquirerId', () => {
      // covers GCI.P1, GCI.C1=false
      expect(
        injector.getContextInquirerId({
          contextId: newCtx(),
          effectiveInquirerId: nextId(),
        }),
      ).toBeDefined();
    });

    it('T191: khong co effectiveInquirerId, dung id cua inquirer', () => {
      // covers GCI.P2, GCI.C1=true
      expect(
        injector.getContextInquirerId({
          contextId: newCtx(),
          inquirer: makeWrapper(),
        }),
      ).toBeDefined();
    });
  });

  // ============================ isInContext =================================
  describe('isInContext', () => {
    const rc = () => ({ contextId: newCtx(), inquirer: makeWrapper() });

    it('T192: isStatic true', () => {
      // covers IIC.P1, IIC.C1=true
      const w = makeWrapper({ isStatic: vi.fn(() => true) });
      expect(injector.isInContext(w, rc())).toBeDefined();
      expect(w.isInRequestScope).not.toHaveBeenCalled();
    });

    it('T193: isInRequestScope true', () => {
      // covers IIC.P2, IIC.C1=false, IIC.C2=true
      const w = makeWrapper({ isInRequestScope: vi.fn(() => true) });
      expect(injector.isInContext(w, rc())).toBeDefined();
    });

    it('T194: isLazyTransient true', () => {
      // covers IIC.P3, IIC.C2=false, IIC.C3=true
      const w = makeWrapper({ isLazyTransient: vi.fn(() => true) });
      expect(injector.isInContext(w, rc())).toBeDefined();
    });

    it('T195: isExplicitlyRequested true', () => {
      // covers IIC.P4, IIC.C3=false, IIC.C4=true
      const w = makeWrapper({ isExplicitlyRequested: vi.fn(() => true) });
      expect(injector.isInContext(w, rc())).toBeDefined();
    });

    it('T196: ca bon deu false', () => {
      // covers IIC.P5, IIC.C4=false
      expect(injector.isInContext(makeWrapper(), rc())).toBeDefined();
    });
  });

  // ============================ lookupSkippedProviderDependencies ===========
  describe('lookupSkippedProviderDependencies', () => {
    it('T197: factory provider khong co dependency', async () => {
      // covers LSP.P1, LSP.C1=true, LSP.C2=false, LSP.C4=true, LSP.C5=true, LSP.C10=false
      const rs = vi.spyOn(injector, 'resolveSingleParam');
      await injector.lookupSkippedProviderDependencies(
        makeWrapper({ inject: [] }),
        moduleRef,
      );
      expect(rs).not.toHaveBeenCalled();
    });

    it('T198: factory provider, dependency optional that bai thi bi nuot', async () => {
      // covers LSP.P2, LSP.C6=false, LSP.C7=true, LSP.C7=false, LSP.C10=false
      const depA = `A_${nextId()}`;
      const depB = `B_${nextId()}`;
      const rs = vi
        .spyOn(injector, 'resolveSingleParam')
        .mockImplementation(async (_w: any, param: any) => {
          if (param === depB) {
            throw new Error(`missing-${nextId()}`);
          }
          return undefined as any;
        });
      await injector.lookupSkippedProviderDependencies(
        makeWrapper({ inject: [depA, { token: depB, optional: true }] }),
        moduleRef,
      );
      expect(rs).toHaveBeenCalled();
    });

    it('T199: factory provider, dependency khong optional that bai thi nem loi', async () => {
      // covers LSP.P3, LSP.C6=true, LSP.C9=false, LSP.C9=true, LSP.C10=true
      const depA = `A_${nextId()}`;
      const depB = `B_${nextId()}`;
      vi.spyOn(injector, 'resolveSingleParam').mockImplementation(
        async (_w: any, param: any) => {
          if (param === depB) {
            throw new Error(`missing-${nextId()}`);
          }
          return undefined as any;
        },
      );
      await expect(
        injector.lookupSkippedProviderDependencies(
          makeWrapper({ inject: [depA, depB] }),
          moduleRef,
        ),
      ).rejects.toThrow();
    });

    it('T200: khong phai factory va metatype khong phai function thi bo qua', async () => {
      // covers LSP.P4, LSP.C1=false, LSP.C2=true, LSP.C3=true
      const classDeps = vi.spyOn(injector, 'getClassDependencies');
      await injector.lookupSkippedProviderDependencies(
        makeWrapper({ metatype: {} }),
        moduleRef,
      );
      expect(classDeps).not.toHaveBeenCalled();
    });

    it('T201: class provider, co constructor dependency va property, mot so optional that bai', async () => {
      // covers LSP.P5, LSP.C3=false, LSP.C4=false, LSP.C5=false, LSP.C6=false, LSP.C7=true/false, LSP.C8=true/false
      const depA = `A_${nextId()}`;
      const depB = `B_${nextId()}`;
      const prop1 = `N1_${nextId()}`;
      const prop2 = `N2_${nextId()}`;
      vi.spyOn(injector, 'getClassDependencies').mockReturnValue([
        [depA, depB],
        [1],
      ]);
      vi.spyOn(injector, 'reflectProperties').mockReturnValue([
        { key: 'p1', name: prop1, isOptional: true },
        { key: 'p2', name: prop2 },
      ]);
      const rs = vi
        .spyOn(injector, 'resolveSingleParam')
        .mockImplementation(async (_w: any, param: any) => {
          if (param === depB || param === prop1) {
            throw new Error(`missing-${nextId()}`);
          }
          return undefined as any;
        });
      await injector.lookupSkippedProviderDependencies(
        makeWrapper({ metatype: class Svc {} }),
        moduleRef,
      );
      expect(rs).toHaveBeenCalled();
    });
  });

  // ============================ shouldSkipProviderLoading ===================
  describe('shouldSkipProviderLoading', () => {
    it('T202: ctx STATIC, khong inquirer, wrapper transient', () => {
      // covers SSP.P1, SSP.C1=true, SSP.C2=true, SSP.C3=true, SSP.C5=false, SSP.C7=true, SSP.C8=true
      const w = makeWrapper({ isTransient: true });
      expect(
        injector.shouldSkipProviderLoading(w, { contextId: STATIC_CONTEXT }),
      ).toBeDefined();
    });

    it('T203: ctx STATIC, khong inquirer, khong transient, scope REQUEST', () => {
      // covers SSP.P2, SSP.C3=false, SSP.C4=true, SSP.C8=true
      const w = makeWrapper({ scope: Scope.REQUEST });
      expect(
        injector.shouldSkipProviderLoading(w, { contextId: STATIC_CONTEXT }),
      ).toBeDefined();
    });

    it('T204: ctx STATIC, khong inquirer, khong transient, scope mac dinh', () => {
      // covers SSP.P3, SSP.C4=false, SSP.C8=false, SSP.C9=false
      const w = makeWrapper({ scope: Scope.DEFAULT });
      expect(
        injector.shouldSkipProviderLoading(w, { contextId: STATIC_CONTEXT }),
      ).toBeDefined();
    });

    it('T205: ctx STATIC, co inquirer ngoai context', () => {
      // covers SSP.P4, SSP.C2=false, SSP.C5=true, SSP.C6=true, SSP.C9=true
      vi.spyOn(injector, 'isInContext').mockReturnValue(false);
      expect(
        injector.shouldSkipProviderLoading(makeWrapper(), {
          contextId: STATIC_CONTEXT,
          inquirer: makeWrapper(),
        }),
      ).toBeDefined();
    });

    it('T206: ctx STATIC, co inquirer trong context', () => {
      // covers SSP.P5, SSP.C6=false, SSP.C9=false
      vi.spyOn(injector, 'isInContext').mockReturnValue(true);
      expect(
        injector.shouldSkipProviderLoading(makeWrapper(), {
          contextId: STATIC_CONTEXT,
          inquirer: makeWrapper(),
        }),
      ).toBeDefined();
    });

    it('T207: ctx khac STATIC thi khong bo qua', () => {
      // covers SSP.P6, SSP.C1=false, SSP.C7=false
      const w = makeWrapper({ isTransient: true });
      expect(
        injector.shouldSkipProviderLoading(w, { contextId: newCtx() }),
      ).toBeDefined();
    });
  });

  // ============================ getEffectiveInquirer ========================
  describe('getEffectiveInquirer', () => {
    const transient = () => makeWrapper({ isTransient: true });

    it('T208: dependency undefined', () => {
      // covers GEI.P1, GEI.C1=false
      expect(
        injector.getEffectiveInquirer(
          undefined,
          { contextId: newCtx(), inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T209: dependency khong transient', () => {
      // covers GEI.P2, GEI.C1=false
      expect(
        injector.getEffectiveInquirer(
          makeWrapper(),
          { contextId: newCtx(), inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T210: dependency transient, khong co inquirer', () => {
      // covers GEI.P3, GEI.C1=true, GEI.C2=false
      ok(() =>
        injector.getEffectiveInquirer(
          transient(),
          { contextId: newCtx() },
          makeWrapper(),
        ),
      );
    });

    it('T211: dependency transient, inquirer khong transient', () => {
      // covers GEI.P4, GEI.C2=false
      expect(
        injector.getEffectiveInquirer(
          transient(),
          { contextId: newCtx(), inquirer: makeWrapper() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T212: ca hai transient nhung khong co parentInquirer', () => {
      // covers GEI.P5, GEI.C2=true, GEI.C3=false
      expect(
        injector.getEffectiveInquirer(
          transient(),
          { contextId: newCtx(), inquirer: transient() },
          undefined,
        ),
      ).toBeDefined();
    });

    it('T213: ctx STATIC, co rootInquirer', () => {
      // covers GEI.P6, GEI.C3=true, GEI.C4=true, GEI.C5=false
      expect(
        injector.getEffectiveInquirer(
          transient(),
          {
            contextId: STATIC_CONTEXT,
            inquirer: transient(),
            rootInquirer: makeWrapper(),
          },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T214: ctx STATIC, khong co rootInquirer thi dung parentInquirer', () => {
      // covers GEI.P7, GEI.C5=true
      expect(
        injector.getEffectiveInquirer(
          transient(),
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T215: ctx khac STATIC thi dung parentInquirer', () => {
      // covers GEI.P8, GEI.C4=false
      expect(
        injector.getEffectiveInquirer(
          transient(),
          { contextId: newCtx(), inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });
  });

  // ============================ getEffectiveInquirerId ======================
  describe('getEffectiveInquirerId', () => {
    const transient = () => makeWrapper({ isTransient: true });

    it('T216: ctx khac STATIC', () => {
      // covers GEID.P1, GEID.C1=false
      expect(
        injector.getEffectiveInquirerId(
          transient(),
          { contextId: newCtx(), inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T217: ctx STATIC, dependency undefined', () => {
      // covers GEID.P2, GEID.C1=true, GEID.C2=false
      expect(
        injector.getEffectiveInquirerId(
          undefined,
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T218: ctx STATIC, dependency khong transient', () => {
      // covers GEID.P3, GEID.C2=false
      expect(
        injector.getEffectiveInquirerId(
          makeWrapper(),
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T219: ctx STATIC, inquirer khong transient', () => {
      // covers GEID.P4, GEID.C2=true, GEID.C3=false
      expect(
        injector.getEffectiveInquirerId(
          transient(),
          { contextId: STATIC_CONTEXT, inquirer: makeWrapper() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T220: ctx STATIC, ca hai transient, khong co parentInquirer', () => {
      // covers GEID.P5, GEID.C3=true, GEID.C4=false
      expect(
        injector.getEffectiveInquirerId(
          transient(),
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          undefined,
        ),
      ).toBeDefined();
    });

    it('T221: dieu kien day du, co effectiveInquirerId', () => {
      // covers GEID.P6, GEID.C4=true, GEID.C5=false
      expect(
        injector.getEffectiveInquirerId(
          transient(),
          {
            contextId: STATIC_CONTEXT,
            inquirer: transient(),
            effectiveInquirerId: nextId(),
          },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T222: dieu kien day du, khong co effectiveInquirerId', () => {
      // covers GEID.P7, GEID.C5=true
      expect(
        injector.getEffectiveInquirerId(
          transient(),
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });
  });

  // ============================ getStaticTransientResolutionContext =========
  describe('getStaticTransientResolutionContext', () => {
    const transient = () => makeWrapper({ isTransient: true });

    it('T223: ctx khac STATIC thi tra ve nguyen context', () => {
      // covers GSTR.P1, GSTR.C1=false
      expect(
        injector.getStaticTransientResolutionContext(
          { contextId: newCtx(), inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T224: ctx STATIC, khong co inquirer', () => {
      // covers GSTR.P2, GSTR.C1=true, GSTR.C2=false
      expect(
        injector.getStaticTransientResolutionContext(
          { contextId: STATIC_CONTEXT },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T225: ctx STATIC, inquirer khong transient', () => {
      // covers GSTR.P3, GSTR.C2=false
      expect(
        injector.getStaticTransientResolutionContext(
          { contextId: STATIC_CONTEXT, inquirer: makeWrapper() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T226: ctx STATIC, inquirer transient, khong co parentInquirer', () => {
      // covers GSTR.P4, GSTR.C2=true, GSTR.C3=false
      expect(
        injector.getStaticTransientResolutionContext(
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          undefined,
        ),
      ).toBeDefined();
    });

    it('T227: dieu kien day du, co effectiveInquirerId', () => {
      // covers GSTR.P5, GSTR.C3=true, GSTR.C4=false
      expect(
        injector.getStaticTransientResolutionContext(
          {
            contextId: STATIC_CONTEXT,
            inquirer: transient(),
            effectiveInquirerId: nextId(),
          },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T228: dieu kien day du, khong co effectiveInquirerId', () => {
      // covers GSTR.P6, GSTR.C4=true
      expect(
        injector.getStaticTransientResolutionContext(
          { contextId: STATIC_CONTEXT, inquirer: transient() },
          makeWrapper(),
        ),
      ).toBeDefined();
    });
  });

  // ============================ getEffectiveResolutionContext ===============
  describe('getEffectiveResolutionContext', () => {
    it('T229: effectiveInquirer trung inquirer thi giu rootInquirer', () => {
      // covers GERC.P1, GERC.C1=true
      expect(
        injector.getEffectiveResolutionContext(
          makeWrapper(),
          {
            contextId: newCtx(),
            inquirer: makeWrapper(),
            rootInquirer: makeWrapper(),
          },
          makeWrapper(),
        ),
      ).toBeDefined();
    });

    it('T230: effectiveInquirer la parentInquirer thi bo rootInquirer', () => {
      // covers GERC.P2, GERC.C1=false
      const transient = () => makeWrapper({ isTransient: true });
      expect(
        injector.getEffectiveResolutionContext(
          transient(),
          {
            contextId: newCtx(),
            inquirer: transient(),
            rootInquirer: makeWrapper(),
          },
          makeWrapper(),
        ),
      ).toBeDefined();
    });
  });

  // ============================ hasDenseCtorMetadata ========================
  describe('hasDenseCtorMetadata', () => {
    const fakeDeps = (n: number) => Array.from({ length: n }, () => nextId());
    const metaOf = (n: number) =>
      Array.from({ length: n }, () => makeWrapper());

    it('T231: metadata undefined', () => {
      // covers HD.P1, HD.C1=true
      expect(
        injector.hasDenseCtorMetadata(makeWrapper(), undefined, undefined),
      ).toBeDefined();
    });

    it('T232: inject co gia tri, do dai khong khop', () => {
      // covers HD.P2, HD.C1=false, HD.C2=true, HD.C4=true
      expect(
        injector.hasDenseCtorMetadata(
          makeWrapper(),
          fakeDeps(3),
          metaOf(rand(5, 8)),
        ),
      ).toBeDefined();
    });

    it('T233: inject rong, metadata rong (vong 0 lan)', () => {
      // covers HD.P3, HD.C4=false
      expect(
        injector.hasDenseCtorMetadata(makeWrapper(), [], []),
      ).toBeDefined();
    });

    it('T234: inject 1 phan tu, metadata day du (vong 1 lan)', () => {
      // covers HD.P4, HD.C5=false
      expect(
        injector.hasDenseCtorMetadata(makeWrapper(), fakeDeps(1), metaOf(1)),
      ).toBeDefined();
    });

    it('T235: nhieu phan tu, co phan tu undefined', () => {
      // covers HD.P5, HD.C5=false, HD.C5=true
      const metadata: any[] = [makeWrapper(), undefined, makeWrapper()];
      expect(
        injector.hasDenseCtorMetadata(makeWrapper(), fakeDeps(3), metadata),
      ).toBeDefined();
    });

    it('T236: inject nil, co metatype, dung reflectConstructorParams', () => {
      // covers HD.P6, HD.C2=false, HD.C3=true, HD.C5=false
      vi.spyOn(injector, 'reflectConstructorParams').mockReturnValue(
        fakeDeps(3),
      );
      expect(
        injector.hasDenseCtorMetadata(
          makeWrapper({ metatype: class Svc {} }),
          undefined,
          metaOf(3),
        ),
      ).toBeDefined();
    });

    it('T237: inject nil, khong co metatype thi so phu thuoc la 0', () => {
      // covers HD.P7, HD.C3=false
      expect(
        injector.hasDenseCtorMetadata(
          makeWrapper({ metatype: undefined }),
          undefined,
          [],
        ),
      ).toBeDefined();
    });
  });

  // ============================ hasCompletePropertiesMetadata ===============
  describe('hasCompletePropertiesMetadata', () => {
    it('T238: metadata undefined', () => {
      // covers HCP.P1, HCP.C1=true
      expect(
        injector.hasCompletePropertiesMetadata(makeWrapper(), undefined),
      ).toBeDefined();
    });

    it('T239: khong co metatype, khong co property (vong 0 lan)', () => {
      // covers HCP.P2, HCP.C1=false, HCP.C2=false
      expect(
        injector.hasCompletePropertiesMetadata(
          makeWrapper({ metatype: undefined }),
          [],
        ),
      ).toBeDefined();
    });

    it('T240: mot property co trong metadata', () => {
      // covers HCP.P3, HCP.C2=true, HCP.C3=true
      const key = `prop${rand(100, 900)}`;
      vi.spyOn(injector, 'reflectProperties').mockReturnValue([{ key }]);
      expect(
        injector.hasCompletePropertiesMetadata(makeWrapper(), [{ key }]),
      ).toBeDefined();
    });

    it('T241: nhieu property deu co trong metadata', () => {
      // covers HCP.P4, HCP.C3=false, HCP.C3=true
      const a = `a${rand(100, 900)}`;
      const b = `b${rand(100, 900)}`;
      vi.spyOn(injector, 'reflectProperties').mockReturnValue([
        { key: a },
        { key: b },
      ]);
      expect(
        injector.hasCompletePropertiesMetadata(makeWrapper(), [
          { key: a },
          { key: b },
        ]),
      ).toBeDefined();
    });

    it('T242: co property khong co trong metadata', () => {
      // covers HCP.P5, HCP.C3=false
      const a = `a${rand(100, 900)}`;
      const c = `c${rand(100, 900)}`;
      vi.spyOn(injector, 'reflectProperties').mockReturnValue([
        { key: a },
        { key: c },
      ]);
      expect(
        injector.hasCompletePropertiesMetadata(makeWrapper(), [
          { key: a },
          { key: `other${rand(100, 900)}` },
        ]),
      ).toBeDefined();
    });
  });

  // ============================ resolveScopedComponentHost ==================
  describe('resolveScopedComponentHost', () => {
    it('T243: item la INQUIRER transient co parent thi tra parentInquirer', () => {
      // covers RSH.P1, RSH.C1=true
      const parent = makeWrapper();
      const item = makeWrapper({ isTransient: true, name: INQUIRER });
      expect(
        injector.resolveScopedComponentHost(item, newCtx(), undefined, parent),
      ).toBeDefined();
    });

    it('T244: item thuong thi resolve qua resolveComponentHost', async () => {
      // covers RSH.P2, RSH.C1=false
      const spy = vi
        .spyOn(injector, 'resolveComponentHost')
        .mockResolvedValue(makeWrapper());
      const item = makeWrapper({ host: { name: `Host${rand(100, 900)}` } });
      await injector.resolveScopedComponentHost(item, newCtx());
      expect(spy).toHaveBeenCalled();
    });
  });

  // ============================ isInquirerRequest / isInquirer ==============
  describe('isInquirerRequest', () => {
    it('T245: item khong transient', () => {
      // covers IIR.P1, IIR.C1=false
      ok(() => injector.isInquirerRequest(makeWrapper(), makeWrapper()));
    });

    it('T246: transient nhung ten khong phai INQUIRER', () => {
      // covers IIR.P2, IIR.C1=true, IIR.C2=false
      ok(() =>
        injector.isInquirerRequest(
          makeWrapper({ isTransient: true }),
          makeWrapper(),
        ),
      );
    });

    it('T247: transient, ten INQUIRER, khong co parentInquirer', () => {
      // covers IIR.P3, IIR.C2=true, IIR.C3=false
      ok(() =>
        injector.isInquirerRequest(
          makeWrapper({ isTransient: true, name: INQUIRER }),
          undefined,
        ),
      );
    });

    it('T248: transient, ten INQUIRER, co parentInquirer', () => {
      // covers IIR.P4, IIR.C3=true
      expect(
        injector.isInquirerRequest(
          makeWrapper({ isTransient: true, name: INQUIRER }),
          makeWrapper(),
        ),
      ).toBeDefined();
    });
  });

  describe('isInquirer', () => {
    it('T249: param khong phai INQUIRER', () => {
      // covers II.P1, II.C1=false
      ok(() => injector.isInquirer(`param-${nextId()}`, makeWrapper()));
    });

    it('T250: param la INQUIRER, khong co parentInquirer', () => {
      // covers II.P2, II.C1=true, II.C2=false
      ok(() => injector.isInquirer(INQUIRER, undefined));
    });

    it('T251: param la INQUIRER, co parentInquirer', () => {
      // covers II.P3, II.C2=true
      expect(injector.isInquirer(INQUIRER, makeWrapper())).toBeDefined();
    });
  });

  // ============================ addDependencyMetadata =======================
  describe('addDependencyMetadata', () => {
    it('T252: khoa la symbol thi them properties metadata', () => {
      // covers ADM.P1, ADM.C1=true
      const host = makeWrapper();
      injector.addDependencyMetadata(
        Symbol(`s${nextId()}`),
        host,
        makeWrapper(),
      );
      expect(host.addPropertiesMetadata).toHaveBeenCalled();
    });

    it('T253: khoa la string thi them properties metadata', () => {
      // covers ADM.P2, ADM.C1=false, ADM.C2=true
      const host = makeWrapper();
      injector.addDependencyMetadata(`key-${nextId()}`, host, makeWrapper());
      expect(host.addPropertiesMetadata).toHaveBeenCalled();
    });

    it('T254: khoa la so thi them ctor metadata', () => {
      // covers ADM.P3, ADM.C2=false
      const host = makeWrapper();
      injector.addDependencyMetadata(rand(0, 9), host, makeWrapper());
      expect(host.addCtorMetadata).toHaveBeenCalled();
    });
  });

  // ============================ getTokenName ================================
  describe('getTokenName', () => {
    it('T255: token la function', () => {
      // covers GTN.P1, GTN.C1=true
      class Named {}
      expect(injector.getTokenName(Named)).toBeDefined();
    });

    it('T256: token la string', () => {
      // covers GTN.P2, GTN.C1=false
      expect(injector.getTokenName(`TOKEN_${nextId()}`)).toBeDefined();
    });

    it('T257: token la symbol', () => {
      // covers GTN.P3, GTN.C1=false
      expect(injector.getTokenName(Symbol(`s${nextId()}`))).toBeDefined();
    });
  });

  // ============================ printResolvingDependenciesLog ===============
  describe('printResolvingDependenciesLog', () => {
    it('T258: khong o debug mode thi khong ghi log', () => {
      // covers PRD.P1, PRD.C1=true
      injector.printResolvingDependenciesLog(`T_${nextId()}`, makeWrapper());
      expect(injector.logger.log).not.toHaveBeenCalled();
    });

    it('T259: debug, khong co inquirer thi ten la unknown', () => {
      // covers PRD.P2, PRD.C1=false, PRD.C2=false, PRD.C4=true, PRD.C5=false
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printResolvingDependenciesLog(`T_${nextId()}`, undefined);
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T260: debug, ten inquirer trung ten token (alias)', () => {
      // covers PRD.P3, PRD.C2=true, PRD.C3=true, PRD.C4=false, PRD.C5=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      const token = `T_${nextId()}`;
      injector.printResolvingDependenciesLog(
        token,
        makeWrapper({ name: token }),
      );
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T261: debug, ten inquirer khac ten token', () => {
      // covers PRD.P4, PRD.C5=false
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printResolvingDependenciesLog(
        `T_${nextId()}`,
        makeWrapper({ name: `Other${nextId()}` }),
      );
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T262: debug, name la object khong co toString', () => {
      // covers PRD.P5, PRD.C3=false, PRD.C4=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printResolvingDependenciesLog(
        `T_${nextId()}`,
        makeWrapper({ name: Object.create(null) }),
      );
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T263: debug, name la chuoi rong', () => {
      // covers PRD.P6, PRD.C2=false, PRD.C4=false
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printResolvingDependenciesLog(
        `T_${nextId()}`,
        makeWrapper({ name: '' }),
      );
      expect(injector.logger.log).toHaveBeenCalled();
    });
  });

  // ============================ printLookingForProviderLog ==================
  describe('printLookingForProviderLog', () => {
    it('T264: khong o debug mode', () => {
      // covers PLP.P1, PLP.C1=true
      injector.printLookingForProviderLog(`T_${nextId()}`, moduleRef);
      expect(injector.logger.log).not.toHaveBeenCalled();
    });

    it('T265: debug, module co metatype co ten', () => {
      // covers PLP.P2, PLP.C1=false, PLP.C2=false, PLP.C3=false, PLP.C4=false
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printLookingForProviderLog(`T_${nextId()}`, moduleRef);
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T266: debug, moduleRef undefined', () => {
      // covers PLP.P3, PLP.C2=true, PLP.C4=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printLookingForProviderLog(`T_${nextId()}`, undefined);
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T267: debug, module khong co metatype', () => {
      // covers PLP.P4, PLP.C3=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printLookingForProviderLog(`T_${nextId()}`, {});
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T268: debug, metatype khong co ten', () => {
      // covers PLP.P5, PLP.C4=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printLookingForProviderLog(`T_${nextId()}`, { metatype: {} });
      expect(injector.logger.log).toHaveBeenCalled();
    });
  });

  // ============================ printFoundInModuleLog =======================
  describe('printFoundInModuleLog', () => {
    it('T269: khong o debug mode', () => {
      // covers PFM.P1, PFM.C1=true
      injector.printFoundInModuleLog(`T_${nextId()}`, moduleRef);
      expect(injector.logger.log).not.toHaveBeenCalled();
    });

    it('T270: debug, module co metatype co ten', () => {
      // covers PFM.P2, PFM.C1=false, PFM.C2=false, PFM.C3=false, PFM.C4=false
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printFoundInModuleLog(`T_${nextId()}`, moduleRef);
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T271: debug, moduleRef undefined', () => {
      // covers PFM.P3, PFM.C2=true, PFM.C4=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printFoundInModuleLog(`T_${nextId()}`, undefined);
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T272: debug, module khong co metatype', () => {
      // covers PFM.P4, PFM.C3=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printFoundInModuleLog(`T_${nextId()}`, {});
      expect(injector.logger.log).toHaveBeenCalled();
    });

    it('T273: debug, metatype khong co ten', () => {
      // covers PFM.P5, PFM.C4=true
      vi.mocked(isDebugMode).mockReturnValue(true);
      injector.printFoundInModuleLog(`T_${nextId()}`, { metatype: {} });
      expect(injector.logger.log).toHaveBeenCalled();
    });
  });

  // ============================ getContextId / getNowTimestamp / instanceDecorator
  describe('getContextId', () => {
    it('T274: contextId khong co getParent', () => {
      // covers GCX.P1, GCX.C1=false
      expect(injector.getContextId(newCtx(), makeWrapper())).toBeDefined();
    });

    it('T275: contextId co getParent', () => {
      // covers GCX.P2, GCX.C1=true
      const parent = newCtx();
      const ctx: any = { id: rand(100, 900), getParent: vi.fn(() => parent) };
      const w = makeWrapper();
      expect(injector.getContextId(ctx, w)).toBeDefined();
      expect(ctx.getParent).toHaveBeenCalled();
    });
  });

  describe('getNowTimestamp', () => {
    it('T276: tra ve moc thoi gian', () => {
      // covers GNT.P1
      expect(injector.getNowTimestamp()).toBeDefined();
    });
  });

  describe('instanceDecorator mac dinh', () => {
    it('T277: khong truyen options thi decorator tra lai chinh target', () => {
      // covers DEF.P1 (d115-117)
      const target = { marker: rand(100, 900) };
      expect(new (Injector as any)().instanceDecorator(target)).toBeDefined();
    });
  });

  // ============================ bo sung vong 1: d605 ========================
  describe('getFactoryProviderDependencies - d605 (bo sung theo bang coverage)', () => {
    it('T278: inject doi tu gia tri sang undefined giua hai lan doc (mock co chu dich)', () => {
      // covers F.C(d605) `wrapper.inject ?? undefined` = true (nullish)
      // Mock co chu dich: trong thuc te d605 chi toi duoc khi inject khac nil (d620), nen vi tri nay
      // unreachable voi wrapper that; getter doi gia tri chi de phu nhanh nay.
      let reads = 0;
      const wrapper: any = {
        id: nextId(),
        name: `Provider${rand(100, 900)}`,
        get inject() {
          reads++;
          return reads === 1 ? [null] : undefined;
        },
      };
      expect(() => injector.getFactoryProviderDependencies(wrapper)).toThrow();
    });
  });
});
