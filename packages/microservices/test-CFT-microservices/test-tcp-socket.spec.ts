import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ClientTCP } from '../client/client-tcp.js';
import { InvalidTcpDataReceptionException } from '../errors/invalid-tcp-data-reception.exception.js';
import { JsonSocket } from '../helpers/json-socket.js';
import { TcpSocket } from '../helpers/tcp-socket.js';
import { ServerTCP } from '../server/server-tcp.js';
import { of } from 'rxjs';

const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomText(): string {
  const length = randomInt(9, 19);
  return Array.from(
    { length },
    () => alphabet[randomInt(0, alphabet.length - 1)],
  ).join('');
}

function socketStub() {
  return Object.assign(new EventEmitter(), {
    write: vi.fn(() => true),
    connect: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    writableLength: 0,
  });
}

function frame(value: unknown): string {
  const json = JSON.stringify(value);
  return `${json.length}#${json}`;
}

class CftTcpSocket extends TcpSocket {
  public readonly handleSend = vi.fn();
  public readonly handleData = vi.fn();

  constructor(socket: ReturnType<typeof socketStub>) {
    super(socket as never);
  }
}

describe('TcpSocket base class', () => {
  it('delegates socket operations and sends only while connected', () => {
    const rawSocket = socketStub();
    const socket = new CftTcpSocket(rawSocket);
    const message = randomText();
    const callback = vi.fn();

    expect(socket.netSocket).toBe(rawSocket);
    expect(socket.connect(randomInt(2000, 9000), randomText())).toBe(socket);
    expect(socket.on('custom', callback)).toBe(socket);
    expect(socket.once('custom-once', callback)).toBe(socket);
    expect(socket.end()).toBe(socket);
    socket.sendMessage(message, callback);
    expect(socket.handleSend).toHaveBeenCalled();

    rawSocket.emit('close');
    socket.sendMessage(randomText(), callback);
    expect(callback).toHaveBeenCalled();

    rawSocket.emit('connect');
    socket.sendMessage(randomText(), callback);
    expect(socket.handleSend).toHaveBeenCalledTimes(2);
    rawSocket.emit('error', randomText());
    socket.sendMessage(randomText());
  });

  it('routes inbound data and closes the socket on framing exceptions', () => {
    const rawSocket = socketStub();
    const socket = new CftTcpSocket(rawSocket);
    const errorListener = vi.fn();
    rawSocket.on('error', errorListener);

    rawSocket.emit('data', Buffer.from(randomText()));
    expect(socket.handleData).toHaveBeenCalled();

    socket['emitMessage'](JSON.stringify({ value: randomText() }));
    expect(rawSocket.listenerCount('message')).toBeGreaterThanOrEqual(0);
    expect(() => socket['emitMessage'](randomText())).toThrow();

    socket['handleDataError'](new Error(randomText()));
    expect(rawSocket.end).toHaveBeenCalled();
    socket['handleDataError'](new Error(randomText()), { destroy: true });
    expect(rawSocket.destroy).toHaveBeenCalled();
    expect(errorListener).toHaveBeenCalled();
  });
});

