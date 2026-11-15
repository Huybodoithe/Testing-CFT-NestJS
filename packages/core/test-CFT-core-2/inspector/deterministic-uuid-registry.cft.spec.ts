import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicUuidRegistry } from '../../inspector/deterministic-uuid-registry.js';

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

// Chuỗi ngẫu nhiên gồm chữ thường, độ dài nằm giữa lớp tương đương
const randStr = (len: number): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
  return s;
};

describe('DeterministicUuidRegistry (CFT)', () => {
  beforeEach(() => {
    state = SEED;
    // registry là static, dùng chung giữa các test nên phải xóa
    DeterministicUuidRegistry.clear();
  });

  it('T1: get lần đầu với chuỗi mới', () => {
    // covers P1, C1=true (inc mặc định), C2=false, C3=false, C4=true (loop >= 1 lần)
    expect(
      DeterministicUuidRegistry.get(randStr(randInt(5, 12))),
    ).toBeDefined();
  });

  it('T2: get lần hai cùng chuỗi (id đã tồn tại)', () => {
    // covers P2, C3=true (lần ngoài), đệ quy inc+1: C1=false, C2=true
    const str = randStr(randInt(5, 12));
    DeterministicUuidRegistry.get(str);
    expect(DeterministicUuidRegistry.get(str)).toBeDefined();
  });

  it('T3: get với inc truyền vào bằng 0', () => {
    // covers P3, C1=false, C2=false
    expect(DeterministicUuidRegistry.get(randStr(8), 0)).toBeDefined();
  });

  it('T4: get với inc truyền vào khác 0', () => {
    // covers P4, C1=false, C2=true
    expect(
      DeterministicUuidRegistry.get(randStr(8), randInt(2, 9)),
    ).toBeDefined();
  });

  it('T5: clear() rồi get lại cùng chuỗi', () => {
    // covers P5
    const str = randStr(randInt(5, 12));
    DeterministicUuidRegistry.get(str);
    expect(() => DeterministicUuidRegistry.clear()).not.toThrow();
    expect(DeterministicUuidRegistry.get(str)).toBeDefined();
  });

  it('T6: get với chuỗi rỗng (vòng for 0 lần lặp)', () => {
    // covers P6, C4=false ngay từ đầu.
    // Chuỗi rỗng là giá trị biên, nhưng là cách duy nhất để vòng for chạy 0 lần.
    expect(DeterministicUuidRegistry.get('')).toBeDefined();
  });

  it('T7: get ba lần cùng chuỗi (đệ quy nhiều tầng)', () => {
    // covers P7, C3=true hai lần liên tiếp
    const str = randStr(randInt(5, 12));
    DeterministicUuidRegistry.get(str);
    DeterministicUuidRegistry.get(str);
    expect(DeterministicUuidRegistry.get(str)).toBeDefined();
  });
});
