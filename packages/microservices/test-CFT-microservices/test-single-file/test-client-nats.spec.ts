/**
 * Control Flow Testing (CFT) cho ClientNats
 * ------------------------------------------------------------------
 * - Input sinh ngẫu nhiên, nằm sâu trong lớp tương đương (không dùng giá trị biên).
 *   Ngoại lệ bắt buộc: nhánh "empty response" cần payload rỗng (đó chính là điều kiện của nhánh).
 * - Output KHÔNG được kiểm tra tính đúng đắn; chỉ ép chương trình đi qua đúng nhánh
 *   (toBeDefined / toHaveBeenCalled / rejects.toBeDefined).
 * - Dependency ngoài (nats package, loadPackage, hasPacketMetadata, serializer, ...) được mock.
 *
 * Vị trí: packages/microservices/test-CFT-microservices/test-single-file/
 * (import tương đối '../../client/client-nats.js', '../../events/...', '../../utils/...').
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPackage } from '@nestjs/common/internal';
import { NatsEventsMap } from '../../events/nats.events.js';
import { hasPacketMetadata } from '../../utils/packet-metadata.utils.js';
import { ClientNats } from '../../client/client-nats.js';

vi.mock('@nestjs/common/internal', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@nestjs/common/internal')>();
  return { ...actual, loadPackage: vi.fn() };
});

vi.mock('../../utils/packet-metadata.utils.js', () => ({
  hasPacketMetadata: vi.fn(),
}));

/* ----------------------------- Random helpers ----------------------------- */
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randStr = (prefix = 'v') =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------- Fakes/Mocks ------------------------------ */
class FakeHdrs {
  private readonly store = new Map<string, string[]>();
  set(key: string, value: string) {
    this.store.set(key, [value]);
  }
  append(key: string, value: string) {
    this.store.set(key, [...(this.store.get(key) ?? []), value]);
  }
  has(key: string) {
    return this.store.has(key);
  }
  keys() {
    return [...this.store.keys()];
  }
  values(key: string) {
    return this.store.get(key) ?? [];
  }
}

const natsPkg = {
  connect: vi.fn(),
  createInbox: vi.fn(),
  headers: vi.fn(),
};

const createConn = (): Record<string, any> => ({
  close: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  publish: vi.fn(),
  status: vi.fn(),
  info: { headers: true },
});

const makeStatusConn = (items: any[], onEnd?: () => void) => {
  const conn = createConn();
  conn.status = vi.fn(() =>
    (async function* () {
      for (const item of items) {
        yield item;
      }
      onEnd?.();
    })(),
  );
  return conn;
};

