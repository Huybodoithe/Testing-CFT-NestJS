import 'reflect-metadata';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClientGrpcProxy } from '../client/client-grpc.js';
import { ClientKafka } from '../client/client-kafka.js';
import { ClientMqtt } from '../client/client-mqtt.js';
import { ClientNats } from '../client/client-nats.js';
import { ClientProxy } from '../client/client-proxy.js';
import { ClientProxyFactory } from '../client/client-proxy-factory.js';
import { ClientRedis } from '../client/client-redis.js';
import { ClientRMQ } from '../client/client-rmq.js';
import { ClientTCP } from '../client/client-tcp.js';
import { Transport } from '../enums/transport.enum.js';
import type { ReadPacket, WritePacket } from '../interfaces/index.js';

vi.mock('mqtt', () => ({ connect: vi.fn() }));
vi.mock('ioredis', () => ({ default: vi.fn() }));
vi.mock('@nats-io/transport-node', () => ({
  connect: vi.fn(),
  headers: vi.fn(),
}));
vi.mock('amqp-connection-manager', () => ({ connect: vi.fn() }));
vi.mock('kafkajs', () => ({ Kafka: vi.fn() }));

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

class CftClient extends ClientProxy {
  public readonly published = vi.fn();
  public readonly dispatched = vi.fn(async () => ({ accepted: true }));

  public connect = vi.fn(async () => undefined);
  public close = vi.fn();
  public unwrap<T>(): T {
    return undefined as T;
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    this.published(packet);
    callback({ response: randomText(), isDisposed: true });
    return vi.fn();
  }

  protected dispatchEvent(packet: ReadPacket): Promise<unknown> {
    this.published(packet);
    return this.dispatched();
  }
}

describe('ClientProxyFactory control-flow paths', () => {
  it('creates default TCP client and each configured transport', () => {
    const protoPath = join(
      import.meta.dirname,
      '..',
      'test',
      'client',
      'test.proto',
    );
    const clients = [
      ClientProxyFactory.create({}),
      ClientProxyFactory.create({ transport: Transport.TCP }),
      ClientProxyFactory.create({ transport: Transport.REDIS }),
      ClientProxyFactory.create({ transport: Transport.NATS }),
      ClientProxyFactory.create({ transport: Transport.MQTT }),
      ClientProxyFactory.create({
        transport: Transport.GRPC,
        options: { protoPath, package: 'test' },
      }),
      ClientProxyFactory.create({ transport: Transport.RMQ }),
      ClientProxyFactory.create({ transport: Transport.KAFKA }),
    ];

    clients.forEach(client => expect(client).toBeDefined());
  }, 15_000);

  it('takes the custom-class branch', () => {
    class CustomClient extends ClientTCP {}
    const client = ClientProxyFactory.create({
      customClass: CustomClient,
      options: { host: randomText(), port: randomInt(20, 200) },
    });

    expect(client).toBeDefined();
  });
});

describe('ClientProxy paths', () => {
  it('sends and emits valid randomly generated messages', async () => {
    const client = new CftClient();
    const hook = vi.fn(packet => {
      packet.metadata = { trace: randomText() };
    });
    const connectSpy = vi.spyOn(client, 'connect');
    client.setOnDispatchHook(hook);

    const response = await firstValueFrom(
      client.send(randomText(), { record: { value: randomText() } }),
    );
    const eventResult = await firstValueFrom(
      client.emit(randomText(), { record: { value: randomText() } }),
    );

    expect(response).toBeDefined();
    expect(eventResult).toBeDefined();
    expect(hook).toHaveBeenCalled();
    expect(connectSpy).toHaveBeenCalled();
  });

  it('rejects request paths with a nil pattern or payload', async () => {
    const client = new CftClient();
    await expect(
      firstValueFrom(client.send(undefined, { value: randomText() })),
    ).rejects.toBeDefined();
    await expect(
      firstValueFrom(client.send(randomText(), null)),
    ).rejects.toBeDefined();
  });
});

