/**
 * test-client-rmq.spec.ts
 * Unit test (Vitest) cho ClientRMQ - kỹ thuật Control Flow Testing.
 * Vị trí: packages/microservices/test-CFT-microservices/test-single-file/
 * (client-rmq.ts nằm ở packages/microservices/client/, nên import đi lên 2 cấp).
 *
 * - Input sinh ngẫu nhiên, nằm sâu trong lớp tương đương (không dùng giá trị biên).
 * - Output không kiểm tra tính đúng đắn; chỉ ép chương trình đi qua đúng nhánh
 *   (assert toBeDefined / spy đã được gọi).
 */
import 'reflect-metadata';
import { EventEmitter } from 'events';
import { ReplaySubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks cho dependency bên ngoài
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  loadPackage: vi.fn(),
  loadPackageSync: vi.fn(),
  hasPacketMetadata: vi.fn(),
}));

vi.mock('@nestjs/common/internal', async importOriginal => ({
  ...(await importOriginal<any>()),
  loadPackage: h.loadPackage,
  loadPackageSync: h.loadPackageSync,
}));
vi.mock('amqplib', () => ({}));
vi.mock('amqp-connection-manager', () => ({}));
vi.mock('../../utils/packet-metadata.utils.js', () => ({
  hasPacketMetadata: h.hasPacketMetadata,
}));

// ---------------------------------------------------------------------------
// Bộ sinh dữ liệu ngẫu nhiên (nằm giữa miền, tránh biên)
// ---------------------------------------------------------------------------
const rndInt = (lo: number, hi: number) => {
  const span = hi - lo;
  return Math.floor(lo + span * 0.2 + Math.random() * span * 0.6);
};
const rndStr = (prefix = 'v') =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------------------
// Fake amqp-connection-manager
// ---------------------------------------------------------------------------
let ClientRMQ: any;
let RmqRecord: any;
let fakeClient: any;
let wrappers: any[];
let rawChannel: any;
let fakePkg: any;

