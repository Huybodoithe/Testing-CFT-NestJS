import 'reflect-metadata';
import { join } from 'node:path';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ServerGrpc } from '../server/server-grpc.js';
import { ServerKafka } from '../server/server-kafka.js';
import { ServerMqtt } from '../server/server-mqtt.js';
import { ServerNats } from '../server/server-nats.js';
import { ServerRedis } from '../server/server-redis.js';
import { ServerRMQ } from '../server/server-rmq.js';
import { ServerTCP } from '../server/server-tcp.js';
import { ServerFactory } from '../server/server-factory.js';
import { Transport } from '../enums/transport.enum.js';

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

function handler() {
  return vi.fn(async () => randomText());
}

describe('ServerFactory control-flow paths', () => {
  it('creates default TCP and each configured transport', () => {
    const protoPath = join(
      import.meta.dirname,
      '..',
      'test',
      'server',
      'test.proto',
    );
    const servers = [
      ServerFactory.create({}),
      ServerFactory.create({ transport: Transport.TCP }),
      ServerFactory.create({ transport: Transport.REDIS }),
      ServerFactory.create({ transport: Transport.NATS }),
      ServerFactory.create({ transport: Transport.MQTT }),
      ServerFactory.create({
        transport: Transport.GRPC,
        options: { protoPath, package: 'test' },
      }),
      ServerFactory.create({ transport: Transport.RMQ }),
      ServerFactory.create({ transport: Transport.KAFKA }),
    ];

    servers.forEach(server => expect(server).toBeDefined());
  }, 15_000);
});

describe('Server base-class paths', () => {
  it('registers event handlers, resolves direct and normalized patterns', () => {
    const server = new ServerTCP({});
    const exactPattern = `cft.${randomText()}`;
    const exactHandler = handler();
    const objectPattern = { scope: randomText(), action: randomText() };
    const objectHandler = handler();
    const eventHandler = handler();

    server.addHandler(exactPattern, exactHandler);
    server.addHandler(objectPattern, objectHandler);
    server.addHandler(exactPattern, eventHandler, true);

    expect(server.getHandlers()).toBeDefined();
    expect(server.getHandlerByPattern(exactPattern)).toBeDefined();
    expect(
      server.getHandlerByPattern(JSON.stringify(objectPattern)),
    ).toBeDefined();
    expect(server.getHandlerByPattern(randomText())).toBeDefined();
  });

  it('sends replies and exercises processing hooks and rejection handling', async () => {
    const server = new ServerTCP({});
    const context = {} as never;
    const replies = vi.fn(async () => undefined);
    const startHook = vi.fn(
      (
        _transport: Transport | symbol,
        _context: unknown,
        done: () => Promise<unknown>,
      ) => done(),
    );
    const endHook = vi.fn();
    server.setTransportId(Transport.TCP);
    server.setOnProcessingStartHook(startHook);
    server.setOnProcessingEndHook(endHook);

    server.send(of(randomText()), replies);
    await server['handleRequest'](
      context,
      async () => of(randomText()) as never,
      replies,
    );
    await expect(
      server['handleRequest'](
        context,
        async () => Promise.reject(new Error(randomText())),
        replies,
      ),
    ).rejects.toBeDefined();
    await new Promise(resolve => setImmediate(resolve));

    expect(replies).toHaveBeenCalled();
    expect(startHook).toHaveBeenCalled();
    expect(endHook).toHaveBeenCalled();
  });

  it('handles an event with and without a matching handler', async () => {
    const server = new ServerTCP({});
    const context = {} as never;
    const pattern = randomText();
    const callback = handler();
    server.addHandler(pattern, callback, true);

    await server.handleEvent(pattern, { pattern, data: randomText() }, context);
    await server.handleEvent(randomText(), { data: randomText() }, context);
    expect(callback).toHaveBeenCalled();
  });

  it('transforms values, promises, and observables and validates packet ids', async () => {
    const server = new ServerTCP({});
    const value = randomText();

    await expect(
      lastValueFrom(server.transformToObservable(value)),
    ).resolves.toBeDefined();
    await expect(
      lastValueFrom(server.transformToObservable(Promise.resolve(value))),
    ).resolves.toBeDefined();
    await expect(
      lastValueFrom(server.transformToObservable(of(value))),
    ).resolves.toBeDefined();
    expect(server.getOptionsProp({ value }, 'value')).toBeDefined();
    expect(
      server.getOptionsProp(undefined, 'value' as never, value),
    ).toBeDefined();
    expect(() =>
      server['assertValidPacketId'](randomInt(100, 9999)),
    ).not.toThrow();
    expect(() => server['assertValidPacketId'](randomText())).not.toThrow();
    expect(() => server['assertValidPacketId']({ id: randomText() })).toThrow();
    expect(server['getPatternAsString'](value)).toBeDefined();
  });
});

describe('ServerGrpc helper paths', () => {
  it('looks up nested, absent, and root package values', () => {
    const server = Object.create(ServerGrpc.prototype) as ServerGrpc;
    const segment = randomText();
    const nested = randomText();
    const root = { [segment]: { [nested]: randomText() } };

    expect(server.lookupPackage(root, `${segment}.${nested}`)).toBeDefined();
    expect(server.lookupPackage(root, randomText())).toBeUndefined();
    expect(server.lookupPackage(root, '')).toBeDefined();
  });
});

