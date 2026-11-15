import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callModuleBootstrapHook } from '../../hooks/on-app-bootstrap.hook.js';
import { getInstancesGroupedByHierarchyLevel } from '../../hooks/utils/get-instances-grouped-by-hierarchy-level.js';
import { getSortedHierarchyLevels } from '../../hooks/utils/get-sorted-hierarchy-levels.js';

vi.mock(
  '../../hooks/utils/get-instances-grouped-by-hierarchy-level.js',
  () => ({
    getInstancesGroupedByHierarchyLevel: vi.fn(),
  }),
);
vi.mock('../../hooks/utils/get-sorted-hierarchy-levels.js', () => ({
  getSortedHierarchyLevels: vi.fn(),
}));

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

// Wrapper của module class: instance + isDependencyTreeStatic()
const makeHost = (instance: unknown, isStatic = true) => ({
  instance,
  isDependencyTreeStatic: vi.fn(() => isStatic),
});

// moduleRef giả. getNonAliasProviders trả mảng mới mỗi lần vì code gọi shift()
const makeModuleRef = (host: unknown) =>
  ({
    getNonAliasProviders: vi.fn(() => [['ModuleClass', host]]),
    controllers: new Map(),
    injectables: new Map(),
    middlewares: new Map(),
  }) as any;

// Điều khiển kết quả của hai helper; danh sách level lấy từ key của Map
const setupLevels = (grouped: Map<number, unknown[]>) => {
  vi.mocked(getInstancesGroupedByHierarchyLevel).mockReturnValue(
    grouped as any,
  );
  vi.mocked(getSortedHierarchyLevels).mockReturnValue([
    ...grouped.keys(),
  ] as any);
};

describe('callModuleBootstrapHook (CFT)', () => {
  beforeEach(() => {
    state = SEED;
    vi.resetAllMocks();
  });

  it('T1: levels rỗng, instance của module là undefined', async () => {
    // covers P1, B1=false, C3=false
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
  });

  it('T2: instance của module không có onApplicationBootstrap', async () => {
    // covers P2, C3=true, C4=false
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost({ id: randInt(100, 900) }));
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
  });

  it('T3: module có hook nhưng dependency tree không static', async () => {
    // covers P3, C3=true, C4=true, C5=false
    const hook = vi.fn();
    setupLevels(new Map());
    const host = makeHost({ onApplicationBootstrap: hook }, false);
    const ref = makeModuleRef(host);
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
    expect(host.isDependencyTreeStatic).toHaveBeenCalled();
  });

  it('T4: module có hook và dependency tree static', async () => {
    // covers P4, C3=true, C4=true, C5=true
    const hook = vi.fn();
    setupLevels(new Map());
    const host = makeHost({ onApplicationBootstrap: hook }, true);
    const ref = makeModuleRef(host);
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
    expect(hook).toHaveBeenCalled();
  });

  it('T5: level chứa null và undefined', async () => {
    // covers P5, B1=true, C1=false
    setupLevels(new Map([[randLevel(), [null, undefined]]]));
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
  });

  it('T6: level chứa phần tử không có hook hợp lệ', async () => {
    // covers P6, C1=true, C2=false
    setupLevels(
      new Map([
        [
          randLevel(),
          [
            { id: randInt(100, 900) },
            { onApplicationBootstrap: 'not-a-function' },
          ],
        ],
      ]),
    );
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
  });

  it('T7: level chứa phần tử có hook dạng function', async () => {
    // covers P7, C1=true, C2=true
    const hook = vi.fn();
    setupLevels(new Map([[randLevel(), [{ onApplicationBootstrap: hook }]]]));
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
    expect(hook).toHaveBeenCalled();
  });

  it('T8: nhiều level, nhiều phần tử trộn lẫn', async () => {
    // covers P8, B1=true (nhiều lần), C1=true/false, C2=true/false
    const hookA = vi.fn();
    const hookB = vi.fn();
    const levelA = randLevel();
    const levelB = levelA + randInt(1, 10);
    setupLevels(
      new Map<number, unknown[]>([
        [levelA, [{ onApplicationBootstrap: hookA }, null]],
        [
          levelB,
          [{ id: randInt(100, 900) }, { onApplicationBootstrap: hookB }],
        ],
      ]),
    );
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleBootstrapHook(ref)).resolves.toBeUndefined();
    expect(hookA).toHaveBeenCalled();
    expect(hookB).toHaveBeenCalled();
  });
});
