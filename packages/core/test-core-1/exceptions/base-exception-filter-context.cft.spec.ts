import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import {
  FILTER_CATCH_EXCEPTIONS,
  type ExceptionFilterMetadata,
} from '@nestjs/common/internal';
import { BaseExceptionFilterContext } from '../../exceptions/base-exception-filter-context.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type { NestContainer } from '../../injector/container.js';
import type {
  ContextId,
  HostComponentInfo,
  InstanceWrapper,
} from '../../injector/instance-wrapper.js';

const RANDOM_SEED = 1808;

// PRNG một bước cho từng salt: kết quả độc lập với thứ tự chạy các test.
function seededNumber(salt: number): number {
  const state = (Math.imul(RANDOM_SEED ^ salt, 1664525) + 1013904223) >>> 0;
  return 10_000 + (state % 90_000);
}

function seededLabel(salt: number): string {
  return `cft-${seededNumber(salt).toString(36)}`;
}

class InspectableContext extends BaseExceptionFilterContext {
  // Trạng thái này được thiết lập bởi các context con thật của NestJS.
  setModuleContext(moduleName: string): void {
    this.moduleContext = moduleName;
  }
}

type ModuleStub = { injectables: Map<Function, InstanceWrapper> };

function makeHarness() {
  const modules = new Map<string, ModuleStub>();
  const getModules = vi.fn(() => modules);
  // Chỉ mô phỏng biên container.getModules(); không giả mạo implementation mục tiêu.
  const container = { getModules } as unknown as NestContainer;
  return { context: new InspectableContext(container), modules, getModules };
}

type Harness = ReturnType<typeof makeHarness>;

function registerModule(
  harness: Harness,
  moduleName: string,
  entries: readonly (readonly [Function, InstanceWrapper])[] = [],
): void {
  harness.modules.set(moduleName, { injectables: new Map(entries) });
  harness.context.setModuleContext(moduleName);
}

function makeWrapper(
  token: Function,
  host: { instance: ExceptionFilter | null } | undefined,
  isDurable = false,
) {
  const resolve = vi.fn((_contextId: ContextId, _inquirerId?: string) => host);
  const isDependencyTreeDurable = vi.fn(() => isDurable);
  // Stub giới hạn tại giao diện mà BaseExceptionFilterContext sử dụng.
  const wrapper = {
    token,
    getInstanceByContextId: resolve,
    isDependencyTreeDurable,
  } as unknown as InstanceWrapper;
  return { wrapper, resolve, isDependencyTreeDurable };
}

// Filter trong test không dùng host; giá trị này chỉ thỏa contract của callback.
const unusedHost = {} as ArgumentsHost;

