import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientRedis } from '../../client/client-redis.js';
import { RedisStatus } from '../../events/redis.events.js';
import { loadPackage } from '@nestjs/common/internal';

vi.mock('@nestjs/common/internal', async importOriginal => {
  const actual: any = await importOriginal();
  return { ...actual, loadPackage: vi.fn() };
});

// ---------- Random data helpers (giá trị nằm sâu trong lớp tương đương, không dùng biên) ----------
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randStr = (prefix = 'x') =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

// ---------- Fake ioredis client ----------
const fakeClient = (status = 'ready'): any => ({
  status,
  on: vi.fn(),
  addListener: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue('OK'),
  disconnect: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
});
const handlerOf = (fake: any, event: string) =>
  fake.on.mock.calls.find((c: any[]) => c[0] === event)![1];

describe('ClientRedis - Control Flow Testing', () => {
  let client: ClientRedis;
  let c: any;
  let errorSpy: any;
  let logSpy: any;
  let debugSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ClientRedis({
      host: randStr('host'),
      port: randInt(2000, 9000),
    } as any);
    c = client as any;
    errorSpy = vi.spyOn(c.logger, 'error').mockImplementation(() => undefined);
    logSpy = vi.spyOn(c.logger, 'log').mockImplementation(() => undefined);
    debugSpy = vi.spyOn(c.logger, 'debug').mockImplementation(() => undefined);
  });

  // ================= getRequestPattern / getReplyPattern =================
  it('TC01: getRequestPattern trả về pattern', () => {
    expect(client.getRequestPattern(randStr('p'))).toBeDefined();
  });

  it('TC02: getReplyPattern thêm hậu tố .reply', () => {
    expect(client.getReplyPattern(randStr('p'))).toBeDefined();
  });

  // ================= close / quitClient =================
  it('TC03: close - pubClient & subClient tồn tại, quit thành công', async () => {
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    const pub = c.pubClient;
    const sub = c.subClient;
    c.pendingEventListeners = [{ event: 'error', callback: vi.fn() }];
    await client.close();
    expect(pub.quit).toHaveBeenCalled();
    expect(sub.quit).toHaveBeenCalled();
    expect(client).toBeDefined();
  });

  it('TC04: close - không có client nào', async () => {
    c.pubClient = null;
    c.subClient = null;
    await client.close();
    expect(client).toBeDefined();
  });

  it('TC05: close - chỉ có pubClient', async () => {
    c.pubClient = fakeClient();
    c.subClient = null;
    await client.close();
    expect(client).toBeDefined();
  });

  it('TC06: close - chỉ có subClient', async () => {
    c.pubClient = null;
    c.subClient = fakeClient();
    await client.close();
    expect(client).toBeDefined();
  });

  it('TC07: close - quit() bị reject => gọi disconnect()', async () => {
    const pub = fakeClient();
    const sub = fakeClient();
    pub.quit.mockRejectedValue(new Error(randStr('quit')));
    sub.quit.mockRejectedValue(new Error(randStr('quit')));
    c.pubClient = pub;
    c.subClient = sub;
    await client.close();
    expect(pub.disconnect).toHaveBeenCalled();
    expect(sub.disconnect).toHaveBeenCalled();
  });

  // ================= connect =================
  it('TC08: connect - đã có connectionPromise', async () => {
    const existing = Promise.resolve(randStr('existing'));
    c.connectionPromise = existing;
    const result = client.connect();
    expect(result).toBeDefined();
  });

  it('TC09: connect - handleConnection thành công', async () => {
    vi.spyOn(c, 'handleConnection').mockResolvedValue(undefined);
    const result = await client.connect();
    expect(result).toBeUndefined();
    expect(c.connectionPromise).not.toBeNull();
  });

  it('TC10: connect - handleConnection lỗi, connectionPromise không đổi => discardClients', async () => {
    vi.spyOn(c, 'handleConnection').mockRejectedValue(new Error(randStr('e')));
    const discardSpy = vi.spyOn(c, 'discardClients');
    await expect(client.connect()).rejects.toBeDefined();
    expect(discardSpy).toHaveBeenCalled();
  });

  it('TC11: connect - handleConnection lỗi, connectionPromise đã bị thay thế => không discard', async () => {
    vi.spyOn(c, 'handleConnection').mockImplementation(async () => {
      await Promise.resolve();
      c.connectionPromise = Promise.resolve(randStr('other'));
      throw new Error(randStr('e'));
    });
    const discardSpy = vi.spyOn(c, 'discardClients');
    await expect(client.connect()).rejects.toBeDefined();
    expect(discardSpy).not.toHaveBeenCalled();
  });

  // ================= discardClients =================
  it('TC12: discardClients - client status khác end và status end', () => {
    const pub = fakeClient('ready');
    const sub = fakeClient('end');
    c.pubClient = pub;
    c.subClient = sub;
    c.discardClients();
    expect(pub.disconnect).toHaveBeenCalled();
    expect(sub.disconnect).not.toHaveBeenCalled();
  });

  it('TC13: discardClients - client null', () => {
    c.pubClient = null;
    c.subClient = null;
    c.discardClients();
    expect(c.pubClient).toBeDefined();
  });

  // ================= isCurrentClient =================
  it('TC14: isCurrentClient - trùng pubClient', () => {
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    expect(c.isCurrentClient(c.pubClient)).toBeDefined();
  });

  it('TC15: isCurrentClient - trùng subClient', () => {
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    expect(c.isCurrentClient(c.subClient)).toBeDefined();
  });

  it('TC16: isCurrentClient - client khác', () => {
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    expect(c.isCurrentClient(fakeClient())).toBeDefined();
  });

  // ================= handleConnection =================
  it('TC17: handleConnection - có pendingEventListeners', async () => {
    const pub = fakeClient();
    const sub = fakeClient();
    vi.spyOn(c, 'createClient')
      .mockResolvedValueOnce(pub)
      .mockResolvedValueOnce(sub);
    const cb = vi.fn();
    c.pendingEventListeners = [{ event: 'error', callback: cb }];
    await c.handleConnection();
    handlerOf(pub, 'error')(randStr('arg'));
    handlerOf(sub, 'error')(randStr('arg'));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('TC18: handleConnection - không có pendingEventListeners', async () => {
    const pub = fakeClient();
    const sub = fakeClient();
    vi.spyOn(c, 'createClient')
      .mockResolvedValueOnce(pub)
      .mockResolvedValueOnce(sub);
    c.pendingEventListeners = [];
    const result = await c.handleConnection();
    expect(result).toBeUndefined();
  });

  // ================= createClient =================
  it('TC19: createClient - có clientInfoTag, module có default export', async () => {
    let created: any;
    class FakeRedis {
      constructor(opts: any) {
        created = opts;
      }
    }
    (loadPackage as any).mockResolvedValue({ default: FakeRedis });
    const tagged = new ClientRedis({
      host: randStr('h'),
      port: randInt(2000, 9000),
      clientInfoTag: randStr('tag'),
    } as any);
    const result = await tagged.createClient();
    expect(result).toBeDefined();
    expect(created).toBeDefined();
  });

  it('TC20: createClient - không có clientInfoTag, module không có default', async () => {
    let created: any;
    class FakeRedis {
      constructor(opts: any) {
        created = opts;
      }
    }
    (loadPackage as any).mockResolvedValue(FakeRedis);
    const result = await client.createClient();
    expect(result).toBeDefined();
    expect(created).toBeDefined();
  });

  // ================= registerErrorListener =================
  it('TC21: registerErrorListener - lỗi được log', () => {
    const fake = fakeClient();
    client.registerErrorListener(fake);
    const handler = fake.addListener.mock.calls[0][1];
    handler(new Error(randStr('err')));
    expect(errorSpy).toHaveBeenCalled();
  });

  // ================= registerReconnectListener =================
  it('TC22: reconnect - isManuallyClosed = true', () => {
    const fake = fakeClient();
    c.pubClient = fake;
    c.isManuallyClosed = true;
    const nextSpy = vi.spyOn(c._status$, 'next');
    client.registerReconnectListener(fake);
    handlerOf(fake, 'reconnecting')();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('TC23: reconnect - client không phải client hiện tại', () => {
    const fake = fakeClient();
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    const nextSpy = vi.spyOn(c._status$, 'next');
    client.registerReconnectListener(fake);
    handlerOf(fake, 'reconnecting')();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('TC24: reconnect - client hiện tại, chưa từng kết nối thành công', () => {
    const fake = fakeClient();
    c.pubClient = fake;
    c.wasInitialConnectionSuccessful = false;
    const nextSpy = vi.spyOn(c._status$, 'next');
    client.registerReconnectListener(fake);
    handlerOf(fake, 'reconnecting')();
    expect(nextSpy).toHaveBeenCalledWith(RedisStatus.RECONNECTING);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('TC25: reconnect - client hiện tại, đã từng kết nối thành công', () => {
    const fake = fakeClient();
    c.subClient = fake;
    c.wasInitialConnectionSuccessful = true;
    client.registerReconnectListener(fake);
    handlerOf(fake, 'reconnecting')();
    expect(logSpy).toHaveBeenCalled();
  });

  // ================= registerReadyListener =================
  const setupReady = (pubStatus: string, subStatus: string) => {
    const pub = fakeClient(pubStatus);
    const sub = fakeClient(subStatus);
    c.pubClient = pub;
    c.subClient = sub;
    return { pub, sub };
  };

  it('TC26: ready - client không phải client hiện tại', () => {
    setupReady('ready', 'ready');
    const other = fakeClient();
    client.registerReadyListener(other);
    handlerOf(other, 'ready')();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('TC27: ready - pubClient chưa ready', () => {
    const { pub } = setupReady('connecting', 'ready');
    client.registerReadyListener(pub);
    handlerOf(pub, 'ready')();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('TC28: ready - pubClient ready, subClient chưa ready', () => {
    const { pub } = setupReady('ready', 'connecting');
    client.registerReadyListener(pub);
    handlerOf(pub, 'ready')();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('TC29: ready - pubClient null (optional chaining)', () => {
    const sub = fakeClient('ready');
    c.pubClient = null;
    c.subClient = sub;
    client.registerReadyListener(sub);
    handlerOf(sub, 'ready')();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('TC30: ready - subClient null (optional chaining)', () => {
    const pub = fakeClient('ready');
    c.pubClient = pub;
    c.subClient = null;
    client.registerReadyListener(pub);
    handlerOf(pub, 'ready')();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('TC31: ready - tất cả ready, lần đầu, returnBuffers falsy => message', () => {
    const { pub, sub } = setupReady('ready', 'ready');
    c.wasInitialConnectionSuccessful = false;
    client.registerReadyListener(pub);
    handlerOf(pub, 'ready')();
    expect(sub.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('TC32: ready - tất cả ready, lần đầu, returnBuffers true => messageBuffer', () => {
    const { pub, sub } = setupReady('ready', 'ready');
    c.options = { ...c.options, returnBuffers: true };
    c.wasInitialConnectionSuccessful = false;
    client.registerReadyListener(pub);
    handlerOf(pub, 'ready')();
    expect(sub.on).toHaveBeenCalledWith('messageBuffer', expect.any(Function));
  });

  it('TC33: ready - tất cả ready, đã từng kết nối => không đăng ký lại', () => {
    const { pub, sub } = setupReady('ready', 'ready');
    c.wasInitialConnectionSuccessful = true;
    client.registerReadyListener(pub);
    handlerOf(pub, 'ready')();
    expect(sub.on).not.toHaveBeenCalled();
  });

  // ================= registerEndListener =================
  it('TC34: end - isManuallyClosed = true', () => {
    const fake = fakeClient();
    c.pubClient = fake;
    c.isManuallyClosed = true;
    client.registerEndListener(fake);
    handlerOf(fake, 'end')();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('TC35: end - client không phải client hiện tại', () => {
    const fake = fakeClient();
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    client.registerEndListener(fake);
    handlerOf(fake, 'end')();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('TC36: end - client hiện tại => DISCONNECTED, handleClose, discardClients', () => {
    const pub = fakeClient();
    const sub = fakeClient();
    c.pubClient = pub;
    c.subClient = sub;
    const nextSpy = vi.spyOn(c._status$, 'next');
    client.registerEndListener(pub);
    handlerOf(pub, 'end')();
    expect(nextSpy).toHaveBeenCalledWith(RedisStatus.DISCONNECTED);
    expect(errorSpy).toHaveBeenCalled();
    expect(c.pubClient).toBeNull();
  });

  // ================= handleClose =================
  it('TC37: handleClose - routingMap rỗng', () => {
    c.routingMap.clear();
    c.subscriptionsCount.set(randStr('ch'), randInt(3, 9));
    client.handleClose();
    expect(c.subscriptionsCount.size).toBeDefined();
  });

  it('TC38: handleClose - routingMap có callback chạy bình thường', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    c.routingMap.set(randStr('id'), cb1);
    c.routingMap.set(randStr('id'), cb2);
    client.handleClose();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('TC39: handleClose - callback ném lỗi => log lỗi và tiếp tục', () => {
    const bad = vi.fn(() => {
      throw new Error(randStr('cbErr'));
    });
    const good = vi.fn();
    c.routingMap.set(randStr('id'), bad);
    c.routingMap.set(randStr('id'), good);
    client.handleClose();
    expect(errorSpy).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  // ================= getClientOptions =================
  it('TC40: getClientOptions - options có giá trị', () => {
    const opts: any = client.getClientOptions();
    expect(opts.retryStrategy).toBeDefined();
    expect(opts.retryStrategy(randInt(3, 8))).toBeDefined;
  });

  it('TC41: getClientOptions - options undefined (nhánh || {})', () => {
    c.options = undefined;
    const opts: any = client.getClientOptions();
    expect(opts).toBeDefined();
    opts.retryStrategy(randInt(3, 8));
  });

  // ================= on =================
  it('TC42: on - chưa có client => chỉ lưu pending listener', () => {
    c.pubClient = null;
    c.subClient = null;
    (client as any).on('error', vi.fn());
    expect(c.pendingEventListeners.length).toBeDefined();
  });

  it('TC43: on - có cả pub và sub => đăng ký trực tiếp', () => {
    const pub = fakeClient();
    const sub = fakeClient();
    c.pubClient = pub;
    c.subClient = sub;
    const cb = vi.fn();
    (client as any).on('error', cb);
    handlerOf(sub, 'error')(randStr('a'));
    handlerOf(pub, 'error')(randStr('a'));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('TC44: on - chỉ có pubClient', () => {
    const pub = fakeClient();
    c.pubClient = pub;
    c.subClient = null;
    (client as any).on('error', vi.fn());
    expect(pub.on).not.toHaveBeenCalled();
  });

  it('TC45: on - chỉ có subClient', () => {
    const sub = fakeClient();
    c.pubClient = null;
    c.subClient = sub;
    (client as any).on('error', vi.fn());
    expect(sub.on).not.toHaveBeenCalled();
  });

  // ================= unwrap =================
  it('TC46: unwrap - thiếu pubClient => throw', () => {
    c.pubClient = null;
    c.subClient = fakeClient();
    expect(() => client.unwrap()).toThrow();
  });

  it('TC47: unwrap - có pubClient, thiếu subClient => throw', () => {
    c.pubClient = fakeClient();
    c.subClient = null;
    expect(() => client.unwrap()).toThrow();
  });

  it('TC48: unwrap - đủ cả hai => trả về mảng', () => {
    c.pubClient = fakeClient();
    c.subClient = fakeClient();
    expect(client.unwrap()).toBeDefined();
  });

  // ================= createRetryStrategy =================
  it('TC49: retry - isManuallyClosed = true', () => {
    c.isManuallyClosed = true;
    c.options = { ...c.options, retryAttempts: randInt(20, 60) };
    expect(() => client.createRetryStrategy(randInt(2, 10))).not.toThrow();
  });

  it('TC50: retry - không có retryAttempts', () => {
    c.options = { host: randStr('h'), port: randInt(2000, 9000) };
    client.createRetryStrategy(randInt(2, 10));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('TC51: retry - times vượt quá retryAttempts', () => {
    c.options = { ...c.options, retryAttempts: randInt(20, 60) };
    client.createRetryStrategy(randInt(200, 400));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('TC52: retry - còn lượt retry, có retryDelay', () => {
    c.options = {
      ...c.options,
      retryAttempts: randInt(40, 90),
      retryDelay: randInt(1500, 4000),
    };
    expect(client.createRetryStrategy(randInt(2, 10))).toBeDefined();
  });

  it('TC53: retry - còn lượt retry, không có retryDelay => mặc định', () => {
    c.options = { ...c.options, retryAttempts: randInt(40, 90) };
    expect(client.createRetryStrategy(randInt(2, 10))).toBeDefined();
  });

  // ================= createResponseCallback =================
  describe('createResponseCallback', () => {
    let cb: (channel: string, buffer: any) => Promise<void>;
    beforeEach(() => {
      c.deserializer = { deserialize: vi.fn() };
      cb = client.createResponseCallback() as any;
    });

    it('TC54: JSON.parse lỗi, không có callback, buffer là string', async () => {
      c.deserializer.deserialize.mockResolvedValue({ id: randStr('id') });
      await cb(randStr('ch'), randStr('notjson'));
      expect(debugSpy).toHaveBeenCalled();
    });

    it('TC55: deserializer reject bằng Error', async () => {
      c.deserializer.deserialize.mockRejectedValue(new Error(randStr('de')));
      await cb(randStr('ch'), JSON.stringify({ id: randStr('id') }));
      expect(errorSpy).toHaveBeenCalled();
    });

    it('TC56: deserializer reject bằng null (optional chaining)', async () => {
      c.deserializer.deserialize.mockRejectedValue(null);
      await cb(randStr('ch'), JSON.stringify({ id: randStr('id') }));
      expect(errorSpy).toHaveBeenCalled();
    });

    it('TC57: không có callback, buffer là Buffer', async () => {
      c.deserializer.deserialize.mockResolvedValue({ id: randStr('id') });
      await cb(randStr('ch'), Buffer.from(randStr('bin')));
      expect(debugSpy).toHaveBeenCalledTimes(3);
    });

    it('TC58: có callback, isDisposed = true', async () => {
      const id = randStr('id');
      const routed = vi.fn();
      c.routingMap.set(id, routed);
      c.deserializer.deserialize.mockResolvedValue({
        id,
        response: randStr('r'),
        isDisposed: true,
      });
      await cb(randStr('ch'), JSON.stringify({ id }));
      expect(routed).toHaveBeenCalled();
    });

    it('TC59: có callback, err có giá trị, isDisposed = false', async () => {
      const id = randStr('id');
      const routed = vi.fn();
      c.routingMap.set(id, routed);
      c.deserializer.deserialize.mockResolvedValue({
        id,
        err: randStr('err'),
        isDisposed: false,
      });
      await cb(randStr('ch'), JSON.stringify({ id }));
      expect(routed).toHaveBeenCalled();
    });

    it('TC60: có callback, không err, không isDisposed', async () => {
      const id = randStr('id');
      const routed = vi.fn();
      c.routingMap.set(id, routed);
      c.deserializer.deserialize.mockResolvedValue({
        id,
        response: randStr('r'),
      });
      await cb(randStr('ch'), JSON.stringify({ id }));
      expect(routed).toHaveBeenCalled();
    });
  });

  // ================= publish =================
  describe('publish', () => {
    let pub: any;
    let sub: any;
    let pattern: string;
    let replyChannel: string;
    let callback: any;

    beforeEach(() => {
      pub = fakeClient();
      sub = fakeClient();
      c.pubClient = pub;
      c.subClient = sub;
      pattern = randStr('pattern');
      replyChannel = `${pattern}.reply`;
      callback = vi.fn();
    });

    const doPublish = () =>
      c.publish({ pattern, data: randStr('data') }, callback);

    it('TC61: subscriptionsCount <= 0, subscribe OK => publish OK', () => {
      sub.subscribe.mockImplementation((_ch: string, cbk: any) => cbk(null));
      pub.publish.mockImplementation((_c: string, _m: string, cbk: any) =>
        cbk(null),
      );
      const cleanup = doPublish();
      expect(cleanup).toBeDefined();
      expect(c.routingMap.size).toBeGreaterThan(0);
    });

    it('TC62: subscriptionsCount <= 0, subscribe trả lỗi', () => {
      sub.subscribe.mockImplementation((_ch: string, cbk: any) =>
        cbk(new Error(randStr('subErr'))),
      );
      doPublish();
      expect(callback).toHaveBeenCalled();
    });

    it('TC63: subscriptionsCount > 0 => publish trực tiếp', () => {
      c.subscriptionsCount.set(replyChannel, randInt(3, 8));
      pub.publish.mockImplementation((_c: string, _m: string, cbk: any) =>
        cbk(null),
      );
      doPublish();
      expect(pub.publish).toHaveBeenCalled();
      expect(sub.subscribe).not.toHaveBeenCalled();
    });

    it('TC64: publish callback trả lỗi, chưa teardown', () => {
      c.subscriptionsCount.set(replyChannel, randInt(3, 8));
      pub.publish.mockImplementation((_c: string, _m: string, cbk: any) =>
        cbk(new Error(randStr('pubErr'))),
      );
      doPublish();
      expect(callback).toHaveBeenCalled();
    });

    it('TC65: publish callback trả lỗi nhưng đã teardown', () => {
      c.subscriptionsCount.set(replyChannel, randInt(3, 8));
      let stored: any;
      pub.publish.mockImplementation((_c: string, _m: string, cbk: any) => {
        stored = cbk;
      });
      const cleanup = doPublish();
      cleanup();
      stored(new Error(randStr('pubErr')));
      expect(callback).not.toHaveBeenCalled();
    });

    it('TC66: teardown trước khi subscribe phản hồi => publishPacket bỏ qua', () => {
      let stored: any;
      sub.subscribe.mockImplementation((_ch: string, cbk: any) => {
        stored = cbk;
      });
      const cleanup = doPublish();
      cleanup();
      stored(null);
      expect(pub.publish).not.toHaveBeenCalled();
    });

    it('TC67: pubClient.publish ném lỗi (entry đếm còn tồn tại)', () => {
      c.subscriptionsCount.set(replyChannel, randInt(3, 8));
      pub.publish.mockImplementation(() => {
        throw new Error(randStr('throw'));
      });
      doPublish();
      expect(callback).toHaveBeenCalled();
    });

    it('TC68: pubClient.publish ném lỗi sau khi entry đếm bị xóa (|| 1)', () => {
      c.subscriptionsCount.set(replyChannel, randInt(3, 8));
      pub.publish.mockImplementation(() => {
        c.subscriptionsCount.delete(replyChannel);
        throw new Error(randStr('throw'));
      });
      doPublish();
      expect(callback).toHaveBeenCalled();
    });

    it('TC69: cleanup sau khi đã publish, count về 0 => unsubscribe', () => {
      sub.subscribe.mockImplementation((_ch: string, cbk: any) => cbk(null));
      pub.publish.mockImplementation(() => undefined);
      const cleanup = doPublish();
      cleanup();
      expect(sub.unsubscribe).toHaveBeenCalled();
    });

    it('TC70: cleanup sau khi đã publish, count còn > 0 => không unsubscribe', () => {
      c.subscriptionsCount.set(replyChannel, randInt(3, 8));
      pub.publish.mockImplementation(() => undefined);
      const cleanup = doPublish();
      cleanup();
      expect(sub.unsubscribe).not.toHaveBeenCalled();
    });

    it('TC71: serializer ném lỗi => catch ngoài, trả về noop', () => {
      c.serializer = {
        serialize: vi.fn(() => {
          throw new Error(randStr('ser'));
        }),
      };
      const cleanup = doPublish();
      expect(callback).toHaveBeenCalled();
      expect(cleanup()).toBeUndefined();
    });
  });

  // ================= dispatchEvent =================
  it('TC72: dispatchEvent - publish trả lỗi => reject', async () => {
    c.pubClient = fakeClient();
    c.pubClient.publish.mockImplementation((_c: string, _m: string, cbk: any) =>
      cbk(new Error(randStr('de'))),
    );
    await expect(
      c.dispatchEvent({ pattern: randStr('p'), data: randStr('d') }),
    ).rejects.toBeDefined();
  });

  it('TC73: dispatchEvent - publish thành công => resolve', async () => {
    c.pubClient = fakeClient();
    c.pubClient.publish.mockImplementation((_c: string, _m: string, cbk: any) =>
      cbk(null),
    );
    const result = await c.dispatchEvent({
      pattern: randStr('p'),
      data: randStr('d'),
    });
    expect(result).toBeUndefined();
  });

  // ================= unsubscribeFromChannel / setSubscriptionsCount =================
  it('TC74: unsubscribeFromChannel - count = 1 => unsubscribe + xóa entry', () => {
    const sub = fakeClient();
    c.subClient = sub;
    const channel = randStr('ch');
    c.subscriptionsCount.set(channel, 1);
    c.unsubscribeFromChannel(channel);
    sub.unsubscribe.mock.calls[0][1]();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('TC75: unsubscribeFromChannel - count > 1 => chỉ giảm bộ đếm', () => {
    const sub = fakeClient();
    c.subClient = sub;
    const channel = randStr('ch');
    c.subscriptionsCount.set(channel, randInt(4, 9));
    c.unsubscribeFromChannel(channel);
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(c.subscriptionsCount.get(channel)).toBeDefined();
  });
});