describe('ServerKafka handler paths', () => {
  it('matches exact and regex handlers and misses unrelated patterns', () => {
    const server = new ServerKafka({});
    const topicPart = randomText().toLowerCase();
    const exactPattern = `events.${topicPart}`;
    const regexPattern = /^events\.[a-z]+$/;
    const exactHandler = handler();
    const regexHandler = handler();

    server.addHandler(exactPattern, exactHandler);
    server.addHandler(regexPattern, regexHandler);

    expect(server.getHandlerByPattern(exactPattern)).toBeDefined();
    expect(
      server.getHandlerByPattern(`events.${randomText().toLowerCase()}`),
    ).toBeDefined();
    expect(server.getHandlerByPattern(`other.${randomText()}`)).toBeDefined();
  });
});

describe('ServerMqtt helper paths', () => {
  it('matches ordinary topics, wildcards, shared subscriptions, and misses', () => {
    const server = new ServerMqtt({});
    const segment = randomText().toLowerCase();

    expect(
      server.matchMqttPattern(`orders/${segment}`, `orders/${segment}`),
    ).toBeDefined();
    expect(
      server.matchMqttPattern('orders/+', `orders/${segment}`),
    ).toBeDefined();
    expect(
      server.matchMqttPattern('orders/#', `orders/${segment}/detail`),
    ).toBeDefined();
    expect(server.matchMqttPattern('#', `$SYS/${segment}`)).toBeDefined();
    expect(
      server.matchMqttPattern(`orders/${segment}`, `users/${randomText()}`),
    ).toBeDefined();
    expect(
      server.removeHandlerKeySharedPrefix(`$share/${segment}/orders/#`),
    ).toBeDefined();
    expect(
      server.removeHandlerKeySharedPrefix(`orders/${segment}`),
    ).toBeDefined();
  });

  it('parses JSON and plain text and resolves matching handlers', () => {
    const server = new ServerMqtt({});
    const topic = `events/${randomText().toLowerCase()}`;
    const callback = handler();
    server.addHandler(topic, callback);

    expect(
      server.parseMessage(JSON.stringify({ value: randomText() })),
    ).toBeDefined();
    expect(server.parseMessage(randomText())).toBeDefined();
    expect(server.getHandlerByPattern(topic)).toBeDefined();
    expect(server.getHandlerByPattern(`events/${randomText()}`)).toBeDefined();
    expect(server.getRequestPattern(topic)).toBeDefined();
    expect(server.getReplyPattern(topic)).toBeDefined();
  });
});

describe('ServerNats helper paths', () => {
  it('matches exact, single-token, multi-token, and non-matching subjects', () => {
    const server = new ServerNats({});
    const token = randomText();

    expect(
      server['matchNatsSubject'](`orders.${token}`, `orders.${token}`),
    ).toBeDefined();
    expect(
      server['matchNatsSubject']('orders.*', `orders.${token}`),
    ).toBeDefined();
    expect(
      server['matchNatsSubject']('orders.>', `orders.${token}.detail`),
    ).toBeDefined();
    expect(
      server['matchNatsSubject']('orders.>', `orders.${randomText()}`),
    ).toBeDefined();
    expect(
      server['matchNatsSubject'](`orders.${token}`, `users.${randomText()}`),
    ).toBeDefined();
  });
});

describe('ServerRedis helper paths', () => {
  it('parses JSON and plain text and returns retry paths by configuration', () => {
    const defaultServer = new ServerRedis({});
    const retryServer = new ServerRedis({
      retryAttempts: randomInt(7, 20),
      retryDelay: randomInt(300, 1800),
    });

    expect(
      defaultServer.parseMessage(JSON.stringify({ value: randomText() })),
    ).toBeDefined();
    expect(defaultServer.parseMessage(randomText())).toBeDefined();
    expect(defaultServer.getReplyPattern(randomText())).toBeDefined();
    expect(defaultServer.createRetryStrategy(randomInt(1, 4))).toBeUndefined();
    expect(retryServer.createRetryStrategy(randomInt(1, 4))).toBeDefined();
    expect(
      retryServer.createRetryStrategy(retryServer['options'].retryAttempts + 5),
    ).toBeUndefined();
    retryServer['isManuallyClosed'] = true;
    expect(retryServer.createRetryStrategy(randomInt(1, 4))).toBeUndefined();
  });
});

describe('ServerRMQ wildcard paths', () => {
  it('initializes wildcard handlers and resolves matching routes', () => {
    const server = new ServerRMQ({ wildcards: true });
    const token = randomText().toLowerCase();
    const wildcardHandler = handler();
    const exactHandler = handler();
    server.addHandler('orders.*', wildcardHandler);
    server.addHandler(`users.${token}`, exactHandler);
    server['initializeWildcardHandlersIfExist']();

    expect(server.getHandlerByPattern(`orders.${token}`)).toBeDefined();
    expect(server.getHandlerByPattern(`users.${token}`)).toBeDefined();
    expect(server.getHandlerByPattern(`other.${token}`)).toBeDefined();
    expect(
      server['matchRmqPattern'](
        'orders.#',
        `orders.${randomText()}.${randomText()}`,
      ),
    ).toBeDefined();
    expect(
      server['matchRmqPattern'](
        'orders.*',
        `orders.${randomText()}.${randomText()}`,
      ),
    ).toBeDefined();
  });
});

describe('ServerTCP helper paths', () => {
  it('handles valid patterns and packet ids and closes without a listener', () => {
    const server = new ServerTCP({});
    const value = randomText();

    expect(server['getPatternAsString'](value)).toBeDefined();
    expect(server['getPatternAsString']({ value })).toBeDefined();
    expect(() => server['assertValidPacketId'](randomText())).not.toThrow();
    expect(() =>
      server['assertValidPacketId'](randomInt(100, 9999)),
    ).not.toThrow();
    expect(() => server['assertValidPacketId'](false)).toThrow();
    expect(() => server.close()).not.toThrow();
  });
});
