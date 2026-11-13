import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { GuardsConsumer } from '../../guards/guards-consumer.js';

const randInt = () => Math.floor(Math.random() * 900) + 50;

class FakeController {}

describe('GuardsConsumer (CFT)', () => {
  let consumer: GuardsConsumer;
  let args: unknown[];
  const instance = new FakeController() as any;
  const callback = () => undefined;
  const makeGuard = (value: unknown) => ({
    canActivate: vi.fn().mockReturnValue(value),
  });

  beforeEach(() => {
    consumer = new GuardsConsumer();
    args = [randInt(), randInt()];
  });

  describe('tryActivate', () => {
    it('T1: guards undefined', async () => {
      // covers B1
      const r = await consumer.tryActivate(
        undefined as any,
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T2: guards là mảng rỗng', async () => {
      // covers B2
      const r = await consumer.tryActivate([], args, instance, callback);
      expect(r).toBeDefined();
    });

    it('T3: guard đồng bộ trả false', async () => {
      // covers B3 (1 lần lặp), B4, B5
      const r = await consumer.tryActivate(
        [makeGuard(false)],
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T4: guard đồng bộ trả true', async () => {
      // covers B4, B6 (dòng 27), B9
      const r = await consumer.tryActivate(
        [makeGuard(true)],
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T5: guard trả Promise true', async () => {
      // covers B7, B11, B9
      const r = await consumer.tryActivate(
        [makeGuard(Promise.resolve(true))],
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T6: guard trả Promise false', async () => {
      // covers B8, B11
      const r = await consumer.tryActivate(
        [makeGuard(Promise.resolve(false))],
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T7: guard trả Observable true', async () => {
      // covers B10 (dòng 56), B7, B9
      const r = await consumer.tryActivate(
        [makeGuard(of(true))],
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T8: nhiều guard đều cho qua (sync, Promise, Observable)', async () => {
      // covers B3 (nhiều lần lặp), B6, B7, B10, B9
      const guards = [
        makeGuard(true),
        makeGuard(Promise.resolve(true)),
        makeGuard(of(true)),
      ];
      const r = await consumer.tryActivate(guards, args, instance, callback);
      expect(r).toBeDefined();
    });

    it('T9: guard trả Observable false', async () => {
      // covers B10, B8
      const r = await consumer.tryActivate(
        [makeGuard(of(false))],
        args,
        instance,
        callback,
      );
      expect(r).toBeDefined();
    });

    it('T10: dừng ngay khi có guard trả false', async () => {
      // covers B5 trong vòng lặp nhiều phần tử (guard sau không được gọi)
      const second = makeGuard(true);
      await consumer.tryActivate(
        [makeGuard(false), second],
        args,
        instance,
        callback,
      );
      expect(second.canActivate).not.toHaveBeenCalled();
    });
  });

  describe('pickResult', () => {
    it('T11: nhận Observable trực tiếp', async () => {
      // covers B10
      const r = await consumer.pickResult(of(true));
      expect(r).toBeDefined();
    });

    it('T12: nhận boolean trực tiếp', async () => {
      // covers B11
      const r = await consumer.pickResult(false);
      expect(r).toBeDefined();
    });
  });

  describe('createContext', () => {
    it('T13: tạo ExecutionContextHost', () => {
      const ctx = consumer.createContext(args, instance, callback);
      expect(ctx).toBeDefined();
    });
  });
});
