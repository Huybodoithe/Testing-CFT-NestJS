import { describe, it, expect, beforeEach } from 'vitest';
import { ByReferenceModuleOpaqueKeyFactory } from '../../injector/opaque-key-factory/by-reference-module-opaque-key-factory.js';

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

// Class mới mỗi lần (id được gắn lên chính class), tên ngẫu nhiên
const makeModuleClass = (): any => {
  class TestModule {}
  Object.defineProperty(TestModule, 'name', {
    value: `TestModule${randInt(100, 900)}`,
  });
  return TestModule;
};

const makeMeta = (): any => ({
  providers: [],
  exports: [],
  global: randInt(0, 1) === 1,
});

describe('ByReferenceModuleOpaqueKeyFactory (CFT)', () => {
  beforeEach(() => {
    state = SEED;
  });

  it('T1: không có options, không truyền originalRef', () => {
    // covers P1, C1=true, C2=true, C3=true, C4=false, C5=true
    const factory = new ByReferenceModuleOpaqueKeyFactory();
    expect(factory.createForStatic(makeModuleClass())).toBeDefined();
  });

  it('T2: options random, truyền originalRef', () => {
    // covers P2, C1=false, C2=false, C3=false, C5=true
    const factory = new ByReferenceModuleOpaqueKeyFactory({
      keyGenerationStrategy: 'random',
    });
    const cls = makeModuleClass();
    expect(factory.createForStatic(cls, cls)).toBeDefined();
  });

  it('T3: options không có keyGenerationStrategy', () => {
    // covers P3, C1=false, C2=true, C3=true
    const factory = new ByReferenceModuleOpaqueKeyFactory({} as any);
    expect(factory.createForStatic(makeModuleClass())).toBeDefined();
  });

  it('T4: shallow, module tĩnh', () => {
    // covers P4, C5=false, C6=false
    const factory = new ByReferenceModuleOpaqueKeyFactory({
      keyGenerationStrategy: 'shallow',
    });
    expect(factory.createForStatic(makeModuleClass())).toBeDefined();
  });

  it('T5: shallow, module động', () => {
    // covers P5, C5=false, C6=true
    const factory = new ByReferenceModuleOpaqueKeyFactory({
      keyGenerationStrategy: 'shallow',
    });
    const cls = makeModuleClass();
    const meta = makeMeta();
    expect(
      factory.createForDynamic(cls, meta, { module: cls, ...meta }),
    ).toBeDefined();
  });

  it('T6: random, module động', () => {
    // covers P6, C5=true (qua createForDynamic)
    const factory = new ByReferenceModuleOpaqueKeyFactory({
      keyGenerationStrategy: 'random',
    });
    const cls = makeModuleClass();
    const meta = makeMeta();
    expect(
      factory.createForDynamic(cls, meta, { module: cls, ...meta }),
    ).toBeDefined();
  });

  it('T7: gọi hai lần cho cùng một class', () => {
    // covers P7, C4=true (lần 2), C4=false (lần 1)
    const factory = new ByReferenceModuleOpaqueKeyFactory();
    const cls = makeModuleClass();
    const first = factory.createForStatic(cls);
    const second = factory.createForStatic(cls);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
  });

  it('T8: lớp con của module đã có id', () => {
    // covers P8, C4=false (hasOwnProperty không thừa kế)
    const factory = new ByReferenceModuleOpaqueKeyFactory();
    const parent = makeModuleClass();
    factory.createForStatic(parent);
    const child: any = class extends parent {};
    expect(factory.createForStatic(child)).toBeDefined();
  });
});
