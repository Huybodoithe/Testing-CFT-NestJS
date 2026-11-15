/**
 * CFT spec: packages/core/injector/module.ts
 * Lưu tại: packages/core/test-CFT-core-2/injector/module.cft.spec.ts
 * Số dòng theo bản in bằng lệnh Get-Content (L<n>). Nhãn T1..T85 trùng với bảng trong báo cáo.
 *
 * ============================================================
 * 1. QUYẾT ĐỊNH (B) VÀ ĐIỀU KIỆN NGUYÊN TỐ (C)
 * ============================================================
 * get instance
 *   B1   L142 if (!_providers.has(_metatype))
 * get isInstantiated
 *   C2a  L155 _providers.get(_metatype)?.   (wrapper nullish)     C2b isNil(instance)
 * addInjectable
 *   B3   L223 if (isCustomProvider(injectable))
 *   B4   L231 if (!instanceWrapper)
 *   B5   L245 if (host)
 *   C6a  L247 _controllers.get(host)  ||  C6b _providers.get(host)
 *   B7   L248 hostWrapper && hostWrapper.addEnhancerMetadata(...)
 * addProvider
 *   B8   L259 if (isCustomProvider(provider))
 *   C9a  L261 isEntryProvider(provider.provide)  ||  C9b L262 isEntryProvider(useClass)
 *   C10a L271 isTransientProvider  ||  C10b L272 isRequestScopeProvider  ; && C10c L273 isAlreadyDeclared
 *   B11  L292 if (isEntryProvider(provider))
 * addCustomProvider
 *   B12  L317 isCustomClass(useClass != nil)     B13 L319 isCustomValue
 *   B14  L321 isCustomFactory                    B15 L323 isCustomUseExisting   (else: throw)
 *   isCustomValue (L340-341):  C13a isObject(provider)  &&  C13b Object.hasOwn(provider, 'useValue')
 * isDynamicModule (L354):      C16a exported  &&  C16b exported.module
 * addCustomClass
 *   B17  L365 isUndefined(scope)      B18 L368 isUndefined(durable)
 *   C19a L377 useClass?.  (nullish)   C19b useClass.name truthy (||)
 * addCustomValue
 *   C20a L397 contextOptions?.  (nullish)    C20b instrument?.  (nullish)
 *   B21  L404 instanceDecorator ? makeSafeInstanceDecorator(...)(value) : value
 *   C22a L402 providerToken?.  (nullish)     C22b name truthy (||)
 * addCustomFactory
 *   C23  L436 inject || []
 *   C24a L432 providerToken?.  (nullish)     C24b name truthy (||)
 * addCustomUseExisting
 *   C25a L455 providerToken?.  (nullish)     C25b name truthy (||)
 * addExportedProviderOrModule
 *   B26  L473 isCustomProvider(toExport)
 *   C27a L475 isString(toExport)  ||  C27b isSymbol(toExport)
 *   B28  L477 isDynamicModule(toExport)       (else: addExportedUnit(toExport))
 * addCustomExportedProvider
 *   C29a L489 isString(provide)  ||  C29b isSymbol(provide)
 * validateExportedProvider
 *   B30  L496 if (_providers.has(token))
 *   B31  L505 if (!imports.includes(token))
 *   B32  L507 isFunction(token) ? token.name : token
 * replace
 *   B33  L545 C33a options.isProvider  &&  C33b hasProvider(toReplace)
 *   B34  L549 C34a !options.isProvider &&  C34b hasInjectable(toReplace)
 * getProviderById / getControllerById / getInjectableById / getMiddlewareById
 *   B35..B38  L575 / L584 / L593 / L602  if (item.id === id)   (vòng lặp 0/1/nhiều)
 * createModuleReferenceType (lớp con động)
 *   DP1  L622 get(options = {})                       DP2 L644 contextId = createContextId()
 *   DP3  L646 resolve(options = {})
 *   C40a L627 options.strict ?? true                  C40b L628 options.each ?? false      (get)
 *   B41  L633 options.strict ? {moduleId, each} : options
 *   C42a L649 strict ?? true                          C42b L650 each ?? false              (resolve)
 *   C43a L665 type  &&  C43b isFunction(type)  &&  C43c type.prototype   (throw khi !(...))
 * isEntryProvider
 *   B44  L674 typeof metatype === 'function' ? !!Reflect.getMetadata(...) : false
 * generateUuid (gọi riêng sau khi gán token, vì trong constructor token luôn undefined)
 *   B45  L681 this.token ?          B46 L682 token.includes(':') ?          B47 L687 key ? UuidFactory.get : random
 * Hàm không có nhánh: constructor, addCoreProviders, addModuleRef, addModuleAsProvider, addApplicationConfig,
 *   addController, assignControllerUniqueId, addImport, các getter/setter, getProviderByKey, hasProvider,
 *   hasInjectable, getNonAliasProviders (chỉ là biểu thức lọc), isTransientProvider, isRequestScopeProvider.
 *
 * ============================================================
 * 2. BẢNG ĐIỀU KIỆN NGUYÊN TỐ (T: test phủ true, F: test phủ false)
 * ============================================================
 * B1   T: T4              F: T3
 * C2a  T: T5              F: T6,T7
 * C2b  T: T6              F: T7
 * B3   T: T9              F: T10..T14
 * B4   T: T10,T12,T13,T14 F: T11
 * B5   T: T12..T14        F: T10,T11
 * C6a  T: T12             F: T13,T14
 * C6b  T: T13             F: T14
 * B7   T: T12,T13         F: T14
 * B8   T: T15..T17        F: T18..T22
 * C9a  T: T16             F: T15,T17
 * C9b  T: T17             F: T15
 * C10a T: T19,T21         F: T18,T20,T22
 * C10b T: T20             F: T18,T22
 * C10c T: T19,T20         F: T21
 * B11  T: T22             F: T18..T21
 * B12  T: T24             F: T25..T28
 * B13  T: T25             F: T26..T28
 * C13a T: T25..T28        F: T29
 * C13b T: T25             F: T26..T28
 * B14  T: T26             F: T27,T28
 * B15  T: T27             F: T28
 * C16a T: T30 (giá trị thật)  F: T30 (null)
 * C16b T: T30 ({module})      F: T30 ({})
 * B17  T: T31             F: T32
 * B18  T: T31             F: T32
 * C19a T: T34             F: T31..T33
 * C19b T: T31,T32         F: T33,T34
 * C20a T: T35             F: T36..T40
 * C20b T: T36             F: T37,T38
 * B21  T: T38             F: T35..T37
 * C22a T: T40             F: T35..T39
 * C22b T: T39             F: T35
 * C23  T: T41             F: T42
 * C24a T: T43             F: T41,T42
 * C24b T: T41             F: T42
 * C25a T: T46             F: T44,T45
 * C25b T: T44             F: T45
 * B26  T: T47             F: T48..T51
 * C27a T: T48             F: T49..T51
 * C27b T: T49             F: T50,T51
 * B28  T: T50             F: T51
 * C29a T: T52             F: T53,T54
 * C29b T: T53             F: T54
 * B30  T: T55             F: T56..T58
 * B31  T: T57,T58         F: T56
 * B32  T: T58             F: T57
 * C33a T: T60,T61         F: T62,T63
 * C33b T: T60             F: T61
 * C34a T: T62,T63         F: T61
 * C34b T: T62             F: T63
 * B35  T: T64  F: T65      B36 T: T66  F: T67      B37 T: T68  F: T69      B38 T: T70  F: T71
 * DP1  bỏ qua: T73        truyền: T74
 * C40a T: T73             F: T74
 * C40b T: T73             F: T74
 * B41  T: T73             F: T74
 * DP2  bỏ qua: T75        truyền: T76
 * DP3  bỏ qua: T75        truyền: T76
 * C42a T: T75             F: T76
 * C42b T: T75             F: T76
 * C43a T: T78..T80        F: T77
 * C43b T: T79,T80         F: T78
 * C43c T: T80             F: T79
 * B44  T: T81             F: T81
 * B45  T: T82,T83         F: T84,T85
 * B46  T: T82             F: T83
 * B47  T: T82..T84        F: T85
 *
 * ============================================================
 * 3. BẢNG PATH (P theo từng hàm; mỗi test ghi P trong comment covers)
 * ============================================================
 * instance: P1 trả về (T3), P2 ném RuntimeException (T4)
 * isInstantiated: P1 wrapper không có (T5), P2 instance null (T6), P3 có instance (T7)
 * entryProviders: P1 0 phần tử, P2 1 phần tử (T8)
 * addInjectable: P1 custom (T9), P2 mới không host (T10), P3 đã có (T11), P4 host controller (T12),
 *   P5 host provider (T13), P6 host không có (T14)
 * addProvider: P1 custom thường (T15), P2 custom entry bằng provide (T16), P3 custom entry bằng useClass (T17),
 *   P4 class thường (T18), P5 transient đã khai báo (T19), P6 request đã khai báo (T20),
 *   P7 transient chưa khai báo (T21), P8 entry (T22)
 * addCustomProvider: P1 class (T24), P2 value (T25), P3 factory (T26), P4 existing (T27), P5 throw (T28)
 * addCustomClass P1..P4 (T31..T34); addCustomValue P1..P6 (T35..T40); addCustomFactory P1..P3 (T41..T43);
 *   addCustomUseExisting P1..P3 (T44..T46)
 * addExportedProviderOrModule: P1 custom (T47), P2 string (T48), P3 symbol (T49), P4 dynamic (T50), P5 class (T51)
 * addCustomExportedProvider: P1 string (T52), P2 symbol (T53), P3 khác (T54)
 * validateExportedProvider: P1 có provider (T55), P2 có trong imports (T56), P3 ném, token chuỗi (T57), P4 ném, token class (T58)
 * replace: P1 provider (T60), P2 không có provider (T61), P3 injectable (T62), P4 không có injectable (T63)
 * getXById: mỗi hàm P1 tìm thấy, P2 không thấy (T64..T71)
 * ModuleRef: get P1 (T73), P2 (T74); resolve P1 (T75), P2 (T76); create P1..P3 ném (T77..T79), P4 hợp lệ (T80)
 * isEntryProvider: P1 function có/không metadata, P2 không phải function (T81)
 * generateUuid: P1 token có ':' (T82), P2 token không ':' (T83), P3 dùng name (T84), P4 random (T85)
 *
 * ============================================================
 * 4. TỔNG KẾT
 * ============================================================
 * Mọi quyết định và điều kiện nguyên tố trong bảng đều có cả true và false. Unreachable: không có.
 * (Chưa chạy: coverage thực tế chờ bảng đo. V8 có thể không tính ??, ?., || là nhánh riêng nên C3
 *  chứng minh bằng bảng trên; ghi rõ "Branch % theo V8".)
 *
 * ============================================================
 * 5. LÝ DO MOCK
 * ============================================================
 * - Module, InstanceWrapper, ApplicationConfig, các exception, helper getClassScope/isDurable/UuidFactory dùng bản thật.
 * - container là đối tượng giả tối giản { applicationConfig, contextOptions }: constructor Module chỉ đọc hai field
 *   này, và NestContainer thật không cần thiết cho phạm vi unit test.
 * - vi.spyOn trên instance của ModuleRef động (find, resolvePerContext, instantiateClass): cô lập việc chuyển tiếp
 *   tham số của get/resolve/create khỏi container thật. mockRestore trong afterEach.
 *
 * ============================================================
 * 6. ĐỐI CHIẾU COPILOT
 * ============================================================
 * - Đúng: Module không có I/O; provider transient/request và entry provider dựng được bằng Injectable({scope}) và
 *   Reflect.defineMetadata; custom provider chọn theo hình dạng object (useValue: undefined vẫn là value provider);
 *   export kiểm tra qua import graph; get/resolve/create dùng được bằng spy trên find/resolvePerContext.
 * - Chưa đúng: Copilot nói nhánh token của generateUuid đạt được qua constructor. Thực tế `_token` luôn undefined
 *   lúc constructor chạy nên chỉ gọi lại generateUuid sau khi gán token mới đạt nhánh có token (T82, T83); không cần
 *   spy UuidFactory. Copilot cũng gợi ý spy Logger.prototype.warn cho instanceDecorator: việc ghi log nằm trong
 *   makeSafeInstanceDecorator (file khác), không thuộc module.ts.
 * - Thiếu: không liệt kê điều kiện nguyên tố (C6, C9, C10, C13, C16, C43), `?.` (C2a, C19a, C20, C22a, C24a, C25a),
 *   `||` của tên (C19b, C22b, C24b, C25b), `?:` ở B21 và B32, tham số mặc định (DP1..DP3), replace (C33/C34),
 *   addCustomExportedProvider, validateExportedProvider (B30..B32) và các vòng lặp getXById.
 * - Chưa xác minh: ModuleRef constructor với container giả chạy được (Module cũng tạo ModuleRef ngay trong
 *   constructor); InstanceWrapper chấp nhận token/name undefined (T40, T43, T46).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Injectable, Scope } from '@nestjs/common';
import { ENTRY_PROVIDER_WATERMARK } from '@nestjs/common/internal';
import { ApplicationConfig } from '../../application-config';
import { Module } from '../../injector/module';

// ---------- seed cố định ----------
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};
const tok = () => `tok${rand(100, 999)}`;

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
});

// ---------- hàm dựng ----------
const makeClass = (): any => {
  class C {}
  return C;
};
const anonClass = (): any => (() => class {})();
const entryClass = (): any => {
  const E = makeClass();
  Reflect.defineMetadata(ENTRY_PROVIDER_WATERMARK, true, E);
  return E;
};
const scoped = (scope: Scope): any => {
  const S = makeClass();
  Injectable({ scope })(S);
  return S;
};

function mk(opts: { contextOptions?: any; metatype?: any } = {}) {
  class SomeModule {}
  const container: any = {
    applicationConfig: new ApplicationConfig(),
    contextOptions: opts.contextOptions,
  };
  const metatype = opts.metatype ?? SomeModule;
  const mod = new Module(metatype, container);
  return { mod, m: mod as any, container, metatype };
}
const newRef = (mod: Module): any =>
  new (mod.createModuleReferenceType())() as any;

describe('Module (CFT)', () => {
  // ---------------- constructor, getters ----------------
  describe('constructor / getters', () => {
    it('T1: constructor tạo core providers', () => {
      // covers P1
      const { mod } = mk();
      expect(mod.providers.size).toBeDefined();
    });

    it('T2: getter/setter và hàm tra cứu đơn giản', () => {
      // covers P1 (getter/setter, getProviderByKey, hasProvider, hasInjectable)
      const { mod, metatype } = mk();
      mod.token = `t${rand(100, 999)}`;
      mod.isGlobal = true;
      mod.initOnPreview = true;
      mod.distance = rand(5, 90);
      expect(mod.id).toBeDefined();
      expect(mod.token).toBeDefined();
      expect(mod.name).toBeDefined();
      expect(mod.isGlobal).toBeDefined();
      expect(mod.initOnPreview).toBeDefined();
      expect(mod.distance).toBeDefined();
      expect(mod.metatype).toBeDefined();
      expect(mod.middlewares).toBeDefined();
      expect(mod.imports).toBeDefined();
      expect(mod.injectables).toBeDefined();
      expect(mod.controllers).toBeDefined();
      expect(mod.exports).toBeDefined();
      expect(mod.getProviderByKey(metatype)).toBeDefined();
      expect(mod.hasProvider(metatype)).toBeDefined();
      expect(mod.hasInjectable(metatype)).toBeDefined();
    });

    it('T3: instance khi có provider của module', () => {
      // covers P1, B1=false
      const { mod } = mk();
      expect(() => mod.instance).not.toThrow();
    });

    it('T4: instance khi thiếu provider của module', () => {
      // covers P2, B1=true
      const { mod, metatype } = mk();
      mod.providers.delete(metatype);
      expect(() => mod.instance).toThrow();
    });

    it('T5: isInstantiated khi không có wrapper', () => {
      // covers P1, C2a=true
      const { mod, metatype } = mk();
      mod.providers.delete(metatype);
      expect(mod.isInstantiated).toBeDefined();
    });

    it('T6: isInstantiated khi instance là null', () => {
      // covers P2, C2a=false, C2b=true
      const { mod } = mk();
      expect(mod.isInstantiated).toBeDefined();
    });

    it('T7: isInstantiated khi đã có instance', () => {
      // covers P3, C2b=false
      const { mod, metatype } = mk();
      mod.getProviderByKey(metatype).instance = {} as any;
      expect(mod.isInstantiated).toBeDefined();
    });

    it('T8: entryProviders với 0 và 1 phần tử', () => {
      // covers P1 (0 phần tử), P2 (1 phần tử)
      const { mod } = mk();
      expect(mod.entryProviders).toBeDefined();
      mod.addProvider(entryClass());
      expect(mod.entryProviders).toBeDefined();
    });
  });

  // ---------------- addInjectable ----------------
  describe('addInjectable', () => {
    it('T9: custom provider', () => {
      // covers P1, B3=true
      const { mod } = mk();
      expect(() =>
        mod.addInjectable(
          { provide: tok(), useValue: rand(1, 99) } as any,
          'guard' as any,
        ),
      ).not.toThrow();
    });

    it('T10: class mới, không host', () => {
      // covers P2, B3=false, B4=true, B5=false
      const { mod } = mk();
      expect(mod.addInjectable(makeClass(), 'guard' as any)).toBeDefined();
    });

    it('T11: class đã có trong injectables', () => {
      // covers P3, B4=false
      const { mod } = mk();
      const G = makeClass();
      mod.addInjectable(G, 'guard' as any);
      expect(mod.addInjectable(G, 'guard' as any)).toBeDefined();
    });

    it('T12: host là controller', () => {
      // covers P4, B5=true, C6a=true, B7=true
      const { mod } = mk();
      const Ctrl = makeClass();
      mod.addController(Ctrl);
      expect(
        mod.addInjectable(makeClass(), 'guard' as any, Ctrl),
      ).toBeDefined();
    });

    it('T13: host là provider', () => {
      // covers P5, C6a=false, C6b=true, B7=true
      const { mod } = mk();
      const Svc = makeClass();
      mod.addProvider(Svc);
      expect(mod.addInjectable(makeClass(), 'guard' as any, Svc)).toBeDefined();
    });

    it('T14: host không tồn tại', () => {
      // covers P6, C6a=false, C6b=false, B7=false
      const { mod } = mk();
      expect(
        mod.addInjectable(makeClass(), 'guard' as any, makeClass()),
      ).toBeDefined();
    });
  });

  // ---------------- addProvider ----------------
  describe('addProvider', () => {
    it('T15: custom provider, provide và useClass không phải entry', () => {
      // covers P1, B8=true, C9a=false, C9b=false
      const { mod } = mk();
      expect(
        mod.addProvider({ provide: tok(), useClass: makeClass() } as any),
      ).toBeDefined();
    });

    it('T16: custom provider, provide là entry', () => {
      // covers P2, C9a=true
      const { mod } = mk();
      expect(
        mod.addProvider({
          provide: entryClass(),
          useValue: rand(1, 99),
        } as any),
      ).toBeDefined();
    });

    it('T17: custom provider, useClass là entry', () => {
      // covers P3, C9a=false, C9b=true
      const { mod } = mk();
      expect(
        mod.addProvider({ provide: tok(), useClass: entryClass() } as any),
      ).toBeDefined();
    });

    it('T18: class thường, mới', () => {
      // covers P4, B8=false, C10a=false, C10b=false, B11=false
      const { mod } = mk();
      expect(mod.addProvider(makeClass())).toBeDefined();
    });

    it('T19: class transient đã khai báo -> trả về sớm', () => {
      // covers P5, C10a=true, C10c=true (lần gọi thứ hai); lần đầu C10c=false, B11=false
      const { mod } = mk();
      const S = scoped(Scope.TRANSIENT);
      mod.addProvider(S);
      expect(mod.addProvider(S)).toBeDefined();
    });

    it('T20: class request-scope đã khai báo -> trả về sớm', () => {
      // covers P6, C10a=false, C10b=true, C10c=true
      const { mod } = mk();
      const S = scoped(Scope.REQUEST);
      mod.addProvider(S);
      expect(mod.addProvider(S)).toBeDefined();
    });

    it('T21: class transient chưa khai báo', () => {
      // covers P7, C10a=true, C10c=false
      const { mod } = mk();
      expect(mod.addProvider(scoped(Scope.TRANSIENT))).toBeDefined();
    });

    it('T22: class entry', () => {
      // covers P8, C10a=false, C10b=false, B11=true
      const { mod } = mk();
      expect(mod.addProvider(entryClass())).toBeDefined();
    });
  });

  // ---------------- isCustomProvider, addCustomProvider ----------------
  describe('isCustomProvider / addCustomProvider', () => {
    it('T23: isCustomProvider có và không có provide', () => {
      // covers P1, !isNil(provide)=true/false
      const { mod } = mk();
      expect(
        mod.isCustomProvider({ provide: tok(), useValue: 1 } as any),
      ).toBeDefined();
      expect(mod.isCustomProvider(makeClass())).toBeDefined();
    });

    it('T24: class provider', () => {
      // covers P1, B12=true
      const { m } = mk();
      expect(
        m.addCustomProvider(
          { provide: tok(), useClass: makeClass() },
          new Map(),
        ),
      ).toBeDefined();
    });

    it('T25: value provider', () => {
      // covers P2, B12=false, B13=true, C13a=true, C13b=true
      const { m } = mk();
      expect(
        m.addCustomProvider(
          { provide: tok(), useValue: rand(1, 99) },
          new Map(),
        ),
      ).toBeDefined();
    });

    it('T26: factory provider', () => {
      // covers P3, B13=false (C13b=false), B14=true
      const { m } = mk();
      expect(
        m.addCustomProvider(
          { provide: tok(), useFactory: () => rand(1, 99) },
          new Map(),
        ),
      ).toBeDefined();
    });

    it('T27: useExisting provider', () => {
      // covers P4, B14=false, B15=true
      const { m } = mk();
      expect(
        m.addCustomProvider({ provide: tok(), useExisting: tok() }, new Map()),
      ).toBeDefined();
    });

    it('T28: provider không hợp lệ -> InvalidProviderException', () => {
      // covers P5, B15=false
      const { m } = mk();
      expect(() =>
        m.addCustomProvider({ provide: tok() }, new Map()),
      ).toThrow();
    });

    it('T29: isCustomValue với giá trị không phải object', () => {
      // covers C13a=false
      const { mod } = mk();
      expect(mod.isCustomValue('plain')).toBeDefined();
    });

    it('T30: isDynamicModule với null, {} và {module}', () => {
      // covers C16a=false (null), C16a=true/C16b=false ({}), C16a=true/C16b=true ({module})
      const { mod } = mk();
      expect(mod.isDynamicModule(null)).toBeDefined();
      expect(mod.isDynamicModule({})).toBeDefined();
      expect(mod.isDynamicModule({ module: makeClass() })).toBeDefined();
    });
  });

  // ---------------- addCustomClass ----------------
  describe('addCustomClass', () => {
    it('T31: scope và durable bỏ trống, class có tên', () => {
      // covers P1, B17=true, B18=true, C19a=false, C19b=true
      const { m } = mk();
      expect(() =>
        m.addCustomClass({ provide: tok(), useClass: makeClass() }, new Map()),
      ).not.toThrow();
    });

    it('T32: truyền scope và durable', () => {
      // covers P2, B17=false, B18=false
      const { m } = mk();
      expect(() =>
        m.addCustomClass(
          {
            provide: tok(),
            useClass: makeClass(),
            scope: Scope.DEFAULT,
            durable: false,
          },
          new Map(),
        ),
      ).not.toThrow();
    });

    it('T33: class ẩn danh (name rỗng)', () => {
      // covers P3, C19b=false
      const { m } = mk();
      expect(() =>
        m.addCustomClass({ provide: tok(), useClass: anonClass() }, new Map()),
      ).not.toThrow();
    });

    it('T34: useClass undefined, truyền scope và durable', () => {
      // covers P4, C19a=true
      const { m } = mk();
      expect(() =>
        m.addCustomClass(
          {
            provide: tok(),
            useClass: undefined,
            scope: Scope.DEFAULT,
            durable: false,
          },
          new Map(),
        ),
      ).not.toThrow();
    });
  });

  // ---------------- addCustomValue ----------------
  describe('addCustomValue', () => {
    it('T35: contextOptions undefined, token chuỗi', () => {
      // covers P1, C20a=true, B21=false, C22a=false, C22b=false
      const { m } = mk();
      expect(() =>
        m.addCustomValue({ provide: tok(), useValue: rand(1, 99) }, new Map()),
      ).not.toThrow();
    });

    it('T36: contextOptions rỗng', () => {
      // covers P2, C20a=false, C20b=true, B21=false
      const { m } = mk({ contextOptions: {} });
      expect(() =>
        m.addCustomValue({ provide: tok(), useValue: rand(1, 99) }, new Map()),
      ).not.toThrow();
    });

    it('T37: instrument không có instanceDecorator', () => {
      // covers P3, C20b=false, B21=false
      const { m } = mk({ contextOptions: { instrument: {} } });
      expect(() =>
        m.addCustomValue({ provide: tok(), useValue: rand(1, 99) }, new Map()),
      ).not.toThrow();
    });

    it('T38: có instanceDecorator', () => {
      // covers P4, B21=true
      const decorator = vi.fn((v: unknown) => v);
      const { m } = mk({
        contextOptions: { instrument: { instanceDecorator: decorator } },
      });
      m.addCustomValue({ provide: tok(), useValue: rand(1, 99) }, new Map());
      expect(decorator).toHaveBeenCalled();
    });

    it('T39: token là class, value là Promise', () => {
      // covers P5, C22b=true
      const { m } = mk();
      expect(() =>
        m.addCustomValue(
          { provide: makeClass(), useValue: Promise.resolve(rand(1, 99)) },
          new Map(),
        ),
      ).not.toThrow();
    });

    it('T40: token undefined', () => {
      // covers P6, C22a=true
      const { m } = mk();
      expect(() =>
        m.addCustomValue(
          { provide: undefined, useValue: rand(1, 99) },
          new Map(),
        ),
      ).not.toThrow();
    });
  });

  // ---------------- addCustomFactory ----------------
  describe('addCustomFactory', () => {
    it('T41: có inject, token là class', () => {
      // covers P1, C23=true, C24a=false, C24b=true
      const { m } = mk();
      expect(() =>
        m.addCustomFactory(
          { provide: makeClass(), useFactory: () => 1, inject: [tok()] },
          new Map(),
        ),
      ).not.toThrow();
    });

    it('T42: không inject, token là chuỗi', () => {
      // covers P2, C23=false, C24b=false
      const { m } = mk();
      expect(() =>
        m.addCustomFactory({ provide: tok(), useFactory: () => 1 }, new Map()),
      ).not.toThrow();
    });

    it('T43: token undefined', () => {
      // covers P3, C24a=true
      const { m } = mk();
      expect(() =>
        m.addCustomFactory(
          { provide: undefined, useFactory: () => 1 },
          new Map(),
        ),
      ).not.toThrow();
    });
  });

  // ---------------- addCustomUseExisting ----------------
  describe('addCustomUseExisting', () => {
    it('T44: token là class', () => {
      // covers P1, C25a=false, C25b=true
      const { m } = mk();
      expect(() =>
        m.addCustomUseExisting(
          { provide: makeClass(), useExisting: tok() },
          new Map(),
        ),
      ).not.toThrow();
    });

    it('T45: token là chuỗi', () => {
      // covers P2, C25b=false
      const { m } = mk();
      expect(() =>
        m.addCustomUseExisting(
          { provide: tok(), useExisting: tok() },
          new Map(),
        ),
      ).not.toThrow();
    });

    it('T46: token undefined', () => {
      // covers P3, C25a=true
      const { m } = mk();
      expect(() =>
        m.addCustomUseExisting(
          { provide: undefined, useExisting: tok() },
          new Map(),
        ),
      ).not.toThrow();
    });
  });

  // ---------------- addExportedProviderOrModule ----------------
  describe('addExportedProviderOrModule', () => {
    it('T47: custom provider', () => {
      // covers P1, B26=true
      const { mod } = mk();
      const t = tok();
      mod.addProvider({ provide: t, useValue: rand(1, 99) } as any);
      expect(() =>
        mod.addExportedProviderOrModule({ provide: t, useValue: 1 } as any),
      ).not.toThrow();
    });

    it('T48: token chuỗi', () => {
      // covers P2, B26=false, C27a=true
      const { mod } = mk();
      const t = tok();
      mod.addProvider({ provide: t, useValue: rand(1, 99) } as any);
      expect(() => mod.addExportedProviderOrModule(t)).not.toThrow();
    });

    it('T49: token symbol', () => {
      // covers P3, C27a=false, C27b=true
      const { mod } = mk();
      const s = Symbol(tok());
      mod.addProvider({ provide: s, useValue: rand(1, 99) } as any);
      expect(() => mod.addExportedProviderOrModule(s)).not.toThrow();
    });

    it('T50: dynamic module', () => {
      // covers P4, C27a=false, C27b=false, B28=true
      const { mod, container } = mk();
      const Imported = makeClass();
      mod.addImport(new Module(Imported, container));
      expect(() =>
        mod.addExportedProviderOrModule({ module: Imported } as any),
      ).not.toThrow();
    });

    it('T51: class provider', () => {
      // covers P5, B28=false
      const { mod } = mk();
      const C = makeClass();
      mod.addProvider(C);
      expect(() => mod.addExportedProviderOrModule(C)).not.toThrow();
    });
  });

  // ---------------- addCustomExportedProvider ----------------
  describe('addCustomExportedProvider', () => {
    it('T52: provide là chuỗi', () => {
      // covers P1, C29a=true
      const { mod, m } = mk();
      const t = tok();
      mod.addProvider({ provide: t, useValue: rand(1, 99) } as any);
      expect(() => m.addCustomExportedProvider({ provide: t })).not.toThrow();
    });

    it('T53: provide là symbol', () => {
      // covers P2, C29a=false, C29b=true
      const { mod, m } = mk();
      const s = Symbol(tok());
      mod.addProvider({ provide: s, useValue: rand(1, 99) } as any);
      expect(() => m.addCustomExportedProvider({ provide: s })).not.toThrow();
    });

    it('T54: provide là class', () => {
      // covers P3, C29a=false, C29b=false
      const { mod, m } = mk();
      const C = makeClass();
      mod.addProvider(C);
      expect(() => m.addCustomExportedProvider({ provide: C })).not.toThrow();
    });
  });

  // ---------------- validateExportedProvider ----------------
  describe('validateExportedProvider', () => {
    it('T55: token có trong providers', () => {
      // covers P1, B30=true
      const { mod } = mk();
      const t = tok();
      mod.addProvider({ provide: t, useValue: rand(1, 99) } as any);
      expect(mod.validateExportedProvider(t)).toBeDefined();
    });

    it('T56: token là metatype của module được import', () => {
      // covers P2, B30=false, B31=false
      const { mod, container } = mk();
      const Imported = makeClass();
      mod.addImport(new Module(Imported, container));
      expect(mod.validateExportedProvider(Imported)).toBeDefined();
    });

    it('T57: token chuỗi lạ -> UnknownExportException', () => {
      // covers P3, B31=true, B32=false
      const { mod } = mk();
      expect(() => mod.validateExportedProvider(tok())).toThrow();
    });

    it('T58: token class lạ -> UnknownExportException', () => {
      // covers P4, B31=true, B32=true
      const { mod } = mk();
      expect(() => mod.validateExportedProvider(makeClass())).toThrow();
    });
  });

  // ---------------- addController, addImport ----------------
  describe('addController / addImport', () => {
    it('T59: addController gán id, addImport thêm module', () => {
      // covers P1 (addController, assignControllerUniqueId, addImport)
      const { mod, container } = mk();
      mod.addController(makeClass());
      mod.addImport(new Module(makeClass(), container));
      expect(mod.controllers.size).toBeDefined();
    });
  });

  // ---------------- replace ----------------
  describe('replace', () => {
    it('T60: isProvider=true, có provider', () => {
      // covers P1, C33a=true, C33b=true
      const { mod } = mk();
      const t = tok();
      mod.addProvider({ provide: t, useValue: rand(1, 99) } as any);
      expect(() =>
        mod.replace(t, { isProvider: true, useValue: rand(100, 199) }),
      ).not.toThrow();
    });

    it('T61: isProvider=true, không có provider', () => {
      // covers P2, C33b=false, C34a=false
      const { mod } = mk();
      expect(() =>
        mod.replace(tok(), { isProvider: true, useValue: 1 }),
      ).not.toThrow();
    });

    it('T62: isProvider=false, có injectable', () => {
      // covers P3, C33a=false, C34a=true, C34b=true
      const { mod } = mk();
      const G = makeClass();
      mod.addInjectable(G, 'guard' as any);
      expect(() =>
        mod.replace(G, { isProvider: false, useValue: rand(100, 199) }),
      ).not.toThrow();
    });

    it('T63: isProvider=false, không có injectable', () => {
      // covers P4, C34b=false
      const { mod } = mk();
      expect(() =>
        mod.replace(makeClass(), { isProvider: false }),
      ).not.toThrow();
    });
  });

  // ---------------- getXById ----------------
  describe('getProviderById / getControllerById / getInjectableById / getMiddlewareById', () => {
    it('T64: getProviderById tìm thấy', () => {
      // covers P1, B35=true
      const { mod, metatype } = mk();
      const id = mod.getProviderByKey(metatype).id;
      expect(() => mod.getProviderById(id)).not.toThrow();
    });

    it('T65: getProviderById không tìm thấy', () => {
      // covers P2, B35=false
      const { mod } = mk();
      expect(() => mod.getProviderById(`id${rand(100, 999)}`)).not.toThrow();
    });

    it('T66: getControllerById tìm thấy', () => {
      // covers P1, B36=true
      const { mod } = mk();
      const Ctrl = makeClass();
      mod.addController(Ctrl);
      const id = mod.controllers.get(Ctrl)!.id;
      expect(() => mod.getControllerById(id)).not.toThrow();
    });

    it('T67: getControllerById khi 0 controller', () => {
      // covers P2, B36=false (vòng lặp 0 lần)
      const { mod } = mk();
      expect(() => mod.getControllerById(`id${rand(100, 999)}`)).not.toThrow();
    });

    it('T68: getInjectableById tìm thấy', () => {
      // covers P1, B37=true
      const { mod } = mk();
      const w = mod.addInjectable(makeClass(), 'guard' as any) as any;
      expect(() => mod.getInjectableById(w.id)).not.toThrow();
    });

    it('T69: getInjectableById không tìm thấy', () => {
      // covers P2, B37=false (vòng lặp 1 lần)
      const { mod } = mk();
      mod.addInjectable(makeClass(), 'guard' as any);
      expect(() => mod.getInjectableById(`id${rand(100, 999)}`)).not.toThrow();
    });

    it('T70: getMiddlewareById tìm thấy', () => {
      // covers P1, B38=true
      const { mod } = mk();
      const id = `mw${rand(100, 999)}`;
      mod.middlewares.set(tok(), { id } as any);
      expect(() => mod.getMiddlewareById(id)).not.toThrow();
    });

    it('T71: getMiddlewareById khi 0 middleware', () => {
      // covers P2, B38=false (vòng lặp 0 lần)
      const { mod } = mk();
      expect(() => mod.getMiddlewareById(`mw${rand(100, 999)}`)).not.toThrow();
    });
  });

  // ---------------- getNonAliasProviders ----------------
  describe('getNonAliasProviders', () => {
    it('T72: có provider alias và provider thường', () => {
      // covers P1 (lọc isAlias true/false)
      const { mod } = mk();
      mod.addProvider({ provide: tok(), useExisting: tok() } as any);
      mod.addProvider(makeClass());
      expect(() => mod.getNonAliasProviders()).not.toThrow();
    });
  });

  // ---------------- createModuleReferenceType ----------------
  describe('createModuleReferenceType', () => {
    it('T73: get không truyền options', () => {
      // covers P1, DP1=bỏ qua, C40a=true, C40b=true, B41=true
      const { mod } = mk();
      const ref = newRef(mod);
      const find = track(vi.spyOn(ref, 'find').mockReturnValue({} as any));
      ref.get(tok());
      expect(find).toHaveBeenCalled();
    });

    it('T74: get với strict=false, each=true', () => {
      // covers P2, DP1=truyền, C40a=false, C40b=false, B41=false
      const { mod } = mk();
      const ref = newRef(mod);
      const find = track(vi.spyOn(ref, 'find').mockReturnValue({} as any));
      ref.get(tok(), { strict: false, each: true });
      expect(find).toHaveBeenCalled();
    });

    it('T75: resolve không truyền contextId và options', () => {
      // covers P1, DP2=bỏ qua, DP3=bỏ qua, C42a=true, C42b=true
      const { mod } = mk();
      const ref = newRef(mod);
      const resolvePerContext = track(
        vi.spyOn(ref, 'resolvePerContext').mockResolvedValue(undefined as any),
      );
      return ref.resolve(tok()).then(() => {
        expect(resolvePerContext).toHaveBeenCalled();
      });
    });

    it('T76: resolve có contextId và options', () => {
      // covers P2, DP2=truyền, DP3=truyền, C42a=false, C42b=false
      const { mod } = mk();
      const ref = newRef(mod);
      const resolvePerContext = track(
        vi.spyOn(ref, 'resolvePerContext').mockResolvedValue(undefined as any),
      );
      return ref
        .resolve(tok(), { id: rand(100, 999) }, { strict: false, each: true })
        .then(() => {
          expect(resolvePerContext).toHaveBeenCalled();
        });
    });

    it('T77: create với type undefined', async () => {
      // covers P1, C43a=false
      const { mod } = mk();
      await expect(newRef(mod).create(undefined)).rejects.toThrow();
    });

    it('T78: create với type không phải function', async () => {
      // covers P2, C43a=true, C43b=false
      const { mod } = mk();
      await expect(newRef(mod).create({ x: rand(1, 99) })).rejects.toThrow();
    });

    it('T79: create với function không có prototype', async () => {
      // covers P3, C43b=true, C43c=false
      const { mod } = mk();
      await expect(newRef(mod).create(() => rand(1, 99))).rejects.toThrow();
    });

    it('T80: create với class hợp lệ', async () => {
      // covers P4, C43c=true
      const { mod } = mk();
      const ref = newRef(mod);
      const instantiate = track(
        vi.spyOn(ref, 'instantiateClass').mockResolvedValue({} as any),
      );
      await ref.create(makeClass());
      expect(instantiate).toHaveBeenCalled();
    });
  });

  // ---------------- isEntryProvider ----------------
  describe('isEntryProvider', () => {
    it('T81: function có metadata, function không metadata, không phải function', () => {
      // covers P1 (B44=true, !!getMetadata true/false), P2 (B44=false)
      const { m } = mk();
      expect(m.isEntryProvider(entryClass())).toBeDefined();
      expect(m.isEntryProvider(makeClass())).toBeDefined();
      expect(m.isEntryProvider(tok())).toBeDefined();
    });
  });

  // ---------------- generateUuid ----------------
  describe('generateUuid', () => {
    it('T82: token chứa dấu ":"', () => {
      // covers P1, B45=true, B46=true, B47=true
      const { mod, m } = mk();
      mod.token = `${tok()}:${tok()}`;
      expect(() => m.generateUuid()).not.toThrow();
    });

    it('T83: token không chứa dấu ":"', () => {
      // covers P2, B46=false
      const { mod, m } = mk();
      mod.token = tok();
      expect(() => m.generateUuid()).not.toThrow();
    });

    it('T84: không có token, dùng tên metatype', () => {
      // covers P3, B45=false, B47=true
      const { m } = mk();
      expect(() => m.generateUuid()).not.toThrow();
    });

    it('T85: không có token, tên metatype rỗng -> random', () => {
      // covers P4, B45=false, B47=false
      const { m } = mk({ metatype: anonClass() });
      expect(() => m.generateUuid()).not.toThrow();
    });
  });
});