const deferred = () => {
  let resolve!: (v: any) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<any>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const build = (extra: Record<string, any> = {}) => {
  const serializer = {
    serialize: vi.fn(() => ({
      data: Buffer.from(randStr('payload')),
      headers: undefined,
    })),
  };
  const deserializer = {
    deserialize: vi.fn(async () => ({ response: randStr('resp') })),
  };
  return new ClientNats({
    serializer,
    deserializer,
    inboxPrefix: '_INBOX',
    ...extra,
  } as any);
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/* --------------------------------- Tests ---------------------------------- */
describe('ClientNats (Control Flow Testing)', () => {
  let client: any;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    natsPkg.connect.mockImplementation(async () => createConn());
    natsPkg.createInbox.mockImplementation(
      (prefix?: string) => `${prefix ?? '_INBOX'}.${randStr('ib')}`,
    );
    natsPkg.headers.mockImplementation(() => new FakeHdrs());
    vi.mocked(loadPackage).mockResolvedValue(natsPkg as any);
    vi.mocked(hasPacketMetadata).mockReturnValue(false as any);

    client = build();
    // nạp natsPackage (biến module-level) thông qua loadPackage đã mock
    await client.createClient();

    errSpy = vi.spyOn(client.logger, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(client.logger, 'log').mockImplementation(() => {});
    debugSpy = vi.spyOn(client.logger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ----------------------------- Constructor ----------------------------- */
  describe('constructor / initializeSerializer / initializeDeserializer', () => {
    it('TC01 - options có serializer & deserializer tuỳ chỉnh', () => {
      const instance = build();
      expect(instance).toBeDefined();
    });

    it('TC02 - options rỗng => dùng serializer/deserializer mặc định', () => {
      const instance = new ClientNats({} as any);
      expect(instance).toBeDefined();
    });

    it('TC03 - options undefined (optional chaining null)', () => {
      const instance = new ClientNats(undefined as any);
      expect(instance).toBeDefined();
    });
  });

  /* ----------------------------- createClient ---------------------------- */
  describe('createClient', () => {
    it('TC04 - serializer & deserializer đều có hàm init', async () => {
      const serializer = { init: vi.fn().mockResolvedValue(undefined) };
      const deserializer = { init: vi.fn().mockResolvedValue(undefined) };
      client.serializer = serializer;
      client.deserializer = deserializer;
      client.options = {
        servers: `nats://${randStr('host')}:${randInt(2000, 3000)}`,
      };

      const result = await client.createClient();

      expect(result).toBeDefined();
      expect(serializer.init).toHaveBeenCalled();
      expect(deserializer.init).toHaveBeenCalled();
    });

    it('TC05 - serializer & deserializer tồn tại nhưng không có init', async () => {
      client.serializer = { serialize: vi.fn() };
      client.deserializer = { deserialize: vi.fn() };

      const result = await client.createClient();

      expect(result).toBeDefined();
    });

    it('TC06 - serializer/deserializer undefined và options undefined', async () => {
      client.serializer = undefined;
      client.deserializer = undefined;
      client.options = undefined;

      const result = await client.createClient();

      expect(result).toBeDefined();
    });
  });

  /* -------------------------------- close -------------------------------- */
  describe('close', () => {
    it('TC07 - natsClient = null', async () => {
      client.natsClient = null;
      await client.close();
      expect(client.natsClient).toBeNull();
    });

    it('TC08 - natsClient hợp lệ, close() thành công', async () => {
      const conn = createConn();
      client.natsClient = conn;
      client.routingMap.set(randStr('id'), vi.fn());

      await client.close();

      expect(conn.close).toHaveBeenCalled();
    });

    it('TC09 - natsClient.close() reject => finally vẫn chạy và ném lỗi', async () => {
      const conn = createConn();
      conn.close = vi.fn().mockRejectedValue(new Error(randStr('err')));
      client.natsClient = conn;

      await expect(client.close()).rejects.toBeDefined();
    });
  });

  /* ------------------------------ handleClose ---------------------------- */
  describe('handleClose', () => {
    it('TC10 - routingMap rỗng', () => {
      client.handleClose();
      expect(client.routingMap.size).toBeDefined();
    });

    it('TC11 - routingMap có nhiều callback chạy bình thường', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      client.routingMap.set(randStr('a'), cb1);
      client.routingMap.set(randStr('b'), cb2);

      client.handleClose();

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('TC12 - có callback ném lỗi => logger.error được gọi', () => {
      const bad = vi.fn(() => {
        throw new Error(randStr('boom'));
      });
      const good = vi.fn();
      client.routingMap.set(randStr('a'), bad);
      client.routingMap.set(randStr('b'), good);

      client.handleClose();

      expect(errSpy).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
    });
  });

  /* -------------------------------- connect ------------------------------ */
  describe('connect', () => {
    it('TC13 - đã có connectionPromise => trả về luôn', async () => {
      const cached = Promise.resolve(createConn());
      client.connectionPromise = cached;

      const result = await client.connect();

      expect(result).toBeDefined();
    });

    it('TC14 - createClient reject, attempt vẫn là hiện tại => reset & ném lỗi', async () => {
      vi.spyOn(client, 'createClient').mockRejectedValue(
        new Error(randStr('fail')),
      );

      await expect(client.connect()).rejects.toBeDefined();
    });

    it('TC15 - createClient reject nhưng connectionPromise đã bị thay', async () => {
      const d = deferred();
      vi.spyOn(client, 'createClient').mockReturnValue(d.promise);

      const pending = client.connect();
      client.connectionPromise = Promise.resolve(createConn());
      d.reject(new Error(randStr('fail')));

      await expect(pending).rejects.toBeDefined();
    });

    it('TC16 - đóng/kết nối lại khi đang pending, có connectionPromise mới (close cũ reject)', async () => {
      const d = deferred();
      vi.spyOn(client, 'createClient').mockReturnValue(d.promise);

      const pending = client.connect();
      client.connectionPromise = Promise.resolve(createConn());
      const stale = createConn();
      stale.close = vi.fn().mockRejectedValue(new Error(randStr('x')));
      d.resolve(stale);

      const result = await pending;

      expect(result).toBeDefined();
      expect(stale.close).toHaveBeenCalled();
    });

    it('TC17 - đóng khi đang pending và không còn connectionPromise => ném "Connection closed"', async () => {
      const d = deferred();
      vi.spyOn(client, 'createClient').mockReturnValue(d.promise);

      const pending = client.connect();
      client.connectionPromise = null;
      d.resolve(createConn());

      await expect(pending).rejects.toBeDefined();
    });

    it('TC18 - kết nối thành công, handleStatusUpdates resolve', async () => {
      const conn = createConn();
      vi.spyOn(client, 'createClient').mockResolvedValue(conn);
      const statusSpy = vi
        .spyOn(client, 'handleStatusUpdates')
        .mockResolvedValue(undefined);

      const result = await client.connect();

      expect(result).toBeDefined();
      expect(statusSpy).toHaveBeenCalled();
    });

    it('TC19 - kết nối thành công, handleStatusUpdates reject => logger.error', async () => {
      const conn = createConn();
      vi.spyOn(client, 'createClient').mockResolvedValue(conn);
      vi.spyOn(client, 'handleStatusUpdates').mockRejectedValue(
        new Error(randStr('status')),
      );

      await client.connect();
      await flush();

      expect(errSpy).toHaveBeenCalled();
    });
  });

  /* --------------------------- handleStatusUpdates ----------------------- */
  describe('handleStatusUpdates', () => {
    it('TC20 - natsClient khác client => return sớm', async () => {
      const conn = makeStatusConn([{ type: 'error', error: randStr('e') }]);
      client.natsClient = createConn();

      await client.handleStatusUpdates(conn);

      expect(errSpy).not.toHaveBeenCalled();
    });

    it("TC21 - status 'error'", async () => {
      const conn = makeStatusConn([{ type: 'error', error: randStr('e') }]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(errSpy).toHaveBeenCalled();
    });

    it("TC22 - status 'disconnect'", async () => {
      const conn = makeStatusConn([
        { type: 'disconnect', server: randStr('srv') },
      ]);
      client.natsClient = conn;
      const listener = vi.fn();
      client.on(NatsEventsMap.DISCONNECT, listener);

      await client.handleStatusUpdates(conn);

      expect(listener).toHaveBeenCalled();
    });

    it("TC23 - status 'reconnecting'", async () => {
      const conn = makeStatusConn([{ type: 'reconnecting' }]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(client.connectionPromise).toBeDefined();
    });

    it("TC24 - status 'reconnect'", async () => {
      const conn = makeStatusConn([
        { type: 'reconnect', server: randStr('srv') },
      ]);
      client.natsClient = conn;
      const listener = vi.fn();
      client.on(NatsEventsMap.RECONNECT, listener);

      await client.handleStatusUpdates(conn);

      expect(listener).toHaveBeenCalled();
    });

    it("TC25 - status 'ping' với options.debug = true", async () => {
      client.options = { ...client.options, debug: true };
      const conn = makeStatusConn([
        { type: 'ping', pendingPings: randInt(10, 90) },
      ]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(debugSpy).toHaveBeenCalled();
    });

    it("TC26 - status 'ping' với options.debug = false", async () => {
      client.options = { ...client.options, debug: false };
      const conn = makeStatusConn([
        { type: 'ping', pendingPings: randInt(10, 90) },
      ]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("TC27 - status 'update'", async () => {
      const conn = makeStatusConn([
        { type: 'update', added: [randStr('a')], deleted: [randStr('d')] },
      ]);
      client.natsClient = conn;
      const listener = vi.fn();
      client.on(NatsEventsMap.UPDATE, listener);

      await client.handleStatusUpdates(conn);

      expect(listener).toHaveBeenCalled();
    });

    it('TC28 - default: status có data là object', async () => {
      const conn = makeStatusConn([
        { type: randStr('custom'), data: { k: randStr('v') } },
      ]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(logSpy).toHaveBeenCalled();
    });

    it('TC29 - default: status có data không phải object', async () => {
      const conn = makeStatusConn([
        { type: randStr('custom'), data: randStr('text') },
      ]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(logSpy).toHaveBeenCalled();
    });

    it("TC30 - default: status không có thuộc tính 'data'", async () => {
      const conn = makeStatusConn([{ type: randStr('custom') }]);
      client.natsClient = conn;

      await client.handleStatusUpdates(conn);

      expect(logSpy).toHaveBeenCalled();
    });

    it('TC31 - listener ném lỗi => khối catch ghi log', async () => {
      const conn = makeStatusConn([
        { type: 'reconnect', server: randStr('srv') },
      ]);
      client.natsClient = conn;
      client.on(NatsEventsMap.RECONNECT, () => {
        throw new Error(randStr('listener'));
      });

      await client.handleStatusUpdates(conn);

      expect(errSpy).toHaveBeenCalled();
    });

    it('TC32 - vòng lặp kết thúc, natsClient vẫn là client => reset & handleClose', async () => {
      const conn = makeStatusConn([]);
      client.natsClient = conn;
      const closeSpy = vi.spyOn(client, 'handleClose');

      await client.handleStatusUpdates(conn);

      expect(closeSpy).toHaveBeenCalled();
    });

    it('TC33 - vòng lặp kết thúc, natsClient đã bị đổi => không reset', async () => {
      const conn = makeStatusConn(
        [{ type: 'ping', pendingPings: randInt(10, 90) }],
        () => {
          client.natsClient = null;
        },
      );
      client.natsClient = conn;
      const closeSpy = vi.spyOn(client, 'handleClose');

      await client.handleStatusUpdates(conn);

      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------- on --------------------------------- */
  describe('on', () => {
    it('TC34 - đăng ký listener cho sự kiện', () => {
      const listener = vi.fn();
      client.on(NatsEventsMap.UPDATE, listener);
      client.statusEventEmitter.emit(NatsEventsMap.UPDATE, {
        added: [randStr('a')],
        deleted: [],
      });
      expect(listener).toHaveBeenCalled();
    });
  });

  /* -------------------------------- unwrap ------------------------------- */
  describe('unwrap', () => {
    it('TC35 - natsClient null => ném lỗi', () => {
      client.natsClient = null;
      expect(() => client.unwrap()).toThrow();
    });

    it('TC36 - natsClient đã khởi tạo => trả về client', () => {
      client.natsClient = createConn();
      expect(client.unwrap()).toBeDefined();
    });
  });

  /* ------------------------ createSubscriptionHandler -------------------- */
  describe('createSubscriptionHandler', () => {
    const makePacket = () => ({
      pattern: randStr('pat'),
      data: randStr('data'),
      id: randStr('id'),
    });

    it('TC37 - error truthy => callback({ err })', async () => {
      const callback = vi.fn();
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(new Error(randStr('err')), {});

      expect(callback).toHaveBeenCalled();
    });

    it('TC38 - payload rỗng => EmptyResponseException', async () => {
      const callback = vi.fn();
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(null, { data: new Uint8Array(0) });

      expect(callback).toHaveBeenCalled();
    });

    it('TC39 - deserialize ném lỗi => callback({ err, isDisposed })', async () => {
      const callback = vi.fn();
      client.deserializer = {
        deserialize: vi.fn().mockRejectedValue(new Error(randStr('de'))),
      };
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(null, { data: Buffer.from(randStr('raw')) });

      expect(callback).toHaveBeenCalled();
    });

    it('TC40 - message.id khác packet.id => bỏ qua', async () => {
      const callback = vi.fn();
      client.deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ id: randStr('other'), response: randStr('r') }),
      };
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(null, { data: Buffer.from(randStr('raw')) });

      expect(callback).not.toHaveBeenCalled();
    });

    it('TC41 - id khớp, không err/isDisposed => callback bình thường', async () => {
      const callback = vi.fn();
      const packet = makePacket();
      client.deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ id: packet.id, response: randStr('r') }),
      };
      const handler = client.createSubscriptionHandler(packet, callback);

      await handler(null, { data: Buffer.from(randStr('raw')) });

      expect(callback).toHaveBeenCalled();
    });

    it('TC42 - message không có id (falsy), data undefined => callback bình thường', async () => {
      const callback = vi.fn();
      client.deserializer = {
        deserialize: vi.fn().mockResolvedValue({ response: randStr('r') }),
      };
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(null, {});

      expect(callback).toHaveBeenCalled();
    });

    it('TC43 - isDisposed = true => callback dispose', async () => {
      const callback = vi.fn();
      client.deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ response: randStr('r'), isDisposed: true }),
      };
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(null, { data: Buffer.from(randStr('raw')) });

      expect(callback).toHaveBeenCalled();
    });

    it('TC44 - message.err truthy, isDisposed = false => callback dispose', async () => {
      const callback = vi.fn();
      client.deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ err: randStr('remote-err'), isDisposed: false }),
      };
      const handler = client.createSubscriptionHandler(makePacket(), callback);

      await handler(null, { data: Buffer.from(randStr('raw')) });

      expect(callback).toHaveBeenCalled();
    });
  });

  /* -------------------------------- publish ------------------------------ */
  describe('publish', () => {
    const makePartial = () => ({
      pattern: randStr('pat'),
      data: { value: randInt(10, 90) },
      metadata: { traceId: randStr('trace') },
    });

    it('TC45 - publish thành công và gọi hàm cleanup trả về', () => {
      const conn = createConn();
      client.natsClient = conn;
      vi.mocked(hasPacketMetadata).mockReturnValue(true as any);

      const cleanup = client.publish(makePartial(), vi.fn());
      cleanup();

      expect(cleanup).toBeDefined();
      expect(conn.publish).toHaveBeenCalled();
    });

    it('TC46 - subscribe ném lỗi => catch: cleanup + callback({ err })', () => {
      const conn = createConn();
      conn.subscribe = vi.fn(() => {
        throw new Error(randStr('sub'));
      });
      client.natsClient = conn;
      const callback = vi.fn();

      const cleanup = client.publish(makePartial(), callback);
      cleanup();

      expect(callback).toHaveBeenCalled();
    });

    it('TC47 - publish (NATS) ném lỗi sau khi đã subscribe => catch với cleanup mới', () => {
      const conn = createConn();
      conn.publish = vi.fn(() => {
        throw new Error(randStr('pub'));
      });
      client.natsClient = conn;
      const callback = vi.fn();

      const cleanup = client.publish(makePartial(), callback);

      expect(cleanup).toBeDefined();
      expect(callback).toHaveBeenCalled();
    });
  });

  /* ----------------------------- dispatchEvent --------------------------- */
  describe('dispatchEvent', () => {
    const makePacket = () => ({
      pattern: randStr('evt'),
      data: { value: randInt(10, 90) },
      metadata: { traceId: randStr('trace') },
    });

    it('TC48 - publish thành công => resolve', async () => {
      client.natsClient = createConn();

      const result = client.dispatchEvent(makePacket());

      await expect(result).resolves.toBeUndefined();
    });

    it('TC49 - publish ném lỗi => reject', async () => {
      const conn = createConn();
      conn.publish = vi.fn(() => {
        throw new Error(randStr('pub'));
      });
      client.natsClient = conn;

      await expect(client.dispatchEvent(makePacket())).rejects.toBeDefined();
    });
  });

  /* ------------------------------ mergeHeaders --------------------------- */
  describe('mergeHeaders', () => {
    beforeEach(() => {
      client.natsClient = createConn();
    });

    it('TC50 - không có header/metadata => undefined', () => {
      client.options = { inboxPrefix: '_INBOX' };
      const result = client.mergeHeaders(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('TC51 - requestHeaders là MsgHdrs (nhiều giá trị mỗi key)', () => {
      const requestHeaders = new FakeHdrs();
      requestHeaders.append(randStr('k'), randStr('v1'));
      requestHeaders.append(requestHeaders.keys()[0], randStr('v2'));

      const result = client.mergeHeaders(requestHeaders, undefined);

      expect(result).toBeDefined();
    });

    it('TC52 - requestHeaders là object thuần', () => {
      const result = client.mergeHeaders(
        { [randStr('k')]: randStr('v') },
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('TC53 - requestHeaders truthy nhưng không phải object (chuỗi)', () => {
      const result = client.mergeHeaders(randStr('str'), undefined);
      expect(result).toBeDefined();
    });

    it('TC54 - options.headers: key đã có (bỏ qua) và key mới (set)', () => {
      const shared = randStr('shared');
      client.options = {
        inboxPrefix: '_INBOX',
        headers: {
          [shared]: randStr('static'),
          [randStr('new')]: randStr('s'),
        },
      };

      const result = client.mergeHeaders(
        { [shared]: randStr('req') },
        undefined,
      );

      expect(result).toBeDefined();
    });

    it('TC55 - metadata hợp lệ & server hỗ trợ header: key mới (set) và key đã có (bỏ qua)', () => {
      vi.mocked(hasPacketMetadata).mockReturnValue(true as any);
      const shared = randStr('shared');
      const metadata = { [shared]: randStr('m'), [randStr('n')]: randStr('m') };

      const result = client.mergeHeaders(
        { [shared]: randStr('req') },
        metadata,
      );

      expect(result).toBeDefined();
    });

    it('TC56 - metadata hợp lệ nhưng server không hỗ trợ header => bỏ metadata', () => {
      vi.mocked(hasPacketMetadata).mockReturnValue(true as any);
      client.natsClient = { ...createConn(), info: { headers: false } };

      const result = client.mergeHeaders(undefined, {
        [randStr('k')]: randStr('v'),
      });

      expect(result).toBeUndefined();
    });

    it('TC57 - options undefined (optional chaining) với metadata hợp lệ', () => {
      vi.mocked(hasPacketMetadata).mockReturnValue(true as any);
      client.options = undefined;

      const result = client.mergeHeaders(undefined, {
        [randStr('k')]: randStr('v'),
      });

      expect(result).toBeDefined();
    });
  });

  /* ---------------------------- supportsHeaders -------------------------- */
  describe('supportsHeaders', () => {
    it('TC58 - natsClient null => true', () => {
      client.natsClient = null;
      expect(client.supportsHeaders()).toBeDefined();
    });

    it('TC59 - info.headers = true', () => {
      client.natsClient = { info: { headers: true } };
      expect(client.supportsHeaders()).toBeDefined();
    });

    it('TC60 - info.headers = false', () => {
      client.natsClient = { info: { headers: false } };
      expect(client.supportsHeaders()).toBeDefined();
    });

    it('TC61 - natsClient không có info', () => {
      client.natsClient = {};
      expect(client.supportsHeaders()).toBeDefined();
    });
  });
});
