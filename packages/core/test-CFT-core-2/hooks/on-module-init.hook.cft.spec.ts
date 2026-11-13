import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callModuleInitHook } from '../../hooks/on-module-init.hook';
import { getInstancesGroupedByHierarchyLevel } from '../../hooks/utils/get-instances-grouped-by-hierarchy-level';
import { getSortedHierarchyLevels } from '../../hooks/utils/get-sorted-hierarchy-levels';

vi.mock('../../hooks/utils/get-instances-grouped-by-hierarchy-level', () => ({
  getInstancesGroupedByHierarchyLevel: vi.fn(),
}));
vi.mock('../../hooks/utils/get-sorted-hierarchy-levels', () => ({
  getSortedHierarchyLevels: vi.fn(),
}));

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

// Điều khiển kết quả của hai helper
const setupLevels = (levels: number[], instancesOfLevel0: unknown[] = []) => {
  vi.mocked(getInstancesGroupedByHierarchyLevel).mockReturnValue(
    new Map([[0, instancesOfLevel0]]) as any,
  );
  vi.mocked(getSortedHierarchyLevels).mockReturnValue(levels as any);
};

describe('callModuleInitHook (CFT)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('T1: provider có onModuleInit dạng function', async () => {
    // covers B1 (true), B2 (true), B3 (có level)
    const hook = vi.fn();
    setupLevels([0], [{ onModuleInit: hook }]);
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T2: provider không có onModuleInit', async () => {
    // covers B1 (false)
    setupLevels([0], [{}]);
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T3: onModuleInit không phải function', async () => {
    // covers B1 (false)
    setupLevels([0], [{ onModuleInit: 'not-a-function' }]);
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T4: instance null và undefined bị loại', async () => {
    // covers B2 (false)
    setupLevels([0], [null, undefined]);
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T5: không có level nào', async () => {
    // covers B3 (rỗng)
    setupLevels([]);
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T6: instance của module class là undefined', async () => {
    // covers B4 (falsy)
    setupLevels([]);
    const ref = makeModuleRef(makeHost(undefined));
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T7: instance của module class không có onModuleInit', async () => {
    // covers B4 (truthy), B5 (false)
    setupLevels([]);
    const host = makeHost({});
    const ref = makeModuleRef(host);
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T8: module có hook nhưng dependency tree không static', async () => {
    // covers B4 (truthy), B5 (true), B6 (false)
    const hook = vi.fn();
    setupLevels([]);
    const host = makeHost({ onModuleInit: hook }, false);
    const ref = makeModuleRef(host);
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });

  it('T9: module có hook và dependency tree static', async () => {
    // covers B4 (truthy), B5 (true), B6 (true)
    const hook = vi.fn();
    setupLevels([]);
    const host = makeHost({ onModuleInit: hook }, true);
    const ref = makeModuleRef(host);
    await expect(callModuleInitHook(ref)).resolves.toBeUndefined();
  });
});