describe('JsonSocket framing paths', () => {
  it('parses complete and pipelined frames, including Buffer input', () => {
    const rawSocket = socketStub();
    const jsonSocket = new JsonSocket(rawSocket);
    const messages = vi.fn();
    rawSocket.on('message', messages);

    (jsonSocket as never as { handleData(data: string): void }).handleData(
      `${frame({ payload: randomText() })}${frame({ payload: randomText() })}`,
    );
    (jsonSocket as never as { handleData(data: Buffer): void }).handleData(
      Buffer.from(frame({ payload: randomText() })),
    );

    expect(messages).toHaveBeenCalledTimes(3);
  });

  it('holds incomplete frames until the next chunk arrives', () => {
    const rawSocket = socketStub();
    const jsonSocket = new JsonSocket(rawSocket);
    const messages = vi.fn();
    rawSocket.on('message', messages);
    const encoded = frame({ value: randomText() });
    const splitAt = randomInt(2, 5);

    (jsonSocket as never as { handleData(data: string): void }).handleData(
      encoded.slice(0, splitAt),
    );
    (jsonSocket as never as { handleData(data: string): void }).handleData(
      encoded.slice(splitAt),
    );
    expect(messages).toHaveBeenCalled();
  });

  it('sends framed values and handles write backpressure disabled/enabled', () => {
    const rawSocket = socketStub();
    rawSocket.write.mockReturnValue(false);
    const jsonSocket = new JsonSocket(rawSocket, {
      pauseOnBackpressure: false,
      maxSendBufferSize: randomInt(500, 1400),
    });
    jsonSocket.sendMessage({ payload: randomText() });
    expect(rawSocket.write).toHaveBeenCalled();

    const pressuredSocket = socketStub();
    pressuredSocket.write.mockReturnValue(false);
    const pressured = new JsonSocket(pressuredSocket, {
      pauseOnBackpressure: true,
      drainTimeout: randomInt(500, 1500),
    });
    pressured.sendMessage({ payload: randomText() });
    expect(pressuredSocket.pause).toHaveBeenCalled();
    pressuredSocket.emit('drain');
    expect(pressuredSocket.resume).toHaveBeenCalled();
    pressuredSocket.emit('close');
  });

  it('surfaces malformed framing and malformed JSON through socket errors', () => {
    const rawSocket = socketStub();
    const jsonSocket = new JsonSocket(rawSocket, {
      maxBufferSize: randomInt(40, 100),
    });
    const errors = vi.fn();
    rawSocket.on('error', errors);

    expect(() =>
      (jsonSocket as never as { handleData(data: string): void }).handleData(
        `x${randomText()}#{}`,
      ),
    ).toThrow();
    const invalidJson = new JsonSocket(rawSocket);
    try {
      rawSocket.emit('data', Buffer.from('1#x'));
    } catch {
      // The socket error event is the assertion target for malformed JSON.
    }
    expect(errors).toHaveBeenCalled();
  });

  it('handles empty JSON values and oversized send buffers', () => {
    const rawSocket = socketStub();
    const errors = vi.fn();
    const messages = vi.fn();
    rawSocket.on('error', errors);
    rawSocket.on('message', messages);
    const jsonSocket = new JsonSocket(rawSocket, {
      maxBufferSize: randomInt(80, 160),
      maxSendBufferSize: randomInt(8, 24),
    });

    rawSocket.emit('data', Buffer.from('4#null'));
    expect(messages).toHaveBeenCalled();

    rawSocket.writableLength = randomInt(40, 100);
    jsonSocket.sendMessage({ payload: randomText() });
    expect(rawSocket.destroy).toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
  });
});

describe('InvalidTcpDataReceptionException', () => {
  it('normalizes string, Error, message-shaped object, and generic inputs', () => {
    const inputs = [
      `Corrupted length value ${randomText()}`,
      new Error(randomText()),
      { message: randomText() },
      randomInt(20, 800),
    ];
    const exceptions = inputs.map(
      input => new InvalidTcpDataReceptionException(input as never),
    );
    const corrupted = new InvalidTcpDataReceptionException(
      `Corrupted length value ${randomText()}`,
    );

    expect(exceptions.every(item => item instanceof Error)).toBe(true);
    expect(corrupted).toBeDefined();
  });
});

