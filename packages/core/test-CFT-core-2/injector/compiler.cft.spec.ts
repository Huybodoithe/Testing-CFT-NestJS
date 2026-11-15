import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModuleCompiler } from '../../injector/compiler.js';

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

const makeKeyFactory = () =>
  ({
    createForDynamic: vi.fn(() => `dyn-${randInt(100, 900)}`),
    createForStatic: vi.fn(() => `sta-${randInt(100, 900)}`),
  }) as any;

const makeModuleClass = (): any => {
  class TestModule {}
  Object.defineProperty(TestModule, 'name', {
    value: `TestModule${randInt(100, 900)}`,
  });
  return TestModule;
};

describe('ModuleCompiler (CFT)', () => {
  beforeEach(() => {
    state = SEED;
    vi.clearAllMocks();
  });

  it('T1: getter moduleOpaqueKeyFactory', () => {
    // covers P6
    const compiler = new ModuleCompiler(makeKeyFactory());
    expect(compiler.moduleOpaqueKeyFactory).toBeDefined();
  });

  it('T2: compile với class thường', async () => {
    // covers P1, C2=false, C4=false, C1=false, C3=false
    const factory = makeKeyFactory();
    const compiler = new ModuleCompiler(factory);
    const result = await compiler.compile(makeModuleClass());
    expect(result).toBeDefined();
    expect(factory.createForStatic).toHaveBeenCalled();
  });

  it('T3: compile với forward reference', async () => {
    // covers P2, C2=false, C4=true, C1=false, C3=false
    const factory = makeKeyFactory();
    const compiler = new ModuleCompiler(factory);
    const cls = makeModuleClass();
    const result = await compiler.compile({ forwardRef: () => cls } as any);
    expect(result).toBeDefined();
    expect(factory.createForStatic).toHaveBeenCalled();
  });

  it('T4: compile với module động', async () => {
    // covers P3, C2=true, C1=true
    const factory = makeKeyFactory();
    const compiler = new ModuleCompiler(factory);
    const result = await compiler.compile({
      module: makeModuleClass(),
      providers: [],
    } as any);
    expect(result).toBeDefined();
    expect(factory.createForDynamic).toHaveBeenCalled();
  });

  it('T5: compile với Promise của module động', async () => {
    // covers P4, C2=true, C1=true (qua await)
    const factory = makeKeyFactory();
    const compiler = new ModuleCompiler(factory);
    const result = await compiler.compile(
      Promise.resolve({ module: makeModuleClass(), exports: [] }) as any,
    );
    expect(result).toBeDefined();
    expect(factory.createForDynamic).toHaveBeenCalled();
  });

  it('T6: compile với giá trị nil', async () => {
    // covers P5; unreachable: C3=true vì isDynamicModule truy cập .module ở dòng 64 trước (ném TypeError)
    const compiler = new ModuleCompiler(makeKeyFactory());
    await expect(compiler.compile(undefined as any)).rejects.toThrow();
  });
});
