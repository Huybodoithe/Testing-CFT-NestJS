import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Module } from '../../injector/module';
import { TopologyTree } from '../../injector/topology-tree/topology-tree';

// Module giả tối giản: TopologyTree chỉ đọc thuộc tính `imports`
type MockModule = { imports?: Set<MockModule | null | undefined> };

// Input ngẫu nhiên có seed cố định (seed = 20261114), reset trước mỗi test
let seed = 20261114;
const rand = (min: number, max: number) => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};

const node = (): MockModule => ({ imports: new Set() });
const build = (root: MockModule) => new TopologyTree(root as unknown as Module);

describe('TopologyTree (CFT)', () => {
  beforeEach(() => {
    seed = 20261114;
  });

  describe('constructor + sortTopologically', () => {
    it('T1: root không có thuộc tính imports', () => {
      // covers P1, C1=true, C6=true
      const root: MockModule = {};
      expect(build(root)).toBeDefined();
    });

    it('T2: root có imports rỗng', () => {
      // covers P2, C1=false, C6=false
      expect(build(node())).toBeDefined();
    });

    it('T3: root import nhiều module thường', () => {
      // covers P3, C2=false, C3=false, C4=true, C5=true, C7=true, C8=true
      const root = node();
      const n = rand(2, 5);
      for (let i = 0; i < n; i++) {
        root.imports!.add(node());
      }
      expect(build(root)).toBeDefined();
    });

    it('T4: chuỗi import nhiều tầng, node cuối không có imports', () => {
      // covers P4, C1=true, C6=true ở module không phải root
      const length = rand(3, 7);
      const root = node();
      let current = root;
      for (let i = 0; i < length; i++) {
        const next = node();
        current.imports!.add(next);
        current = next;
      }
      current.imports = undefined;
      expect(build(root)).toBeDefined();
    });

    it('T5: imports chứa null và undefined', () => {
      // covers P5, C2=true (ngắn mạch), C7=false
      const root = node();
      root.imports!.add(null);
      root.imports!.add(undefined);
      const n = rand(1, 3);
      for (let i = 0; i < n; i++) {
        root.imports!.add(node());
      }
      expect(build(root)).toBeDefined();
    });

    it('T6: chu trình kiểu forwardRef', () => {
      // covers P6, C3=true, C8=false
      const length = rand(3, 6);
      const nodes = Array.from({ length }, node);
      for (let i = 0; i < length - 1; i++) {
        nodes[i].imports!.add(nodes[i + 1]);
      }
      nodes[length - 1].imports!.add(nodes[0]); // cạnh đóng chu trình
      expect(build(nodes[0])).toBeDefined();
    });

    it('T7: diamond, module chung được gặp lại ở cùng độ sâu', () => {
      // covers P7, C4=false, C5=false, C8=false
      const root = node();
      const shared = node();
      const middles = rand(2, 4);
      for (let i = 0; i < middles; i++) {
        const mid = node();
        mid.imports!.add(shared);
        root.imports!.add(mid);
      }
      expect(build(root)).toBeDefined();
    });

    it('T8: module chung được gặp lại ở độ sâu lớn hơn', () => {
      // covers P8, C4=false, C5=true (cập nhật depth)
      const root = node();
      const shared = node();
      const first = node();
      root.imports!.add(first); // thêm chuỗi trước để shared được gặp ở root trước
      root.imports!.add(shared);
      const k = rand(1, 4);
      let current = first;
      for (let i = 1; i < k; i++) {
        const next = node();
        current.imports!.add(next);
        current = next;
      }
      current.imports!.add(shared); // đường dài hơn tới shared
      expect(build(root)).toBeDefined();
    });
  });

  describe('walk', () => {
    it('T9: gọi callback cho các module đã có depth', () => {
      // covers P9
      const root = node();
      const n = rand(1, 4);
      for (let i = 0; i < n; i++) {
        root.imports!.add(node());
      }
      const callback = vi.fn();
      build(root).walk(callback);
      expect(callback).toHaveBeenCalled();
    });
  });
});
