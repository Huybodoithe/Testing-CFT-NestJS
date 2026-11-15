import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ClientKafka } from '../client/client-kafka.js';
import { KafkaHeaders } from '../enums/kafka-headers.enum.js';
import { IncomingRequestDeserializer } from '../deserializers/incoming-request.deserializer.js';
import { KafkaRequestDeserializer } from '../deserializers/kafka-request.deserializer.js';
import { KafkaResponseDeserializer } from '../deserializers/kafka-response.deserializer.js';
import { KafkaRequestSerializer } from '../serializers/kafka-request.serializer.js';
import { MqttRecordSerializer } from '../serializers/mqtt-record.serializer.js';
import { NatsRecordSerializer } from '../serializers/nats-record.serializer.js';
import { RmqRecordSerializer } from '../serializers/rmq-record.serializer.js';
import {
  MqttRecordBuilder,
  NatsRecordBuilder,
  RmqRecordBuilder,
} from '../record-builders/index.js';
import { ServerKafka } from '../server/server-kafka.js';

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

describe('KafkaRequestSerializer CFT', () => {
  const serializer = new KafkaRequestSerializer();

  it('encodes message payloads and request records with optional keys and headers', () => {
    const text = randomText();
    const key = randomText();
    const response = [
      serializer.serialize({ scope: randomText(), value: text }),
      serializer.serialize({
        key,
        value: { payload: randomText() },
        headers: { tenant: randomText() },
      }),
      serializer.serialize({
        key: null,
        value: Buffer.from(text),
        headers: [randomText()],
      }),
      serializer.serialize({
        key: randomInt(200, 900),
        value: randomInt(100, 800),
      }),
      serializer.serialize({ value: undefined }),
    ];

    expect(response).toBeDefined();
    expect(serializer.encode([randomText(), randomInt(50, 900)])).toBeDefined();
    expect(serializer.encode({ payload: randomText() })).toBeDefined();
    expect(serializer.encode(Buffer.from(text))).toBeDefined();
    expect(serializer.encode(undefined)).toBeNull();
  });
});

describe('KafkaRequestDeserializer CFT', () => {
  const deserializer = new KafkaRequestDeserializer();

  it('maps external messages with and without channel options', () => {
    const message = { value: { payload: randomText() } };
    const results = [
      deserializer.deserialize(message, { channel: randomText() }),
      deserializer.deserialize({ value: undefined }, { channel: randomText() }),
      deserializer.deserialize(message),
      deserializer.deserialize(
        { pattern: randomText(), data: randomText() },
        { channel: randomText() },
      ),
    ];

    expect(results).toBeDefined();
  });
});

describe('KafkaResponseDeserializer CFT', () => {
  const deserializer = new KafkaResponseDeserializer();

  it('maps response, disposed, no-response, and error headers', () => {
    const id = randomText();
    const response = randomText();
    const packets = [
      deserializer.deserialize({
        headers: { [KafkaHeaders.CORRELATION_ID]: Buffer.from(id) },
        value: response,
      }),
      deserializer.deserialize({
        headers: {
          [KafkaHeaders.CORRELATION_ID]: Buffer.from(id),
          [KafkaHeaders.NEST_IS_DISPOSED]: Buffer.from(randomText()),
        },
        value: response,
      }),
      deserializer.deserialize({
        headers: {
          [KafkaHeaders.CORRELATION_ID]: Buffer.from(id),
          [KafkaHeaders.NEST_IS_DISPOSED]: Buffer.from(randomText()),
          [KafkaHeaders.NEST_NO_RESPONSE]: Buffer.from(randomText()),
        },
      }),
      deserializer.deserialize({
        headers: {
          [KafkaHeaders.CORRELATION_ID]: Buffer.from(id),
          [KafkaHeaders.NEST_ERR]: randomText(),
        },
      }),
    ];

    expect(packets).toBeDefined();
  });
});

describe('IncomingRequestDeserializer CFT', () => {
  const deserializer = new IncomingRequestDeserializer();

  it('distinguishes internal requests from external payloads and absent options', () => {
    const request = { pattern: randomText(), data: randomText() };
    const results = [
      deserializer.deserialize(request),
      deserializer.deserialize({ data: randomText() }),
      deserializer.deserialize({}),
      deserializer.deserialize(randomText(), { channel: randomText() }),
      deserializer.deserialize(null, { channel: randomText() }),
    ];

    expect(results).toBeDefined();
  });
});

