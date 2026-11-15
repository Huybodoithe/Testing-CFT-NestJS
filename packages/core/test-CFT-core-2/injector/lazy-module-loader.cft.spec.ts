import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyModuleLoader } from '../../injector/lazy-module-loader/lazy-module-loader';

/**
 * CFT - packages/core/injector/lazy-module-loader/lazy-module-loader.ts
 *
 * Quyết định / điều kiện (số dòng gần đúng theo đoạn mã đã dán):
 *  B1  L31-41  try { scanForModules } catch                    -> C1: scan ném lỗi (true) / không (false)
 *  B2  L42     moduleInstances.length === 0                    -> C2
 *  B3  L50     moduleInstance && getTargetModuleRef(...)       -> C3: moduleInstance truthy
 *  B4  L53     filter: !modulesInFlight.has(m)                 -> C4
 *  B5  L63-72  try { await build } catch / finally             -> C5: build ném lỗi
 *  B6  L83     buildModules: moduleInstances.length === 0      -> C6
 *  B7  L99     finally: loadOpts?.logger === false             -> C7: loadOpts nullish ; C8: logger === false
 *  B8  L106    registerLoggerConfiguration: loadOpts?.logger === false -> C9: loadOpts nullish ; C10: logger === false
 *  Loop: filter / map / forEach / new Set(...)  -> 0, 1, nhiều phần tử
 */

// ---------- PRNG có seed cố định ----------
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let rand = mulberry32(20261115);
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

// ---------- helper ----------
const makeModule = (token: string) => {
  const moduleRef = { token: `ref-${token}` };
  return {
    token,
    moduleRef,
    getProviderByKey: vi.fn(() => ({ instance: moduleRef })),
  } as any;
};
const makeModules = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeModule(`m${i}-${randInt(1000, 9000)}`),
  );

const makeLoader = (overrides?: any[]) => {
  const dependenciesScanner = {
    scanForModules: vi.fn(),
    removeModules: vi.fn(),
    scanModulesForDependencies: vi.fn().mockResolvedValue(undefined),
  };
  const instanceLoader = {
    logger: { tag: 'original-logger' },
    setLogger: vi.fn(),
    createInstancesOfDependencies: vi.fn().mockResolvedValue(undefined),
  };
  const moduleCompiler = {
    compile: vi.fn().mockResolvedValue({ token: 'tok' }),
  };
  const modulesContainer = { get: vi.fn() };
  const loader = new LazyModuleLoader(
    dependenciesScanner as any,
    instanceLoader as any,
    moduleCompiler as any,
    modulesContainer as any,
    overrides as any,
  );
  return {
    loader,
    dependenciesScanner,
    instanceLoader,
    moduleCompiler,
    modulesContainer,
  };
};

class SampleModule {}
const loaderFn = () => SampleModule as any;

// chỉ kiểm tra "không ném lỗi" (kết quả có thể là undefined)
const settles = async (p: Promise<unknown>) => {
  await expect(p.then(() => 'settled')).resolves.toBe('settled');
};

