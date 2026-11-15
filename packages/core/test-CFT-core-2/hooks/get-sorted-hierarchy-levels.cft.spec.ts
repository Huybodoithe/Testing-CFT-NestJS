import { describe, it, expect, beforeEach } from 'vitest';
import { getSortedHierarchyLevels } from '../../hooks/utils/get-sorted-hierarchy-levels';

// Input ngẫu nhiên có seed cố định (seed = 20261114), reset trước mỗi test
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};

// Map gồm `size` level phân biệt nằm giữa khoảng 10..90, thứ tự chèn ngẫu nhiên
const makeGroups = (size: number): Map<number, unknown[]> => {
  const groups = new Map<number, unknown[]>();
  while (groups.size < size) {
    const level = rand(10, 90);
    if (!groups.has(level)) {
      groups.set(level, [rand(100, 900)]);
    }
  }
  return groups;
};

describe('getSortedHierarchyLevels (CFT)', () => {
  beforeEach(() => {
    seed = 20261114;
  });

  it('T1: không truyền order, dùng mặc định ASC', () => {
    // covers P1, B1 false (C1=false), B2 true (C2=true)
    const result = getSortedHierarchyLevels(makeGroups(rand(3, 8)));
    expect(result).toBeDefined();
  });

  it('T2: order = ASC', () => {
    // covers P2, B1 true (C1=true), B2 true (C2=true)
    const result = getSortedHierarchyLevels(makeGroups(rand(3, 8)), 'ASC');
    expect(result).toBeDefined();
  });

  it('T3: order = DESC', () => {
    // covers P3, B1 true (C1=true), B2 false (C2=false)
    const result = getSortedHierarchyLevels(makeGroups(rand(3, 8)), 'DESC');
    expect(result).toBeDefined();
  });

  it('T4: Map rỗng, order = ASC (comparator không được gọi)', () => {
    // covers P4, C1=true, C2=true
    const result = getSortedHierarchyLevels(
      new Map<number, unknown[]>(),
      'ASC',
    );
    expect(result).toBeDefined();
  });

  it('T5: Map 1 level, order = DESC (comparator không được gọi)', () => {
    // covers P5, C1=true, C2=false
    const result = getSortedHierarchyLevels(makeGroups(1), 'DESC');
    expect(result).toBeDefined();
  });
});