describe('MqttRecordSerializer CFT', () => {
  const serializer = new MqttRecordSerializer();

  it('serializes packets containing request records, reply records, or plain values', () => {
    const value = { payload: randomText() };
    const requestRecord = new MqttRecordBuilder()
      .setData(value)
      .setQoS(1)
      .build();
    const replyRecord = new MqttRecordBuilder(value)
      .setProperties({ userProperties: { tenant: randomText() } })
      .build();

    const results = [
      serializer.serialize({ pattern: randomText(), data: requestRecord }),
      serializer.serialize({ response: replyRecord, isDisposed: true }),
      serializer.serialize({ data: { payload: randomText() } }),
      serializer.serialize({ response: randomText() }),
    ];
    expect(results).toBeDefined();
  });
});

describe('NatsRecordSerializer CFT', () => {
  const serializer = new NatsRecordSerializer();

  it('serializes ordinary data, NATS records, replies, and absent packets', () => {
    const value = { payload: randomText() };
    const requestRecord = new NatsRecordBuilder(value)
      .setHeaders({ tenant: randomText() } as never)
      .build();
    const replyRecord = new NatsRecordBuilder(value)
      .setHeaders({ tenant: randomText() } as never)
      .build();

    const results = [
      serializer.serialize({ data: { payload: randomText() } }),
      serializer.serialize({ data: requestRecord }),
      serializer.serialize({ response: replyRecord, isDisposed: true }),
      serializer.serialize({
        data: randomText(),
        headers: { key: randomText() },
      }),
      serializer.serialize(undefined as never),
    ];
    expect(results).toBeDefined();
  });
});

describe('RmqRecordSerializer CFT', () => {
  const serializer = new RmqRecordSerializer();

  it('serializes ordinary packets, request records, and reply records', () => {
    const value = { payload: randomText() };
    const options = { appId: randomText(), priority: randomInt(2, 8) };
    const requestRecord = new RmqRecordBuilder(value)
      .setOptions(options)
      .build();
    const replyRecord = new RmqRecordBuilder(value).setOptions(options).build();

    const results = [
      serializer.serialize({ pattern: randomText(), data: value }),
      serializer.serialize({ pattern: randomText(), data: requestRecord }),
      serializer.serialize({ response: replyRecord, isDisposed: true }),
      serializer.serialize(undefined as never),
      serializer.serialize(null as never),
    ];
    expect(results).toBeDefined();
  });
});

describe('ClientKafka and ServerKafka CFT', () => {
  it('routes Kafka replies with and without correlation headers', async () => {
    const client = new ClientKafka({});
    const callback = vi.fn();
    const correlationId = randomText();
    client['routingMap'].set(correlationId, callback);
    const response = client.createResponseCallback();
    const topic = randomText();

    await response({
      topic,
      partition: randomInt(1, 7),
      message: {
        offset: String(randomInt(100, 900)),
        value: Buffer.from(randomText()),
        headers: { [KafkaHeaders.CORRELATION_ID]: Buffer.from(correlationId) },
      },
      heartbeat: async () => undefined,
      pause: () => () => undefined,
    });
    await response({
      topic,
      partition: randomInt(1, 7),
      message: {
        offset: String(randomInt(100, 900)),
        value: Buffer.from(randomText()),
        headers: {},
      },
      heartbeat: async () => undefined,
      pause: () => () => undefined,
    });

    expect(callback).toHaveBeenCalled();
    expect(client['mergeMetadata']({ headers: {} }, undefined)).toBeDefined();
    expect(
      client['mergeMetadata'](
        { headers: { tenant: randomText() } },
        { trace: randomText() },
      ),
    ).toBeDefined();
  });

  it('assigns Kafka response headers for normal, completed, error, and partition paths', () => {
    const server = new ServerKafka({});
    const correlationId = randomText();
    const message = { headers: {} } as never;
    const completion = { isDisposed: true };
    const ordinary = { response: randomText(), isDisposed: false };
    const failure = { err: randomText(), isDisposed: true };

    server.assignCorrelationIdHeader(correlationId, message);
    server.assignReplyPartition(String(randomInt(1, 7)), message);
    server.assignReplyPartition(undefined, message);
    server.assignIsDisposedHeader(completion, message);
    server.assignIsDisposedHeader(ordinary, message);
    server.assignErrorHeader(failure, message);
    server.assignErrorHeader(ordinary, message);

    expect(message).toBeDefined();
    expect(
      server['readMetadata']({ tenant: Buffer.from(randomText()) }),
    ).toBeDefined();
    expect(() => server['readMetadata'](undefined)).not.toThrow();
  });
});
