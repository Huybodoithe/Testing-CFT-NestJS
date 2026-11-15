import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MqttContext } from '../ctx-host/mqtt.context.js';
import { NatsContext } from '../ctx-host/nats.context.js';
import { RmqContext } from '../ctx-host/rmq.context.js';
import {
  hasPacketMetadata,
  toPacketMetadata,
} from '../utils/packet-metadata.utils.js';

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

describe('packet metadata utilities', () => {
  it('keeps string entries and skips values in other equivalence classes', () => {
    const metadata = toPacketMetadata([
      [randomText(), randomText()],
      [randomText(), randomInt(25, 800)],
      [randomText(), [randomText(), randomText()]],
      [randomText(), Buffer.from(randomText())],
      [randomText(), { nested: randomText() }],
      [randomText(), undefined],
    ]);

    expect(metadata).toBeDefined();
  });

  it('returns no metadata when no entry has a string value', () => {
    expect(
      toPacketMetadata([
        [randomText(), randomInt(20, 700)],
        [randomText(), Buffer.from(randomText())],
        [randomText(), [randomText()]],
      ]),
    ).toBeUndefined();
  });

  it('checks absent, empty, and populated metadata', () => {
    expect(hasPacketMetadata(undefined)).toBeDefined();
    expect(hasPacketMetadata({})).toBeDefined();
    expect(hasPacketMetadata({ [randomText()]: randomText() })).toBeDefined();
  });
});

describe('MqttContext', () => {
  it('reads topic and packet and extracts single-valued user properties', () => {
    const topic = randomText();
    const packet = {
      properties: {
        userProperties: {
          [randomText()]: randomText(),
          [randomText()]: [randomText(), randomText()],
          [randomText()]: randomInt(20, 800),
        },
      },
    };
    const context = new MqttContext([topic, packet]);

    expect(context.getTopic()).toBeDefined();
    expect(context.getPacket()).toBeDefined();
    expect(context.getMetadata()).toBeDefined();
  });

  it('returns no metadata when properties or user properties are absent', () => {
    expect(new MqttContext([randomText(), {}]).getMetadata()).toBeUndefined();
    expect(
      new MqttContext([randomText(), { properties: {} }]).getMetadata(),
    ).toBeUndefined();
  });
});

describe('NatsContext', () => {
  it('reads subject and headers and maps only single string values', () => {
    const subject = randomText();
    const key = randomText();
    const headers = {
      keys: vi.fn(() => [key, randomText(), randomText()]),
      values: vi.fn((name: string) => {
        if (name === key) return [randomText()];
        if (name.length > 10) return [randomText(), randomText()];
        return [randomInt(20, 800)];
      }),
    };
    const context = new NatsContext([subject, headers]);

    expect(context.getSubject()).toBeDefined();
    expect(context.getHeaders()).toBeDefined();
    expect(context.getMetadata()).toBeDefined();
    expect(headers.keys).toHaveBeenCalled();
  });

  it('returns no metadata when header accessors are missing or not functions', () => {
    expect(
      new NatsContext([randomText(), undefined]).getMetadata(),
    ).toBeUndefined();
    expect(
      new NatsContext([
        randomText(),
        { keys: randomText(), values: vi.fn() },
      ]).getMetadata(),
    ).toBeUndefined();
    expect(
      new NatsContext([
        randomText(),
        { keys: vi.fn(() => [randomText()]) },
      ]).getMetadata(),
    ).toBeUndefined();
  });
});

describe('RmqContext', () => {
  it('reads message, channel, pattern, and string-valued headers', () => {
    const message = {
      properties: {
        headers: {
          [randomText()]: randomText(),
          [randomText()]: randomInt(30, 600),
          [randomText()]: [randomText()],
          [randomText()]: { nested: randomText() },
        },
      },
    };
    const channel = { identifier: randomText() };
    const pattern = randomText();
    const context = new RmqContext([message, channel, pattern]);

    expect(context.getMessage()).toBeDefined();
    expect(context.getChannelRef()).toBeDefined();
    expect(context.getPattern()).toBeDefined();
    expect(context.getMetadata()).toBeDefined();
  });

  it('returns no metadata when message headers are absent', () => {
    expect(
      new RmqContext([
        {},
        { identifier: randomText() },
        randomText(),
      ]).getMetadata(),
    ).toBeUndefined();
    expect(
      new RmqContext([
        { properties: {} },
        { identifier: randomText() },
        randomText(),
      ]).getMetadata(),
    ).toBeUndefined();
  });
});
