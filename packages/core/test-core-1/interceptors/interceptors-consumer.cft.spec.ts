import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Observable,
  concat,
  lastValueFrom,
  of,
  throwError,
} from 'rxjs';
import { map, tap, toArray } from 'rxjs/operators';
import { destroyUnsentBody } from '../../helpers/destroy-unsent-body.js';
import { InterceptorsConsumer } from '../../interceptors/interceptors-consumer.js';

// Chỉ giả lập ranh giới hủy body/stream; mọi method của target chạy thật.
vi.mock('../../helpers/destroy-unsent-body.js', () => ({
  destroyUnsentBody: vi.fn(),
}));

// Xorshift32, seed cố định 1808. Mỗi sample(n) khởi tạo lại seed:
// dữ liệu không phụ thuộc thứ tự chạy các test.
function sample(n: number): string {
  let state = 1808;
  for (let i = 0; i < n; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
  }
  return `payload-${state.toString(36)}`;
}

class SampleController {
  public handle(...values: unknown[]): unknown[] {
    return values;
  }
}

function fixture() {
  const instance = new SampleController();
  const callback = instance.handle;
  const args: unknown[] = [sample(1), { id: sample(2) }, sample(3)];
  return { instance, callback, args };
}

// Chỉ nhường microtask; không dùng fake timers, network hoặc thời gian thực.
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('InterceptorsConsumer — CFT', () => {
  describe('intercept', () => {
    it('T01 — interceptors undefined: short-circuit, không đánh giá isEmptyArray', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const expected = sample(4);
      const next = vi.fn(async () => expected);

      const result = await consumer.intercept(
        undefined as unknown as NestInterceptor[],
        args,
        instance,
        callback,
        next,
        'rpc',
      );

      expect(result).toBe(expected);
      expect(next).toHaveBeenCalledOnce();
    });

    it('T02 — mảng rỗng: short-circuit và chuyển tiếp Promise rejection', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const failure = new Error(sample(5));
      const next = vi.fn(async (): Promise<unknown> => {
        throw failure;
      });

      await expect(
        consumer.intercept([], args, instance, callback, next),
      ).rejects.toBe(failure);
      expect(next).toHaveBeenCalledOnce();
    });

    it('T03 — một interceptor: tạo context rpc và chỉ gọi next khi subscribe', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const expected = sample(6);
      const next = vi.fn(async () => expected);
      const contexts: ExecutionContext[] = [];
      const interceptor: NestInterceptor = {
        intercept(context: ExecutionContext, handler: CallHandler) {
          contexts.push(context);
          return handler.handle();
        },
      };

      const response = await consumer.intercept(
        [interceptor],
        args,
        instance,
        callback,
        next,
        'rpc',
      );
      expect(response).toBeInstanceOf(Observable);
      expect(contexts).toHaveLength(0);
      expect(next).not.toHaveBeenCalled();

      expect(await lastValueFrom(response as Observable<unknown>)).toBe(expected);
      expect(next).toHaveBeenCalledOnce();
      expect(contexts).toHaveLength(1);
      expect(contexts[0].getType()).toBe('rpc');
      expect(contexts[0].getClass()).toBe(SampleController);
      expect(contexts[0].getHandler()).toBe(callback);
      expect(contexts[0].getArgs()).toBe(args);
      expect(contexts[0].getArgByIndex(1)).toBe(args[1]);
    });

    it('T04 — hai interceptors: đi qua i < length rồi i >= length, thứ tự lồng nhau', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const payload = sample(7);
      const events: string[] = [];
      const contexts: ExecutionContext[] = [];
      const outer: NestInterceptor = {
        intercept(context, handler) {
          events.push('outer:enter');
          contexts.push(context);
          return handler.handle().pipe(
            tap(() => events.push('outer:next')),
            map(value => `outer(${String(value)})`),
          );
        },
      };
      const inner: NestInterceptor = {
        intercept(context, handler) {
          events.push('inner:enter');
          contexts.push(context);
          return handler.handle().pipe(
            tap(() => events.push('inner:next')),
            map(value => `inner(${String(value)})`),
          );
        },
      };
      const next = vi.fn(async () => {
        events.push('next');
        return payload;
      });

      // type không truyền vào: ExecutionContextHost mặc định 'http'.
      const response = await consumer.intercept(
        [outer, inner], args, instance, callback, next,
      );
      const value = await lastValueFrom(response as Observable<unknown>);

      expect(value).toBe(`outer(inner(${payload}))`);
      expect(events).toEqual([
        'outer:enter', 'inner:enter', 'next', 'inner:next', 'outer:next',
      ]);
      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toBe(contexts[1]);
      expect(contexts[0].getType()).toBe('http');
      expect(next).toHaveBeenCalledOnce();
    });

    it('T05 — interceptor return sớm không gọi handler.handle, không gọi next', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const expected = sample(8);
      const next = vi.fn(async () => sample(9));
      const downstream = vi.fn((_context: ExecutionContext, handler: CallHandler) =>
        handler.handle(),
      );
      const shortCircuit: NestInterceptor = { intercept: () => of(expected) };
      const second: NestInterceptor = { intercept: downstream };

      const response = await consumer.intercept(
        [shortCircuit, second], args, instance, callback, next,
      );

      expect(await lastValueFrom(response as Observable<unknown>)).toBe(expected);
      expect(downstream).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('T06 — interceptor ném lỗi đồng bộ khi được subscribe', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const failure = new Error(sample(10));
      const next = vi.fn(async () => sample(11));
      const interceptor: NestInterceptor = {
        intercept: () => { throw failure; },
      };

      const response = await consumer.intercept(
        [interceptor], args, instance, callback, next,
      );
      await expect(lastValueFrom(response as Observable<unknown>)).rejects.toBe(failure);
      expect(next).not.toHaveBeenCalled();
    });

    it('T07 — interceptor trả Promise bị reject, lỗi đi ra chuỗi Observable', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const failure = new Error(sample(12));
      const next = vi.fn(async () => sample(13));
      const interceptor: NestInterceptor = {
        intercept: () => Promise.reject(failure),
      };

      const response = await consumer.intercept(
        [interceptor], args, instance, callback, next,
      );
      await expect(lastValueFrom(response as Observable<unknown>)).rejects.toBe(failure);
      expect(next).not.toHaveBeenCalled();
    });

    it('T08 — interceptor trả Observable bị error, không chạy handler tiếp theo', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const failure = new Error(sample(14));
      const next = vi.fn(async () => sample(15));
      const interceptor: NestInterceptor = {
        intercept: () => throwError(() => failure),
      };

      const response = await consumer.intercept(
        [interceptor], args, instance, callback, next,
      );
      await expect(lastValueFrom(response as Observable<unknown>)).rejects.toBe(failure);
      expect(next).not.toHaveBeenCalled();
    });

    it('T09 — hai lần handle tạo hai lần đi tới nhánh cuối của nextFn', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const value = sample(16);
      const next = vi.fn(async () => value);
      const interceptor: NestInterceptor = {
        intercept: (_context, handler) => concat(handler.handle(), handler.handle()),
      };

      const response = await consumer.intercept(
        [interceptor], args, instance, callback, next,
      );
      const results = await lastValueFrom(
        (response as Observable<unknown>).pipe(toArray()),
      );

      expect(results).toEqual([value, value]);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('T19 — next reject trong chuỗi interceptor: lỗi async được truyền tới consumer', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const failure = new Error(sample(17));
      const next = vi.fn(async (): Promise<unknown> => { throw failure; });
      const interceptor: NestInterceptor = {
        intercept: (_context, handler) => handler.handle(),
      };

      const response = await consumer.intercept(
        [interceptor], args, instance, callback, next,
      );
      await expect(lastValueFrom(response as Observable<unknown>)).rejects.toBe(failure);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('createContext', () => {
    it('T10 — public createContext giữ nguyên args, class và callback', () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();

      const context = consumer.createContext(args, instance, callback);

      expect(context.getType()).toBe('http');
      expect(context.getClass()).toBe(SampleController);
      expect(context.getHandler()).toBe(callback);
      expect(context.getArgs()).toBe(args);
      expect(context.getArgByIndex(0)).toBe(args[0]);
    });
  });

  describe('transformDeferred', () => {
    it('T11 — giá trị thường: next được gọi eager và Promise.resolve(value) được flatten', async () => {
      const consumer = new InterceptorsConsumer();
      const expected = { token: sample(18) };
      const next = vi.fn(async () => expected);

      const response = consumer.transformDeferred(next);
      expect(next).toHaveBeenCalledOnce();
      expect(response).toBeInstanceOf(Observable);
      expect(await lastValueFrom(response)).toBe(expected);
      expect(destroyUnsentBody).not.toHaveBeenCalled();
    });

    it('T12 — giá trị Observable: subscribe producer và chuyển tiếp nhiều emission', async () => {
      const consumer = new InterceptorsConsumer();
      const first = sample(19);
      const second = sample(20);
      const subscribed = vi.fn();
      const producer = new Observable<string>(subscriber => {
        subscribed();
        subscriber.next(first);
        subscriber.next(second);
        subscriber.complete();
      });
      const next = vi.fn(async () => producer);

      const response = consumer.transformDeferred(next);
      expect(next).toHaveBeenCalledOnce();
      expect(subscribed).not.toHaveBeenCalled();
      const values = await lastValueFrom(response.pipe(toArray()));

      expect(values).toEqual([first, second]);
      expect(subscribed).toHaveBeenCalledOnce();
    });

    it('T13 — next trả rejected Promise khi subscriber đang mở: gửi error', async () => {
      const consumer = new InterceptorsConsumer();
      const failure = new Error(sample(21));
      const next = vi.fn(async (): Promise<unknown> => { throw failure; });

      const response = consumer.transformDeferred(next);
      await expect(lastValueFrom(response)).rejects.toBe(failure);
      expect(next).toHaveBeenCalledOnce();
    });

    it('T14 — next ném lỗi đồng bộ ngay trong transformDeferred', () => {
      const consumer = new InterceptorsConsumer();
      const failure = new Error(sample(22));
      const next = vi.fn((): Promise<unknown> => { throw failure; });

      expect(() => consumer.transformDeferred(next)).toThrow(failure);
      expect(next).toHaveBeenCalledOnce();
    });

    it('T15 — hủy trước resolve: không subscribe producer, giải phóng body chưa gửi', async () => {
      const consumer = new InterceptorsConsumer();
      let resolvePending!: (value: unknown) => void;
      const pending = new Promise<unknown>(resolve => { resolvePending = resolve; });
      const producerStarted = vi.fn();
      const producer = new Observable<string>(subscriber => {
        producerStarted();
        subscriber.next(sample(23));
        subscriber.complete();
      });
      const onNext = vi.fn();
      const onError = vi.fn();
      const response = consumer.transformDeferred(() => pending);
      const subscription = response.subscribe({ next: onNext, error: onError });

      subscription.unsubscribe();
      resolvePending(producer);
      await drainMicrotasks();

      expect(producerStarted).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(destroyUnsentBody).toHaveBeenCalledOnce();
      expect(destroyUnsentBody).toHaveBeenCalledWith(producer);
    });

    it('T16 — hủy trước reject: không gửi error tới subscriber đã đóng', async () => {
      const consumer = new InterceptorsConsumer();
      let rejectPending!: (reason?: unknown) => void;
      const pending = new Promise<unknown>((_resolve, reject) => {
        rejectPending = reject;
      });
      const failure = new Error(sample(24));
      const onError = vi.fn();
      const response = consumer.transformDeferred(() => pending);
      const subscription = response.subscribe({ error: onError });

      subscription.unsubscribe();
      rejectPending(failure);
      await drainMicrotasks();

      expect(onError).not.toHaveBeenCalled();
      expect(destroyUnsentBody).not.toHaveBeenCalled();
    });

    it('T17 — hủy sau khi Promise resolve: unsubscribe innerSub và dọn producer', async () => {
      const consumer = new InterceptorsConsumer();
      const expected = sample(25);
      const started = vi.fn();
      const teardown = vi.fn();
      const producer = new Observable<string>(subscriber => {
        started();
        subscriber.next(expected);
        return teardown;
      });
      const onNext = vi.fn();
      const response = consumer.transformDeferred(() => Promise.resolve(producer));
      const subscription = response.subscribe({ next: onNext });
      await drainMicrotasks();

      expect(started).toHaveBeenCalledOnce();
      expect(onNext).toHaveBeenCalledOnce();
      expect(onNext).toHaveBeenCalledWith(expected);
      expect(teardown).not.toHaveBeenCalled();

      subscription.unsubscribe();
      expect(teardown).toHaveBeenCalledOnce();
      expect(destroyUnsentBody).not.toHaveBeenCalled();
    });
  });

  describe('bindAsyncScope (qua API intercept)', () => {
    it('T18 — handler.handle được tạo trong ALS scope và subscribe ngoài scope', async () => {
      const consumer = new InterceptorsConsumer();
      const { args, instance, callback } = fixture();
      const storage = new AsyncLocalStorage<{ trace: string }>();
      const marker = sample(26);
      const value = sample(27);
      let seenInNext: string | undefined;
      const next = vi.fn(async () => {
        seenInNext = storage.getStore()?.trace;
        return value;
      });
      const interceptor: NestInterceptor = {
        intercept(_context, handler) {
          // bindAsyncScope được gọi khi handle() tạo deferred Observable.
          return storage.run({ trace: marker }, () => handler.handle());
        },
      };

      const response = await consumer.intercept(
        [interceptor], args, instance, callback, next,
      );
      expect(storage.getStore()).toBeUndefined();
      expect(await lastValueFrom(response as Observable<unknown>)).toBe(value);
      expect(seenInNext).toBe(marker);
      expect(next).toHaveBeenCalledOnce();
    });
  });
});