describe('BaseExceptionFilterContext / CFT (seed 1808)', () => {
  describe('createConcreteContext', () => {
    it('T01 - metadata rỗng trả [] sớm mà không truy cập container', () => {
      const harness = makeHarness();
      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >([]);

      expect(result).toEqual([]);
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T02 - metadata undefined kích hoạt nhánh isEmpty và trả []', () => {
      const harness = makeHarness();
      // Ngoại lệ biên chủ đích: metadata có thể chưa được Reflect cung cấp.
      const missingMetadata = undefined as unknown as unknown[];
      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >(missingMetadata);

      expect(result).toEqual([]);
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T03 - lọc phần tử falsy và phần tử không phải filter/function', () => {
      const harness = makeHarness();
      const invalidEntries: unknown[] = [
        null,
        undefined,
        false,
        0,
        '',
        seededLabel(3),
        { catch: seededLabel(4) },
        {},
      ];

      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >(invalidEntries);

      expect(result).toEqual([]);
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T04 - chấp nhận object.catch là function, bind this và đọc metadata', () => {
      const harness = makeHarness();
      const payload = seededLabel(5);
      class KnownError extends Error {}
      class ObjectFilter implements ExceptionFilter {
        readonly payload = payload;
        catch(): string {
          return this.payload;
        }
      }
      Reflect.defineMetadata(FILTER_CATCH_EXCEPTIONS, [KnownError], ObjectFilter);
      const filter = new ObjectFilter();

      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >([filter]);

      expect(result).toHaveLength(1);
      expect(result[0].exceptionMetatypes).toEqual([KnownError]);
      expect(result[0].func(new KnownError(), unusedHost)).toBe(payload);
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T05 - class filter được resolve qua wrapper với STATIC_CONTEXT mặc định', () => {
      const harness = makeHarness();
      const moduleName = seededLabel(6);
      const payload = seededLabel(7);
      class RegisteredFilter implements ExceptionFilter {
        readonly payload = payload;
        catch(): string {
          return this.payload;
        }
      }
      const resolvedFilter = new RegisteredFilter();
      const { wrapper, resolve } = makeWrapper(RegisteredFilter, {
        instance: resolvedFilter,
      });
      registerModule(harness, moduleName, [[RegisteredFilter, wrapper]]);

      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >([RegisteredFilter]);

      expect(harness.getModules).toHaveBeenCalledOnce();
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(STATIC_CONTEXT, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].exceptionMetatypes).toEqual([]);
      expect(result[0].func(new Error(seededLabel(8)), unusedHost)).toBe(
        payload,
      );
    });

    it('T06 - nhiều phần tử: giữ thứ tự các filter hợp lệ và bỏ class không đăng ký', () => {
      const harness = makeHarness();
      const firstValue = seededLabel(9);
      const secondValue = seededLabel(10);
      class FirstFilter implements ExceptionFilter {
        catch(): string {
          return firstValue;
        }
      }
      class SecondFilter implements ExceptionFilter {
        catch(): string {
          return secondValue;
        }
      }
      class MissingFilter implements ExceptionFilter {
        catch(): string {
          return seededLabel(11);
        }
      }
      registerModule(harness, seededLabel(12));

      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >([
        null,
        new FirstFilter(),
        MissingFilter,
        { catch: seededLabel(13) },
        new SecondFilter(),
      ]);

      expect(result).toHaveLength(2);
      expect(result.map(entry => entry.func(new Error(), unusedHost))).toEqual([
        firstValue,
        secondValue,
      ]);
      expect(harness.getModules).toHaveBeenCalledOnce();
    });

    it('T21 - contextId và inquirerId tường minh được truyền từ createConcreteContext', () => {
      const harness = makeHarness();
      class ScopedFilter implements ExceptionFilter {
        catch(): string {
          return seededLabel(21);
        }
      }
      const instance = new ScopedFilter();
      const { wrapper, resolve } = makeWrapper(ScopedFilter, { instance });
      registerModule(harness, seededLabel(22), [[ScopedFilter, wrapper]]);
      const contextId: ContextId = { id: seededNumber(23) };
      const inquirerId = seededLabel(24);

      const result = harness.context.createConcreteContext<
        unknown[],
        ExceptionFilterMetadata[]
      >([ScopedFilter], contextId, inquirerId);

      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(contextId, inquirerId);
      expect(result).toHaveLength(1);
      expect(result[0].func(new Error(), unusedHost)).toBe(seededLabel(21));
    });
  });

  describe('getFilterInstance', () => {
    it('T07 - object có catch truthy được trả trực tiếp, bỏ qua DI', () => {
      const harness = makeHarness();
      const directFilter: ExceptionFilter = { catch: vi.fn() };

      expect(harness.context.getFilterInstance(directFilter)).toBe(directFilter);
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T08 - không có moduleContext: class filter trả null', () => {
      const harness = makeHarness();
      class UnregisteredFilter implements ExceptionFilter {
        catch(): void {}
      }

      expect(harness.context.getFilterInstance(UnregisteredFilter)).toBeNull();
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T09 - moduleContext không có trong collection: trả null', () => {
      const harness = makeHarness();
      harness.context.setModuleContext(seededLabel(25));
      class UnregisteredFilter implements ExceptionFilter {
        catch(): void {}
      }

      expect(harness.context.getFilterInstance(UnregisteredFilter)).toBeNull();
      expect(harness.getModules).toHaveBeenCalledOnce();
    });

    it('T10 - module tồn tại nhưng injectables không có metatype: trả null', () => {
      const harness = makeHarness();
      registerModule(harness, seededLabel(26));
      class UnregisteredFilter implements ExceptionFilter {
        catch(): void {}
      }

      expect(harness.context.getFilterInstance(UnregisteredFilter)).toBeNull();
      expect(harness.getModules).toHaveBeenCalledOnce();
    });

    it('T11 - host tồn tại nhưng instance là null: trả null', () => {
      const harness = makeHarness();
      class UnresolvedFilter implements ExceptionFilter {
        catch(): void {}
      }
      const { wrapper, resolve } = makeWrapper(UnresolvedFilter, {
        instance: null,
      });
      registerModule(harness, seededLabel(27), [[UnresolvedFilter, wrapper]]);

      expect(harness.context.getFilterInstance(UnresolvedFilter)).toBeNull();
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(STATIC_CONTEXT, undefined);
    });

    it('T12 - host undefined: && short-circuit trả undefined (artificial_state)', () => {
      const harness = makeHarness();
      class UnusualFilter implements ExceptionFilter {
        catch(): void {}
      }
      // InstanceWrapper thật luôn trả host; đây chỉ là phép thử bảo vệ biểu thức &&.
      const { wrapper, resolve } = makeWrapper(UnusualFilter, undefined);
      registerModule(harness, seededLabel(28), [[UnusualFilter, wrapper]]);

      expect(harness.context.getFilterInstance(UnusualFilter)).toBeUndefined();
      expect(resolve).toHaveBeenCalledOnce();
    });

    it('T13 - instance được trả với contextId/inquirerId tường minh', () => {
      const harness = makeHarness();
      class ResolvedFilter implements ExceptionFilter {
        catch(): void {}
      }
      const instance = new ResolvedFilter();
      const { wrapper, resolve } = makeWrapper(ResolvedFilter, { instance });
      registerModule(harness, seededLabel(29), [[ResolvedFilter, wrapper]]);
      const contextId: ContextId = { id: seededNumber(30) };
      const inquirerId = seededLabel(31);

      expect(
        harness.context.getFilterInstance(ResolvedFilter, contextId, inquirerId),
      ).toBe(instance);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(contextId, inquirerId);
    });

    it('T14 - getParent của contextId chuyển sang context cha và nhận thông tin wrapper', () => {
      const harness = makeHarness();
      class DurableFilter implements ExceptionFilter {
        catch(): void {}
      }
      const instance = new DurableFilter();
      const { wrapper, resolve, isDependencyTreeDurable } = makeWrapper(
        DurableFilter,
        { instance },
        true,
      );
      registerModule(harness, seededLabel(32), [[DurableFilter, wrapper]]);
      const parentContext: ContextId = { id: seededNumber(33) };
      const getParent = vi.fn((_info: HostComponentInfo): ContextId => parentContext);
      const contextId: ContextId = {
        id: seededNumber(34),
        getParent,
      };
      const inquirerId = seededLabel(35);

      expect(
        harness.context.getFilterInstance(DurableFilter, contextId, inquirerId),
      ).toBe(instance);
      expect(isDependencyTreeDurable).toHaveBeenCalledOnce();
      expect(getParent).toHaveBeenCalledTimes(1);
      expect(getParent).toHaveBeenCalledWith({
        token: DurableFilter,
        isTreeDurable: true,
      });
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(parentContext, inquirerId);
    });
  });

  describe('getInstanceByMetatype', () => {
    it('T15 - thiếu moduleContext: trả undefined trước khi gọi container', () => {
      const harness = makeHarness();
      class Filter {}

      expect(harness.context.getInstanceByMetatype(Filter)).toBeUndefined();
      expect(harness.getModules).not.toHaveBeenCalled();
    });

    it('T16 - moduleRef không tồn tại: trả undefined', () => {
      const harness = makeHarness();
      harness.context.setModuleContext(seededLabel(36));
      class Filter {}

      expect(harness.context.getInstanceByMetatype(Filter)).toBeUndefined();
      expect(harness.getModules).toHaveBeenCalledOnce();
    });

    it('T17 - moduleRef có nhưng token vắng: trả undefined', () => {
      const harness = makeHarness();
      registerModule(harness, seededLabel(37));
      class Filter {}

      expect(harness.context.getInstanceByMetatype(Filter)).toBeUndefined();
      expect(harness.getModules).toHaveBeenCalledOnce();
    });

    it('T18 - moduleRef và token tồn tại: trả đúng wrapper', () => {
      const harness = makeHarness();
      class Filter {}
      const { wrapper } = makeWrapper(Filter, { instance: null });
      registerModule(harness, seededLabel(38), [[Filter, wrapper]]);

      expect(harness.context.getInstanceByMetatype(Filter)).toBe(wrapper);
      expect(harness.getModules).toHaveBeenCalledOnce();
    });
  });

  describe('reflectCatchExceptions', () => {
    it('T19 - không có Reflect metadata: trả mảng rỗng', () => {
      const harness = makeHarness();
      class PlainFilter implements ExceptionFilter {
        catch(): void {}
      }

      expect(harness.context.reflectCatchExceptions(new PlainFilter())).toEqual(
        [],
      );
    });

    it('T20 - có metadata: trả đúng danh sách metatype đã khai báo', () => {
      const harness = makeHarness();
      class DomainErrorA extends Error {}
      class DomainErrorB extends Error {}
      class AnnotatedFilter implements ExceptionFilter {
        catch(): void {}
      }
      const types = [DomainErrorA, DomainErrorB];
      Reflect.defineMetadata(FILTER_CATCH_EXCEPTIONS, types, AnnotatedFilter);

      expect(
        harness.context.reflectCatchExceptions(new AnnotatedFilter()),
      ).toBe(types);
    });
  });
});
