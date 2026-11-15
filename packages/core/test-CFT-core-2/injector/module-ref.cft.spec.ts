import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  injectorCtor: vi.fn(),
  resolveProperties: vi.fn(),
  waitForDeferredLoads: vi.fn(),
  resolveConstructorParams: vi.fn(),
  applyProperties: vi.fn(),
  linksCtor: vi.fn(),
  linksGet: vi.fn(),
  wrapperSet: vi.fn(),
  wrapperDetach: vi.fn(),
  getClassScope: vi.fn(),
  isDurable: vi.fn(),
}));

vi.mock('../../injector/injector', async importOriginal => ({
  ...(await importOriginal<any>()),
  Injector: class {
    constructor(opts: any) {
      h.injectorCtor(opts);
    }
    resolveProperties = h.resolveProperties;
    waitForDeferredLoads = h.waitForDeferredLoads;
    resolveConstructorParams = h.resolveConstructorParams;
    applyProperties = h.applyProperties;
  },
}));
vi.mock('../../injector/instance-links-host', async importOriginal => ({
  ...(await importOriginal<any>()),
  InstanceLinksHost: class {
    constructor(container: any) {
      h.linksCtor(container);
    }
    get = h.linksGet;
  },
}));
vi.mock('../../injector/instance-wrapper', async importOriginal => ({
  ...(await importOriginal<any>()),
  InstanceWrapper: class {
    constructor(public readonly opts: any) {}
    setInstanceByContextId = h.wrapperSet;
    detachFromDependencies = h.wrapperDetach;
  },
}));
vi.mock('../../helpers/get-class-scope', () => ({
  getClassScope: h.getClassScope,
}));
vi.mock('../../helpers/is-durable', () => ({ isDurable: h.isDurable }));

import { ModuleRef } from '../../injector/module-ref';

/**
 * CFT - packages/core/injector/module-ref.ts
 *
 * Quyết định / điều kiện (số dòng gần đúng):
 *  B1 L32   getter instanceLinksHost: !this._instanceLinksHost           -> C1 true (lần 1) / false (lần 2)
 *  B2 L41-46 constructor:
 *      C2 contextOptions?.preview  : contextOptions nullish (true/false)
 *      C3 preview ?? false         : preview nullish (true/false)
 *      C4 contextOptions?.snapshot : contextOptions nullish
 *      C5 contextOptions?.instrument?.instanceDecorator : contextOptions nullish ; C6 instrument nullish
 *  B3 L152  introspect: !wrapperRef.isDependencyTreeStatic()             -> C7
 *  B4 L154  introspect: wrapperRef.isTransient                           -> C8
 *  B5 L170  type && type.name                                            -> C9 type truthy
 *  B6 L178  type?.prototype                                              -> C10 type nullish ; C11 prototype truthy
 *  B7 L179/195/199/212  contextId ?? STATIC_CONTEXT (4 vị trí)           -> C12 contextId nullish
 *  B8 L217  !isCreated                                                   -> C13
 *  Loop: không có vòng lặp
 */

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

class TestModuleRef extends ModuleRef {
  get(): any {
    return undefined;
  }
  resolve(): any {
    return Promise.resolve(undefined);
  }
  create(): any {
    return Promise.resolve(undefined);
  }
  public linksHost() {
    return this.instanceLinksHost;
  }
  public callInstantiate(type: any, moduleRef: any, contextId?: any) {
    return this.instantiateClass(type, moduleRef, contextId);
  }
}

const makeContainer = (contextOptions?: any) =>
  ({
    contextOptions,
    registerRequestProvider: vi.fn(),
  }) as any;