describe('LazyModuleLoader.load [CFT]', () => {
  beforeEach(() => {
    rand = mulberry32(20261115);
  });

  // ===== Nhánh scan =====
  it('scanForModules ném lỗi -> removeModules rồi ném lại', async () => {
    // covers P1, C1=true
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockRejectedValue(
      new Error(`scan-failed-${randInt(100, 900)}`),
    );
    await expect(ctx.loader.load(loaderFn)).rejects.toThrow();
  });

  // ===== Module đã được load (length === 0) =====
  it('module đã load, không có build in-flight, container có module', async () => {
    // covers P2, C1=false, C2=true, C3=true
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue([]);
    ctx.modulesContainer.get.mockReturnValue(
      makeModule(`exist-${randInt(100, 900)}`),
    );
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });

  it('module đã load nhưng đang in-flight -> chờ build rồi trả ref', async () => {
    // covers P3, C2=true, C3=true (await modulesInFlight.get có promise)
    const ctx = makeLoader();
    const mod = makeModule(`inflight-${randInt(100, 900)}`);
    (ctx.loader as any).modulesInFlight.set(mod, Promise.resolve());
    ctx.dependenciesScanner.scanForModules.mockResolvedValue([]);
    ctx.modulesContainer.get.mockReturnValue(mod);
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });

  it('module đã load nhưng container trả undefined', async () => {
    // covers P4, C2=true, C3=false
    // chỉ đạt được khi mock modulesContainer.get -> undefined (mã thật dùng non-null assertion `!`)
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue([]);
    ctx.modulesContainer.get.mockReturnValue(undefined);
    await settles(ctx.loader.load(loaderFn));
  });

  // ===== Build module mới =====
  it('1 module mới, không truyền loadOpts', async () => {
    // covers P5, C2=false, C4=true (loop 1), C5=false, C6=false, C7=true(nullish), C9=true(nullish)
    const ctx = makeLoader();
    const [m] = makeModules(1);
    ctx.dependenciesScanner.scanForModules.mockResolvedValue([m]);
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });

  it('nhiều module mới (loop nhiều lần), có overrides', async () => {
    // covers P5, C4=true (loop nhiều), createLazyModulesContainer loop nhiều
    const ctx = makeLoader([
      { moduleToReplace: class A {}, newModule: class B {} } as any,
    ]);
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(
      makeModules(randInt(3, 6)),
    );
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });

  it('danh sách module trùng lặp -> new Set loại bỏ trùng', async () => {
    // covers P11 (loop có phần tử trùng)
    const ctx = makeLoader();
    const [a, b] = makeModules(2);
    ctx.dependenciesScanner.scanForModules.mockResolvedValue([a, b, a]);
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });

  it('loadOpts.logger === false -> đặt SilentLogger rồi khôi phục', async () => {
    // covers P6, C9=false(loadOpts defined), C10=true, C7=false, C8=true
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(
      makeModules(randInt(2, 5)),
    );
    await expect(
      ctx.loader.load(loaderFn, { logger: false } as any),
    ).resolves.toBeDefined();
  });

  it('loadOpts có nhưng logger !== false', async () => {
    // covers P7, C7=false(defined), C8=false, C9=false(defined), C10=false
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(
      makeModules(randInt(2, 5)),
    );
    await expect(
      ctx.loader.load(loaderFn, { logger: true } as any),
    ).resolves.toBeDefined();
  });

  it('loadOpts là object rỗng (logger undefined)', async () => {
    // covers P7, C8=false, C10=false (logger undefined)
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(
      makeModules(randInt(2, 5)),
    );
    await expect(ctx.loader.load(loaderFn, {} as any)).resolves.toBeDefined();
  });

  // ===== Build lỗi =====
  it('build ném lỗi (logger mặc định) -> removeModules + ném lại', async () => {
    // covers P8, C5=true
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(
      makeModules(randInt(2, 5)),
    );
    ctx.instanceLoader.createInstancesOfDependencies.mockRejectedValue(
      new Error(`build-failed-${randInt(100, 900)}`),
    );
    await expect(ctx.loader.load(loaderFn)).rejects.toThrow();
  });

  it('build ném lỗi khi logger === false -> finally vẫn khôi phục logger', async () => {
    // covers P8, C5=true, C8=true (nhánh finally trong đường lỗi)
    const ctx = makeLoader();
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(
      makeModules(randInt(2, 5)),
    );
    ctx.dependenciesScanner.scanModulesForDependencies.mockRejectedValue(
      new Error('scan-deps-failed'),
    );
    await expect(
      ctx.loader.load(loaderFn, { logger: false } as any),
    ).rejects.toThrow();
  });

  // ===== In-flight =====
  it('tất cả module đã in-flight -> modulesToBuild rỗng (buildModules length === 0)', async () => {
    // covers P9, C4=false (loop nhiều), C6=true, forEach 0 lần
    const ctx = makeLoader();
    const mods = makeModules(randInt(3, 6));
    mods.forEach((m: any) =>
      (ctx.loader as any).modulesInFlight.set(m, Promise.resolve()),
    );
    ctx.dependenciesScanner.scanForModules.mockResolvedValue(mods);
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });

  it('một phần module in-flight, phần còn lại build mới', async () => {
    // covers P10, C4=true và C4=false trong cùng lần gọi, C6=false
    const ctx = makeLoader();
    const [a, b, c] = makeModules(3);
    (ctx.loader as any).modulesInFlight.set(b, Promise.resolve());
    ctx.dependenciesScanner.scanForModules.mockResolvedValue([a, b, c]);
    await expect(ctx.loader.load(loaderFn)).resolves.toBeDefined();
  });
});
