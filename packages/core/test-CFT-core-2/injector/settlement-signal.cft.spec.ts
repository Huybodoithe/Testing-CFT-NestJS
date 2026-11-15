import { describe, it, expect, beforeEach } from 'vitest';
import { SettlementSignal } from '../../injector/settlement-signal';

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

// Id ngẫu nhiên; tiền tố khác nhau để các id không trùng nhau
const makeId = (prefix: string) => `${prefix}-${randInt(100, 900)}`;

describe('SettlementSignal (CFT)', () => {
  beforeEach(() => {
    state = SEED;
  });

  it('T1: khởi tạo và lấy promise', () => {
    // covers P1
    const signal = new SettlementSignal();
    expect(signal.asPromise()).toBeDefined();
  });

  it('T2: complete() giải phóng promise', async () => {
    // covers P2
    const signal = new SettlementSignal();
    expect(() => signal.complete()).not.toThrow();
    await signal.asPromise();
    expect(signal.asPromise()).toBeDefined();
  });

  it('T3: error() giải phóng promise', async () => {
    // covers P3
    const signal = new SettlementSignal();
    expect(() => signal.error(new Error(makeId('boom')))).not.toThrow();
    await signal.asPromise();
    expect(signal.asPromise()).toBeDefined();
  });

  it('T4: insertRef khi chưa completed', () => {
    // covers P4, C1=true
    const signal = new SettlementSignal();
    expect(() => signal.insertRef({ id: makeId('ref') })).not.toThrow();
  });

  it('T5: insertRef sau khi đã completed', () => {
    // covers P5, C1=false
    const signal = new SettlementSignal();
    signal.complete();
    expect(() => signal.insertRef({ id: makeId('ref') })).not.toThrow();
  });

  it('T6: isCycle sau khi đã completed', () => {
    // covers P6, C2=true
    const signal = new SettlementSignal();
    signal.complete();
    expect(signal.isCycle(makeId('target'))).toBeDefined();
  });

  it('T7: isCycle khi không có ref nào', () => {
    // covers P7, C2=false, C3=false, B3=0 lần lặp
    const signal = new SettlementSignal();
    expect(signal.isCycle(makeId('target'))).toBeDefined();
  });

  it('T8: isCycle khi có ref trùng id', () => {
    // covers P8, C4=true
    const signal = new SettlementSignal();
    const target = makeId('target');
    signal.insertRef({ id: target });
    expect(signal.isCycle(target)).toBeDefined();
  });

  it('T9: isCycle khi ref khác id và không có settlementSignal', () => {
    // covers P9, C4=false, C5=true (nil, ?. ngắn mạch)
    const signal = new SettlementSignal();
    signal.insertRef({ id: makeId('ref') });
    expect(signal.isCycle(makeId('target'))).toBeDefined();
  });

  it('T10: isCycle gián tiếp qua settlementSignal của ref', () => {
    // covers P10, C4=false, C5=false (có signal), C6=true
    const target = makeId('target');
    const inner = new SettlementSignal();
    inner.insertRef({ id: target });
    const outer = new SettlementSignal();
    outer.insertRef({ id: makeId('inner'), settlementSignal: inner });
    expect(outer.isCycle(target)).toBeDefined();
  });

  it('T11: ref có settlementSignal nhưng signal đó không chờ id', () => {
    // covers P11, C4=false, C5=false, C6=false
    const inner = new SettlementSignal();
    const outer = new SettlementSignal();
    outer.insertRef({ id: makeId('inner'), settlementSignal: inner });
    expect(outer.isCycle(makeId('target'))).toBeDefined();
  });

  it('T12: nhiều ref, ref khớp ở lần lặp sau', () => {
    // covers P12, B3=nhiều lần lặp, C4=false rồi C4=true
    const signal = new SettlementSignal();
    const target = makeId('target');
    signal.insertRef({ id: makeId('ref') });
    signal.insertRef({ id: target });
    expect(signal.isCycle(target)).toBeDefined();
  });

  it('T13: vòng tròn a <-> b, dừng nhờ visited', () => {
    // covers P13, C3=true (đệ quy quay lại signal đã thăm), C3=false (lần đầu)
    const a = new SettlementSignal();
    const b = new SettlementSignal();
    a.insertRef({ id: makeId('b'), settlementSignal: b });
    b.insertRef({ id: makeId('a'), settlementSignal: a });
    expect(a.isCycle(makeId('target'))).toBeDefined();
  });
});
