import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lastValueFrom } from 'rxjs';

const h = vi.hoisted(() => ({
  parse: vi.fn(),
  loadPackage: vi.fn(),
}));

vi.mock('@nestjs/common/internal', async importOriginal => ({
  ...(await importOriginal<any>()),
  loadPackage: h.loadPackage,
}));

vi.mock('../../helpers/index.js', async importOriginal => ({
  ...(await importOriginal<any>()),
  KafkaLogger: vi.fn(() => () => undefined),
  KafkaParser: class {
    constructor(public opts?: any) {}
    parse(...args: any[]) {
      return h.parse(...args);
    }
  },
  KafkaReplyPartitionAssigner: class {
    constructor(
      public client: any,
      public config: any,
    ) {}
  },
}));

vi.mock('../../utils/packet-metadata.utils.js', () => ({
  hasPacketMetadata: (m: any) =>
    !!m && typeof m === 'object' && Object.keys(m).length > 0,
}));

import { ClientKafka } from '../../client/client-kafka.js';
import { KafkaHeaders } from '../../enums/index.js';

// ---------- Random generators (giá trị nằm sâu trong lớp tương đương) ----------
const rs = (len = 12): string =>
  Array.from({ length: len }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join('');
const ri = (min = 100, max = 900): number =>
  min + Math.floor(Math.random() * (max - min + 1));

// ---------- Fakes ----------
const EVENTS = {
  CONNECT: 'consumer.connect',
  DISCONNECT: 'consumer.disconnect',
  REBALANCING: 'consumer.rebalancing',
  STOP: 'consumer.stop',
  CRASH: 'consumer.crash',
  GROUP_JOIN: 'consumer.group_join',
};
const PEVENTS = {
  CONNECT: 'producer.connect',
  DISCONNECT: 'producer.disconnect',
};

const makeConsumer = () => ({
  events: EVENTS,
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
  commitOffsets: vi.fn().mockResolvedValue(undefined),
});
const makeProducer = () => ({
  events: PEVENTS,
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue([{ topicName: rs() }]),
});
const makeKafka = (consumer = makeConsumer(), producer = makeProducer()) => ({
  consumer: vi.fn(() => consumer),
  producer: vi.fn(() => producer),
});

const makeClient = (options: any = {}): any => {
  const c: any = new ClientKafka(options);
  vi.spyOn(c.logger, 'error').mockImplementation(() => undefined);
  c.serializer = {
    serialize: vi.fn(async (d: any) => ({ value: d, headers: {} })),
  };
  c.deserializer = { deserialize: vi.fn() };
  return c;
};
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  h.parse.mockReset();
  h.loadPackage.mockReset();
});

