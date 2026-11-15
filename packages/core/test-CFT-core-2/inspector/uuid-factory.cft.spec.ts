import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UuidFactory, UuidFactoryMode } from '../../inspector/uuid-factory.js';
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

const makeKey = () => `key-${randInt(100, 900)}`;

describe('UuidFactory (CFT)', () => {
  beforeEach(() => {
    state = SEED;
    vi.restoreAllMocks();
    // _mode và registry là static, dùng chung giữa các test nên phải đưa về mặc định
    UuidFactory.mode = UuidFactoryMode.Random;
    DeterministicUuidRegistry.clear();
  });

  it('T1: đặt mode Deterministic rồi Random', () => {
    // covers P1 (setter)
    expect(() => {
      UuidFactory.mode = UuidFactoryMode.Deterministic;
    }).not.toThrow();
    expect(() => {
      UuidFactory.mode = UuidFactoryMode.Random;
    }).not.toThrow();
  });

  it('T2: mode Random, không truyền key', () => {
    // covers P2, C1=true (key mặc định), C2=false
    expect(UuidFactory.get()).toBeDefined();
  });

  it('T3: mode Random, truyền key', () => {
    // covers P3, C1=false, C2=false
    expect(UuidFactory.get(makeKey())).toBeDefined();
  });

  it('T4: mode Deterministic, truyền key', () => {
    // covers P4, C1=false, C2=true
    // spyOn mặc định gọi qua hàm thật; chỉ dùng để xác nhận nhánh Deterministic được đi tới
    const spy = vi.spyOn(DeterministicUuidRegistry, 'get');
    UuidFactory.mode = UuidFactoryMode.Deterministic;
    expect(UuidFactory.get(makeKey())).toBeDefined();
    expect(spy).toHaveBeenCalled();
  });

  it('T5: mode Deterministic, không truyền key', () => {
    // covers P5, C1=true, C2=true
    const spy = vi.spyOn(DeterministicUuidRegistry, 'get');
    UuidFactory.mode = UuidFactoryMode.Deterministic;
    expect(UuidFactory.get()).toBeDefined();
    expect(spy).toHaveBeenCalled();
  });
});
