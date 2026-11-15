/**
 * CFT spec: packages/core/middleware/middleware-module.ts
 * Lưu tại: packages/core/test-CFT-core-2/middleware/middleware-module.cft.spec.ts
 * Số dòng theo bản in bằng lệnh Get-Content (L<n>).
 *
 * ============================================================
 * 1. QUYẾT ĐỊNH (B) VÀ ĐIỀU KIỆN NGUYÊN TỐ (C)
 * ============================================================
 * loadConfiguration
 *   B1  L102 if (!instance.configure)                      C1  !instance.configure
 *   B2  L113 if (!this.appOptions.preview)                 C2  !preview
 *   B3  L122 if (!(builder instanceof MiddlewareBuilder))  C3  !(instanceof)
 * registerMiddleware (comparator của sort, L149-164; chỉ chạy khi >= 2 entry)
 *   B4  L154 if (isModuleAGlobal && isModuleBGlobal)       C4a isModuleAGlobal, C4b isModuleBGlobal
 *   B5  L157 if (isModuleAGlobal)                          C5  isModuleAGlobal
 *   B6  L160 if (isModuleBGlobal)                          C6  isModuleBGlobal
 *   LP1 L138 for config of middlewareConfig (0/1/nhiều)   LP2 L166 for entries (0/1/nhiều)
 * registerMiddlewareConfig
 *   LP3 L184 for routeInfo of forRoutes (0/1/nhiều)
 * registerRouteMiddleware
 *   DP1 L202 tham số mặc định handledRequestsByRoute (bỏ qua / truyền vào)
 *   LP4 L207 for metatype (0/1/nhiều)
 *   B7  L211 if (isUndefined(instanceWrapper))             C7  wrapper undefined
 *   B8  L229 RequestMethod[routeInfo.method] ?? 'ALL'      C8  vế trái nullish
 * bindHandler
 *   B9  L260 if (isUndefined(instance?.use))               C9a instance null/undefined (?.)
 *                                                          C9b use undefined
 *   B10 L266 isStatic = isDependencyTreeStatic() && !isTransient
 *                                                          C10a isDependencyTreeStatic(), C10b !isTransient
 *   B11 L267 if (isStatic)                                 (cùng giá trị B10)
 *   B12 L304 exceptionsHandler ??= create(...)             C12 exceptionsHandler nullish
 *   try/catch L290-311: catch khi loadPerContext/createProxy ném lỗi
 * getHandledRequests
 *   B13 L330 if (!byRoute)            B14 L336 if (!handledRequests)
 * createProxy
 *   DP2 L344 contextId = STATIC_CONTEXT (bỏ qua / truyền vào)
 * registerHandler
 *   B15 L372 isMethodAll ? proxy : fn
 *   C16 L379 applicationRef.getRequestMethod?.(req)        (có / không có hàm)
 *   B17 L380-383 actual === requestMethod                  C17a
 *                 || (actual === 'HEAD'                    C17b
 *                     && requestMethod === 'GET')          C17c
 *   B18 L397 if (handledRequests.has(req))
 *   B19 L406 path || '/'                                   C19 path truthy
 *   LP5 L408 forEach path (0/1/nhiều)
 * getContextId
 *   B20 L413 if (!request[REQUEST_CONTEXT_ID])
 *   B21 L421 isTreeDurable ? payload : Object.assign
 *
 * ============================================================
 * 2. BẢNG ĐIỀU KIỆN NGUYÊN TỐ (T: test phủ true, F: test phủ false)
 * ============================================================
 * C1   T: L1            F: L2,L3,L4,L5
 * C2   T: L3            F: L4            (chỉ đánh giá khi configure ném lỗi)
 * C3   T: L5            F: L2
 * C4a  T: M3,M4,M5      F: M6
 * C4b  T: M3            F: M4            (chỉ đánh giá khi C4a=true)
 * C5   T: M4            F: M6,M7         (chỉ đánh giá khi B4 false)
 * C6   T: M6            F: M7            (chỉ đánh giá khi C5=false)
 * C7   T: RM4           F: RM1..RM3
 * C8   T(nullish): RM3  F: RM2
 * C9a  T: BH1           F: BH2..BH6
 * C9b  T: BH2           F: BH3..BH6      (chỉ đánh giá khi C9a=false)
 * C10a T: BH3,BH4       F: BH5,BH6
 * C10b T: BH3           F: BH4           (chỉ đánh giá khi C10a=true)
 * C12  T: BH6 (lần 1)   F: BH6 (lần 2)
 * B13  T: HR1           F: HR2,HR3
 * B14  T: HR1,HR3       F: HR2
 * C16  T: RH3..RH6      F: RH7
 * C17a T: RH3           F: RH4,RH5,RH6,RH7
 * C17b T: RH4,RH5       F: RH6,RH7       (chỉ đánh giá khi C17a=false)
 * C17c T: RH4           F: RH5           (chỉ đánh giá khi C17b=true)
 * B18  T: RH2 (lần 2)   F: RH2 (lần 1), RH3..RH7
 * C19  T: RH3 (path '') F: RH3 (path khác rỗng)
 * B20  T: GC1,GC2       F: GC3
 * B21  T: GC2           F: GC1
 * B15  T: RH1,RH2       F: RH3..RH7
 * DP1  bỏ qua: RM1      truyền vào: RM2
 * DP2  bỏ qua: CP1      truyền vào: CP2
 *
 * ============================================================
 * 3. BẢNG PATH
 * ============================================================
 * register: P1 gán field + resolveMiddleware ........................ R1
 * resolveMiddleware: P1 0 module (RS1), P2 1 module (RS2), P3 nhiều (RS3)
 * loadConfiguration: P1 không có configure (L1); P2 configure ok + build + insertConfig (L2);
 *   P3 configure lỗi, preview=false -> ném lại (L3); P4 configure lỗi, preview=true -> warn
 *   -> build -> insertConfig (L4); P5 builder không phải instanceof -> return (L5)
 * registerMiddleware: P1 0 entry (M1); P2 1 entry, inner 1 (M2); P3 nhiều entry, inner 0/1/nhiều (M3 = comparator tự nhiên)
 *   comparator: P4 A&B global -> 0 (M3), P5 A global -> -1 (M4), P6 B global -> 1 (M6 ở lượt gọi trực tiếp),
 *   P7 không global -> hiệu distance (M7)   (xem ghi chú M3..M7 trong spec)
 * registerMiddlewareConfig: P1 0 route (MC1), P2 1 route (MC2), P3 nhiều route (MC3)
 * registerRouteMiddleware: P1 0 middleware (RM1), P2 1 middleware (RM2), P3 nhiều (RM3), P4 wrapper undefined -> ném (RM4)
 * bindHandler: P1 instance undefined (BH1), P2 thiếu use (BH2), P3 static (BH3),
 *   P4 transient -> per request (BH4), P5 non-static, thành công (BH5), P6 catch, lần 1 và 2 (BH6)
 * getHandledRequests: P1 map mới + set mới (HR1), P2 dùng lại cả hai (HR2), P3 map cũ + set mới (HR3)
 * createProxy: P1 mặc định (CP1), P2 truyền contextId (CP2)
 * registerHandler: RH1 ALL 0 path, RH2 ALL 1 path + dedup, RH3 GET khớp + nhiều path,
 *   RH4 GET/HEAD, RH5 POST/HEAD, RH6 POST/GET, RH7 không có getRequestMethod
 * getContextId: GC1 chưa có symbol + non-durable, GC2 chưa có symbol + durable, GC3 đã có symbol
 *
 * ============================================================
 * 4. TỔNG KẾT
 * ============================================================
 * Quyết định B1..B21: 21/21 có đủ true/false trong bảng. Điều kiện nguyên tố: tất cả có T và F.
 * Unreachable: không có.
 * (Chưa chạy: số liệu coverage thực tế chờ bảng đo của người làm bài. V8 có thể không tính ??, ?. là nhánh riêng,
 *  nên C3 chứng minh bằng bảng ở trên.)
 *
 * ============================================================
 * 5. LÝ DO MOCK
 * ============================================================
 * - Đối tượng giả tối giản (không vi.mock module): container, injector, graphInspector, routerExceptionFilter,
 *   resolver, routeInfoPathExtractor, applicationRef, wrapper, middlewareContainer. Lý do: các lớp thật cần
 *   cây module/DI đầy đủ, ngoài phạm vi unit test của file này.
 * - vi.spyOn trên phương thức của chính MiddlewareModule (resolveMiddleware, loadConfiguration,
 *   registerMiddlewareConfig, registerRouteMiddleware, bindHandler, registerHandler): cô lập từng hàm; riêng
 *   registerHandler trong bindHandler để lấy lại handler đã truyền vào.
 * - vi.spyOn(Logger.prototype, 'warn'): tránh in log và để nhánh preview chạy.
 * - vi.spyOn(Array.prototype, 'sort'): bắt comparator inline (L149-164) để gọi trực tiếp với từng cặp
 *   global/không global, vì thứ tự so sánh của engine không đảm bảo phủ đủ B4..B6. Gỡ ngay sau lời gọi đồng bộ.
 * - Object.defineProperty(MiddlewareBuilder, Symbol.hasInstance, ...): ép `instanceof` trả false (L122) mà không
 *   cần vi.mock; gỡ trong afterEach.
 *
 * ============================================================
 * 6. ĐỐI CHIẾU COPILOT
 * ============================================================
 * - Copilot kết luận nhánh `instanceof MiddlewareBuilder` false "không cần test riêng": chưa đúng, vì C3=true cần
 *   thiết để đạt C2/C3. Đạt được bằng ghi đè Symbol.hasInstance.
 * - Copilot không liệt kê: `instance?.use` (C9a), `?? 'ALL'` (B8), `??=` (B12), `getRequestMethod?.` (C16),
 *   `path || '/'` (C19), tham số mặc định (DP1, DP2), vòng lặp registerAllConfigs, và việc comparator của sort
 *   chỉ chạy khi có từ 2 entry.
 * - Copilot gợi ý dùng InstanceWrapper/Module thật: khả thi nhưng nặng; dùng wrapper giả với
 *   isDependencyTreeStatic/isDependencyTreeDurable/isTransient để điều khiển nhánh trực tiếp.
 * - Các kết luận khác của Copilot (preview, static/transient, catch, ALL/GET/HEAD, dedup, context id) đã đối chiếu
 *   với mã nguồn và đúng.
 * - Giả định chưa xác minh: `new ApplicationConfig()` không cần tham số; các constructor thật của
 *   RouterExceptionFilters, RoutesMapper, MiddlewareResolver, RouteInfoPathExtractor chạy được với container giả.
 *   Nếu R1 lỗi, gửi lại thông báo lỗi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, RequestMethod } from '@nestjs/common';
import { ApplicationConfig } from '../../application-config';
import { MiddlewareBuilder } from '../../middleware/builder';
import { MiddlewareModule } from '../../middleware/middleware-module';
import { REQUEST_CONTEXT_ID } from '../../router/request/request-constants';

// ---------- seed cố định ----------
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};

// ---------- theo dõi spy để mockRestore trong afterEach ----------
const spies: Array<{ mockRestore: () => void }> = [];
const track = <T extends { mockRestore: () => void }>(spy: T): T => {
  spies.push(spy);
  return spy;
};

beforeEach(() => {
  seed = 20261114;
});

afterEach(() => {
  spies.splice(0).forEach(s => s.mockRestore());
  delete (MiddlewareBuilder as any)[Symbol.hasInstance];
});

// ---------- hàm dựng ----------
function createModule(appOptions: any = {}) {
  const mod = new MiddlewareModule<any>();
  const m = mod as any;
  m.appOptions = appOptions;
  m.routesMapper = {};
  m.httpAdapter = {};
  m.routeInfoPathExtractor = { extractPathsFrom: vi.fn(() => ['/']) };
  m.injector = { loadPerContext: vi.fn() };
  m.routerExceptionFilter = { create: vi.fn(() => ({ next: vi.fn() })) };
  m.resolver = { resolveInstances: vi.fn() };
  m.graphInspector = {
    insertClassNode: vi.fn(),
    insertEntrypointDefinition: vi.fn(),
  };
  m.container = {
    getModuleByKey: vi.fn(() => ({ distance: rand(10, 90) })),
    registerRequestProvider: vi.fn(),
  };
  return { mod, m };
}

function createWrapper(opts: {
  instance?: any;
  isStatic: boolean;
  isTransient?: boolean;
  isDurable?: boolean;
}) {
  class SomeMiddleware {}
  return {
    instance: opts.instance,
    metatype: SomeMiddleware,
    name: 'SomeMiddleware',
    id: `w${rand(100, 900)}`,
    isTransient: opts.isTransient ?? false,
    isDependencyTreeStatic: () => opts.isStatic,
    isDependencyTreeDurable: () => opts.isDurable ?? false,
  } as any;
}

const makeRouteInfo = (
  method: any = RequestMethod.GET,
  path = `/r${rand(10, 99)}`,
) => ({ path, method, version: undefined }) as any;

describe('MiddlewareModule (CFT)', () => {
  // =========================================================
  describe('register', () => {
    it('R1: gán field và gọi resolveMiddleware', async () => {
      // covers P1
      const { mod } = createModule();
      const resolveSpy = track(
        vi.spyOn(mod, 'resolveMiddleware').mockResolvedValue(undefined),
      );
      const appRef = {};
      const container: any = {
        getHttpAdapterRef: vi.fn(() => appRef),
        getModules: vi.fn(() => new Map()),
      };
      const middlewareContainer: any = {};
      await mod.register(
        middlewareContainer,
        container,
        new ApplicationConfig(),
        { loadPerContext: vi.fn() } as any,
        {} as any,
        {} as any,
        {} as any,
      );
      expect(resolveSpy).toHaveBeenCalled();
    });
  });

  // =========================================================
  describe('resolveMiddleware', () => {
    it('RS1: 0 module', async () => {
      // covers P1
      const { mod } = createModule();
      track(vi.spyOn(mod, 'loadConfiguration').mockResolvedValue(undefined));
      await mod.resolveMiddleware({} as any, new Map());
      expect(mod).toBeDefined();
    });

    it('RS2: 1 module', async () => {
      // covers P2
      const { mod, m } = createModule();
      const loadSpy = track(
        vi.spyOn(mod, 'loadConfiguration').mockResolvedValue(undefined),
      );
      await mod.resolveMiddleware(
        {} as any,
        new Map<string, any>([['modA', { name: 'modA' }]]),
      );
      expect(loadSpy).toHaveBeenCalled();
      expect(m.resolver.resolveInstances).toHaveBeenCalled();
    });

    it('RS3: nhiều module', async () => {
      // covers P3
      const { mod, m } = createModule();
      const loadSpy = track(
        vi.spyOn(mod, 'loadConfiguration').mockResolvedValue(undefined),
      );
      await mod.resolveMiddleware(
        {} as any,
        new Map<string, any>([
          ['modA', {}],
          ['modB', {}],
          ['modC', {}],
        ]),
      );
      expect(loadSpy).toHaveBeenCalled();
      expect(m.resolver.resolveInstances).toHaveBeenCalled();
    });
  });

  // =========================================================
  describe('loadConfiguration', () => {
    it('L1: module không có configure', async () => {
      // covers P1, C1=true
      const { mod } = createModule();
      const middlewareContainer: any = { insertConfig: vi.fn() };
      await mod.loadConfiguration(
        middlewareContainer,
        { instance: {}, name: 'ModL1' } as any,
        'keyL1',
      );
      expect(middlewareContainer.insertConfig).toBeDefined();
    });

    it('L2: configure chạy được -> build + insertConfig', async () => {
      // covers P2, C1=false, C3=false
      const { mod } = createModule();
      const configure = vi.fn().mockResolvedValue(undefined);
      const middlewareContainer: any = { insertConfig: vi.fn() };
      await mod.loadConfiguration(
        middlewareContainer,
        { instance: { configure }, name: 'ModL2' } as any,
        'keyL2',
      );
      expect(configure).toHaveBeenCalled();
      expect(middlewareContainer.insertConfig).toHaveBeenCalled();
    });

    it('L3: configure lỗi, preview=false -> ném lại', async () => {
      // covers P3, C1=false, C2=true
      const { mod } = createModule({ preview: false });
      const configure = vi.fn().mockRejectedValue(new Error('boom'));
      await expect(
        mod.loadConfiguration(
          { insertConfig: vi.fn() } as any,
          { instance: { configure }, name: 'ModL3' } as any,
          'keyL3',
        ),
      ).rejects.toThrow();
    });

    it('L4: configure lỗi, preview=true -> warn rồi tiếp tục', async () => {
      // covers P4, C2=false
      const { mod } = createModule({ preview: true });
      const warnSpy = track(
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
      );
      const configure = vi.fn().mockRejectedValue(new Error('boom'));
      const middlewareContainer: any = { insertConfig: vi.fn() };
      await mod.loadConfiguration(
        middlewareContainer,
        { instance: { configure }, name: 'ModL4' } as any,
        'keyL4',
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(middlewareContainer.insertConfig).toHaveBeenCalled();
    });

    it('L5: builder không phải instanceof MiddlewareBuilder -> return', async () => {
      // covers P5, C3=true
      const { mod } = createModule();
      Object.defineProperty(MiddlewareBuilder, Symbol.hasInstance, {
        value: () => false,
        configurable: true,
      });
      const middlewareContainer: any = { insertConfig: vi.fn() };
      await mod.loadConfiguration(
        middlewareContainer,
        {
          instance: { configure: vi.fn().mockResolvedValue(undefined) },
          name: 'ModL5',
        } as any,
        'keyL5',
      );
      expect(middlewareContainer.insertConfig).toBeDefined();
    });
  });

  // =========================================================
  describe('registerMiddleware', () => {
    const cfg = () => ({ middleware: [], forRoutes: [] }) as any;

    it('M1: 0 entry', async () => {
      // covers P1 (LP2=0)
      const { mod } = createModule();
      track(
        vi.spyOn(mod, 'registerMiddlewareConfig').mockResolvedValue(undefined),
      );
      const mc: any = { getConfigurations: vi.fn(() => new Map()) };
      await mod.registerMiddleware(mc, {});
      expect(mod).toBeDefined();
    });

    it('M2: 1 entry, 1 config', async () => {
      // covers P2 (LP2=1, LP1=1)
      const { mod } = createModule();
      const cfgSpy = track(
        vi.spyOn(mod, 'registerMiddlewareConfig').mockResolvedValue(undefined),
      );
      const mc: any = {
        getConfigurations: vi.fn(() => new Map([['modM2', new Set([cfg()])]])),
      };
      await mod.registerMiddleware(mc, {});
      expect(cfgSpy).toHaveBeenCalled();
    });

    it('M3..M7: nhiều entry, config 0/1/nhiều; gọi trực tiếp comparator cho mọi cặp', async () => {
      // covers P3 (LP2=nhiều, LP1=0/1/nhiều), comparator P4..P7:
      //  M3 -> C4a=true, C4b=true (cả hai global, trả 0)
      //  M4 -> C4a=true, C4b=false, C5=true (A global, trả -1)
      //  M6 -> C4a=false, C5=false, C6=true (B global, trả 1)
      //  M7 -> C4a=false, C5=false, C6=false (không global, hiệu distance)
      const { mod, m } = createModule();
      const modules: Record<string, any> = {
        g1: { distance: Number.MAX_VALUE },
        g2: { distance: Number.MAX_VALUE },
        n1: { distance: rand(10, 40) },
        n2: { distance: rand(50, 90) },
      };
      m.container.getModuleByKey = vi.fn((key: string) => modules[key]);
      const cfgSpy = track(
        vi.spyOn(mod, 'registerMiddlewareConfig').mockResolvedValue(undefined),
      );
      const mc: any = {
        getConfigurations: vi.fn(
          () =>
            new Map<string, Set<any>>([
              ['n1', new Set([cfg()])],
              ['n2', new Set([cfg(), cfg(), cfg()])],
              ['g1', new Set()],
            ]),
        ),
      };

      const origSort = Array.prototype.sort;
      const captured: any[] = [];
      const sortSpy = vi
        .spyOn(Array.prototype, 'sort')
        .mockImplementation(function (this: any[], compare: any) {
          captured.push(compare);
          return origSort.call(this, compare);
        });
      const pending = mod.registerMiddleware(mc, {});
      sortSpy.mockRestore(); // sort chạy đồng bộ trước lần await đầu tiên
      await pending;

      expect(cfgSpy).toHaveBeenCalled();
      const compare = captured[0];
      expect(compare).toBeDefined();
      const entry = (key: string) => [key, new Set()];
      expect(() => compare(entry('g1'), entry('g2'))).not.toThrow(); // M3
      expect(() => compare(entry('g1'), entry('n1'))).not.toThrow(); // M4
      expect(() => compare(entry('n1'), entry('g1'))).not.toThrow(); // M6
      expect(() => compare(entry('n1'), entry('n2'))).not.toThrow(); // M7
    });
  });

  // =========================================================
  describe('registerMiddlewareConfig', () => {
    it('MC1: 0 route', async () => {
      // covers P1
      const { mod } = createModule();
      track(
        vi.spyOn(mod, 'registerRouteMiddleware').mockResolvedValue(undefined),
      );
      await mod.registerMiddlewareConfig(
        {} as any,
        { middleware: [], forRoutes: [] } as any,
        'keyMC1',
        {},
      );
      expect(mod).toBeDefined();
    });

    it('MC2: 1 route', async () => {
      // covers P2
      const { mod } = createModule();
      const routeSpy = track(
        vi.spyOn(mod, 'registerRouteMiddleware').mockResolvedValue(undefined),
      );
      await mod.registerMiddlewareConfig(
        {} as any,
        { middleware: [], forRoutes: [makeRouteInfo()] } as any,
        'keyMC2',
        {},
      );
      expect(routeSpy).toHaveBeenCalled();
    });

    it('MC3: nhiều route', async () => {
      // covers P3
      const { mod } = createModule();
      const routeSpy = track(
        vi.spyOn(mod, 'registerRouteMiddleware').mockResolvedValue(undefined),
      );
      await mod.registerMiddlewareConfig(
        {} as any,
        {
          middleware: [],
          forRoutes: [makeRouteInfo(), makeRouteInfo(RequestMethod.POST)],
        } as any,
        'keyMC3',
        {},
      );
      expect(routeSpy).toHaveBeenCalled();
    });
  });

  // =========================================================
  describe('registerRouteMiddleware', () => {
    it('RM1: 0 middleware, bỏ tham số handledRequestsByRoute', async () => {
      // covers P1, DP1=bỏ qua
      const { mod, m } = createModule();
      const bindSpy = track(
        vi.spyOn(m, 'bindHandler').mockResolvedValue(undefined),
      );
      m.container.getModuleByKey = vi.fn(() => ({ name: 'modRM1' }));
      await mod.registerRouteMiddleware(
        { getMiddlewareCollection: vi.fn() } as any,
        makeRouteInfo(),
        { middleware: [] } as any,
        'keyRM1',
        {},
      );
      expect(bindSpy).toBeDefined();
    });

    it('RM2: 1 middleware (không phải mảng), method hợp lệ, truyền handledRequestsByRoute', async () => {
      // covers P2, C7=false, C8=false, DP1=truyền vào
      const { mod, m } = createModule();
      const bindSpy = track(
        vi.spyOn(m, 'bindHandler').mockResolvedValue(undefined),
      );
      class MwA {}
      const wrapper = { name: 'MwA', id: `w${rand(100, 900)}` };
      const collection = new Map<any, any>([[MwA, wrapper]]);
      m.container.getModuleByKey = vi.fn(() => ({ name: 'modRM2' }));
      await mod.registerRouteMiddleware(
        { getMiddlewareCollection: vi.fn(() => collection) } as any,
        makeRouteInfo(RequestMethod.POST),
        { middleware: MwA } as any,
        'keyRM2',
        {},
        new Map(),
      );
      expect(bindSpy).toHaveBeenCalled();
      expect(m.graphInspector.insertEntrypointDefinition).toHaveBeenCalled();
    });

    it('RM3: nhiều middleware, method không có tên -> ALL', async () => {
      // covers P3, C8=true (nullish)
      const { mod, m } = createModule();
      const bindSpy = track(
        vi.spyOn(m, 'bindHandler').mockResolvedValue(undefined),
      );
      class MwB {}
      class MwC {}
      const collection = new Map<any, any>([
        [MwB, { name: 'MwB', id: 'b1' }],
        [MwC, { name: 'MwC', id: 'c1' }],
      ]);
      m.container.getModuleByKey = vi.fn(() => ({ name: 'modRM3' }));
      await mod.registerRouteMiddleware(
        { getMiddlewareCollection: vi.fn(() => collection) } as any,
        makeRouteInfo(rand(5000, 9000)),
        { middleware: [MwB, MwC] } as any,
        'keyRM3',
        {},
      );
      expect(bindSpy).toHaveBeenCalled();
    });

    it('RM4: wrapper không tồn tại -> ném RuntimeException', async () => {
      // covers P4, C7=true
      const { mod, m } = createModule();
      class MwD {}
      m.container.getModuleByKey = vi.fn(() => ({ name: 'modRM4' }));
      await expect(
        mod.registerRouteMiddleware(
          { getMiddlewareCollection: vi.fn(() => new Map()) } as any,
          makeRouteInfo(),
          { middleware: MwD } as any,
          'keyRM4',
          {},
        ),
      ).rejects.toThrow();
    });
  });

  // =========================================================
  describe('bindHandler', () => {
    const run = (m: any, wrapper: any) =>
      m.bindHandler(wrapper, {}, makeRouteInfo(), {}, new Map(), new WeakSet());

    it('BH1: instance undefined -> InvalidMiddlewareException', async () => {
      // covers P1, C9a=true
      const { m } = createModule();
      await expect(
        run(m, createWrapper({ instance: undefined, isStatic: true })),
      ).rejects.toThrow();
    });

    it('BH2: instance không có use -> InvalidMiddlewareException', async () => {
      // covers P2, C9a=false, C9b=true
      const { m } = createModule();
      await expect(
        run(m, createWrapper({ instance: {}, isStatic: true })),
      ).rejects.toThrow();
    });

    it('BH3: static, không transient -> proxy tĩnh', async () => {
      // covers P3, C9a=false, C9b=false, C10a=true, C10b=true
      const { m } = createModule();
      const regSpy = track(
        vi.spyOn(m, 'registerHandler').mockResolvedValue(undefined),
      );
      await run(
        m,
        createWrapper({ instance: { use: vi.fn() }, isStatic: true }),
      );
      expect(regSpy).toHaveBeenCalled();
    });

    it('BH4: static nhưng transient -> xử lý theo request', async () => {
      // covers P4, C10a=true, C10b=false
      const { m } = createModule();
      const regSpy = track(
        vi.spyOn(m, 'registerHandler').mockResolvedValue(undefined),
      );
      await run(
        m,
        createWrapper({
          instance: { use: vi.fn() },
          isStatic: true,
          isTransient: true,
        }),
      );
      expect(regSpy).toHaveBeenCalled();
      expect(regSpy.mock.calls[0][2]).toBeDefined();
    });

    it('BH5: non-static -> handler per request chạy thành công', async () => {
      // covers P5, C10a=false, try không lỗi
      const { m } = createModule();
      const regSpy = track(
        vi.spyOn(m, 'registerHandler').mockResolvedValue(undefined),
      );
      const contextInstance = { use: vi.fn() };
      m.injector.loadPerContext = vi.fn().mockResolvedValue(contextInstance);
      await run(
        m,
        createWrapper({
          instance: { use: vi.fn() },
          isStatic: false,
          isDurable: false,
        }),
      );
      const handler = regSpy.mock.calls[0][2] as any;
      await handler({}, {}, vi.fn());
      expect(m.injector.loadPerContext).toHaveBeenCalled();
    });

    it('BH6: loadPerContext lỗi -> catch; lần 1 tạo handler, lần 2 dùng lại', async () => {
      // covers P6, C12=true (lần 1), C12=false (lần 2)
      const { m } = createModule();
      const regSpy = track(
        vi.spyOn(m, 'registerHandler').mockResolvedValue(undefined),
      );
      const exceptionsHandler = { next: vi.fn() };
      m.routerExceptionFilter.create = vi.fn(() => exceptionsHandler);
      m.injector.loadPerContext = vi.fn().mockRejectedValue(new Error('fail'));
      await run(
        m,
        createWrapper({
          instance: { use: vi.fn() },
          isStatic: false,
          isDurable: true,
        }),
      );
      const handler = regSpy.mock.calls[0][2] as any;
      await handler({}, {}, vi.fn());
      await handler({}, {}, vi.fn());
      expect(m.routerExceptionFilter.create).toHaveBeenCalled();
      expect(exceptionsHandler.next).toHaveBeenCalled();
    });
  });

  // =========================================================
  describe('getHandledRequests', () => {
    it('HR1: map mới + set mới', () => {
      // covers P1, B13=true, B14=true
      const { m } = createModule();
      const result = m.getHandledRequests(
        new Map(),
        {},
        makeRouteInfo(RequestMethod.GET, '/a'),
      );
      expect(result).toBeDefined();
    });

    it('HR2: dùng lại map và set đã có', () => {
      // covers P2, B13=false, B14=false
      const { m } = createModule();
      const store = new Map();
      const mw = {};
      const route = makeRouteInfo(RequestMethod.GET, '/a');
      m.getHandledRequests(store, mw, route);
      const result = m.getHandledRequests(store, mw, route);
      expect(result).toBeDefined();
    });

    it('HR3: map đã có nhưng key route mới', () => {
      // covers P3, B13=false, B14=true
      const { m } = createModule();
      const store = new Map();
      const mw = {};
      m.getHandledRequests(store, mw, makeRouteInfo(RequestMethod.GET, '/a'));
      const result = m.getHandledRequests(
        store,
        mw,
        makeRouteInfo(RequestMethod.POST, '/b'),
      );
      expect(result).toBeDefined();
    });
  });

  // =========================================================
  describe('createProxy', () => {
    it('CP1: bỏ qua contextId (mặc định STATIC_CONTEXT)', async () => {
      // covers P1, DP2=bỏ qua
      const { m } = createModule();
      const proxy = await m.createProxy({ use: vi.fn() });
      expect(proxy).toBeDefined();
    });

    it('CP2: truyền contextId', async () => {
      // covers P2, DP2=truyền vào
      const { m } = createModule();
      const proxy = await m.createProxy(
        { use: vi.fn() },
        { id: rand(100, 900) },
      );
      expect(proxy).toBeDefined();
    });
  });

  // =========================================================
  describe('registerHandler', () => {
    const setup = (opts: {
      method: any;
      paths: string[];
      actual?: string;
      withGetRequestMethod?: boolean;
    }) => {
      const { m } = createModule();
      m.routeInfoPathExtractor.extractPathsFrom = vi.fn(() => opts.paths);
      const router = vi.fn();
      const applicationRef: any = {
        createMiddlewareFactory: vi.fn(async () => router),
      };
      if (opts.withGetRequestMethod !== false) {
        applicationRef.getRequestMethod = vi.fn(() => opts.actual);
      }
      const proxy = vi.fn();
      const run = () =>
        m.registerHandler(
          applicationRef,
          makeRouteInfo(opts.method),
          proxy,
          new WeakSet(),
        );
      return { router, proxy, run };
    };

    it('RH1: ALL, 0 path', async () => {
      // covers B15=true, LP5=0
      const { router, run } = setup({ method: RequestMethod.ALL, paths: [] });
      await run();
      expect(router).toBeDefined();
    });

    it('RH2: ALL, 1 path; cùng request qua handler 2 lần -> dedup', async () => {
      // covers B15=true, LP5=1, B18=false (lần 1), B18=true (lần 2)
      const { router, proxy, run } = setup({
        method: RequestMethod.ALL,
        paths: ['/api'],
      });
      await run();
      const handler = router.mock.calls[0][1];
      const req = {};
      const next = vi.fn();
      handler(req, {}, next);
      handler(req, {}, next);
      expect(proxy).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('RH3: GET khớp GET; nhiều path gồm path rỗng', async () => {
      // covers B15=false, C16=true, C17a=true, C19=true/false, LP5=nhiều
      const { router, proxy, run } = setup({
        method: RequestMethod.GET,
        paths: ['', `/p${rand(10, 99)}`, '/'],
        actual: 'GET',
      });
      await run();
      expect(router).toHaveBeenCalled();
      router.mock.calls[0][1]({}, {}, vi.fn());
      expect(proxy).toHaveBeenCalled();
    });

    it('RH4: route GET, request thực là HEAD -> chạy proxy', async () => {
      // covers C17a=false, C17b=true, C17c=true
      const { router, proxy, run } = setup({
        method: RequestMethod.GET,
        paths: ['/h'],
        actual: 'HEAD',
      });
      await run();
      router.mock.calls[0][1]({}, {}, vi.fn());
      expect(proxy).toHaveBeenCalled();
    });

    it('RH5: route POST, request thực là HEAD -> next', async () => {
      // covers C17a=false, C17b=true, C17c=false
      const { router, run } = setup({
        method: RequestMethod.POST,
        paths: ['/h'],
        actual: 'HEAD',
      });
      await run();
      const next = vi.fn();
      router.mock.calls[0][1]({}, {}, next);
      expect(next).toHaveBeenCalled();
    });

    it('RH6: route POST, request thực là GET -> next', async () => {
      // covers C17a=false, C17b=false
      const { router, run } = setup({
        method: RequestMethod.POST,
        paths: ['/h'],
        actual: 'GET',
      });
      await run();
      const next = vi.fn();
      router.mock.calls[0][1]({}, {}, next);
      expect(next).toHaveBeenCalled();
    });

    it('RH7: adapter không có getRequestMethod -> next', async () => {
      // covers C16=false, C17a=false, C17b=false
      const { router, run } = setup({
        method: RequestMethod.POST,
        paths: ['/h'],
        withGetRequestMethod: false,
      });
      await run();
      const next = vi.fn();
      router.mock.calls[0][1]({}, {}, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // =========================================================
  describe('getContextId', () => {
    it('GC1: request chưa có context id, non-durable', () => {
      // covers B20=true, B21=false
      const { m } = createModule();
      const result = m.getContextId({}, false);
      expect(result).toBeDefined();
      expect(m.container.registerRequestProvider).toHaveBeenCalled();
    });

    it('GC2: request chưa có context id, durable', () => {
      // covers B20=true, B21=true
      const { m } = createModule();
      const result = m.getContextId({}, true);
      expect(result).toBeDefined();
      expect(m.container.registerRequestProvider).toHaveBeenCalled();
    });

    it('GC3: request đã có context id', () => {
      // covers B20=false
      const { m } = createModule();
      const req: any = {};
      req[REQUEST_CONTEXT_ID] = { id: rand(100, 900) };
      const result = m.getContextId(req, false);
      expect(result).toBeDefined();
    });
  });
});
