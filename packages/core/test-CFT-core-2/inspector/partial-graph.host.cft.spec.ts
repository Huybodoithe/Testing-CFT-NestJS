import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartialGraphHost } from '../../inspector/partial-graph.host.js';

// PRNG có seed cố định (mulberry32), reset trong beforeEach
const SEED = 20261114;
let state = SEED;
const rand = (): number => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number): number =>
  Math.floor(rand() * (max - min + 1)) + min;

// SerializedGraph giả: chỉ có hai method mà file nguồn gọi
const makeGraph = (id: number) =>
  ({
    toJSON: vi.fn(() => ({ id })),
    toString: vi.fn(() => `graph-${id}`),
  }) as any;

describe('PartialGraphHost (CFT)', () => {
  beforeEach(() => {
    state = SEED;
    // partialGraph là static, dùng chung giữa các test nên phải đưa về chưa đăng ký
    PartialGraphHost.register(undefined as any);
  });

  it('T1: toJSON khi chưa đăng ký graph', () => {
    // covers P1, C1=true (partialGraph nil, ?. ngắn mạch)
    expect(() => PartialGraphHost.toJSON()).not.toThrow();
  });

  it('T2: toJSON sau khi đăng ký graph', () => {
    // covers P2, C1=false
    const graph = makeGraph(randInt(100, 900));
    PartialGraphHost.register(graph);
    expect(PartialGraphHost.toJSON()).toBeDefined();
    expect(graph.toJSON).toHaveBeenCalled();
  });

  it('T3: toString khi chưa đăng ký graph', () => {
    // covers P3, C2=true (partialGraph nil, ?. ngắn mạch)
    expect(() => PartialGraphHost.toString()).not.toThrow();
  });

  it('T4: toString sau khi đăng ký graph', () => {
    // covers P4, C2=false
    const graph = makeGraph(randInt(100, 900));
    PartialGraphHost.register(graph);
    expect(PartialGraphHost.toString()).toBeDefined();
    expect(graph.toString).toHaveBeenCalled();
  });

  it('T5: register graph', () => {
    // covers P5
    expect(() =>
      PartialGraphHost.register(makeGraph(randInt(100, 900))),
    ).not.toThrow();
  });
});
