import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { callAppShutdownHook } from '../../hooks/on-app-shutdown.hook.js';
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
const pickSignal = () => ['SIGTERM', 'SIGINT', 'SIGHUP'][randInt(0, 2)];

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

describe('callAppShutdownHook (CFT)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    state = SEED;
    vi.resetAllMocks();
    logSpy = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
  });

  it('T1: levels rỗng, instance của module là undefined', async () => {
    // covers P1, B1=false, C5=false
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
  });

  it('T2: instance của module không có onApplicationShutdown', async () => {
    // covers P2, C5=true, C6=false
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost({ id: randInt(100, 900) }));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
  });

  it('T3: module có hook nhưng dependency tree không static', async () => {
    // covers P3, C5=true, C6=true, C7=false
    const hook = vi.fn();
    setupLevels(new Map());
    const host = makeHost({ onApplicationShutdown: hook }, false);
    const ref = makeModuleRef(host);
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(host.isDependencyTreeStatic).toHaveBeenCalled();
  });

  it('T4: module có hook, static, hook thành công', async () => {
    // covers P4, C5=true, C6=true, C7=true, B7=try thành công
    const hook = vi.fn().mockResolvedValue(undefined);
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost({ onApplicationShutdown: hook }, true));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(hook).toHaveBeenCalled();
  });

  it('T5: hook của module ném Error', async () => {
    // covers P5, B7=catch, C8=true
    const hook = vi.fn().mockRejectedValue(new Error('shutdown fail'));
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost({ onApplicationShutdown: hook }, true));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });

  it('T6: hook của module ném giá trị undefined', async () => {
    // covers P6, B7=catch, C8=false
    const hook = vi.fn().mockRejectedValue(undefined);
    setupLevels(new Map());
    const ref = makeModuleRef(makeHost({ onApplicationShutdown: hook }, true));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });

  it('T7: level chứa null và undefined', async () => {
    // covers P7, B1=true, C1=false
    setupLevels(new Map([[randLevel(), [null, undefined]]]));
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
  });

  it('T8: level chứa phần tử không có hook hợp lệ', async () => {
    // covers P8, C1=true, C2=false
    setupLevels(
      new Map([
        [
          randLevel(),
          [
            { id: randInt(100, 900) },
            { onApplicationShutdown: 'not-a-function' },
          ],
        ],
      ]),
    );
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
  });

  it('T9: hook của provider chạy thành công', async () => {
    // covers P9, C2=true, C3=false
    const hook = vi.fn().mockResolvedValue(undefined);
    setupLevels(new Map([[randLevel(), [{ onApplicationShutdown: hook }]]]));
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(hook).toHaveBeenCalled();
  });

  it('T10: hook của provider reject bằng Error', async () => {
    // covers P10, C3=true, C4=true
    const hook = vi.fn().mockRejectedValue(new Error('provider fail'));
    setupLevels(new Map([[randLevel(), [{ onApplicationShutdown: hook }]]]));
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });

  it('T11: hook của provider reject bằng undefined', async () => {
    // covers P11, C3=true, C4=false
    const hook = vi.fn().mockRejectedValue(undefined);
    setupLevels(new Map([[randLevel(), [{ onApplicationShutdown: hook }]]]));
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });

  it('T12: nhiều level, nhiều phần tử trộn lẫn', async () => {
    // covers P12, B1=true (nhiều lần), C1=true/false, C2=true/false, C3=true/false
    const hookOk = vi.fn().mockResolvedValue(undefined);
    const hookFail = vi.fn().mockRejectedValue(new Error('mixed fail'));
    const levelA = randLevel();
    const levelB = levelA + randInt(1, 10);
    setupLevels(
      new Map<number, unknown[]>([
        [levelA, [{ onApplicationShutdown: hookOk }, null]],
        [
          levelB,
          [{ id: randInt(100, 900) }, { onApplicationShutdown: hookFail }],
        ],
      ]),
    );
    const ref = makeModuleRef(makeHost(undefined));
    await expect(
      callAppShutdownHook(ref, pickSignal()),
    ).resolves.toBeUndefined();
    expect(hookOk).toHaveBeenCalled();
    expect(hookFail).toHaveBeenCalled();
  });
});
