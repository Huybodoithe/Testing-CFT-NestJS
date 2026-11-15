import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { ClientGrpcProxy } from '../../client/client-grpc.js';
import { ClientKafka } from '../../client/client-kafka.js';
import { ClientMqtt } from '../../client/client-mqtt.js';
import { ClientNats } from '../../client/client-nats.js';
import { ClientProxyFactory } from '../../client/client-proxy-factory.js';
import { ClientRedis } from '../../client/client-redis.js';
import { ClientRMQ } from '../../client/client-rmq.js';
import { ClientTCP } from '../../client/client-tcp.js';
import { Transport } from '../../enums/transport.enum.js';

// ---------- Mock các client để không mở kết nối thật / không cần thư viện ngoài ----------
vi.mock('../../client/client-tcp.js', () => ({
  ClientTCP: class ClientTCP {
    constructor(public options?: unknown) {}
  },
}));
vi.mock('../../client/client-redis.js', () => ({
  ClientRedis: class ClientRedis {
    constructor(public options?: unknown) {}
  },
}));
vi.mock('../../client/client-nats.js', () => ({
  ClientNats: class ClientNats {
    constructor(public options?: unknown) {}
  },
}));
vi.mock('../../client/client-mqtt.js', () => ({
  ClientMqtt: class ClientMqtt {
    constructor(public options?: unknown) {}
  },
}));
vi.mock('../../client/client-grpc.js', () => ({
  ClientGrpcProxy: class ClientGrpcProxy {
    constructor(public options?: unknown) {}
  },
}));
vi.mock('../../client/client-rmq.js', () => ({
  ClientRMQ: class ClientRMQ {
    constructor(public options?: unknown) {}
  },
}));
vi.mock('../../client/client-kafka.js', () => ({
  ClientKafka: class ClientKafka {
    constructor(public options?: unknown) {}
  },
}));

// ---------- Sinh dữ liệu ngẫu nhiên, nằm sâu trong lớp tương đương (không dùng biên) ----------
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randStr = (prefix = 'v'): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const randHost = (): string => `${randStr('host')}.local`;
const randPort = (): number => randInt(20000, 40000);

describe('ClientProxyFactory', () => {
  describe('create', () => {
    // TC01: customClass có giá trị
    it('TC01 - should create custom client when customClass is provided', () => {
      const ctorSpy = vi.fn();
      class CustomClient {
        constructor(opts: unknown) {
          ctorSpy(opts);
        }
      }
      const proxy = ClientProxyFactory.create({
        customClass: CustomClient,
        options: { host: randHost(), port: randPort() },
      } as any);
      expect(proxy).toBeDefined();
      expect(ctorSpy).toHaveBeenCalled();
    });

    // TC02: transport = REDIS
    it('TC02 - should create redis client', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.REDIS,
        options: { host: randHost(), port: randPort() },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientRedis).toBeDefined();
    });

    // TC03: transport = NATS
    it('TC03 - should create nats client', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.NATS,
        options: { servers: [`nats://${randHost()}:${randPort()}`] },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientNats).toBeDefined();
    });

    // TC04: transport = MQTT
    it('TC04 - should create mqtt client', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.MQTT,
        options: { url: `mqtt://${randHost()}:${randPort()}` },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientMqtt).toBeDefined();
    });

    // TC05: transport = GRPC
    it('TC05 - should create grpc client', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.GRPC,
        options: {
          protoPath: join(process.cwd(), `${randStr('proto')}.proto`),
          package: randStr('pkg'),
        },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientGrpcProxy).toBeDefined();
    });

    // TC06: transport = RMQ
    it('TC06 - should create rmq client', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: {
          urls: [`amqp://${randHost()}:${randPort()}`],
          queue: randStr('queue'),
        },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientRMQ).toBeDefined();
    });

    // TC07: transport = KAFKA
    it('TC07 - should create kafka client', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.KAFKA,
        options: { client: { brokers: [`${randHost()}:${randPort()}`] } },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientKafka).toBeDefined();
    });

    // TC08: không có transport -> default (TCP)
    it('TC08 - should create tcp client by default', () => {
      const proxy = ClientProxyFactory.create({});
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientTCP).toBeDefined();
    });

    // TC09: transport = TCP tường minh -> default (TCP)
    it('TC09 - should create tcp client when transport is TCP', () => {
      const proxy = ClientProxyFactory.create({
        transport: Transport.TCP,
        options: { host: randHost(), port: randPort() },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientTCP).toBeDefined();
    });

    // TC10: transport là giá trị lạ -> default (TCP)
    it('TC10 - should fall back to tcp client for unknown transport', () => {
      const proxy = ClientProxyFactory.create({
        transport: randInt(100, 900) as unknown as Transport,
        options: { host: randHost(), port: randPort() },
      } as any);
      expect(proxy).toBeDefined();
      expect(proxy instanceof ClientTCP).toBeDefined();
    });

    // TC11: customClass không kèm options
    it('TC11 - should create custom client even when options are omitted', () => {
      class CustomClient {
        constructor(public opts?: unknown) {}
      }
      const proxy = ClientProxyFactory.create({
        customClass: CustomClient,
      } as any);
      expect(proxy).toBeDefined();
    });
  });
});