function makeRawChannel() {
  return {
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    assertExchange: vi.fn().mockResolvedValue(undefined),
    prefetch: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeClient() {
  const e: any = new EventEmitter();
  e.close = vi.fn().mockResolvedValue(undefined);
  e.createChannel = vi.fn((opts: any) => {
    const w: any = new EventEmitter();
    w.close = vi.fn().mockResolvedValue(undefined);
    w.publish = vi.fn().mockResolvedValue(undefined);
    w.sendToQueue = vi.fn().mockResolvedValue(undefined);
    wrappers.push(w);
    Promise.resolve().then(() => opts.setup(rawChannel));
    return w;
  });
  return e;
}

function create(options: Record<string, any> = {}) {
  const c: any = new ClientRMQ({
    queue: rndStr('queue'),
    urls: [`amqp://${rndStr('host')}`],
    ...options,
  });
  vi.spyOn(c.logger, 'log').mockImplementation(() => undefined);
  vi.spyOn(c.logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(c.logger, 'warn').mockImplementation(() => undefined);
  return c;
}

async function startConnect(c: any) {
  fakeClient = undefined;
  const p = c.connect();
  await vi.waitFor(() => expect(fakeClient).toBeDefined());
  return p;
}

async function connectOk(c: any) {
  const p = startConnect(c);
  await vi.waitFor(() => expect(fakeClient).toBeDefined());
  fakeClient.emit('connect');
  await p;
  return fakeClient;
}

beforeEach(async () => {
  vi.resetModules();
  wrappers = [];
  fakeClient = undefined;
  rawChannel = makeRawChannel();
  fakePkg = {
    connect: vi.fn(() => {
      fakeClient = makeFakeClient();
      return fakeClient;
    }),
  };
  h.loadPackage.mockReset();
  h.loadPackage.mockImplementation(async (name: string) =>
    name === 'amqp-connection-manager' ? fakePkg : {},
  );
  h.loadPackageSync.mockReset();
  h.loadPackageSync.mockReturnValue(fakePkg);
  h.hasPacketMetadata.mockReset();
  h.hasPacketMetadata.mockImplementation((m: unknown) => !!m);

  ({ ClientRMQ } = await import('../../client/client-rmq.js'));
  ({ RmqRecord } = await import('../../record-builders/index.js'));
});

// ===========================================================================
describe('ClientRMQ - constructor', () => {
  it('TC01: noAssert lấy từ options.noAssert', () => {
    const c = create({ noAssert: true, queueOptions: { noAssert: false } });
    expect(c.noAssert).toBeDefined();
  });

  it('TC02: noAssert lấy từ queueOptions.noAssert', () => {
    const c = create({ queueOptions: { noAssert: true } });
    expect(c.noAssert).toBeDefined();
  });

  it('TC03: noAssert mặc định + serializer mặc định', () => {
    const c = create();
    expect(c.noAssert).toBeDefined();
    expect(c.serializer).toBeDefined();
  });

  it('TC04: serializer tuỳ chỉnh', () => {
    const serializer = { serialize: vi.fn() };
    const c = create({ serializer });
    expect(c.serializer).toBe(serializer);
  });
});

// ===========================================================================
describe('ClientRMQ - close()', () => {
  it('TC05: channel và client đều đóng thành công', async () => {
    const c = create();
    const channel = { close: vi.fn().mockResolvedValue(undefined) };
    const client = { close: vi.fn().mockResolvedValue(undefined) };
    c.channel = channel;
    c.client = client;
    await c.close();
    expect(channel.close).toHaveBeenCalled();
    expect(client.close).toHaveBeenCalled();
  });

  it('TC06: channel và client là null (optional chaining)', async () => {
    const c = create();
    await c.close();
    expect(c.client).toBeNull();
  });

  it('TC07: chỉ channel.close() lỗi -> ném lỗi, client vẫn đóng', async () => {
    const c = create();
    const err = new Error(rndStr('chan'));
    const client = { close: vi.fn().mockResolvedValue(undefined) };
    c.channel = { close: vi.fn().mockRejectedValue(err) };
    c.client = client;
    await expect(c.close()).rejects.toBeDefined();
    expect(client.close).toHaveBeenCalled();
  });

  it('TC08: cả channel và client lỗi -> log lỗi còn lại, ném lỗi đầu', async () => {
    const c = create();
    c.channel = { close: vi.fn().mockRejectedValue(new Error(rndStr('a'))) };
    c.client = { close: vi.fn().mockRejectedValue(new Error(rndStr('b'))) };
    await expect(c.close()).rejects.toBeDefined();
    expect(c.logger.error).toHaveBeenCalled();
  });
});

// ===========================================================================
describe('ClientRMQ - handleClose()', () => {
  it('TC09: routingMap có phần tử, callback chạy bình thường', () => {
    const c = create();
    const cb = vi.fn();
    c.routingMap.set(rndStr('id'), cb);
    c.responseEmitter = new EventEmitter();
    c.handleClose();
    expect(cb).toHaveBeenCalled();
  });

  it('TC10: callback ném lỗi -> bị log, không dừng vòng lặp', () => {
    const c = create();
    const bad = vi.fn(() => {
      throw new Error(rndStr('cb'));
    });
    const good = vi.fn();
    c.routingMap.set(rndStr('id1'), bad);
    c.routingMap.set(rndStr('id2'), good);
    c.handleClose();
    expect(c.logger.error).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  it('TC11: routingMap rỗng, responseEmitter undefined', () => {
    const c = create();
    c.handleClose();
    expect(c.routingMap.size).toBeDefined();
  });
});

// ===========================================================================
describe('ClientRMQ - connect()', () => {
  it('TC12: đã có client -> trả về connectionPromise', async () => {
    const c = create();
    const value = rndStr('conn');
    c.client = {};
    c.connectionPromise = Promise.resolve(value);
    await expect(c.connect()).resolves.toBeDefined();
  });

  it('TC13: kết nối lần đầu (chưa load package) + pendingEventListeners', async () => {
    const c = create();
    const cb = vi.fn();
    c.on('connect', cb);
    await connectOk(c);
    expect(cb).toHaveBeenCalled();
    expect(fakePkg.connect).toHaveBeenCalledTimes(1);
  });

  it('TC14: connect() đồng thời - lần 2 thấy client đã có sau khi load', async () => {
    const c = create();
    fakeClient = undefined;
    const p1 = c.connect();
    const p2 = c.connect();
    await vi.waitFor(() => expect(fakeClient).toBeDefined());
    fakeClient.emit('connect');
    await Promise.all([p1, p2]);
    expect(fakePkg.connect).toHaveBeenCalledTimes(1);
  });

  it('TC15: close() chạy trong lúc đang load package -> ném lỗi', async () => {
    const c = create();
    const p = c.connect();
    const closing = c.close();
    await expect(p).rejects.toThrow('Connection closed');
    await closing;
  });

  it('TC16: rmqPackage đã được load -> bỏ qua loadRmqPackage', async () => {
    await connectOk(create());
    const callsAfterFirst = h.loadPackage.mock.calls.length;
    await connectOk(create());
    expect(h.loadPackage).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it('TC17: kết nối lỗi, client chưa bị thay -> dọn dẹp toàn bộ', async () => {
    const c = create();
    const p = startConnect(c);
    await vi.waitFor(() => expect(fakeClient).toBeDefined());
    const first = fakeClient;
    first.emit('error', new Error(rndStr('boom')));
    await expect(p).rejects.toBeDefined();
    expect(first.close).toHaveBeenCalled();
    expect(c.client).toBeNull();
  });

  it('TC18: kết nối lỗi, client đã bị thay thế -> không reset state', async () => {
    const c = create();
    const p = startConnect(c);
    await vi.waitFor(() => expect(fakeClient).toBeDefined());
    const first = fakeClient;
    const sentinel = {};
    c.client = sentinel;
    first.emit('error', new Error(rndStr('boom')));
    await expect(p).rejects.toBeDefined();
    expect(c.client).toBe(sentinel);
    expect(first.close).toHaveBeenCalled();
  });

  it('TC19: kết nối lỗi, channel tồn tại và close() lỗi bị nuốt', async () => {
    const c = create();
    const p = startConnect(c);
    await vi.waitFor(() => expect(fakeClient).toBeDefined());
    const first = fakeClient;
    const channel = {
      close: vi.fn().mockRejectedValue(new Error(rndStr('ch'))),
    };
    c.channel = channel;
    first.emit('error', new Error(rndStr('boom')));
    await expect(p).rejects.toBeDefined();
    expect(channel.close).toHaveBeenCalled();
  });

  it('TC20: sau lỗi, connect() lần kế tiếp tạo client mới', async () => {
    const c = create();
    const p = startConnect(c);
    await vi.waitFor(() => expect(fakeClient).toBeDefined());
    fakeClient.emit('error', new Error(rndStr('boom')));
    await expect(p).rejects.toBeDefined();
    await connectOk(c);
    expect(fakePkg.connect).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
describe('ClientRMQ - createChannel()', () => {
  it('TC21: setup thành công -> resolve', async () => {
    const c = create();
    c.client = makeFakeClient();
    await expect(c.createChannel()).resolves.toBeUndefined();
  });

  it('TC22: wrapper phát sự kiện error -> log và reject', async () => {
    const c = create();
    c.client = makeFakeClient();
    const p = c.createChannel();
    wrappers[0].emit('error', new Error(rndStr('wrap')));
    await expect(p).rejects.toBeDefined();
    expect(c.logger.error).toHaveBeenCalled();
  });
});

// ===========================================================================
describe('ClientRMQ - createClient()', () => {
  it('TC23: không có urls + rmqPackage chưa load -> loadPackageSync', () => {
    const c = new ClientRMQ({ queue: rndStr('queue') }) as any;
    const client = c.createClient();
    expect(client).toBeDefined();
    expect(h.loadPackageSync).toHaveBeenCalled();
  });

  it('TC24: có urls + rmqPackage đã load -> không gọi loadPackageSync', async () => {
    await connectOk(create());
    const c = create({
      urls: [`amqp://${rndStr('h')}`, `amqp://${rndStr('h')}`],
    });
    const client = c.createClient();
    expect(client).toBeDefined();
    expect(h.loadPackageSync).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('ClientRMQ - mergeDisconnectEvent()', () => {
  it('TC25: source$ phát giá trị trước', () => {
    const c = create();
    const inst = new EventEmitter();
    const source$ = new Subject<string>();
    const result: string[] = [];
    c.mergeDisconnectEvent(inst, source$).subscribe((v: string) =>
      result.push(v),
    );
    source$.next(rndStr('val'));
    expect(result.length).toBeDefined();
    expect(result).toHaveLength(1);
  });

  it('TC26: sự kiện disconnect -> stream lỗi', () => {
    const c = create();
    const inst = new EventEmitter();
    const errors: unknown[] = [];
    c.mergeDisconnectEvent(inst, new Subject()).subscribe({
      error: (e: unknown) => errors.push(e),
    });
    inst.emit('disconnect', { err: rndStr('dis') });
    expect(errors).toHaveLength(1);
  });

  it('TC27: connectFailed ở url cuối -> ném lỗi', () => {
    const urls = [rndStr('u1'), rndStr('u2'), rndStr('u3')];
    const c = create({ urls });
    const inst = new EventEmitter();
    const errors: unknown[] = [];
    c.mergeDisconnectEvent(inst, new Subject()).subscribe({
      error: (e: unknown) => errors.push(e),
    });
    inst.emit('connectFailed', { url: urls[2] });
    expect(errors).toHaveLength(1);
  });

  it('TC28: connectFailed ở url chưa phải cuối -> retry, rồi nhận giá trị', () => {
    const urls = [rndStr('u1'), rndStr('u2'), rndStr('u3')];
    const c = create({ urls });
    const inst = new EventEmitter();
    const source$ = new Subject<string>();
    const errors: unknown[] = [];
    const result: string[] = [];
    c.mergeDisconnectEvent(inst, source$).subscribe({
      next: (v: string) => result.push(v),
      error: (e: unknown) => errors.push(e),
    });
    inst.emit('connectFailed', { url: urls[0] });
    source$.next(rndStr('val'));
    expect(errors).toHaveLength(0);
    expect(result).toHaveLength(1);
  });
});

// ===========================================================================
describe('ClientRMQ - convertConnectionToPromise()', () => {
  it('TC29: connection$ phát giá trị', async () => {
    const c = create();
    c.connection$ = new ReplaySubject(1);
    c.connection$.next(rndStr('v'));
    await expect(c.convertConnectionToPromise()).resolves.toBeDefined();
  });

  it('TC30: connection$ complete không có giá trị (EmptyError) -> undefined', async () => {
    const c = create();
    c.connection$ = new ReplaySubject(1);
    c.connection$.complete();
    await expect(c.convertConnectionToPromise()).resolves.toBeUndefined();
  });

  it('TC31: connection$ lỗi khác EmptyError -> ném lại', async () => {
    const c = create();
    c.connection$ = new ReplaySubject(1);
    c.connection$.error(new Error(rndStr('x')));
    await expect(c.convertConnectionToPromise()).rejects.toBeDefined();
  });
});

// ===========================================================================
describe('ClientRMQ - setupChannel()', () => {
  const run = async (options: Record<string, any>) => {
    const c = create(options);
    const raw = makeRawChannel();
    const resolve = vi.fn();
    await c.setupChannel(raw, resolve);
    return { raw, resolve };
  };

  it('TC32: nhánh queue, noAssert=false, không exchange -> assertQueue, không bind', async () => {
    const { raw, resolve } = await run({});
    expect(raw.assertQueue).toHaveBeenCalled();
    expect(raw.bindQueue).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalled();
  });

  it('TC33: nhánh queue, noAssert=true, có exchange + routingKey -> bind', async () => {
    const { raw } = await run({
      noAssert: true,
      exchange: rndStr('ex'),
      routingKey: rndStr('rk'),
    });
    expect(raw.assertQueue).not.toHaveBeenCalled();
    expect(raw.bindQueue).toHaveBeenCalled();
  });

  it('TC34: có exchange nhưng thiếu routingKey -> không bind', async () => {
    const { raw } = await run({ exchange: rndStr('ex') });
    expect(raw.bindQueue).not.toHaveBeenCalled();
  });

  it('TC35: wildcards=true, exchange/exchangeType mặc định', async () => {
    const { raw } = await run({ wildcards: true });
    expect(raw.assertExchange).toHaveBeenCalled();
    expect(raw.assertQueue).not.toHaveBeenCalled();
  });

  it('TC36: wildcards=true, exchange/exchangeType/arguments tuỳ chỉnh', async () => {
    const { raw } = await run({
      wildcards: true,
      exchange: rndStr('ex'),
      exchangeType: 'direct',
      exchangeArguments: { [rndStr('k')]: rndStr('v') },
    });
    expect(raw.assertExchange).toHaveBeenCalled();
  });

  it('TC37: exchangeType=fanout (không wildcards) -> nhánh exchange', async () => {
    const { raw } = await run({
      exchangeType: 'fanout',
      exchange: rndStr('ex'),
    });
    expect(raw.assertExchange).toHaveBeenCalled();
  });

  it('TC38: prefetchCount & isGlobalPrefetchCount được cấu hình', async () => {
    const { raw } = await run({
      prefetchCount: rndInt(10, 90),
      isGlobalPrefetchCount: true,
    });
    expect(raw.prefetch).toHaveBeenCalled();
  });
});

// ===========================================================================
describe('ClientRMQ - consumeChannel()', () => {
  it('TC39: noAck tuỳ chỉnh + correlationId có listener -> emit', async () => {
    const c = create({ noAck: false });
    c.responseEmitter = new EventEmitter();
    const id = rndStr('corr');
    const listener = vi.fn();
    c.responseEmitter.on(id, listener);
    const raw = makeRawChannel();
    await c.consumeChannel(raw);
    const handler = raw.consume.mock.calls[0][1];
    handler({ properties: { correlationId: id } });
    expect(listener).toHaveBeenCalled();
  });

  it('TC40: noAck mặc định + correlationId không có listener -> bỏ qua', async () => {
    const c = create();
    c.responseEmitter = new EventEmitter();
    const emitSpy = vi.spyOn(c.responseEmitter, 'emit');
    const raw = makeRawChannel();
    await c.consumeChannel(raw);
    const handler = raw.consume.mock.calls[0][1];
    handler({ properties: { correlationId: rndStr('unknown') } });
    expect(emitSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('ClientRMQ - event listeners', () => {
  it('TC41: registerErrorListener ghi log', () => {
    const c = create();
    const client = new EventEmitter();
    c.registerErrorListener(client);
    client.emit('error', new Error(rndStr('e')));
    expect(c.logger.error).toHaveBeenCalled();
  });

  it('TC42: disconnect - không phải lần đầu, đúng client, replyQueue mặc định', () => {
    const c = create();
    const client = new EventEmitter();
    c.client = client;
    c.isInitialConnect = false;
    const spy = vi.spyOn(c, 'handleClose').mockImplementation(() => undefined);
    c.registerDisconnectListener(client);
    client.emit('disconnect', new Error(rndStr('d')));
    expect(spy).toHaveBeenCalled();
    expect(c.connectionPromise).toBeDefined();
  });

  it('TC43: disconnect - lần đầu, client khác -> không handleClose', () => {
    const c = create();
    const client = new EventEmitter();
    c.client = new EventEmitter();
    const spy = vi.spyOn(c, 'handleClose').mockImplementation(() => undefined);
    c.registerDisconnectListener(client);
    client.emit('disconnect', new Error(rndStr('d')));
    expect(spy).not.toHaveBeenCalled();
  });

  it('TC44: disconnect - replyQueue tuỳ chỉnh -> không handleClose', () => {
    const c = create({ replyQueue: rndStr('reply') });
    const client = new EventEmitter();
    c.client = client;
    const spy = vi.spyOn(c, 'handleClose').mockImplementation(() => undefined);
    c.registerDisconnectListener(client);
    client.emit('disconnect', new Error(rndStr('d')));
    expect(spy).not.toHaveBeenCalled();
  });

  it('TC45: connect - lần đầu -> isInitialConnect=false', () => {
    const c = create();
    const client = new EventEmitter();
    const next = vi.spyOn(c._status$, 'next');
    c.registerConnectListener(client);
    client.emit('connect');
    expect(next).toHaveBeenCalled();
    expect(c.isInitialConnect).toBeDefined();
  });

  it('TC46: connect - kết nối lại -> connectionPromise resolve', async () => {
    const c = create();
    const client = new EventEmitter();
    c.isInitialConnect = false;
    c.registerConnectListener(client);
    client.emit('connect');
    await expect(c.connectionPromise).resolves.toBeUndefined();
  });

  it('TC47: blocked listener', () => {
    const c = create();
    const client = new EventEmitter();
    c.registerBlockedListener(client);
    client.emit('blocked', { reason: rndStr('why') });
    expect(c.logger.warn).toHaveBeenCalled();
  });

  it('TC48: unblocked listener', () => {
    const c = create();
    const client = new EventEmitter();
    c.registerUnblockedListener(client);
    client.emit('unblocked');
    expect(c.logger.log).toHaveBeenCalled();
  });
});

// ===========================================================================
describe('ClientRMQ - on() / unwrap()', () => {
  it('TC49: on() khi chưa có client -> chỉ lưu pending', () => {
    const c = create();
    c.on('connect', vi.fn());
    expect(c.pendingEventListeners).toHaveLength(1);
  });

  it('TC50: on() khi đã có client -> addListener', () => {
    const c = create();
    c.client = { addListener: vi.fn() };
    c.on('connect', vi.fn());
    expect(c.client.addListener).toHaveBeenCalled();
  });

  it('TC51: unwrap() khi chưa có client -> ném lỗi', () => {
    const c = create();
    expect(() => c.unwrap()).toThrow();
  });

  it('TC52: unwrap() khi có client', () => {
    const c = create();
    c.client = {};
    expect(c.unwrap()).toBeDefined();
  });
});

// ===========================================================================
describe('ClientRMQ - handleMessage()', () => {
  const setup = (impl: () => Promise<any>) => {
    const c = create();
    c.deserializer = { deserialize: vi.fn(impl) };
    return c;
  };
  const ok = () =>
    Promise.resolve({
      err: undefined,
      response: rndStr('r'),
      isDisposed: false,
    });

  it('TC53: options là hàm (overload 1) + phản hồi bình thường', async () => {
    const c = setup(ok);
    const cb = vi.fn();
    await c.handleMessage(rndStr('pkt'), cb);
    expect(cb).toHaveBeenCalled();
  });

  it('TC54: options là object + phản hồi bình thường', async () => {
    const c = setup(ok);
    const cb = vi.fn();
    await c.handleMessage(rndStr('pkt'), { [rndStr('k')]: rndStr('v') }, cb);
    expect(cb).toHaveBeenCalled();
  });

  it('TC55: isDisposed=true', async () => {
    const c = setup(() =>
      Promise.resolve({
        err: undefined,
        response: rndStr('r'),
        isDisposed: true,
      }),
    );
    const cb = vi.fn();
    await c.handleMessage(rndStr('pkt'), {}, cb);
    expect(cb).toHaveBeenCalled();
  });

  it('TC56: có err trong response', async () => {
    const c = setup(() =>
      Promise.resolve({
        err: rndStr('err'),
        response: undefined,
        isDisposed: false,
      }),
    );
    const cb = vi.fn();
    await c.handleMessage(rndStr('pkt'), {}, cb);
    expect(cb).toHaveBeenCalled();
  });

  it('TC57: deserialize ném lỗi -> callback với isDisposed', async () => {
    const c = setup(() => Promise.reject(new Error(rndStr('de'))));
    const cb = vi.fn();
    await c.handleMessage(rndStr('pkt'), {}, cb);
    expect(cb).toHaveBeenCalled();
  });

  it('TC58: deserialize ném lỗi, không có callback', async () => {
    const c = setup(() => Promise.reject(new Error(rndStr('de'))));
    await expect(
      c.handleMessage(rndStr('pkt'), {}, undefined),
    ).resolves.toBeUndefined();
  });

  it('TC59: phản hồi bình thường, không có callback', async () => {
    const c = setup(ok);
    await expect(
      c.handleMessage(rndStr('pkt'), {}, undefined),
    ).resolves.toBeUndefined();
  });

  it('TC60: isDisposed=true, không có callback', async () => {
    const c = setup(() =>
      Promise.resolve({
        err: undefined,
        response: rndStr('r'),
        isDisposed: true,
      }),
    );
    await expect(
      c.handleMessage(rndStr('pkt'), {}, undefined),
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
describe('ClientRMQ - publish()', () => {
  const prepare = (options: Record<string, any> = {}) => {
    const c = create(options);
    c.channel = {
      publish: vi.fn().mockResolvedValue(undefined),
      sendToQueue: vi.fn().mockResolvedValue(undefined),
    };
    c.responseEmitter = new EventEmitter();
    return c;
  };
  const msg = (extra: Record<string, any> = {}) => ({
    pattern: rndStr('pattern'),
    data: { value: rndInt(100, 900) },
    ...extra,
  });

  it('TC61: nhánh queue (không wildcards/fanout), options undefined', () => {
    const c = prepare();
    const cleanup = c.publish(msg(), vi.fn());
    expect(c.channel.sendToQueue).toHaveBeenCalled();
    expect(c.routingMap.size).toBeDefined();
    expect(cleanup).toBeDefined();
  });

  it('TC62: wildcards=true, exchange mặc định = queue', () => {
    const c = prepare({ wildcards: true });
    c.publish(msg(), vi.fn());
    expect(c.channel.publish).toHaveBeenCalled();
  });

  it('TC63: wildcards=true, exchange tuỳ chỉnh, RmqRecord + metadata', () => {
    const c = prepare({ wildcards: true, exchange: rndStr('ex') });
    const record = new RmqRecord(
      { value: rndInt(100, 900) },
      { headers: { [rndStr('h')]: rndStr('v') } },
    );
    c.publish(
      msg({ data: record, metadata: { traceparent: rndStr('tp') } }),
      vi.fn(),
    );
    expect(c.channel.publish).toHaveBeenCalled();
  });

  it('TC64: exchangeType=fanout (không wildcards) -> channel.publish', () => {
    const c = prepare({ exchangeType: 'fanout' });
    c.publish(msg(), vi.fn());
    expect(c.channel.publish).toHaveBeenCalled();
  });

  it('TC65: sendToQueue reject -> callback({err})', async () => {
    const c = prepare();
    c.channel.sendToQueue = vi.fn().mockRejectedValue(new Error(rndStr('s')));
    const cb = vi.fn();
    c.publish(msg(), cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
  });

  it('TC66: channel.publish reject -> callback({err})', async () => {
    const c = prepare({ wildcards: true });
    c.channel.publish = vi.fn().mockRejectedValue(new Error(rndStr('p')));
    const cb = vi.fn();
    c.publish(msg(), cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
  });

  it('TC67: channel=null -> ném sau khi gán cleanup -> catch gọi cleanup thật', () => {
    const c = prepare();
    c.channel = null;
    const cb = vi.fn();
    const ret = c.publish(msg(), cb);
    expect(cb).toHaveBeenCalled();
    expect(c.routingMap.size).toBe(0);
    expect(ret()).toBeUndefined();
  });

  it('TC68: serializer ném lỗi trước khi gán cleanup -> cleanup rỗng', () => {
    const c = prepare();
    c.serializer = {
      serialize: vi.fn(() => {
        throw new Error(rndStr('ser'));
      }),
    };
    const cb = vi.fn();
    c.publish(msg(), cb);
    expect(cb).toHaveBeenCalled();
  });

  it('TC69: gọi hàm cleanup được trả về -> xoá routingMap + listener', () => {
    const c = prepare();
    const cleanup = c.publish(msg(), vi.fn());
    cleanup();
    expect(c.routingMap.size).toBe(0);
  });

  it('TC70: nhận phản hồi qua responseEmitter -> listener gọi handleMessage', async () => {
    const c = prepare();
    c.deserializer = {
      deserialize: vi.fn().mockResolvedValue({
        err: undefined,
        response: rndStr('r'),
        isDisposed: false,
      }),
    };
    const cb = vi.fn();
    const message: any = msg();
    c.publish(message, cb);
    c.responseEmitter.emit(message.id, {
      content: Buffer.from(JSON.stringify({ response: rndStr('r') })),
      options: {},
    });
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
  });
});

// ===========================================================================
describe('ClientRMQ - dispatchEvent()', () => {
  const prepare = (options: Record<string, any>, err?: unknown) => {
    const c = create(options);
    c.channel = {
      publish: vi.fn((_e, _p, _c, _o, cb) => cb(err)),
      sendToQueue: vi.fn((_q, _c, _o, cb) => cb(err)),
    };
    return c;
  };
  const pkt = () => ({
    pattern: rndStr('pattern'),
    data: { value: rndInt(100, 900) },
  });

  it('TC71: wildcards=true, thành công, exchange mặc định', async () => {
    const c = prepare({ wildcards: true });
    await expect(c.dispatchEvent(pkt())).resolves.toBeUndefined();
  });

  it('TC72: fanout, exchange tuỳ chỉnh, callback lỗi -> reject', async () => {
    const c = prepare(
      { exchangeType: 'fanout', exchange: rndStr('ex') },
      new Error(rndStr('x')),
    );
    await expect(c.dispatchEvent(pkt())).rejects.toBeDefined();
  });

  it('TC73: nhánh queue, thành công', async () => {
    const c = prepare({});
    await expect(c.dispatchEvent(pkt())).resolves.toBeUndefined();
    expect(c.channel.sendToQueue).toHaveBeenCalled();
  });

  it('TC74: nhánh queue, RmqRecord + metadata, callback lỗi -> reject', async () => {
    const c = prepare({}, new Error(rndStr('x')));
    const record = new RmqRecord(
      { value: rndInt(100, 900) },
      { headers: { [rndStr('h')]: rndStr('v') } },
    );
    await expect(
      c.dispatchEvent({
        pattern: rndStr('pattern'),
        data: record,
        metadata: { traceparent: rndStr('tp') },
      }),
    ).rejects.toBeDefined();
  });
});

// ===========================================================================
describe('ClientRMQ - mergeHeaders()', () => {
  it('TC75: không có headers nào, không metadata -> undefined', () => {
    const c = create();
    expect(c.mergeHeaders(undefined, undefined)).toBeUndefined();
  });

  it('TC76: chỉ có requestHeaders', () => {
    const c = create();
    expect(c.mergeHeaders({ [rndStr('h')]: rndStr('v') })).toBeDefined();
  });

  it('TC77: chỉ có options.headers', () => {
    const c = create({ headers: { [rndStr('h')]: rndStr('v') } });
    expect(c.mergeHeaders(undefined, undefined)).toBeDefined();
  });

  it('TC78: chỉ có metadata', () => {
    const c = create();
    expect(
      c.mergeHeaders(undefined, { traceparent: rndStr('tp') }),
    ).toBeDefined();
  });
});

// ===========================================================================
describe('ClientRMQ - parseMessageContent()', () => {
  it('TC79: nội dung là JSON hợp lệ', () => {
    const c = create();
    const buf = Buffer.from(JSON.stringify({ a: rndStr('v') }));
    expect(c.parseMessageContent(buf)).toBeDefined();
  });

  it('TC80: nội dung không phải JSON -> trả chuỗi thô', () => {
    const c = create();
    const buf = Buffer.from(`not-json-${rndStr('raw')}`);
    expect(c.parseMessageContent(buf)).toBeDefined();
  });
});
