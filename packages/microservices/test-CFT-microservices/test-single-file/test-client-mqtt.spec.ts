import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { EMPTY, lastValueFrom, NEVER, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test driver: ClientMqtt (Control Flow Testing)
 * - Input sinh ngẫu nhiên, nằm sâu trong lớp tương đương (không dùng giá trị biên).
 * - Output chỉ assert ở mức toBeDefined()/toHaveBeenCalled(): mục tiêu là ép đi qua đúng nhánh.
 */

// ---------------------------------------------------------------------------
// Random input helpers (giá trị "giữa" miền, không phải biên)
// ---------------------------------------------------------------------------
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randStr = (len: number = randInt(7, 15)) =>
  Array.from({ length: len }, () => String.fromCharCode(randInt(97, 122))).join(
    '',
  );

// MQTT_MAX_TOPIC_LENGTH = 65535 -> chọn độ dài sâu trong lớp "quá dài"
const TOO_LONG_TOPIC_LEN = () => randInt(70000, 90000);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  clients: [] as any[],
  pkg: null as any,
  load: null as any,
}));

vi.mock('@nestjs/common/internal', async importOriginal => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    loadPackage: (...args: any[]) => state.load(...args),
    loadPackageSync: () => state.pkg,
  };
});

class FakeMqttClient extends EventEmitter {
  options: any;
  reconnecting = false;
  reconnectTimer: any = null;
  publish = vi.fn((_t: any, _p: any, _o: any, cb?: any) => cb?.());
  subscribe = vi.fn((_c: any, cb?: any) => cb?.());
  unsubscribe = vi.fn();
  endAsync = vi.fn(async () => undefined);
  constructor(options: any = {}) {
    super();
    this.options = options;
  }
}

state.pkg = {
  connect: vi.fn((_url: string, options: any) => {
    const c = new FakeMqttClient(options);
    state.clients.push(c);
    return c;
  }),
};

const lastClient = (): FakeMqttClient =>
  state.clients[state.clients.length - 1];

// Module `client-mqtt` giữ biến cache `mqttPackage` ở mức module -> nạp module mới cho mỗi test
async function freshModules() {
  vi.resetModules();
  const m = await import('../../client/client-mqtt.js');
  const r = await import('../../record-builders/mqtt.record-builder.js');
  return { ClientMqtt: m.ClientMqtt, MqttRecord: r.MqttRecord };
}