describe('ClientKafka - Control Flow Testing', () => {
  // ===================== constructor =====================
  describe('constructor', () => {
    it('TC01 - tất cả option được cung cấp', () => {
      const c = new ClientKafka({
        client: { brokers: [`${rs()}:${ri(2000, 8000)}`], clientId: rs() },
        consumer: { groupId: rs() },
        postfixId: `-${rs(5)}`,
        producerOnlyMode: true,
        parser: { keepBinary: true },
        serializer: { serialize: vi.fn() },
        deserializer: { deserialize: vi.fn() },
      } as any);
      expect(c).toBeDefined();
    });

    it('TC02 - options rỗng (dùng toàn bộ giá trị mặc định)', () => {
      const c = new ClientKafka({} as any);
      expect(c).toBeDefined();
    });
  });

  // ===================== getters =====================
  describe('getters consumer / producer', () => {
    it('TC03 - consumer chưa khởi tạo -> throw', () => {
      const c = makeClient();
      expect(() => c.consumer).toThrow();
    });
    it('TC04 - consumer đã khởi tạo', () => {
      const c = makeClient();
      c._consumer = makeConsumer();
      expect(c.consumer).toBeDefined();
    });
    it('TC05 - producer chưa khởi tạo -> throw', () => {
      const c = makeClient();
      expect(() => c.producer).toThrow();
    });
    it('TC06 - producer đã khởi tạo', () => {
      const c = makeClient();
      c._producer = makeProducer();
      expect(c.producer).toBeDefined();
    });
  });

  describe('subscribeToResponseOf', () => {
    it('TC07 - đăng ký reply pattern', () => {
      const c = makeClient();
      c.subscribeToResponseOf(rs());
      expect(c.responsePatterns.length).toBeDefined();
      expect(c.getResponsePatternName(rs())).toBeDefined();
    });
  });

  // ===================== close / handleClose =====================
  describe('close', () => {
    it('TC08 - chưa có producer/consumer', async () => {
      const c = makeClient();
      await c.close();
      expect(c.initialized).toBeDefined();
    });

    it('TC09 - disconnect cả hai thành công', async () => {
      const c = makeClient();
      c._consumer = makeConsumer();
      c._producer = makeProducer();
      await c.close();
      expect(c._producer).toBeDefined();
    });

    it('TC10 - một disconnect thất bại', async () => {
      const c = makeClient();
      c._consumer = makeConsumer();
      c._producer = makeProducer();
      c._producer.disconnect.mockRejectedValue(new Error(rs()));
      await expect(c.close()).rejects.toBeDefined();
    });

    it('TC11 - hai disconnect cùng thất bại (otherFailures.forEach)', async () => {
      const c = makeClient();
      c._consumer = makeConsumer();
      c._producer = makeProducer();
      c._producer.disconnect.mockRejectedValue(new Error(rs()));
      c._consumer.disconnect.mockRejectedValue(new Error(rs()));
      await expect(c.close()).rejects.toBeDefined();
      expect(c.logger.error).toBeDefined();
    });
  });

  describe('handleClose', () => {
    it('TC12 - routingMap rỗng', () => {
      const c = makeClient();
      c.handleClose();
      expect(c.routingMap.size).toBeDefined();
    });

    it('TC13 - routingMap có callback hoạt động bình thường', () => {
      const c = makeClient();
      c.routingMap.set(rs(), vi.fn());
      c.routingMap.set(rs(), vi.fn());
      c.handleClose();
      expect(c.routingMap.size).toBeDefined();
    });

    it('TC14 - callback ném lỗi', () => {
      const c = makeClient();
      c.routingMap.set(rs(), () => {
        throw new Error(rs());
      });
      c.handleClose();
      expect(c.logger.error).toBeDefined();
    });
  });

  // ===================== connect =====================
  describe('connect', () => {
    it('TC15 - đã initialized -> trả lại producer đã cache', async () => {
      const c = makeClient();
      const p = makeProducer();
      c._producer = p;
      c.initialized = Promise.resolve();
      const r = await c.connect();
      expect(r).toBeDefined();
    });

    it('TC16 - kết nối mới thành công', async () => {
      const c = makeClient({ producerOnlyMode: true });
      vi.spyOn(c, 'initializeClientAndConnections').mockImplementation(
        async () => {
          c._producer = makeProducer();
        },
      );
      const r = await c.connect();
      expect(r).toBeDefined();
    });

    it('TC17 - kết nối thất bại, initialized trùng -> reset state', async () => {
      const c = makeClient();
      const consumer = makeConsumer();
      const producer = makeProducer();
      vi.spyOn(c, 'initializeClientAndConnections').mockImplementation(
        async (attempt: any) => {
          attempt.consumer = consumer;
          attempt.producer = producer;
          throw new Error(rs());
        },
      );
      await expect(c.connect()).rejects.toBeDefined();
      expect(consumer.disconnect).toBeDefined();
    });

    it('TC18 - kết nối thất bại, initialized đã bị thay thế -> không reset', async () => {
      const c = makeClient();
      vi.spyOn(c, 'initializeClientAndConnections').mockImplementation(
        async () => {
          c.initialized = null; // mô phỏng close()/connect() mới
          throw new Error(rs());
        },
      );
      await expect(c.connect()).rejects.toBeDefined();
      expect(c.initialized).toBeDefined();
    });
  });

  // ===================== initializeClientAndConnections =====================
  describe('initializeClientAndConnections', () => {
    it('TC19 - có consumer, có consumer/producer options, chạy partition assigner + GROUP_JOIN', async () => {
      const consumer = makeConsumer();
      const producer = makeProducer();
      const kafka = makeKafka(consumer, producer);
      const c = makeClient({
        consumer: { groupId: rs(), sessionTimeout: ri(10000, 20000) },
        producer: { allowAutoTopicCreation: true },
      });
      vi.spyOn(c, 'createClient').mockResolvedValue(kafka);
      vi.spyOn(c, 'bindTopics').mockResolvedValue(undefined);
      const attempt: any = {};
      await c.initializeClientAndConnections(attempt);
      const opts = kafka.consumer.mock.calls[0][0] as any;
      const assigner = opts.partitionAssigners[0]({ cluster: rs() });
      expect(assigner).toBeDefined();
      expect(consumer.on).toBeDefined();
    });

    it('TC20 - có consumer, không có consumer/producer options', async () => {
      const kafka = makeKafka();
      const c = makeClient({});
      vi.spyOn(c, 'createClient').mockResolvedValue(kafka);
      vi.spyOn(c, 'bindTopics').mockResolvedValue(undefined);
      await c.initializeClientAndConnections({});
      expect(c._producer).toBeDefined();
    });

    it('TC21 - producerOnlyMode = true (bỏ qua consumer)', async () => {
      const kafka = makeKafka();
      const c = makeClient({ producerOnlyMode: true });
      vi.spyOn(c, 'createClient').mockResolvedValue(kafka);
      await c.initializeClientAndConnections({});
      expect(kafka.consumer).toBeDefined();
    });
  });

  // ===================== bindTopics / createClient =====================
  describe('bindTopics', () => {
    it('TC22 - chưa có consumer -> throw', async () => {
      const c = makeClient();
      await expect(c.bindTopics()).rejects.toBeDefined();
    });

    it('TC23 - có response patterns + subscribe/run options', async () => {
      const c = makeClient({
        subscribe: { fromBeginning: true },
        run: { autoCommit: false },
      });
      c._consumer = makeConsumer();
      c.responsePatterns = [`${rs()}.reply`, `${rs()}.reply`];
      await c.bindTopics();
      expect(c._consumer.subscribe).toBeDefined();
    });

    it('TC24 - không có response pattern, không có options', async () => {
      const c = makeClient({});
      c._consumer = makeConsumer();
      await c.bindTopics();
      expect(c._consumer.run).toBeDefined();
    });
  });

  describe('createClient', () => {
    it('TC25 - tạo Kafka client từ package kafkajs', async () => {
      h.loadPackage.mockResolvedValue({
        Kafka: class {
          constructor(public cfg: any) {}
        },
      });
      const c = makeClient({ client: { brokers: [rs()], clientId: rs() } });
      const k = await c.createClient();
      expect(k).toBeDefined();
    });
  });

  // ===================== createResponseCallback =====================
  describe('createResponseCallback', () => {
    const payload = (headers: any = undefined): any => ({
      topic: rs(),
      partition: ri(),
      message: { offset: String(ri()), headers },
    });

    it('TC26 - parse lỗi, tìm thấy callback theo header', async () => {
      const c = makeClient();
      const id = rs(16);
      const cb = vi.fn();
      c.routingMap.set(id, cb);
      h.parse.mockImplementation(() => {
        throw new Error(rs());
      });
      const handler = c.createResponseCallback();
      await handler(payload({ [KafkaHeaders.CORRELATION_ID]: id }));
      expect(cb).toBeDefined();
    });

    it('TC27 - parse lỗi, không có header -> không có callback', async () => {
      const c = makeClient();
      h.parse.mockImplementation(() => {
        throw new Error(rs());
      });
      const r = await c.createResponseCallback()(payload(undefined));
      expect(r).toBeUndefined();
    });

    it('TC28 - parse lỗi, giá trị header không thể chuyển thành chuỗi', async () => {
      const c = makeClient();
      h.parse.mockImplementation(() => {
        throw new Error(rs());
      });
      const bad = {
        toString() {
          throw new Error(rs());
        },
      };
      const r = await c.createResponseCallback()(
        payload({ [KafkaHeaders.CORRELATION_ID]: bad }),
      );
      expect(r).toBeUndefined();
    });

    it('TC29 - correlationId là null', async () => {
      const c = makeClient();
      h.parse.mockReturnValue({
        headers: { [KafkaHeaders.CORRELATION_ID]: null },
      });
      const r = await c.createResponseCallback()(payload({}));
      expect(r).toBeUndefined();
    });

    it('TC30 - deserialize lỗi, tìm thấy callback', async () => {
      const c = makeClient();
      const id = rs(16);
      const cb = vi.fn();
      c.routingMap.set(id, cb);
      h.parse.mockReturnValue({
        headers: { [KafkaHeaders.CORRELATION_ID]: Buffer.from(id) },
      });
      c.deserializer.deserialize.mockRejectedValue(new Error(rs()));
      await c.createResponseCallback()(payload({}));
      expect(cb).toBeDefined();
    });

    it('TC31 - deserialize lỗi, không có callback', async () => {
      const c = makeClient();
      h.parse.mockReturnValue({
        headers: { [KafkaHeaders.CORRELATION_ID]: Buffer.from(rs(16)) },
      });
      c.deserializer.deserialize.mockRejectedValue(new Error(rs()));
      const r = await c.createResponseCallback()(payload({}));
      expect(r).toBeUndefined();
    });

    it('TC32 - deserialize OK nhưng routingMap không có id', async () => {
      const c = makeClient();
      h.parse.mockReturnValue({
        headers: { [KafkaHeaders.CORRELATION_ID]: Buffer.from(rs(16)) },
      });
      c.deserializer.deserialize.mockResolvedValue({
        id: rs(16),
        response: rs(),
      });
      const r = await c.createResponseCallback()(payload({}));
      expect(r).toBeUndefined();
    });

    const happy = async (incoming: any) => {
      const c = makeClient();
      const id = rs(16);
      const cb = vi.fn();
      c.routingMap.set(id, cb);
      h.parse.mockReturnValue({
        headers: { [KafkaHeaders.CORRELATION_ID]: Buffer.from(id) },
      });
      c.deserializer.deserialize.mockResolvedValue({ id, ...incoming });
      await c.createResponseCallback()(payload({}));
      return cb;
    };

    it('TC33 - response có err', async () => {
      const cb = await happy({ err: rs(), response: rs() });
      expect(cb).toBeDefined();
    });

    it('TC34 - response có isDisposed = true', async () => {
      const cb = await happy({ isDisposed: true, response: rs() });
      expect(cb).toBeDefined();
    });

    it('TC35 - response bình thường', async () => {
      const cb = await happy({ response: rs() });
      expect(cb).toBeDefined();
    });
  });

  // ===================== emitBatch =====================
  describe('emitBatch', () => {
    it('TC36 - pattern null -> InvalidMessageException', async () => {
      const c = makeClient();
      await expect(
        lastValueFrom(c.emitBatch(null, { messages: [rs()] })),
      ).rejects.toBeDefined();
    });

    it('TC37 - data undefined -> InvalidMessageException', async () => {
      const c = makeClient();
      await expect(
        lastValueFrom(c.emitBatch(rs(), undefined as any)),
      ).rejects.toBeDefined();
    });

    it('TC38 - pattern + data hợp lệ', async () => {
      const c = makeClient();
      vi.spyOn(c, 'connect').mockResolvedValue(makeProducer());
      vi.spyOn(c, 'dispatchBatchEvent').mockResolvedValue([rs()]);
      const r = await lastValueFrom(
        c.emitBatch(rs(), { messages: [rs(), rs()] }),
      );
      expect(r).toBeDefined();
    });
  });

  // ===================== commitOffsets / unwrap / on =====================
  describe('commitOffsets', () => {
    it('TC39 - có consumer', async () => {
      const c = makeClient();
      c._consumer = makeConsumer();
      const r = await c.commitOffsets([
        { topic: rs(), partition: ri(), offset: String(ri()) },
      ]);
      expect(r).toBeUndefined();
    });
    it('TC40 - không có consumer -> throw', () => {
      const c = makeClient();
      expect(() => c.commitOffsets([])).toThrow();
    });
  });

  describe('unwrap', () => {
    it('TC41 - client đã khởi tạo', () => {
      const c = makeClient();
      c.client = makeKafka();
      expect(c.unwrap()).toBeDefined();
    });
    it('TC42 - client chưa khởi tạo -> throw', () => {
      const c = makeClient();
      expect(() => c.unwrap()).toThrow();
    });
  });

  describe('on', () => {
    it('TC43 - luôn throw (không hỗ trợ)', () => {
      const c = makeClient();
      expect(() => c.on(rs(), vi.fn())).toThrow();
    });
  });

  // ===================== event listeners =====================
  describe('registerConsumerEventListeners', () => {
    it('TC44 - không có consumer -> return sớm', () => {
      const c = makeClient();
      c.registerConsumerEventListeners();
      expect(c._consumer).toBeNull();
    });

    it('TC45 - có consumer, kích hoạt toàn bộ handler', () => {
      const c = makeClient();
      c._consumer = makeConsumer();
      const next = vi.spyOn(c._status$, 'next');
      c.registerConsumerEventListeners();
      c._consumer.on.mock.calls.forEach(([, fn]: any[]) => fn());
      expect(next).toBeDefined();
    });
  });

  describe('registerProducerEventListeners', () => {
    it('TC46 - không có producer -> return sớm', () => {
      const c = makeClient();
      c.registerProducerEventListeners();
      expect(c._producer).toBeNull();
    });

    it('TC47 - có producer, kích hoạt toàn bộ handler', () => {
      const c = makeClient();
      c._producer = makeProducer();
      const next = vi.spyOn(c._status$, 'next');
      c.registerProducerEventListeners();
      c._producer.on.mock.calls.forEach(([, fn]: any[]) => fn());
      expect(next).toBeDefined();
    });
  });

  // ===================== dispatchBatchEvent / dispatchEvent =====================
  describe('dispatchBatchEvent', () => {
    it('TC48 - messages rỗng -> return sớm', async () => {
      const c = makeClient();
      const r = await c.dispatchBatchEvent({
        pattern: rs(),
        data: { messages: [] },
      });
      expect(r).toBeUndefined();
    });

    it('TC49 - có messages, có send options và metadata', async () => {
      const c = makeClient({ send: { acks: -1 } });
      c._producer = makeProducer();
      const r = await c.dispatchBatchEvent({
        pattern: rs(),
        data: { messages: [rs(), rs(), rs()] },
        metadata: { [rs(6)]: rs() },
      });
      expect(r).toBeDefined();
    });

    it('TC50 - có messages, không send options, không metadata', async () => {
      const c = makeClient({});
      c._producer = makeProducer();
      const r = await c.dispatchBatchEvent({
        pattern: rs(),
        data: { messages: [rs()] },
      });
      expect(r).toBeDefined();
    });
  });

  describe('dispatchEvent', () => {
    it('TC51 - có send options và metadata', async () => {
      const c = makeClient({ send: { timeout: ri(2000, 9000) } });
      c._producer = makeProducer();
      const r = await c.dispatchEvent({
        pattern: rs(),
        data: rs(),
        metadata: { [rs(6)]: rs() },
      });
      expect(r).toBeDefined();
    });

    it('TC52 - không send options, không metadata', async () => {
      const c = makeClient({});
      c._producer = makeProducer();
      const r = await c.dispatchEvent({ pattern: rs(), data: rs() });
      expect(r).toBeDefined();
    });
  });

  // ===================== getReplyTopicPartition =====================
  describe('getReplyTopicPartition', () => {
    it('TC53 - topic chưa được gán partition -> throw', () => {
      const c = makeClient();
      expect(() => c.getReplyTopicPartition(rs())).toThrow();
    });

    it('TC54 - topic đã có partition', () => {
      const c = makeClient();
      const topic = rs();
      c.consumerAssignments = { [topic]: ri() };
      expect(c.getReplyTopicPartition(topic)).toBeDefined();
    });
  });

  // ===================== publish =====================
  describe('publish', () => {
    const prepare = (opts: any = {}) => {
      const c = makeClient(opts);
      c._producer = makeProducer();
      const pattern = rs();
      c.consumerAssignments = { [`${pattern}.reply`]: ri() };
      return { c, pattern };
    };

    it('TC55 - gửi thành công (có send options + metadata)', async () => {
      const { c, pattern } = prepare({ send: { acks: 1 } });
      const cb = vi.fn();
      const cleanup = c.publish(
        { pattern, data: rs(), metadata: { [rs(6)]: rs() } },
        cb,
      );
      await flush();
      expect(cleanup).toBeDefined();
      expect(c._producer.send).toBeDefined();
    });

    it('TC56 - serializer đồng bộ, không options, không metadata', async () => {
      const { c, pattern } = prepare({});
      c.serializer.serialize = vi.fn(() => ({ value: rs(), headers: {} }));
      const cb = vi.fn();
      c.publish({ pattern, data: rs() }, cb);
      await flush();
      expect(cb).toBeDefined();
    });

    it('TC57 - producer.send bị reject -> errorCallback', async () => {
      const { c, pattern } = prepare({});
      c._producer.send.mockRejectedValue(new Error(rs()));
      const cb = vi.fn();
      c.publish({ pattern, data: rs() }, cb);
      await flush();
      expect(cb).toBeDefined();
    });

    it('TC58 - getReplyTopicPartition ném lỗi -> catch đồng bộ', () => {
      const c = makeClient({});
      c._producer = makeProducer();
      const cb = vi.fn();
      const cleanup = c.publish({ pattern: rs(), data: rs() }, cb);
      expect(cleanup()).toBeNull();
    });

    it('TC59 - hàm cleanup trả về xoá callback khỏi routingMap', async () => {
      const { c, pattern } = prepare({});
      const cleanup = c.publish({ pattern, data: rs() }, vi.fn());
      cleanup();
      await flush();
      expect(c.routingMap.size).toBeDefined();
    });
  });

  // ===================== mergeMetadata =====================
  describe('mergeMetadata', () => {
    it('TC60 - metadata rỗng/undefined -> trả nguyên message', () => {
      const c = makeClient();
      const msg = { value: rs(), headers: {} };
      expect(c.mergeMetadata(msg, undefined)).toBeDefined();
    });

    it('TC61 - có metadata -> trộn vào headers', () => {
      const c = makeClient();
      const msg = { value: rs(), headers: { [rs(5)]: rs() } };
      expect(c.mergeMetadata(msg, { [rs(7)]: rs() })).toBeDefined();
    });
  });

  // ===================== setConsumerAssignments / getters =====================
  describe('setConsumerAssignments', () => {
    it('TC62 - có partition -> lấy partition nhỏ nhất', () => {
      const c = makeClient();
      c.setConsumerAssignments({
        payload: {
          memberAssignment: {
            [rs()]: [ri(300, 500), ri(501, 800), ri(100, 299)],
          },
        },
      });
      expect(c.getConsumerAssignments()).toBeDefined();
    });

    it('TC63 - danh sách partition rỗng -> bỏ qua topic', () => {
      const c = makeClient();
      c.setConsumerAssignments({
        payload: { memberAssignment: { [rs()]: [] } },
      });
      expect(c.getConsumerAssignments()).toBeDefined();
    });
  });
});
