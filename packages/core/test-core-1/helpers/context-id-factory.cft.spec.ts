import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextIdFactory,
  createContextId,
  type ContextIdStrategy,
} from '../../helpers/context-id-factory.js';
import { REQUEST_CONTEXT_ID } from '../../router/request/request-constants.js';
import type {
  ContextId,
  HostComponentInfo,
} from '../../injector/instance-wrapper.js';

const RANDOM_SEED = 1808;

/**
 * LCG with a fixed seed; values are kept away from the 0/1 boundaries.
 * Re-initialized before each test to avoid order-dependent assertions.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 0.2 + 0.6 * (state / 0x100000000);
  };
}

describe('context-id-factory.ts / ContextIdFactory CFT', () => {
  let precedingStrategy: ContextIdStrategy | undefined;

  beforeEach(() => {
    // Strategy has no public reset API. Restore its exact original value in afterEach.
    precedingStrategy = Reflect.get(
      ContextIdFactory,
      'strategy',
    ) as ContextIdStrategy | undefined;
    Reflect.set(ContextIdFactory, 'strategy', undefined);

    // Mock only the nondeterministic boundary, not the target implementation.
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(RANDOM_SEED));
  });

  afterEach(() => {
    Reflect.set(ContextIdFactory, 'strategy', precedingStrategy);
    vi.restoreAllMocks();
  });

  it('T01: createContextId và create tạo các object riêng bằng PRNG có seed', () => {
    const direct = createContextId();
    const fromFactory = ContextIdFactory.create();

    expect(direct).not.toBe(fromFactory);
    expect(direct.id).toBeGreaterThan(0.2);
    expect(direct.id).toBeLessThan(0.8);
    expect(fromFactory.id).toBeGreaterThan(0.2);
    expect(fromFactory.id).toBeLessThan(0.8);
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it('T02: !request trả ID mới với null và undefined, không gọi strategy', () => {
    const attach = vi.fn(() => undefined);
    ContextIdFactory.apply({ attach });

    const fromNull = ContextIdFactory.getByRequest(
      null as unknown as Record<string, unknown>,
    );
    const fromUndefined = ContextIdFactory.getByRequest(
      undefined as unknown as Record<string, unknown>,
    );

    expect(fromNull).not.toBe(fromUndefined);
    expect(typeof fromNull.id).toBe('number');
    expect(typeof fromUndefined.id).toBe('number');
    expect(attach).not.toHaveBeenCalled();
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it('T03: cached ID trên request được trả ngay, không duyệt raw hoặc attach', () => {
    const cached = createContextId();
    const attach = vi.fn(() => undefined);
    ContextIdFactory.apply({ attach });

    const request = {
      [REQUEST_CONTEXT_ID]: cached,
      get raw(): never {
        throw new Error('raw must not be inspected after direct cache hit');
      },
    };

    expect(ContextIdFactory.getByRequest(request)).toBe(cached);
    expect(attach).not.toHaveBeenCalled();
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T04: propsToInspect mặc định tìm ID trong raw và trả trước strategy', () => {
    const cached = ContextIdFactory.create();
    const attach = vi.fn(() => undefined);
    ContextIdFactory.apply({ attach });
    const request = { raw: { [REQUEST_CONTEXT_ID]: cached } };

    expect(ContextIdFactory.getByRequest(request)).toBe(cached);
    expect(attach).not.toHaveBeenCalled();
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T05: duyệt nhiều key, bỏ qua null và ID không có, dừng tại key khớp', () => {
    const cached = ContextIdFactory.create();
    const attach = vi.fn(() => undefined);
    ContextIdFactory.apply({ attach });

    const request = {
      first: null,
      second: { [REQUEST_CONTEXT_ID]: undefined },
      third: { [REQUEST_CONTEXT_ID]: cached },
      get fourth(): never {
        throw new Error('loop must stop after the third key');
      },
    };

    const result = ContextIdFactory.getByRequest(request, [
      'first',
      'second',
      'third',
      'fourth',
    ]);

    expect(result).toBe(cached);
    expect(attach).not.toHaveBeenCalled();
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T06: mảng key rỗng bỏ qua cả raw có cache, rồi tạo ID khi thiếu strategy', () => {
    const cachedInRaw = createContextId();
    const request = { raw: { [REQUEST_CONTEXT_ID]: cachedInRaw } };

    const result = ContextIdFactory.getByRequest(request, []);

    expect(result).not.toBe(cachedInRaw);
    expect(typeof result.id).toBe('number');
    expect(result.getParent).toBeUndefined();
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it('T07: một raw nullish và không có strategy dẫn tới create sớm', () => {
    const request = { raw: null };

    const result = ContextIdFactory.getByRequest(request);

    expect(typeof result.id).toBe('number');
    expect(result).not.toHaveProperty('getParent');
    expect(result).not.toHaveProperty('payload');
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T08: attach trả function; getParent trỏ trực tiếp tới resolver', () => {
    const parent = createContextId();
    const parentResolver = vi.fn((_info: HostComponentInfo): ContextId => parent);
    const attach = vi.fn((_child: ContextId, _request: unknown) => parentResolver);
    ContextIdFactory.apply({ attach });

    const request = { raw: {} };
    const result = ContextIdFactory.getByRequest(request);
    const host: HostComponentInfo = {
      token: 'cft-service',
      isTreeDurable: true,
    };

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(result, request);
    expect(result.getParent).toBe(parentResolver);
    expect(result.getParent?.(host)).toBe(parent);
    expect(parentResolver).toHaveBeenCalledWith(host);
    expect(result).not.toHaveProperty('payload');
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it('T09: attach trả resolver object; sao chép getParent và payload', () => {
    const parent = createContextId();
    const payload = { tenant: 'cft-seeded-1808' };
    const resolver = vi.fn((_info: HostComponentInfo): ContextId => parent);
    const attach = vi.fn((_child: ContextId, _request: unknown) => ({
      resolve: resolver,
      payload,
    }));
    ContextIdFactory.apply({ attach });

    const request = { raw: { [REQUEST_CONTEXT_ID]: undefined } };
    const result = ContextIdFactory.getByRequest(request);
    const host: HostComponentInfo = {
      token: 'cft-service',
      isTreeDurable: false,
    };

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(result, request);
    expect(result.getParent).toBe(resolver);
    expect(result.getParent?.(host)).toBe(parent);
    expect(result.payload).toBe(payload);
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it('T10: attach trả undefined; nhánh non-object gán getParent undefined', () => {
    const attach = vi.fn((_child: ContextId, _request: unknown) => undefined);
    ContextIdFactory.apply({ attach });

    const request = {};
    const result = ContextIdFactory.getByRequest(request);

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(result, request);
    expect(result).toHaveProperty('getParent', undefined);
    expect(result).not.toHaveProperty('payload');
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T11: apply lần sau thay strategy cũ, chỉ attach của strategy mới chạy', () => {
    const oldResolver = vi.fn(
      (_info: HostComponentInfo): ContextId => createContextId(),
    );
    const newResolver = vi.fn(
      (_info: HostComponentInfo): ContextId => createContextId(),
    );
    const oldAttach = vi.fn((_child: ContextId, _request: unknown) => oldResolver);
    const newAttach = vi.fn((_child: ContextId, _request: unknown) => newResolver);

    ContextIdFactory.apply({ attach: oldAttach });
    ContextIdFactory.apply({ attach: newAttach });

    const request = {};
    const result = ContextIdFactory.getByRequest(request);

    expect(oldAttach).not.toHaveBeenCalled();
    expect(newAttach).toHaveBeenCalledTimes(1);
    expect(newAttach).toHaveBeenCalledWith(result, request);
    expect(result.getParent).toBe(newResolver);
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T12: lỗi đồng bộ do attach ném được truyền lên người gọi', () => {
    const failure = new Error('strategy attachment failed');
    const attach = vi.fn((_child: ContextId, _request: unknown): never => {
      throw failure;
    });
    ContextIdFactory.apply({ attach });

    expect(() => ContextIdFactory.getByRequest({})).toThrow(failure);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it('T13: cache trực tiếp null không chặn việc tìm ID trong raw', () => {
    const cachedInRaw = createContextId();
    const attach = vi.fn(() => undefined);
    ContextIdFactory.apply({ attach });

    const request = {
      [REQUEST_CONTEXT_ID]: null,
      raw: { [REQUEST_CONTEXT_ID]: cachedInRaw },
    };

    expect(ContextIdFactory.getByRequest(request)).toBe(cachedInRaw);
    expect(attach).not.toHaveBeenCalled();
    expect(Math.random).toHaveBeenCalledTimes(1);
  });
});
