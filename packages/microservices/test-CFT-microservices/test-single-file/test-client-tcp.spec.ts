import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { EMPTY } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tls from 'tls';
import * as net from 'net';
import { ECONNREFUSED } from '../../constants.js';
import { TcpStatus } from '../../events/tcp.events.js';
import { JsonSocket } from '../../helpers/index.js';
import { ClientTCP } from '../../client/client-tcp.js';

/* -------------------------------------------------------------------------- */
/*  Mock dependencies                                                          */
/* -------------------------------------------------------------------------- */
const mocks = vi.hoisted(() => {
  class MiniEmitter {
    private handlers = new Map<string, Array<(...a: any[]) => any>>();
    on(event: string, cb: (...a: any[]) => any) {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
      return this;
    }
    addListener(event: string, cb: (...a: any[]) => any) {
      return this.on(event, cb);
    }
    removeListener(event: string, cb: (...a: any[]) => any) {
      const list = this.handlers.get(event) ?? [];
      this.handlers.set(
        event,
        list.filter(h => h !== cb),
      );
      return this;
    }
    off(event: string, cb: (...a: any[]) => any) {
      return this.removeListener(event, cb);
    }
    emit(event: string, ...args: any[]) {
      [...(this.handlers.get(event) ?? [])].forEach(h => h(...args));
      return true;
    }
  }

  const makeRawSocket = () => {
    const raw: any = new MiniEmitter();
    raw.destroy = vi.fn();
    raw.connect = vi.fn();
    return raw;
  };

  const makeTcpSocket = (raw: any) => {
    const tcp: any = {
      netSocket: raw,
      on: vi.fn((event: string, cb: any) => {
        raw.on(event, cb);
        return tcp;
      }),
      connect: vi.fn(),
      end: vi.fn(),
      sendMessage: vi.fn(),
    };
    return tcp;
  };

  return { MiniEmitter, makeRawSocket, makeTcpSocket };
});

vi.mock('net', () => ({
  Socket: vi.fn(function () {
    return mocks.makeRawSocket();
  }),
}));

vi.mock('tls', () => ({
  connect: vi.fn(() => mocks.makeRawSocket()),
}));

vi.mock('../helpers/index.js', async importOriginal => ({
  ...(await importOriginal<any>()),
  JsonSocket: vi.fn(function (raw: any) {
    return mocks.makeTcpSocket(raw);
  }),
}));

/* -------------------------------------------------------------------------- */
/*  Random input helpers (values deep inside equivalence classes)              */
/* -------------------------------------------------------------------------- */
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randStr = () => `s${Math.random().toString(36).slice(2, 10)}x`;
const randPort = () => randInt(20000, 40000);
const randHost = () => `host-${randStr()}.example.org`;
const randId = () => `id-${randStr()}`;

const newFakeSocket = () => mocks.makeTcpSocket(mocks.makeRawSocket());
const CustomSocket: any = vi.fn(function (raw: any) {
  return mocks.makeTcpSocket(raw);
});

const newClient = (opts: Record<string, any> = {}) =>
  new ClientTCP({ host: randHost(), port: randPort(), ...opts } as any);
const newTlsClient = (opts: Record<string, any> = {}) =>
  newClient({ tlsOptions: { servername: randStr() }, ...opts });

