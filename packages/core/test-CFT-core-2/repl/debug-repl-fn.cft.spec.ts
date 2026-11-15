import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebugReplFn } from '../../repl/native-functions/debug-repl-fn.js';

// Lớp cha giả: chưa xem constructor thật của ReplFunction, nên chỉ cấp hai thành viên
// mà DebugReplFn dùng (this.ctx và this.logger). Đường dẫn khớp import của file nguồn.
vi.mock('../../repl/repl-function.js', () => ({
  ReplFunction: class {
    constructor(ctx: unknown) {
      (this as any).ctx = ctx;
      (this as any).logger = { error: vi.fn() };
    }
  },
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

// Tập hợp controller/provider giả với số phần tử cho trước (0 = rỗng)
const makeCollection = (
  count: number,
  prefix: string,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const name = `${prefix}${i}_${randInt(100, 900)}`;
    result[name] = name;
  }
  return result;
};

const makeEntry = (controllers: number, providers: number) => ({
  controllers: makeCollection(controllers, 'Ctrl'),
  providers: makeCollection(providers, 'Prov'),
});

const makeFn = (debugRegistry: Record<string, unknown>) => {
  const ctx = { writeToStdout: vi.fn(), debugRegistry };
  const fn: any = new (DebugReplFn as any)(ctx);
  return { fn, ctx };
};

describe('DebugReplFn (CFT)', () => {
  beforeEach(() => {
    state = SEED;
  });

  it('T1: không truyền tham số, registry rỗng', () => {
    // covers P1, C1=false, B4=0 lần lặp
    const { fn, ctx } = makeFn({});
    fn.action();
    expect(ctx.writeToStdout).toHaveBeenCalled();
  });

  it('T2: không truyền tham số, một module có controller và provider', () => {
    // covers P2, C1=false, B4=1 lần lặp, C4=false (cả hai collection)
    const { fn, ctx } = makeFn({
      [`ModuleA${randInt(100, 900)}`]: makeEntry(2, 2),
    });
    fn.action();
    expect(ctx.writeToStdout).toHaveBeenCalled();
  });

  it('T3: không truyền tham số, nhiều module, có collection rỗng', () => {
    // covers P3, B4=nhiều lần lặp, C4=true (collection rỗng) và C4=false
    const { fn, ctx } = makeFn({
      [`ModuleA${randInt(100, 900)}`]: makeEntry(0, 2),
      [`ModuleB${randInt(100, 900)}`]: makeEntry(2, 0),
    });
    fn.action();
    expect(ctx.writeToStdout).toHaveBeenCalled();
  });

  it('T4: truyền tên module (string) có trong registry', () => {
    // covers P4, C1=true, C2=false, C3=false
    const name = `ModuleC${randInt(100, 900)}`;
    const { fn, ctx } = makeFn({ [name]: makeEntry(2, 2) });
    fn.action(name);
    expect(ctx.writeToStdout).toHaveBeenCalled();
  });

  it('T5: truyền class module (function) có trong registry', () => {
    // covers P5, C1=true, C2=true, C3=false
    const name = `ModuleD${randInt(100, 900)}`;
    const cls: any = class {};
    Object.defineProperty(cls, 'name', { value: name });
    const { fn, ctx } = makeFn({ [name]: makeEntry(2, 2) });
    fn.action(cls);
    expect(ctx.writeToStdout).toHaveBeenCalled();
  });

  it('T6: truyền tên module (string) không có trong registry', () => {
    // covers P6, C1=true, C2=false, C3=true
    const { fn } = makeFn({});
    fn.action(`Missing${randInt(100, 900)}`);
    expect(fn.logger.error).toHaveBeenCalled();
  });

  it('T7: truyền class module (function) không có trong registry', () => {
    // covers P7, C1=true, C2=true, C3=true
    const cls: any = class {};
    Object.defineProperty(cls, 'name', {
      value: `Missing${randInt(100, 900)}`,
    });
    const { fn } = makeFn({});
    fn.action(cls);
    expect(fn.logger.error).toHaveBeenCalled();
  });
});