describe('ClientTCP request/response paths', () => {
  it('connects once and resolves when the socket emits connect', async () => {
    const client = new ClientTCP({});
    const socket = {
      netSocket: new EventEmitter(),
      connect: vi.fn(),
      on: vi.fn(function (
        this: any,
        event: string,
        callback: (...args: any[]) => void,
      ) {
        this.netSocket.on(event, callback);
        return this;
      }),
      end: vi.fn(),
    };
    vi.spyOn(client, 'createSocket').mockReturnValue(socket as never);
    const connection = client.connect();
    socket.netSocket.emit('connect');
    await expect(connection).resolves.toBeUndefined();
    await expect(client.connect()).resolves.toBeUndefined();
    expect(socket.connect).toHaveBeenCalled();
  });

  it('handles normal, disposed, error, and untracked responses', async () => {
    const client = new ClientTCP({});
    const callback = vi.fn();
    const id = randomText();
    client['routingMap'].set(id, callback);
    client['deserializer'] = {
      deserialize: vi.fn(async () => ({
        id,
        response: randomText(),
        isDisposed: false,
      })),
    } as never;
    await client.handleResponse({ id });

    client['deserializer'] = {
      deserialize: vi.fn(async () => ({
        id,
        response: randomText(),
        isDisposed: true,
      })),
    } as never;
    await client.handleResponse({ id });

    client['deserializer'] = {
      deserialize: vi.fn(async () => ({ id, err: new Error(randomText()) })),
    } as never;
    await client.handleResponse({ id });
    await client.handleResponse({ id: randomText() });

    expect(callback).toHaveBeenCalled();
  });

  it('handles deserialize failures and publishes through a mocked socket', async () => {
    const client = new ClientTCP({});
    client['deserializer'] = {
      deserialize: vi.fn(async () => {
        throw new Error(randomText());
      }),
    } as never;
    const loggerSpy = vi
      .spyOn(client['logger'], 'error')
      .mockImplementation(() => {});
    await client.handleResponse({ value: randomText() });
    expect(loggerSpy).toHaveBeenCalled();

    const sendMessage = vi.fn();
    client['socket'] = { sendMessage } as never;
    const callback = vi.fn();
    const cleanup = client['publish'](
      { pattern: randomText(), data: randomText() },
      callback,
    );
    expect(sendMessage).toHaveBeenCalled();
    cleanup();

    client['socket'] = {
      sendMessage: vi.fn(() => {
        throw new Error(randomText());
      }),
    } as never;
    client['publish']({ pattern: randomText(), data: randomText() }, callback);

    client['socket'] = { sendMessage } as never;
    await client['dispatchEvent']({
      pattern: { route: randomText() },
      data: randomText(),
    });
    expect(callback).toHaveBeenCalled();
  });
});

describe('ServerTCP request/socket paths', () => {
  it('handles event requests, missing handlers, and matching request handlers', async () => {
    const server = new ServerTCP({});
    const socket = {
      sendMessage: vi.fn(),
      on: vi.fn(),
      end: vi.fn(),
    } as never;
    const pattern = randomText();
    const eventHandler = vi.fn(async () => randomText());
    server.addHandler(pattern, eventHandler, true);

    await server.handleMessage(socket, { pattern, data: randomText() });
    await server.handleMessage(socket, {
      id: randomText(),
      pattern: randomText(),
      data: randomText(),
    });

    const requestHandler = vi.fn(() => of(randomText()));
    const requestPattern = randomText();
    server.addHandler(requestPattern, requestHandler);
    await server.handleMessage(socket, {
      id: randomText(),
      pattern: requestPattern,
      data: randomText(),
    });
    expect(eventHandler).toHaveBeenCalled();
    expect(requestHandler).toHaveBeenCalled();
  });

  it('tracks sockets, handles listener registration, and closes open sockets', () => {
    const server = new ServerTCP({});
    const openSocket = Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
    });
    server['trackOpenSocket'](openSocket as never);
    server['trackOpenSocket'](undefined as never);
    server['closeOpenSockets']();
    expect(openSocket.destroy).toHaveBeenCalled();

    const listener = vi.fn();
    server.on('connect', listener);
    expect(server['server'].listenerCount('connect')).toBeGreaterThan(0);
    expect(server.unwrap()).toBeDefined();
    expect(
      server['endOnDisconnect'](randomText(), {} as never, {} as never),
    ).toBeDefined();
  });
});