describe('ClientGrpcProxy helper paths', () => {
  it('handles valid, missing, and empty package lookup paths', () => {
    const client = Object.create(ClientGrpcProxy.prototype) as ClientGrpcProxy;
    const packageName = randomText();
    const nestedName = randomText();
    const root = { [packageName]: { [nestedName]: { marker: randomText() } } };

    expect(
      client.lookupPackage(root, `${packageName}.${nestedName}`),
    ).toBeDefined();
    expect(
      client.lookupPackage(root, `${randomText()}.missing`),
    ).toBeUndefined();
    expect(client.lookupPackage(root, '')).toBeDefined();
  });

  it('handles keepalive options with recognized and ignored names', () => {
    const client = Object.create(ClientGrpcProxy.prototype) as ClientGrpcProxy;
    Object.defineProperty(client, 'options', {
      configurable: true,
      value: {
        keepalive: {
          keepaliveTimeMs: randomInt(20, 200),
          keepaliveTimeoutMs: randomInt(20, 200),
          [randomText()]: randomInt(20, 200),
        },
      },
    });
    expect(client.getKeepaliveOptions()).toBeDefined();

    Object.defineProperty(client, 'options', {
      configurable: true,
      value: {},
    });
    expect(client.getKeepaliveOptions()).toBeDefined();
  });
});

describe('ClientKafka paths', () => {
  it('registers a response pattern and handles missing consumer state', () => {
    const client = new ClientKafka({});
    client.subscribeToResponseOf(randomText());

    expect(client['responsePatterns'].length).toBeGreaterThan(0);
    expect(() => client.commitOffsets([])).toThrow();
    expect(() => client.unwrap()).toThrow();
    expect(() => client.on('event', vi.fn())).toThrow();
  });
});

describe('ClientMqtt helper paths', () => {
  it('merges message options and checks an ordinary topic', () => {
    const client = new ClientMqtt({
      protocolVersion: 5,
      userProperties: { client: randomText() },
    });

    expect(
      client['mergePacketOptions'](
        { qos: randomInt(1, 2) },
        { trace: randomText() },
      ),
    ).toBeDefined();
    expect(new ClientMqtt({})['mergePacketOptions']()).toBeUndefined();
    expect(() => client['assertTopicLength'](randomText())).not.toThrow();
    expect(client.getRequestPattern(randomText())).toBeDefined();
    expect(client.getResponsePattern(randomText())).toBeDefined();
  });
});

describe('ClientNats helper paths', () => {
  it('handles supported, unsupported, and absent header capability', () => {
    const client = Object.create(ClientNats.prototype) as ClientNats;

    Object.defineProperty(client, 'natsClient', {
      configurable: true,
      value: null,
    });
    expect(client['supportsHeaders']()).toBeDefined();

    Object.defineProperty(client, 'natsClient', {
      configurable: true,
      value: { info: { headers: false } },
    });
    expect(client['supportsHeaders']()).toBeDefined();

    Object.defineProperty(client, 'natsClient', {
      configurable: true,
      value: { info: { headers: true } },
    });
    expect(client['supportsHeaders']()).toBeDefined();
  });

  it('skips header creation when no header source is present', () => {
    const client = new ClientNats({});
    expect(client['mergeHeaders']()).toBeUndefined();
  });
});

describe('ClientRedis paths', () => {
  it('builds request and reply patterns and closes an unconnected client', async () => {
    const client = new ClientRedis({});
    const pattern = randomText();

    expect(client.getRequestPattern(pattern)).toBeDefined();
    expect(client.getReplyPattern(pattern)).toBeDefined();
    await expect(client.close()).resolves.toBeUndefined();
  });
});

describe('ClientRMQ helper paths', () => {
  it('handles empty and populated header sources and parses both content classes', () => {
    const client = new ClientRMQ({});
    expect(client['mergeHeaders']()).toBeUndefined();
    expect(
      client['mergeHeaders'](
        { request: randomText() },
        { trace: randomText() },
      ),
    ).toBeDefined();
    expect(
      client['parseMessageContent'](
        Buffer.from(JSON.stringify({ value: randomText() })),
      ),
    ).toBeDefined();
    expect(
      client['parseMessageContent'](Buffer.from(randomText())),
    ).toBeDefined();
  });
});

describe('ClientTCP paths', () => {
  it('stores pending event listeners and closes without an active socket', () => {
    const client = new ClientTCP({});
    const listener = vi.fn();

    client.on('connect', listener);
    expect(client['pendingEventListeners'].length).toBeGreaterThan(0);
    expect(() => client.close()).not.toThrow();
    expect(client['pendingEventListeners'].length).toBe(0);
    expect(() => client.unwrap()).toThrow();
  });
});
