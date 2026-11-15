import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInstancesGroupedByHierarchyLevel } from '../../hooks/utils/get-instances-grouped-by-hierarchy-level.js';

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

// Level nằm giữa lớp tương đương (không dùng 0, 1 hoặc giá trị biên)
const randLevel = () => randInt(3, 40);

interface WrapperOpts {
  level: number;
  isStatic?: boolean;
  transient?: boolean;
  instance?: unknown;
  transientInstances?: unknown[];
}

// Wrapper giả tối giản: chỉ có các thành viên mà file nguồn dùng
const makeWrapper = (o: WrapperOpts) =>
  ({
    isDependencyTreeStatic: vi.fn(() => o.isStatic ?? true),
    hierarchyLevel: o.level,
    isTransient: o.transient ?? false,
    instance: o.instance,
    getStaticTransientInstances: vi.fn(() => o.transientInstances ?? []),
  }) as any;

describe('getInstancesGroupedByHierarchyLevel (CFT)', () => {
  beforeEach(() => {
    state = SEED;
    vi.clearAllMocks();
  });

  it('T1: không truyền collection nào', () => {
    // covers P0a, B1=false
    const result = getInstancesGroupedByHierarchyLevel();
    expect(result).toBeDefined();
  });

  it('T2: một collection rỗng', () => {
    // covers P0b, B1=true, B2=false
    const result = getInstancesGroupedByHierarchyLevel(new Map());
    expect(result).toBeDefined();
  });

  it('T3: wrapper không static', () => {
    // covers P1, C1=true
    const w = makeWrapper({
      level: randLevel(),
      isStatic: false,
      instance: { id: randInt(100, 900) },
    });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map([['TOKEN_A', w]]),
    );
    expect(result).toBeDefined();
    expect(w.isDependencyTreeStatic).toHaveBeenCalled();
  });

  it('T4: wrapper transient, level mới, danh sách có phần tử rỗng', () => {
    // covers P2, C1=false, C2=true, C3=true, C4=true/false
    const w = makeWrapper({
      level: randLevel(),
      transient: true,
      transientInstances: [
        { instance: { id: randInt(100, 900) } },
        undefined,
        null,
        { instance: { id: randInt(100, 900) } },
      ],
    });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map([['TOKEN_B', w]]),
    );
    expect(result).toBeDefined();
    expect(w.getStaticTransientInstances).toHaveBeenCalled();
  });

  it('T5: wrapper transient, level đã có', () => {
    // covers P4 (wrapper đầu tạo level), P3, C2=false, C3=true
    const level = randLevel();
    const first = makeWrapper({ level, instance: { id: randInt(100, 900) } });
    const second = makeWrapper({
      level,
      transient: true,
      transientInstances: [{ instance: { id: randInt(100, 900) } }],
    });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map<string, any>([
        ['TOKEN_C1', first],
        ['TOKEN_C2', second],
      ]),
    );
    expect(result).toBeDefined();
    expect(second.getStaticTransientInstances).toHaveBeenCalled();
  });

  it('T6: không transient, level mới, có instance', () => {
    // covers P4, C2=true, C3=false, C5=true
    const w = makeWrapper({
      level: randLevel(),
      instance: { id: randInt(100, 900) },
    });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map([['TOKEN_D', w]]),
    );
    expect(result).toBeDefined();
  });

  it('T7: không transient, level đã có, có instance', () => {
    // covers P5, C2=false, C5=true
    const level = randLevel();
    const a = makeWrapper({ level, instance: { id: randInt(100, 900) } });
    const b = makeWrapper({ level, instance: { id: randInt(100, 900) } });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map<string, any>([
        ['TOKEN_E1', a],
        ['TOKEN_E2', b],
      ]),
    );
    expect(result).toBeDefined();
  });

  it('T8: không transient, level mới, không có instance', () => {
    // covers P6, C2=true, C5=false
    const w = makeWrapper({ level: randLevel(), instance: undefined });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map([['TOKEN_F', w]]),
    );
    expect(result).toBeDefined();
  });

  it('T9: không transient, level đã có, không có instance', () => {
    // covers P7, C2=false, C5=false
    const level = randLevel();
    const a = makeWrapper({ level, instance: { id: randInt(100, 900) } });
    const b = makeWrapper({ level, instance: undefined });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map<string, any>([
        ['TOKEN_G1', a],
        ['TOKEN_G2', b],
      ]),
    );
    expect(result).toBeDefined();
  });

  it('T10: nhiều collection (Map và mảng), nhiều wrapper', () => {
    // covers P8, B1=true (nhiều lần), B2=true (nhiều lần)
    const m1 = makeWrapper({
      level: randLevel(),
      instance: { id: randInt(100, 900) },
    });
    const m2 = makeWrapper({ level: randLevel(), isStatic: false });
    const a1 = makeWrapper({
      level: randLevel(),
      transient: true,
      transientInstances: [{ instance: { id: randInt(100, 900) } }],
    });
    const a2 = makeWrapper({
      level: randLevel(),
      instance: { id: randInt(100, 900) },
    });
    const result = getInstancesGroupedByHierarchyLevel(
      new Map<string, any>([
        ['TOKEN_H1', m1],
        ['TOKEN_H2', m2],
      ]),
      [
        ['TOKEN_H3', a1],
        ['TOKEN_H4', a2],
      ] as Array<[string, any]>,
    );
    expect(result).toBeDefined();
  });
});