function quiet(client: any) {
  vi.spyOn(client.logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(client.logger, 'log').mockImplementation(() => undefined);
  vi.spyOn(client.logger, 'debug').mockImplementation(() => undefined);
}

async function setup(options: any = {}, warm = true) {
  const { ClientMqtt, MqttRecord } = await freshModules();
  const client: any = new ClientMqtt(options);
  quiet(client);
  if (warm) {
    client.createClient(); // nạp sẵn mqttPackage
    state.clients.length = 0;
  }
  return { client, MqttRecord };
}

async function ready(options: any = {}) {
  const { client, MqttRecord } = await setup(options);
  const fake = new FakeMqttClient(options);
  client.mqttClient = fake;
  return { client, fake, MqttRecord };
}

beforeEach(() => {
  state.clients.length = 0;
  state.load = vi.fn(async () => state.pkg);
  state.pkg.connect.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClientMqtt - Control Flow Testing', () => {
  // -------------------------------------------------------------------------
  // constructor / patterns
  // -------------------------------------------------------------------------
  describe('constructor & patterns', () => {
    it('TC01: url có, serializer có', async () => {
      const { ClientMqtt } = await freshModules();
      const client: any = new ClientMqtt({
        url: `mqtt://${randStr()}:${randInt(2000, 9000)}`,
        serializer: { serialize: vi.fn((x: any) => x) },
      } as any);
      expect(client).toBeDefined();
    });

    it('TC02: không có url, không có serializer (dùng mặc định)', async () => {
      const { ClientMqtt } = await freshModules();
      const client: any = new ClientMqtt({ clientId: randStr() } as any);
      expect(client.url).toBeDefined();
      expect(client.serializer).toBeDefined();
    });

    it('TC03: options = undefined', async () => {
      const { ClientMqtt } = await freshModules();
      const client: any = new ClientMqtt(undefined as any);
      expect(client).toBeDefined();
    });

    it('TC04: getRequestPattern / getResponsePattern', async () => {
      const { client } = await setup({}, false);
      const p = randStr();
      expect(client.getRequestPattern(p)).toBeDefined();
      expect(client.getResponsePattern(p)).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // close / handleClose
  // -------------------------------------------------------------------------
  describe('close & handleClose', () => {
    it('TC05: close khi có mqttClient, endAsync thành công', async () => {
      const { client, fake } = await ready();
      await client.close();
      expect(fake.endAsync).toHaveBeenCalled();
      expect(client.mqttClient).toBeNull();
    });

    it('TC06: close khi chưa có mqttClient', async () => {
      const { client } = await setup({}, false);
      const result = await client.close();
      expect(result).toBeUndefined();
    });

    it('TC07: close khi endAsync reject (finally vẫn reset state)', async () => {
      const { client, fake } = await ready();
      fake.endAsync.mockRejectedValue(new Error(randStr()));
      await expect(client.close()).rejects.toBeDefined();
      expect(client.mqttClient).toBeNull();
    });

    it('TC08: handleClose với routingMap rỗng', async () => {
      const { client } = await setup({}, false);
      const result = client.handleClose();
      expect(result).toBeUndefined();
    });

    it('TC09: handleClose với nhiều callback chạy bình thường', async () => {
      const { client } = await setup({}, false);
      const cbs = Array.from({ length: randInt(3, 6) }, () => vi.fn());
      cbs.forEach(cb => client.routingMap.set(randStr(), cb));
      client.handleClose();
      cbs.forEach(cb => expect(cb).toHaveBeenCalled());
    });

    it('TC10: handleClose khi một callback ném lỗi', async () => {
      const { client } = await setup({}, false);
      const bad = vi.fn(() => {
        throw new Error(randStr());
      });
      const good = vi.fn();
      client.routingMap.set(randStr(), bad);
      client.routingMap.set(randStr(), good);
      client.handleClose();
      expect(good).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // connect
  // -------------------------------------------------------------------------
  describe('connect', () => {
    it('TC11: đã có mqttClient -> trả về connectionPromise cũ', async () => {
      const { client } = await setup({}, false);
      client.mqttClient = new FakeMqttClient();
      client.connectionPromise = Promise.resolve(randStr());
      const result = await client.connect();
      expect(result).toBeDefined();
    });

    it('TC12: package chưa nạp, nạp xong tạo client và connect thành công', async () => {
      const { client } = await setup({ clientId: randStr() }, false);
      const p = client.connect();
      await vi.waitFor(() => expect(lastClient()).toBeDefined());
      lastClient().emit('connect');
      await p;
      expect(state.load).toHaveBeenCalled();
    });

    it('TC13: trong lúc nạp package, connect() khác đã tạo mqttClient', async () => {
      const { client } = await setup({}, false);
      let release: () => void = () => undefined;
      state.load = vi.fn(
        () => new Promise(res => (release = () => res(state.pkg))),
      );
      const p = client.connect();
      client.mqttClient = new FakeMqttClient();
      client.connectionPromise = Promise.resolve(randStr());
      release();
      expect(await p).toBeDefined();
    });

    it('TC14: trong lúc nạp package, close() được gọi -> throw', async () => {
      const { client } = await setup({}, false);
      let release: () => void = () => undefined;
      state.load = vi.fn(
        () => new Promise(res => (release = () => res(state.pkg))),
      );
      const p = client.connect();
      await client.close();
      release();
      await expect(p).rejects.toBeDefined();
    });

    it('TC15: package đã nạp, có pendingEventListeners, connect thành công', async () => {
      const { client } = await setup({ clientId: randStr() });
      const listener = vi.fn();
      client.on('message', listener);
      const p = client.connect();
      lastClient().emit('connect');
      await p;
      lastClient().emit('message', randStr(), Buffer.from(randStr()));
      expect(listener).toHaveBeenCalled();
    });

    it('TC16: mergeCloseEvent hoàn thành mà không emit (EmptyError)', async () => {
      const { client } = await setup({});
      vi.spyOn(client, 'mergeCloseEvent').mockReturnValue(EMPTY as any);
      const result = await client.connect();
      expect(result).toBeUndefined();
    });

    it('TC17: lỗi + reconnectPeriod = 0 -> discardClient', async () => {
      const { client } = await setup({ reconnectPeriod: 0 });
      const p = client.connect();
      lastClient().emit('error', new Error(randStr()));
      await expect(p).rejects.toBeDefined();
      expect(client.mqttClient).toBeNull();
    });

    it('TC18: lỗi + reconnectPeriod khác 0 -> không discard', async () => {
      const { client } = await setup({ reconnectPeriod: randInt(2000, 8000) });
      const p = client.connect();
      lastClient().emit('error', new Error(randStr()));
      await expect(p).rejects.toBeDefined();
      expect(client.mqttClient).toBeDefined();
    });

    it('TC19: lỗi + client.options = undefined -> không discard', async () => {
      const { client } = await setup({});
      const p = client.connect();
      lastClient().options = undefined;
      lastClient().emit('error', new Error(randStr()));
      await expect(p).rejects.toBeDefined();
      expect(client.mqttClient).toBeDefined();
    });

    it('TC20: lỗi + reconnectPeriod = 0 nhưng connectionPromise đã bị thay (offline)', async () => {
      const { client } = await setup({ reconnectPeriod: 0 });
      const p = client.connect();
      lastClient().emit('offline');
      lastClient().emit('error', new Error(randStr()));
      await expect(p).rejects.toBeDefined();
      expect(client.mqttClient).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // discardClient / mergeCloseEvent / createClient
  // -------------------------------------------------------------------------
  describe('discardClient, mergeCloseEvent, createClient', () => {
    it('TC21: discardClient với client không phải client hiện tại', async () => {
      const { client, fake } = await ready();
      client.discardClient(new FakeMqttClient());
      expect(client.mqttClient).toBe(fake);
    });

    it('TC22: discardClient với client hiện tại', async () => {
      const { client, fake } = await ready();
      client.subscriptionsCount.set(randStr(), randInt(3, 9));
      client.discardClient(fake);
      expect(client.mqttClient).toBeNull();
    });

    it('TC23: mergeCloseEvent - source phát giá trị trước', async () => {
      const { client } = await setup({}, false);
      const r = await lastValueFrom(
        client.mergeCloseEvent(new FakeMqttClient(), of(randInt(100, 900))),
      );
      expect(r).toBeDefined();
    });

    it('TC24: mergeCloseEvent - sự kiện close xảy ra', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      const p = lastValueFrom(client.mergeCloseEvent(fake, NEVER));
      fake.emit('close', new Error(randStr()));
      await expect(p).rejects.toBeDefined();
    });

    it('TC25: createClient khi mqttPackage chưa nạp (dùng loadPackageSync)', async () => {
      const { client } = await setup({ clientId: randStr() }, false);
      expect(client.createClient()).toBeDefined();
    });

    it('TC26: createClient khi mqttPackage đã nạp', async () => {
      const { client } = await setup({ clientId: randStr() });
      expect(client.createClient()).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listeners
  // -------------------------------------------------------------------------
  describe('register*Listener', () => {
    it('TC27: error code ECONNREFUSED -> bỏ qua', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerErrorListener(fake);
      fake.emit('error', { code: 'ECONNREFUSED' });
      expect(client.logger.error).not.toHaveBeenCalled();
    });

    it('TC28: error code ENOTFOUND -> bỏ qua', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerErrorListener(fake);
      fake.emit('error', { code: 'ENOTFOUND' });
      expect(client.logger.error).not.toHaveBeenCalled();
    });

    it('TC29: error code khác -> log lỗi', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerErrorListener(fake);
      fake.emit('error', { code: randStr() });
      expect(client.logger.error).toHaveBeenCalled();
    });

    it('TC30: offline listener', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerOfflineListener(fake);
      fake.emit('offline');
      expect(client.connectionPromise).toBeDefined();
    });

    it('TC31: reconnect listener', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerReconnectListener(fake);
      fake.emit('reconnect');
      expect(client.isReconnecting).toBeDefined();
    });

    it('TC32: disconnect listener', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerDisconnectListener(fake);
      fake.emit('disconnect');
      expect(client.isReconnecting).toBeDefined();
    });

    it('TC33: close listener - không reconnect, là client hiện tại -> discard', async () => {
      const { client, fake } = await ready();
      client.registerCloseListener(fake);
      fake.reconnecting = false;
      fake.emit('close');
      expect(client.mqttClient).toBeNull();
    });

    it('TC34: close listener - reconnecting và có timer -> giữ client', async () => {
      const { client, fake } = await ready();
      client.registerCloseListener(fake);
      fake.reconnecting = true;
      fake.reconnectTimer = { id: randInt(100, 900) };
      fake.emit('close');
      expect(client.mqttClient).toBe(fake);
    });

    it('TC35: close listener - reconnecting nhưng timer null -> discard', async () => {
      const { client, fake } = await ready();
      client.registerCloseListener(fake);
      fake.reconnecting = true;
      fake.reconnectTimer = null;
      fake.emit('close');
      expect(client.mqttClient).toBeNull();
    });

    it('TC36: close listener - client không phải client hiện tại -> giữ nguyên', async () => {
      const { client, fake } = await ready();
      const other = new FakeMqttClient();
      client.registerCloseListener(other);
      other.emit('close');
      expect(client.mqttClient).toBe(fake);
    });

    it('TC37: connect listener - lần kết nối đầu tiên (gắn message handler)', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerConnectListener(fake);
      fake.emit('connect');
      expect(fake.listenerCount('message')).toBeGreaterThan(0);
    });

    it('TC38: connect listener - kết nối lại (không gắn thêm handler)', async () => {
      const { client } = await setup({}, false);
      const fake = new FakeMqttClient();
      client.registerConnectListener(fake);
      fake.emit('connect');
      fake.emit('connect');
      expect(fake.listenerCount('message')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // on / unwrap
  // -------------------------------------------------------------------------
  describe('on & unwrap', () => {
    it('TC39: on() khi đã có mqttClient', async () => {
      const { client, fake } = await ready();
      const cb = vi.fn();
      client.on('error', cb);
      fake.emit('error', new Error(randStr()));
      expect(cb).toHaveBeenCalled();
    });

    it('TC40: on() khi chưa có mqttClient (lưu pending)', async () => {
      const { client } = await setup({}, false);
      client.on('error', vi.fn());
      expect(client.pendingEventListeners.length).toBeGreaterThan(0);
    });

    it('TC41: unwrap() khi đã khởi tạo', async () => {
      const { client } = await ready();
      expect(client.unwrap()).toBeDefined();
    });

    it('TC42: unwrap() khi chưa khởi tạo -> throw', async () => {
      const { client } = await setup({}, false);
      expect(() => client.unwrap()).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // createResponseCallback
  // -------------------------------------------------------------------------
  describe('createResponseCallback', () => {
    const deserializerReturns = (client: any, value: any) =>
      vi.spyOn(client.deserializer, 'deserialize').mockResolvedValue(value);

    it('TC43: payload JSON, không có callback tương ứng', async () => {
      const { client } = await setup({}, false);
      deserializerReturns(client, { id: randStr(), response: randStr() });
      const handler = client.createResponseCallback();
      const r = await handler(
        randStr(),
        Buffer.from(JSON.stringify({ a: randInt(10, 90) })),
      );
      expect(r).toBeUndefined();
    });

    it('TC44: payload không phải JSON', async () => {
      const { client } = await setup({}, false);
      const id = randStr();
      const cb = vi.fn();
      client.routingMap.set(id, cb);
      deserializerReturns(client, { id, response: randStr() });
      const handler = client.createResponseCallback();
      await handler(randStr(), Buffer.from(randStr(randInt(10, 20))));
      expect(cb).toHaveBeenCalled();
    });

    it('TC45: deserializer reject bằng Error', async () => {
      const { client } = await setup({}, false);
      vi.spyOn(client.deserializer, 'deserialize').mockRejectedValue(
        new Error(randStr()),
      );
      const handler = client.createResponseCallback();
      const r = await handler(randStr(), Buffer.from('{"x":1}'));
      expect(r).toBeUndefined();
    });

    it('TC46: deserializer reject bằng undefined', async () => {
      const { client } = await setup({}, false);
      vi.spyOn(client.deserializer, 'deserialize').mockRejectedValue(undefined);
      const handler = client.createResponseCallback();
      const r = await handler(randStr(), Buffer.from('{"x":1}'));
      expect(r).toBeUndefined();
    });

    it('TC47: isDisposed = true', async () => {
      const { client } = await setup({}, false);
      const id = randStr();
      const cb = vi.fn();
      client.routingMap.set(id, cb);
      deserializerReturns(client, {
        id,
        response: randStr(),
        isDisposed: true,
      });
      await client.createResponseCallback()(randStr(), Buffer.from('{"x":1}'));
      expect(cb).toHaveBeenCalled();
    });

    it('TC48: isDisposed = false, có err', async () => {
      const { client } = await setup({}, false);
      const id = randStr();
      const cb = vi.fn();
      client.routingMap.set(id, cb);
      deserializerReturns(client, { id, err: randStr(), isDisposed: false });
      await client.createResponseCallback()(randStr(), Buffer.from('{"x":1}'));
      expect(cb).toHaveBeenCalled();
    });

    it('TC49: không dispose, không err', async () => {
      const { client } = await setup({}, false);
      const id = randStr();
      const cb = vi.fn();
      client.routingMap.set(id, cb);
      deserializerReturns(client, {
        id,
        response: randStr(),
        isDisposed: false,
      });
      await client.createResponseCallback()(randStr(), Buffer.from('{"x":1}'));
      expect(cb).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // publish
  // -------------------------------------------------------------------------
  describe('publish', () => {
    it('TC50: pattern quá dài -> outer catch', async () => {
      const { client } = await ready();
      const cb = vi.fn();
      const cleanup = client.publish(
        { pattern: randStr(TOO_LONG_TOPIC_LEN()), data: randStr() },
        cb,
      );
      expect(cb).toHaveBeenCalled();
      expect(cleanup()).toBeUndefined();
    });

    it('TC51: subscription mới, subscribe OK, data là string', async () => {
      const { client, fake } = await ready();
      const cb = vi.fn();
      client.publish({ pattern: randStr(), data: randStr() }, cb);
      expect(fake.subscribe).toHaveBeenCalled();
      expect(fake.publish).toHaveBeenCalled();
    });

    it('TC52: subscribe trả lỗi', async () => {
      const { client, fake } = await ready();
      fake.subscribe.mockImplementation((_c: any, cb: any) =>
        cb(new Error(randStr())),
      );
      const cb = vi.fn();
      client.publish({ pattern: randStr(), data: randStr() }, cb);
      expect(cb).toHaveBeenCalled();
    });

    it('TC53: đã có subscription (count > 0), data là object thường', async () => {
      const { client, fake } = await ready();
      const pattern = randStr();
      client.publish({ pattern, data: { a: randInt(10, 90) } }, vi.fn());
      client.publish({ pattern, data: { b: randInt(10, 90) } }, vi.fn());
      expect(fake.subscribe).toHaveBeenCalledTimes(1);
      expect(fake.publish).toHaveBeenCalledTimes(2);
    });

    it('TC54: data là MqttRecord', async () => {
      const { client, fake, MqttRecord } = await ready();
      const record = new MqttRecord(randStr(), { qos: 1 } as any);
      client.publish({ pattern: randStr(), data: record }, vi.fn());
      expect(fake.publish).toHaveBeenCalled();
    });

    it('TC55: data = undefined', async () => {
      const { client, fake } = await ready();
      client.publish({ pattern: randStr(), data: undefined }, vi.fn());
      expect(fake.publish).toHaveBeenCalled();
    });

    it('TC56: publish callback trả lỗi khi còn isCounted', async () => {
      const { client, fake } = await ready();
      fake.publish.mockImplementation((_t: any, _p: any, _o: any, cb: any) =>
        cb(new Error(randStr())),
      );
      const cb = vi.fn();
      client.publish({ pattern: randStr(), data: randStr() }, cb);
      expect(cb).toHaveBeenCalled();
    });

    it('TC57: serializer ném lỗi trong publishPacket', async () => {
      const { client } = await ready();
      vi.spyOn(client.serializer, 'serialize').mockImplementation(() => {
        throw new Error(randStr());
      });
      const cb = vi.fn();
      client.publish({ pattern: randStr(), data: randStr() }, cb);
      expect(cb).toHaveBeenCalled();
    });

    it('TC58: undoBookkeeping khi subscriptionsCount đã bị xóa (get || 1)', async () => {
      const { client, fake } = await ready();
      let ack: any;
      fake.subscribe.mockImplementation((_c: any, cb: any) => (ack = cb));
      const cb = vi.fn();
      client.publish({ pattern: randStr(), data: randStr() }, cb);
      client.subscriptionsCount.clear();
      ack(new Error(randStr()));
      expect(cb).toHaveBeenCalled();
    });

    it('TC59: cleanup trước khi broker ack subscribe (publishPacket return sớm)', async () => {
      const { client, fake } = await ready();
      let ack: any;
      fake.subscribe.mockImplementation((_c: any, cb: any) => (ack = cb));
      const cleanup = client.publish(
        { pattern: randStr(), data: randStr() },
        vi.fn(),
      );
      cleanup();
      ack();
      expect(fake.publish).not.toHaveBeenCalled();
    });

    it('TC60: cleanup trước, sau đó subscribe ack lỗi (undoBookkeeping return sớm)', async () => {
      const { client, fake } = await ready();
      let ack: any;
      fake.subscribe.mockImplementation((_c: any, cb: any) => (ack = cb));
      const cb = vi.fn();
      const cleanup = client.publish(
        { pattern: randStr(), data: randStr() },
        cb,
      );
      cleanup();
      ack(new Error(randStr()));
      expect(cb).toHaveBeenCalled();
    });

    it('TC61: publish callback lỗi sau khi đã cleanup (isCounted = false)', async () => {
      const { client, fake } = await ready();
      let pubCb: any;
      fake.publish.mockImplementation(
        (_t: any, _p: any, _o: any, cb: any) => (pubCb = cb),
      );
      const cb = vi.fn();
      const cleanup = client.publish(
        { pattern: randStr(), data: randStr() },
        cb,
      );
      cleanup();
      pubCb(new Error(randStr()));
      expect(cb).not.toHaveBeenCalled();
    });

    it('TC62: publish callback không lỗi (err = undefined)', async () => {
      const { client, fake } = await ready();
      let pubCb: any;
      fake.publish.mockImplementation(
        (_t: any, _p: any, _o: any, cb: any) => (pubCb = cb),
      );
      const cb = vi.fn();
      client.publish({ pattern: randStr(), data: randStr() }, cb);
      pubCb(undefined);
      expect(cb).not.toHaveBeenCalled();
    });

    it('TC63: cleanup 2 request cùng pattern (count > 0 rồi = 0), gọi cleanup 2 lần', async () => {
      const { client, fake } = await ready();
      const pattern = randStr();
      const c1 = client.publish({ pattern, data: randStr() }, vi.fn());
      const c2 = client.publish({ pattern, data: randStr() }, vi.fn());
      c1();
      expect(fake.unsubscribe).not.toHaveBeenCalled();
      c2();
      expect(fake.unsubscribe).toHaveBeenCalled();
      c2(); // lần 2: isCounted = false -> return sớm
      expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // dispatchEvent
  // -------------------------------------------------------------------------
  describe('dispatchEvent', () => {
    it('TC64: pattern quá dài -> throw', async () => {
      const { client } = await ready();
      expect(() =>
        client.dispatchEvent({
          pattern: randStr(TOO_LONG_TOPIC_LEN()),
          data: randStr(),
        }),
      ).toThrow();
    });

    it('TC65: data là string, publish thành công', async () => {
      const { client } = await ready();
      const r = await client.dispatchEvent({
        pattern: randStr(),
        data: randStr(),
      });
      expect(r).toBeUndefined();
    });

    it('TC66: data là MqttRecord, publish thất bại -> reject', async () => {
      const { client, fake, MqttRecord } = await ready();
      fake.publish.mockImplementation((_t: any, _p: any, _o: any, cb: any) =>
        cb(new Error(randStr())),
      );
      const record = new MqttRecord(randStr(), { qos: 1 } as any);
      await expect(
        client.dispatchEvent({ pattern: randStr(), data: record }),
      ).rejects.toBeDefined();
    });

    it('TC67: data = undefined', async () => {
      const { client } = await ready();
      const r = await client.dispatchEvent({
        pattern: randStr(),
        data: undefined,
      });
      expect(r).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // mergePacketOptions
  // -------------------------------------------------------------------------
  describe('mergePacketOptions', () => {
    const meta = () => ({ [randStr()]: randStr() });

    it('TC68: không request options, không userProperties, không metadata', async () => {
      const { client } = await setup({ protocolVersion: 5 }, false);
      expect(
        client.mergePacketOptions(undefined, undefined) ?? 'none',
      ).toBeDefined();
    });

    it('TC69: chỉ có request options (không userProperties/metadata)', async () => {
      const { client } = await setup({ protocolVersion: 4 }, false);
      expect(client.mergePacketOptions({ qos: 1 }, undefined)).toBeDefined();
    });

    it('TC70: chỉ có userProperties của client', async () => {
      const { client } = await setup(
        { protocolVersion: 4, userProperties: { [randStr()]: randStr() } },
        false,
      );
      expect(client.mergePacketOptions(undefined, undefined)).toBeDefined();
    });

    it('TC71: MQTT5 + metadata hợp lệ, không request options', async () => {
      const { client } = await setup({ protocolVersion: 5 }, false);
      expect(client.mergePacketOptions(undefined, meta())).toBeDefined();
    });

    it('TC72: MQTT5 nhưng metadata = undefined + request options', async () => {
      const { client } = await setup({ protocolVersion: 5 }, false);
      expect(client.mergePacketOptions({ qos: 1 }, undefined)).toBeDefined();
    });

    it('TC73: MQTT4 + metadata (bị bỏ qua) + request options', async () => {
      const { client } = await setup({ protocolVersion: 4 }, false);
      expect(client.mergePacketOptions({ qos: 1 }, meta())).toBeDefined();
    });

    it('TC74: MQTT5 + metadata + userProperties + request.properties.userProperties', async () => {
      const { client } = await setup(
        { protocolVersion: 5, userProperties: { [randStr()]: randStr() } },
        false,
      );
      const r = client.mergePacketOptions(
        { qos: 1, properties: { userProperties: { [randStr()]: randStr() } } },
        meta(),
      );
      expect(r).toBeDefined();
    });

    it('TC75: this.options = undefined', async () => {
      const { ClientMqtt } = await freshModules();
      const client: any = new ClientMqtt(undefined as any);
      expect(client.mergePacketOptions({ qos: 1 }, meta())).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // topic length / subscription count
  // -------------------------------------------------------------------------
  describe('assertTopicLength & unsubscribeFromChannel', () => {
    it('TC76: assertTopicLength - topic độ dài hợp lệ', async () => {
      const { client } = await setup({}, false);
      expect(
        client.assertTopicLength(randStr(randInt(20, 200))),
      ).toBeUndefined();
    });

    it('TC77: assertTopicLength - topic quá dài -> throw', async () => {
      const { client } = await setup({}, false);
      expect(() =>
        client.assertTopicLength(randStr(TOO_LONG_TOPIC_LEN())),
      ).toThrow();
    });

    it('TC78: unsubscribeFromChannel - count còn > 0', async () => {
      const { client, fake } = await ready();
      const ch = randStr();
      client.subscriptionsCount.set(ch, randInt(4, 9));
      client.unsubscribeFromChannel(ch);
      expect(fake.unsubscribe).not.toHaveBeenCalled();
    });

    it('TC79: unsubscribeFromChannel - count về 0', async () => {
      const { client, fake } = await ready();
      const ch = randStr();
      client.subscriptionsCount.set(ch, 1);
      client.unsubscribeFromChannel(ch);
      expect(fake.unsubscribe).toHaveBeenCalled();
    });

    it('TC80: initializeSerializer - có / không có serializer tuỳ chỉnh', async () => {
      const { client } = await setup({}, false);
      client.initializeSerializer({ serializer: { serialize: vi.fn() } });
      const custom = client.serializer;
      client.initializeSerializer({});
      expect(custom).toBeDefined();
      expect(client.serializer).toBeDefined();
    });
  });
});