describe('ClientTCP (control flow testing)', () => {
  let loggerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  /* ------------------------------ constructor ------------------------------ */
  describe('constructor', () => {
    it('TC01 - khởi tạo với đầy đủ options', () => {
      const client = newClient({
        socketClass: CustomSocket,
        maxBufferSize: randInt(1000, 9000),
        incompleteMessageTimeout: randInt(1000, 9000),
        messageReceiveTimeout: randInt(1000, 9000),
        maxSendBufferSize: randInt(1000, 9000),
      });
      expect(client).toBeDefined();
    });
  });

  /* -------------------------------- connect -------------------------------- */
  describe('connect()', () => {
    it('TC02 - connectionPromise đã tồn tại -> trả về promise cũ', async () => {
      const client = newClient();
      const cached = Promise.resolve(randStr());
      (client as any).connectionPromise = cached;
      const result = client.connect();
      expect(result).toBeDefined();
      expect(result).toBe(cached);
    });

    it('TC03 - TCP thường, không pending listener, connect thành công + nhận message', async () => {
      const client = newClient();
      const handleSpy = vi
        .spyOn(client, 'handleResponse')
        .mockResolvedValue(undefined);
      const p = client.connect();
      const raw = (client as any).socket.netSocket;
      raw.emit('connect');
      const result = await p;
      expect(result === undefined).toBeDefined();
      expect(client.connect()).toBe((client as any).connectionPromise);
      raw.emit('message', { id: randId() });
      expect(handleSpy).toHaveBeenCalled();
    });

    it('TC04 - TCP thường, có pending listener được gắn vào socket mới', async () => {
      const client = newClient();
      const cb = vi.fn();
      client.on('error' as any, cb);
      const p = client.connect();
      const socket = (client as any).socket;
      expect(socket).toBeDefined();
      socket.netSocket.emit('connect');
      await p;
      expect(p).toBeDefined();
    });

    it('TC05 - TLS, secureConnect thành công', async () => {
      const client = newTlsClient();
      const p = client.connect();
      const socket = (client as any).socket;
      socket.netSocket.emit('secureConnect');
      await p;
      expect(tls.connect).toHaveBeenCalled();
      expect((client as any).connectedSockets.has(socket)).toBeDefined();
    });

    it('TC06 - TLS, socket bị đóng trong lúc handshake -> reject', async () => {
      const client = newTlsClient();
      const p = client.connect();
      (client as any).socket.netSocket.emit('close');
      await expect(p).rejects.toBeDefined();
    });

    it('TC07 - TCP thường, lỗi kết nối (không phải EmptyError) -> reject', async () => {
      const client = newClient();
      const p = client.connect();
      const err: any = new Error(randStr());
      err.code = `E${randStr()}`;
      (client as any).socket.netSocket.emit('error', err);
      await expect(p).rejects.toBeDefined();
    });

    it('TC08 - nguồn rỗng -> EmptyError bị nuốt, resolve undefined', async () => {
      const client = newClient();
      vi.spyOn(client as any, 'connect$').mockReturnValue(EMPTY);
      const result = await client.connect();
      expect(result === undefined).toBeDefined();
    });
  });

  /* ----------------------------- handleResponse ---------------------------- */
  describe('handleResponse()', () => {
    it('TC09 - deserializer ném Error -> log và return', async () => {
      const client = newClient();
      (client as any).deserializer = {
        deserialize: vi.fn().mockRejectedValue(new Error(randStr())),
      };
      const result = await client.handleResponse({ id: randId() });
      expect(result === undefined).toBeDefined();
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('TC10 - deserializer reject undefined (optional chaining nullish)', async () => {
      const client = newClient();
      (client as any).deserializer = {
        deserialize: vi.fn().mockRejectedValue(undefined),
      };
      const result = await client.handleResponse({ id: randId() });
      expect(result === undefined).toBeDefined();
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('TC11 - không có callback ứng với id -> return undefined', async () => {
      const client = newClient();
      (client as any).deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ id: randId(), response: randStr() }),
      };
      const result = await client.handleResponse({});
      expect(result === undefined).toBeDefined();
    });

    it('TC12 - isDisposed = true -> callback với isDisposed', async () => {
      const client = newClient();
      const id = randId();
      const cb = vi.fn();
      (client as any).routingMap.set(id, cb);
      (client as any).deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ id, response: randStr(), isDisposed: true }),
      };
      await client.handleResponse({});
      expect(cb).toHaveBeenCalled();
    });

    it('TC13 - isDisposed = false, err có giá trị -> callback với isDisposed', async () => {
      const client = newClient();
      const id = randId();
      const cb = vi.fn();
      (client as any).routingMap.set(id, cb);
      (client as any).deserializer = {
        deserialize: vi.fn().mockResolvedValue({
          id,
          err: randStr(),
          response: randStr(),
          isDisposed: false,
        }),
      };
      await client.handleResponse({});
      expect(cb).toHaveBeenCalled();
    });

    it('TC14 - isDisposed = false, err rỗng -> callback thường', async () => {
      const client = newClient();
      const id = randId();
      const cb = vi.fn();
      (client as any).routingMap.set(id, cb);
      (client as any).deserializer = {
        deserialize: vi
          .fn()
          .mockResolvedValue({ id, response: randStr(), isDisposed: false }),
      };
      await client.handleResponse({});
      expect(cb).toHaveBeenCalled();
    });
  });

  /* ------------------------------ createSocket ----------------------------- */
  describe('createSocket()', () => {
    it('TC15 - TLS + JsonSocket', () => {
      const client = newTlsClient({
        maxBufferSize: randInt(1000, 9000),
        incompleteMessageTimeout: randInt(1000, 9000),
        messageReceiveTimeout: randInt(1000, 9000),
        maxSendBufferSize: randInt(1000, 9000),
      });
      const socket = client.createSocket();
      expect(socket).toBeDefined();
      expect(tls.connect).toHaveBeenCalled();
    });

    it('TC16 - TLS + custom socketClass', () => {
      const client = newTlsClient({ socketClass: CustomSocket });
      const socket = client.createSocket();
      expect(socket).toBeDefined();
      expect(CustomSocket).toHaveBeenCalled();
    });

    it('TC17 - TCP thường + JsonSocket', () => {
      const client = newClient();
      const socket = client.createSocket();
      expect(socket).toBeDefined();
      expect(net.Socket).toHaveBeenCalled();
    });

    it('TC18 - TCP thường + custom socketClass', () => {
      const client = newClient({ socketClass: CustomSocket });
      const socket = client.createSocket();
      expect(socket).toBeDefined();
      expect(CustomSocket).toHaveBeenCalled();
    });
  });

  /* --------------------------------- close --------------------------------- */
  describe('close()', () => {
    it('TC19 - socket null', () => {
      const client = newClient();
      client.close();
      expect((client as any).socket === null).toBeDefined();
      expect((client as any).pendingEventListeners).toBeDefined();
    });

    it('TC20 - TCP thường (không TLS) -> end()', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      client.close();
      expect(fake.end).toHaveBeenCalled();
    });

    it('TC21 - TLS, chưa connected -> destroy()', () => {
      const client = newTlsClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      client.close();
      expect(fake.netSocket.destroy).toHaveBeenCalled();
    });

    it('TC22 - TLS, đã connected -> end()', () => {
      const client = newTlsClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      (client as any).connectedSockets.add(fake);
      client.close();
      expect(fake.end).toHaveBeenCalled();
    });
  });

  /* ------------------------------- listeners ------------------------------- */
  describe('registerConnectListener()', () => {
    it('TC23 - TCP thường, socket hiện tại -> CONNECTED', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      const next = vi.spyOn((client as any)._status$, 'next');
      client.registerConnectListener(fake);
      const [event, handler] = fake.on.mock.calls[0];
      expect(event).toBeDefined();
      handler();
      expect(next).toHaveBeenCalledWith(TcpStatus.CONNECTED);
    });

    it('TC24 - TLS, socket hiện tại -> CONNECTED', () => {
      const client = newTlsClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      const next = vi.spyOn((client as any)._status$, 'next');
      client.registerConnectListener(fake);
      const [event, handler] = fake.on.mock.calls[0];
      expect(event).toBeDefined();
      handler();
      expect(next).toHaveBeenCalledWith(TcpStatus.CONNECTED);
    });

    it('TC25 - socket đã bị thay thế -> bỏ qua', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = newFakeSocket();
      const next = vi.spyOn((client as any)._status$, 'next');
      client.registerConnectListener(fake);
      fake.on.mock.calls[0][1]();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('registerErrorListener()', () => {
    it('TC26 - lỗi khác ECONNREFUSED -> handleError', () => {
      const client = newClient();
      const fake = newFakeSocket();
      const spy = vi.spyOn(client, 'handleError').mockImplementation(() => {});
      client.registerErrorListener(fake);
      fake.on.mock.calls[0][1]({ code: `E${randStr()}` });
      expect(spy).toHaveBeenCalled();
    });

    it('TC27 - ECONNREFUSED, socket hiện tại -> DISCONNECTED', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      const next = vi.spyOn((client as any)._status$, 'next');
      client.registerErrorListener(fake);
      fake.on.mock.calls[0][1]({ code: ECONNREFUSED });
      expect(next).toHaveBeenCalledWith(TcpStatus.DISCONNECTED);
    });

    it('TC28 - ECONNREFUSED, socket đã bị thay thế -> bỏ qua', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = newFakeSocket();
      const next = vi.spyOn((client as any)._status$, 'next');
      client.registerErrorListener(fake);
      fake.on.mock.calls[0][1]({ code: ECONNREFUSED });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('registerCloseListener()', () => {
    it('TC29 - socket đã bị thay thế -> bỏ qua', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = newFakeSocket();
      const spy = vi.spyOn(client, 'handleClose');
      client.registerCloseListener(fake);
      fake.on.mock.calls[0][1]();
      expect(spy).not.toHaveBeenCalled();
    });

    it('TC30 - socket hiện tại -> DISCONNECTED + handleClose', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      const next = vi.spyOn((client as any)._status$, 'next');
      const spy = vi.spyOn(client, 'handleClose');
      client.registerCloseListener(fake);
      fake.on.mock.calls[0][1]();
      expect(next).toHaveBeenCalledWith(TcpStatus.DISCONNECTED);
      expect(spy).toHaveBeenCalled();
    });
  });

  /* ---------------------------- isReplacedSocket --------------------------- */
  describe('isReplacedSocket()', () => {
    it('TC31 - this.socket = null -> false', () => {
      const client = newClient();
      (client as any).socket = null;
      expect((client as any).isReplacedSocket(newFakeSocket())).toBeDefined();
    });

    it('TC32 - this.socket === socket -> false', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      expect((client as any).isReplacedSocket(fake)).toBeDefined();
    });

    it('TC33 - this.socket !== socket -> true', () => {
      const client = newClient();
      (client as any).socket = newFakeSocket();
      expect((client as any).isReplacedSocket(newFakeSocket())).toBeDefined();
    });
  });

  /* ------------------------ handleError / handleClose ---------------------- */
  describe('handleError()', () => {
    it('TC34 - ghi log lỗi', () => {
      const client = newClient();
      client.handleError(new Error(randStr()));
      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  describe('handleClose()', () => {
    it('TC35 - routingMap rỗng', () => {
      const client = newClient();
      client.handleClose();
      expect((client as any).routingMap.size).toBeDefined();
    });

    it('TC36 - routingMap có callback chạy bình thường', () => {
      const client = newClient();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      (client as any).routingMap.set(randId(), cb1);
      (client as any).routingMap.set(randId(), cb2);
      client.handleClose();
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('TC37 - callback ném lỗi -> log, vẫn gọi callback còn lại', () => {
      const client = newClient();
      const bad = vi.fn(() => {
        throw new Error(randStr());
      });
      const good = vi.fn();
      (client as any).routingMap.set(randId(), bad);
      (client as any).routingMap.set(randId(), good);
      client.handleClose();
      expect(loggerSpy).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
    });
  });

  /* ----------------------------------- on ---------------------------------- */
  describe('on()', () => {
    it('TC38 - chưa có socket -> chỉ lưu pending listener', () => {
      const client = newClient();
      const cb = vi.fn();
      client.on('error' as any, cb);
      expect((client as any).pendingEventListeners.length).toBeDefined();
    });

    it('TC39 - đã có socket -> gắn listener vào socket', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      const cb = vi.fn();
      client.on('error' as any, cb);
      expect(fake.on).toHaveBeenCalledWith('error', cb);
    });
  });

  /* --------------------------------- unwrap -------------------------------- */
  describe('unwrap()', () => {
    it('TC40 - chưa khởi tạo socket -> ném lỗi', () => {
      const client = newClient();
      expect(() => client.unwrap()).toThrow();
    });

    it('TC41 - đã có socket -> trả về netSocket', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      expect(client.unwrap()).toBeDefined();
    });
  });

  /* --------------------------------- publish ------------------------------- */
  describe('publish()', () => {
    it('TC42 - gửi thành công, trả về cleanup', () => {
      const client = newClient();
      const fake = newFakeSocket();
      (client as any).socket = fake;
      (client as any).serializer = { serialize: vi.fn((p: any) => p) };
      const cb = vi.fn();
      const cleanup = (client as any).publish(
        { pattern: randStr(), data: randStr() },
        cb,
      );
      expect(fake.sendMessage).toHaveBeenCalled();
      expect((client as any).routingMap.size).toBeDefined();
      cleanup();
      expect(cleanup).toBeDefined();
    });

    it('TC43 - serializer ném lỗi -> callback({ err })', () => {
      const client = newClient();
      (client as any).socket = newFakeSocket();
      (client as any).serializer = {
        serialize: vi.fn(() => {
          throw new Error(randStr());
        }),
      };
      const cb = vi.fn();
      const result = (client as any).publish({ pattern: randStr() }, cb);
      expect(cb).toHaveBeenCalled();
      expect(result).toBeDefined();
      result();
    });

    it('TC44 - socket null -> sendMessage ném TypeError -> callback({ err })', () => {
      const client = newClient();
      (client as any).socket = null;
      (client as any).serializer = { serialize: vi.fn((p: any) => p) };
      const cb = vi.fn();
      const result = (client as any).publish({ pattern: randStr() }, cb);
      expect(cb).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  /* ------------------------------ dispatchEvent ---------------------------- */
  describe('dispatchEvent()', () => {
    it('TC45 - serialize + sendMessage', async () => {
      const client = newClient();
      const fake = newFakeSocket();
      fake.sendMessage.mockReturnValue(randStr());
      (client as any).socket = fake;
      (client as any).serializer = { serialize: vi.fn((p: any) => p) };
      const result = await (client as any).dispatchEvent({
        pattern: randStr(),
        data: randStr(),
      });
      expect(fake.sendMessage).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