describe('ModuleRef [CFT]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rand = mulberry32(20261115);
  });

  // ===== constructor =====
  it('constructor: contextOptions undefined', () => {
    // covers P1, C2=true, C4=true, C5=true
    const ref = new TestModuleRef(makeContainer(undefined));
    expect(ref).toBeDefined();
  });

  it('constructor: contextOptions rỗng (preview/instrument undefined)', () => {
    // covers P2, C2=false, C3=true, C5=false, C6=true
    const ref = new TestModuleRef(makeContainer({}));
    expect(ref).toBeDefined();
  });

  it('constructor: contextOptions đầy đủ', () => {
    // covers P3, C3=false, C6=false
    const ref = new TestModuleRef(
      makeContainer({
        preview: true,
        snapshot: true,
        instrument: { instanceDecorator: vi.fn() },
      }),
    );
    expect(ref).toBeDefined();
  });

  // ===== getter instanceLinksHost =====
  it('instanceLinksHost: lần đầu tạo, lần sau dùng lại', () => {
    // covers P4 (C1=true) và P5 (C1=false)
    const ref = new TestModuleRef(makeContainer());
    const first = ref.linksHost();
    const second = ref.linksHost();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
  });

  // ===== introspect =====
  it('introspect: dependency tree không static -> REQUEST', () => {
    // covers P6, C7=true
    h.linksGet.mockReturnValue({
      wrapperRef: { isDependencyTreeStatic: () => false, isTransient: false },
    });
    const ref = new TestModuleRef(makeContainer());
    expect(ref.introspect(`token-${randInt(100, 900)}`)).toBeDefined();
  });

  it('introspect: static + transient -> TRANSIENT', () => {
    // covers P7, C7=false, C8=true
    h.linksGet.mockReturnValue({
      wrapperRef: { isDependencyTreeStatic: () => true, isTransient: true },
    });
    const ref = new TestModuleRef(makeContainer());
    expect(ref.introspect(`token-${randInt(100, 900)}`)).toBeDefined();
  });

  it('introspect: static + không transient -> DEFAULT', () => {
    // covers P8, C7=false, C8=false
    h.linksGet.mockReturnValue({
      wrapperRef: { isDependencyTreeStatic: () => true, isTransient: false },
    });
    const ref = new TestModuleRef(makeContainer());
    expect(ref.introspect(`token-${randInt(100, 900)}`)).toBeDefined();
  });

  // ===== registerRequestByContextId =====
  it('registerRequestByContextId', () => {
    // covers P9
    const container = makeContainer();
    const ref = new TestModuleRef(container);
    expect(() =>
      ref.registerRequestByContextId(
        { url: `/r${randInt(100, 900)}` },
        {
          id: randInt(100, 900),
        },
      ),
    ).not.toThrow();
  });

  // ===== instantiateClass =====
  it('instantiateClass: class hợp lệ, contextId undefined, callback được gọi', async () => {
    // covers P10, C9=true, C10=false(type defined)/C11=true, C12=true (cả 4 vị trí), C13=false
    class Sample {
      constructor(
        public a?: any,
        public b?: any,
      ) {}
    }
    h.resolveProperties.mockResolvedValue({ prop: randInt(100, 900) });
    h.waitForDeferredLoads.mockResolvedValue(undefined);
    h.resolveConstructorParams.mockImplementation(
      async (_w: any, _m: any, _i: any, cb: any) => {
        await cb([randInt(100, 900), randInt(100, 900)]);
      },
    );
    const ref = new TestModuleRef(makeContainer());
    await expect(
      ref.callInstantiate(Sample, { name: 'HostModule' }),
    ).resolves.toBeDefined();
  });

  it('instantiateClass: contextId được truyền, callback được gọi', async () => {
    // covers P11, C12=false (cả 4 vị trí), C13=false
    class Sample {}
    h.resolveProperties.mockResolvedValue({});
    h.waitForDeferredLoads.mockResolvedValue(undefined);
    h.resolveConstructorParams.mockImplementation(
      async (_w: any, _m: any, _i: any, cb: any) => {
        await cb([]);
      },
    );
    const ref = new TestModuleRef(makeContainer());
    await expect(
      ref.callInstantiate(
        Sample,
        { name: 'HostModule' },
        { id: randInt(100, 900) },
      ),
    ).resolves.toBeDefined();
  });

  it('instantiateClass: callback bị bỏ qua (dependency request-scoped) -> ném lỗi', async () => {
    // covers P12, C13=true
    class Sample {}
    h.resolveConstructorParams.mockResolvedValue(undefined);
    const ref = new TestModuleRef(makeContainer());
    await expect(
      ref.callInstantiate(Sample, { name: 'HostModule' }),
    ).rejects.toThrow();
  });

  it('instantiateClass: type không có prototype (arrow function)', async () => {
    // covers P13, C10=false (type defined), C11=false (prototype undefined), C13=true
    const arrowType = (() => undefined) as any;
    h.resolveConstructorParams.mockResolvedValue(undefined);
    const ref = new TestModuleRef(makeContainer());
    await expect(
      ref.callInstantiate(arrowType, { name: 'HostModule' }),
    ).rejects.toThrow();
  });

  it('instantiateClass: type undefined', async () => {
    // covers P14, C9=false, C10=true (type nullish)
    // chỉ đạt được khi truyền type undefined (ép kiểu); type.name sau đó ném TypeError -> reject
    h.resolveConstructorParams.mockResolvedValue(undefined);
    const ref = new TestModuleRef(makeContainer());
    await expect(
      ref.callInstantiate(undefined, { name: 'HostModule' }),
    ).rejects.toThrow();
  });

  it('instantiateClass: resolveConstructorParams ném lỗi -> catch(reject)', async () => {
    // covers P15
    class Sample {}
    h.resolveConstructorParams.mockRejectedValue(
      new Error(`inject-failed-${randInt(100, 900)}`),
    );
    const ref = new TestModuleRef(makeContainer());
    await expect(
      ref.callInstantiate(Sample, { name: 'HostModule' }),
    ).rejects.toThrow();
  });
});
