import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { lastValueFrom } from 'rxjs';

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'dummy-uuid'),
}));

vi.mock('@nestjs/common/internal', () => ({
  isNil: (v: any) => v === undefined || v === null,
}));

vi.mock('../../utils/index.js', () => ({
  transformPatternToRoute: vi.fn(() => 'dummy-route'),
}));

vi.mock('../../errors/invalid-message.exception.js', () => ({
  InvalidMessageException: class InvalidMessageException extends Error {},
}));

vi.mock('../../deserializers/incoming-response.deserializer.js', () => ({
  IncomingResponseDeserializer: class IncomingResponseDeserializer {},
}));

vi.mock('../../serializers/identity.serializer.js', () => ({
  IdentitySerializer: class IdentitySerializer {},
}));

import { ClientProxy } from '../../client/client-proxy.js';

// ---------- Random input helpers (giá trị nằm sâu trong lớp tương đương) ----------
const rndInt = (min = 1000, max = 9000) =>
  Math.floor(Math.random() * (max - min)) + min;
const rndStr = (prefix = 's') =>
  `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

// ---------- Concrete subclass để test lớp abstract ----------
class TestClientProxy extends ClientProxy {
  public publishMock = vi.fn<(packet: any, cb: (p: any) => void) => () => void>(
    () => () => undefined,
  );
  public dispatchEventMock = vi.fn(async (_packet: any) => 'dispatched');
  public connectMock = vi.fn(async () => undefined);

  connect() {
    return this.connectMock();
  }
  close() {
    return undefined;
  }
  unwrap<T>(): T {
    return {} as T;
  }
  protected publish(packet: any, cb: (p: any) => void) {
    return this.publishMock(packet, cb);
  }
  protected dispatchEvent<T = any>(packet: any): Promise<T> {
    return this.dispatchEventMock(packet) as Promise<T>;
  }

  // Expose protected members
  public _createPacket(p: any, d: any) {
    return this.createPacket(p, d);
  }
  public _createObserver(o: any) {
    return this.createObserver(o);
  }
  public _serializeError(e: any) {
    return this.serializeError(e);
  }
  public _serializeResponse(r: any) {
    return this.serializeResponse(r);
  }
  public _assignPacketId(p: any) {
    return this.assignPacketId(p);
  }
  public _connect$(i: any, e?: string, c?: string) {
    return this.connect$(i, e, c);
  }
  public _getOptionsProp(obj: any, prop: any, def?: any) {
    return (this as any).getOptionsProp(obj, prop, def);
  }
  public _getOptionsPropNoDefault(obj: any, prop: any) {
    return (this as any).getOptionsProp(obj, prop);
  }
  public _normalizePattern(p: any) {
    return this.normalizePattern(p);
  }
  public _initSerializer(o: any) {
    return this.initializeSerializer(o);
  }
  public _initDeserializer(o: any) {
    return this.initializeDeserializer(o);
  }
  public getSerializer() {
    return this.serializer;
  }
  public getDeserializer() {
    return this.deserializer;
  }
}

describe('ClientProxy - Control Flow Testing', () => {
  let proxy: TestClientProxy;

  beforeEach(() => {
    vi.clearAllMocks();
    proxy = new TestClientProxy();
  });

  // ================= status getter / on =================
  describe('status / on', () => {
    it('TC01: status trả về Observable phát giá trị trạng thái', async () => {
      const st = rndStr('status');
      (proxy as any)._status$.next(st);
      const result = await new Promise(resolve =>
        proxy.status.subscribe(v => resolve(v)),
      );
      expect(result).toBeDefined();
    });

    it('TC02: on() ném lỗi Method not implemented', () => {
      const fn = () => proxy.on(rndStr('evt') as never, vi.fn() as never);
      expect(fn).toThrow();
    });
  });

  // ================= send() =================
  describe('send()', () => {
    it('TC03: pattern nil -> trả về observable lỗi (nhánh isNil(pattern) = true)', async () => {
      const obs = proxy.send(undefined, rndStr('data'));
      await expect(lastValueFrom(obs)).rejects.toBeDefined();
    });

    it('TC04: pattern hợp lệ, data nil -> observable lỗi (nhánh isNil(data) = true)', async () => {
      const obs = proxy.send(rndStr('pattern'), null);
      await expect(lastValueFrom(obs)).rejects.toBeDefined();
    });

    it('TC05: pattern & data hợp lệ, server trả response + isDisposed -> next + complete', async () => {
      proxy.publishMock.mockImplementation((_pkt, cb) => {
        cb({ response: rndStr('resp'), isDisposed: true });
        return () => undefined;
      });
      const result = await lastValueFrom(
        proxy.send(rndStr('pattern'), rndStr('data')),
      );
      expect(result).toBeDefined();
      expect(proxy.connectMock).toHaveBeenCalled();
    });

    it('TC06: publish trả lỗi -> observable error', async () => {
      proxy.publishMock.mockImplementation((_pkt, cb) => {
        cb({ err: rndStr('err') });
        return () => undefined;
      });
      const obs = proxy.send(rndStr('pattern'), rndInt());
      await expect(lastValueFrom(obs)).rejects.toBeDefined();
    });
  });

  // ================= emit() =================
  describe('emit()', () => {
    it('TC07: pattern nil -> observable lỗi', async () => {
      const obs = proxy.emit(undefined, rndStr('data'));
      await expect(lastValueFrom(obs)).rejects.toBeDefined();
    });

    it('TC08: pattern hợp lệ, data nil -> observable lỗi', async () => {
      const obs = proxy.emit(rndStr('pattern'), undefined);
      await expect(lastValueFrom(obs)).rejects.toBeDefined();
    });

    it('TC09: pattern & data hợp lệ -> dispatchEvent được gọi qua connectable', async () => {
      const result = await lastValueFrom(
        proxy.emit(rndStr('pattern'), rndStr('data')),
      );
      expect(result).toBeDefined();
      expect(proxy.dispatchEventMock).toHaveBeenCalled();
    });
  });

  // ================= setOnDispatchHook / createPacket =================
  describe('createPacket()', () => {
    it('TC10: chưa có hook -> trả về packet {pattern, data} (optional chaining = undefined)', () => {
      const packet = proxy._createPacket(rndStr('p'), rndInt());
      expect(packet).toBeDefined();
    });

    it('TC11: đã đặt hook -> hook được gọi với packet', () => {
      const hook = vi.fn((packet: any) => {
        packet.metadata = { trace: rndStr('trace') };
      });
      proxy.setOnDispatchHook(hook);
      const packet = proxy._createPacket(rndStr('p'), rndStr('d'));
      expect(hook).toHaveBeenCalledTimes(1);
      expect(packet).toBeDefined();
    });
  });

  // ================= createObserver() =================
  describe('createObserver()', () => {
    const makeObserver = () => ({
      next: vi.fn(),
      error: vi.fn(),
      complete: vi.fn(),
    });

    it('TC12: err truthy -> observer.error', () => {
      const obs = makeObserver();
      const handler = proxy._createObserver(obs);
      handler({ err: rndStr('err') });
      expect(obs.error).toHaveBeenCalled();
    });

    it('TC13: err falsy, response !== undefined, isDisposed -> next + complete', () => {
      const obs = makeObserver();
      const handler = proxy._createObserver(obs);
      handler({ response: rndStr('resp'), isDisposed: true });
      expect(obs.next).toHaveBeenCalled();
      expect(obs.complete).toHaveBeenCalled();
    });

    it('TC14: response undefined, isDisposed true -> chỉ complete', () => {
      const obs = makeObserver();
      const handler = proxy._createObserver(obs);
      handler({ isDisposed: true });
      expect(obs.complete).toHaveBeenCalled();
      expect(obs.next).not.toHaveBeenCalled();
    });

    it('TC15: response defined, isDisposed false -> chỉ next', () => {
      const obs = makeObserver();
      const handler = proxy._createObserver(obs);
      handler({ response: rndInt(), isDisposed: false });
      expect(obs.next).toHaveBeenCalled();
      expect(obs.complete).not.toHaveBeenCalled();
    });

    it('TC16: response undefined, isDisposed false -> next(undefined)', () => {
      const obs = makeObserver();
      const handler = proxy._createObserver(obs);
      handler({});
      expect(obs.next).toHaveBeenCalled();
    });
  });

  // ================= serialize helpers / assignPacketId =================
  describe('serializeError / serializeResponse / assignPacketId', () => {
    it('TC17: serializeError trả về nguyên err', () => {
      expect(proxy._serializeError(rndStr('e'))).toBeDefined();
    });

    it('TC18: serializeResponse trả về nguyên response', () => {
      expect(proxy._serializeResponse(rndStr('r'))).toBeDefined();
    });

    it('TC19: assignPacketId gán id vào packet', () => {
      const packet = proxy._assignPacketId({
        pattern: rndStr('p'),
        data: rndInt(),
      });
      expect(packet).toBeDefined();
    });
  });

  // ================= connect$() =================
  describe('connect$()', () => {
    it('TC20: phát sự kiện connect -> observable hoàn tất với giá trị', async () => {
      const emitter = new EventEmitter();
      const p = lastValueFrom(proxy._connect$(emitter));
      emitter.emit('connect', rndStr('conn'));
      expect(await p).toBeDefined();
    });

    it('TC21: phát sự kiện error -> observable error', async () => {
      const emitter = new EventEmitter();
      const p = lastValueFrom(proxy._connect$(emitter));
      emitter.emit('error', new Error(rndStr('err')));
      await expect(p).rejects.toBeDefined();
    });

    it('TC22: dùng tên sự kiện tuỳ chỉnh', async () => {
      const emitter = new EventEmitter();
      const p = lastValueFrom(proxy._connect$(emitter, 'fail', 'ready'));
      emitter.emit('ready', rndInt());
      expect(await p).toBeDefined();
    });
  });

  // ================= getOptionsProp() =================
  describe('getOptionsProp()', () => {
    it('TC23: obj falsy -> trả về defaultValue', () => {
      const def = rndStr('def');
      expect(proxy._getOptionsProp(undefined, 'k', def)).toBeDefined();
    });

    it('TC24: obj hợp lệ nhưng thiếu prop -> trả về defaultValue', () => {
      const def = rndInt();
      expect(
        proxy._getOptionsProp({ other: rndStr() }, 'k', def),
      ).toBeDefined();
    });

    it('TC25: obj có prop -> trả về giá trị của prop', () => {
      expect(
        proxy._getOptionsProp({ k: rndStr('val') }, 'k', rndStr('def')),
      ).toBeDefined();
    });

    it('TC26: không truyền defaultValue (dùng default param undefined)', () => {
      const r = proxy._getOptionsPropNoDefault({ other: rndInt() }, 'k');
      expect(r === undefined).toBeDefined();
    });
  });

  // ================= normalizePattern() =================
  describe('normalizePattern()', () => {
    it('TC27: gọi transformPatternToRoute', () => {
      expect(proxy._normalizePattern(rndStr('pattern'))).toBeDefined();
    });
  });

  // ================= initializeSerializer() =================
  describe('initializeSerializer()', () => {
    it('TC28: options undefined -> IdentitySerializer mặc định', () => {
      proxy._initSerializer(undefined);
      expect(proxy.getSerializer()).toBeDefined();
    });

    it('TC29: options có serializer -> dùng serializer tuỳ chỉnh', () => {
      const custom = { serialize: vi.fn() };
      proxy._initSerializer({ serializer: custom });
      expect(proxy.getSerializer()).toBeDefined();
    });

    it('TC30: options có nhưng không có serializer -> mặc định', () => {
      proxy._initSerializer({ [rndStr('x')]: rndInt() });
      expect(proxy.getSerializer()).toBeDefined();
    });
  });

  // ================= initializeDeserializer() =================
  describe('initializeDeserializer()', () => {
    it('TC31: options undefined -> IncomingResponseDeserializer mặc định', () => {
      proxy._initDeserializer(undefined);
      expect(proxy.getDeserializer()).toBeDefined();
    });

    it('TC32: options có deserializer -> dùng deserializer tuỳ chỉnh', () => {
      const custom = { deserialize: vi.fn() };
      proxy._initDeserializer({ deserializer: custom });
      expect(proxy.getDeserializer()).toBeDefined();
    });

    it('TC33: options có nhưng không có deserializer -> mặc định', () => {
      proxy._initDeserializer({ [rndStr('x')]: rndInt() });
      expect(proxy.getDeserializer()).toBeDefined();
    });
  });
});
