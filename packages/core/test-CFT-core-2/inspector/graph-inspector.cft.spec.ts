import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ clear: vi.fn(), register: vi.fn() }));

vi.mock('../../inspector/deterministic-uuid-registry', () => ({
  DeterministicUuidRegistry: { clear: h.clear, get: vi.fn() },
}));
vi.mock('../../inspector/partial-graph.host', () => ({
  PartialGraphHost: { register: h.register },
}));

import { UnknownDependenciesException } from '../../errors/exceptions/unknown-dependencies.exception';
import { GraphInspector } from '../../inspector/graph-inspector';

/**
 * CFT - packages/core/inspector/graph-inspector.ts
 *
 * Quyết định / điều kiện (số dòng gần đúng):
 *  B1  L23   inspectModules: tham số mặc định modules                     -> C1 undefined (dùng getModules) / truyền vào
 *  B2  L25   for (moduleRef of modules.values())                           -> loop 0, 1, nhiều
 *  B3  L31   enhancersMetadataCache.forEach                                -> loop 0, 1, nhiều
 *  B4  L41   error instanceof UnknownDependenciesException                 -> C2
 *  B5  L46   error.moduleRef?.id                                           -> C3 moduleRef nullish
 *  B6  L47   error.metadata?.id                                            -> C4 metadata nullish
 *  B7  L66   ctorMetadata?.forEach                                         -> C5 nullish ; loop 0/1/nhiều
 *  B8  L77   propertiesMetadata?.forEach                                   -> C6 nullish ; loop 0/1/nhiều
 *  B9  L89   entry.ref?.constructor?.name ?? 'Object'                      -> C7 ref nullish ; C8 constructor nullish ; C9 name nullish
 *  B10 L122  wrapper.metatype === moduleRef.metatype                       -> C10
 *  B11 L146  !!dynamicMetadata                                             -> C11
 *  B12 L147  moduleRef.name === 'InternalCoreModule'                       -> C12
 *  B13 L154  for (imports)                                                 -> loop 0/1/nhiều
 *  B14 L170  controllers.get(classRef) ?? providers.get(classRef)          -> C13 left nullish
 *  B15 L175  existingSourceNode.metadata.enhancers ?? []                   -> C14 nullish
 *  B16 L177  entry.enhancerInstanceWrapper                                 -> C15
 *  B17 L193  enhancerRef!.constructor?.name ?? enhancerRef.name            -> C16 constructor nullish ; C17 name nullish
 *  B18 L222  target.host?.name                                             -> C18 host nullish
 *  B19 L230-238 providers/injectables/controllers.forEach                  -> loop 0/1/nhiều
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
const uid = (p: string) => `${p}-${randInt(1000, 9000)}-${randInt(1000, 9000)}`;

const makeGraph = () => {
  const nodes = new Map<string, any>();
  return {
    nodes,
    status: undefined as any,
    metadata: undefined as any,
    insertNode: vi.fn((n: any) => {
      if (!nodes.has(n.id)) nodes.set(n.id, n);
      return nodes.get(n.id);
    }),
    insertEdge: vi.fn(),
    insertEntrypoint: vi.fn(),
    insertOrphanedEnhancer: vi.fn(),
    insertAttachedEnhancer: vi.fn(),
    getNodeById: vi.fn((id: string) => nodes.get(id)),
  };
};

const makeInspector = () => {
  const graph = makeGraph();
  const container = {
    serializedGraph: graph,
    getModules: vi.fn(() => new Map()),
    getDynamicMetadataByToken: vi.fn(),
    getModuleByKey: vi.fn(),
  };
  const inspector = new GraphInspector(container as any);
  return { inspector, graph, container };
};

const makeWrapper = (over: any = {}) =>
  ({
    id: uid('w'),
    name: uid('Wrapper'),
    token: uid('tok'),
    metatype: class {},
    scope: 0,
    isTransient: false,
    subtype: undefined,
    initTime: randInt(1, 90),
    host: { name: uid('Host') },
    isDependencyTreeDurable: vi.fn(() => false),
    isDependencyTreeStatic: vi.fn(() => true),
    getCtorMetadata: vi.fn(),
    getPropertiesMetadata: vi.fn(),
    ...over,
  }) as any;

const makeModule = (over: any = {}) =>
  ({
    id: uid('mod'),
    name: uid('Module'),
    token: uid('modtok'),
    isGlobal: false,
    metatype: class {},
    imports: new Set<any>(),
    providers: new Map<any, any>(),
    injectables: new Map<any, any>(),
    controllers: new Map<any, any>(),
    exports: new Set<any>(),
    ...over,
  }) as any;

const makeUnknownDeps = (extra: any) =>
  Object.assign(Object.create(UnknownDependenciesException.prototype), extra);

describe('GraphInspector [CFT]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rand = mulberry32(20261115);
  });

  // ===== inspectModules =====
  it('inspectModules không truyền tham số -> dùng container.getModules() (0 module)', () => {
    // covers P1, C1=true, B2 loop 0, B3 loop 0
    const { inspector } = makeInspector();
    expect(() => inspector.inspectModules()).not.toThrow();
  });

  it('inspectModules truyền 1 module đơn giản (không dynamic, collection rỗng, không imports)', () => {
    // covers P2, C1=false, loop 1, C11=false, C12=false, B13/B19 loop 0
    const { inspector } = makeInspector();
    const mod = makeModule();
    expect(() =>
      inspector.inspectModules(new Map([[mod.token, mod]])),
    ).not.toThrow();
  });

  it('inspectModules nhiều module: dynamic + InternalCoreModule + imports/providers/injectables/controllers', () => {
    // covers P3, loop nhiều, C11=true, C12=true, C10=true/false, B13 nhiều, B19 nhiều
    const { inspector, container } = makeInspector();
    const imported = [makeModule(), makeModule(), makeModule()];
    const m1 = makeModule({
      name: 'InternalCoreModule',
      imports: new Set(imported),
    });
    const internalWrapper = makeWrapper({ metatype: m1.metatype }); // C10 = true
    const normalWrapper = makeWrapper(); // C10 = false
    m1.providers.set(internalWrapper.token, internalWrapper);
    m1.providers.set(normalWrapper.token, normalWrapper);
    const inj = makeWrapper();
    m1.injectables.set(inj.token, inj);
    const ctl = makeWrapper();
    m1.controllers.set(ctl.token, ctl);
    m1.exports.add(normalWrapper.token);
    const m2 = makeModule();
    container.getDynamicMetadataByToken.mockImplementation((t: any) =>
      t === m1.token ? { providers: [] } : undefined,
    );
    expect(() =>
      inspector.inspectModules(
        new Map([
          [m1.token, m1],
          [m2.token, m2],
        ]),
      ),
    ).not.toThrow();
  });

  it('inspectModules module có đúng 1 import', () => {
    // covers B13 loop 1
    const { inspector } = makeInspector();
    const m = makeModule({ imports: new Set([makeModule()]) });
    expect(() =>
      inspector.inspectModules(new Map([[m.token, m]])),
    ).not.toThrow();
  });

  // ===== enhancer edges =====
  const setupEnhancer = (opts: { inControllers: boolean; preset?: any[] }) => {
    const ctx = makeInspector();
    class SourceClass {}
    const src = makeWrapper({ metatype: SourceClass });
    const mod = makeModule();
    (opts.inControllers ? mod.controllers : mod.providers).set(
      SourceClass,
      src,
    );
    if (opts.preset) {
      ctx.graph.nodes.set(src.id, {
        id: src.id,
        metadata: { enhancers: opts.preset },
      });
    }
    ctx.container.getModuleByKey.mockReturnValue(mod);
    return { ...ctx, SourceClass, src, mod };
  };

  it('enhancer edge: class trong controllers, chưa có enhancers, có enhancerInstanceWrapper (host có)', () => {
    // covers P4, C13=false, C14=true, C15=true, C18=false
    const s = setupEnhancer({ inControllers: true });
    const enhancerWrapper = makeWrapper();
    s.inspector.insertEnhancerMetadataCache({
      moduleToken: s.mod.token,
      classRef: s.SourceClass,
      methodKey: uid('method'),
      subtype: 'guard',
      enhancerInstanceWrapper: enhancerWrapper,
    } as any);
    expect(() =>
      s.inspector.inspectModules(new Map([[s.mod.token, s.mod]])),
    ).not.toThrow();
  });

  it('enhancer edge: class chỉ có trong providers, enhancers đã có, wrapper không có host', () => {
    // covers P5, C13=true, C14=false, C15=true, C18=true
    const s = setupEnhancer({ inControllers: false, preset: [] });
    const enhancerWrapper = makeWrapper({ host: undefined });
    s.inspector.insertEnhancerMetadataCache({
      moduleToken: s.mod.token,
      classRef: s.SourceClass,
      methodKey: uid('method'),
      subtype: 'pipe',
      enhancerInstanceWrapper: enhancerWrapper,
    } as any);
    expect(() =>
      s.inspector.inspectModules(new Map([[s.mod.token, s.mod]])),
    ).not.toThrow();
  });

  it('enhancer edge: enhancerRef là instance có constructor.name', () => {
    // covers P6, C15=false, C16=false, C17=false
    const s = setupEnhancer({ inControllers: true });
    class SomeGuard {}
    s.inspector.insertEnhancerMetadataCache({
      moduleToken: s.mod.token,
      classRef: s.SourceClass,
      methodKey: uid('method'),
      subtype: 'guard',
      enhancerRef: new SomeGuard(),
    } as any);
    expect(() =>
      s.inspector.inspectModules(new Map([[s.mod.token, s.mod]])),
    ).not.toThrow();
  });

  it('enhancer edge: enhancerRef không có constructor (Object.create(null))', () => {
    // covers P7, C16=true, nhánh ?? bên phải
    const s = setupEnhancer({ inControllers: true });
    s.inspector.insertEnhancerMetadataCache({
      moduleToken: s.mod.token,
      classRef: s.SourceClass,
      methodKey: uid('method'),
      subtype: 'interceptor',
      enhancerRef: Object.create(null),
    } as any);
    expect(() =>
      s.inspector.inspectModules(new Map([[s.mod.token, s.mod]])),
    ).not.toThrow();
  });

  it('enhancer edge: constructor tồn tại nhưng name nullish -> dùng enhancerRef.name', () => {
    // covers P8, C16=false, C17=true
    const s = setupEnhancer({ inControllers: true });
    s.inspector.insertEnhancerMetadataCache({
      moduleToken: s.mod.token,
      classRef: s.SourceClass,
      methodKey: uid('method'),
      subtype: 'guard',
      enhancerRef: { constructor: {}, name: uid('fnName') },
    } as any);
    expect(() =>
      s.inspector.inspectModules(new Map([[s.mod.token, s.mod]])),
    ).not.toThrow();
  });

  it('nhiều enhancer entries trong cache (loop nhiều)', () => {
    // covers B3 loop nhiều
    const s = setupEnhancer({ inControllers: true });
    for (let i = 0; i < randInt(3, 6); i++) {
      s.inspector.insertEnhancerMetadataCache({
        moduleToken: s.mod.token,
        classRef: s.SourceClass,
        methodKey: uid('method'),
        subtype: 'guard',
        enhancerRef: new (class Dyn {})(),
      } as any);
    }
    expect(() =>
      s.inspector.inspectModules(new Map([[s.mod.token, s.mod]])),
    ).not.toThrow();
  });

  // ===== registerPartial =====
  it('registerPartial: UnknownDependenciesException có moduleRef và metadata', () => {
    // covers P9, C2=true, C3=false, C4=false
    const { inspector } = makeInspector();
    const err = makeUnknownDeps({
      context: { name: uid('ctx') },
      moduleRef: { id: uid('mid') },
      metadata: { id: uid('nid') },
    });
    expect(() => inspector.registerPartial(err)).not.toThrow();
  });

  it('registerPartial: UnknownDependenciesException không có moduleRef/metadata', () => {
    // covers P10, C2=true, C3=true, C4=true
    const { inspector } = makeInspector();
    const err = makeUnknownDeps({
      context: { name: uid('ctx') },
      moduleRef: undefined,
      metadata: undefined,
    });
    expect(() => inspector.registerPartial(err)).not.toThrow();
  });

  it('registerPartial: lỗi thường', () => {
    // covers P11, C2=false
    const { inspector } = makeInspector();
    expect(() =>
      inspector.registerPartial(new Error(uid('plain-error'))),
    ).not.toThrow();
  });

  // ===== inspectInstanceWrapper =====
  it('inspectInstanceWrapper: ctor và properties metadata undefined', () => {
    // covers P12, C5=true, C6=true
    const { inspector } = makeInspector();
    const source = makeWrapper();
    source.getCtorMetadata.mockReturnValue(undefined);
    source.getPropertiesMetadata.mockReturnValue(undefined);
    expect(() =>
      inspector.inspectInstanceWrapper(source, makeModule()),
    ).not.toThrow();
  });

  it('inspectInstanceWrapper: ctor và properties rỗng (loop 0)', () => {
    // covers P13, C5=false, C6=false, loop 0
    const { inspector } = makeInspector();
    const source = makeWrapper();
    source.getCtorMetadata.mockReturnValue([]);
    source.getPropertiesMetadata.mockReturnValue([]);
    expect(() =>
      inspector.inspectInstanceWrapper(source, makeModule()),
    ).not.toThrow();
  });

  it('inspectInstanceWrapper: 1 ctor dep, 1 property dep', () => {
    // covers P14, loop 1
    const { inspector } = makeInspector();
    const source = makeWrapper();
    source.getCtorMetadata.mockReturnValue([makeWrapper()]);
    source.getPropertiesMetadata.mockReturnValue([
      { key: uid('prop'), wrapper: makeWrapper() },
    ]);
    expect(() =>
      inspector.inspectInstanceWrapper(source, makeModule()),
    ).not.toThrow();
  });

  it('inspectInstanceWrapper: nhiều ctor/property dep, một số không có host', () => {
    // covers P15, loop nhiều, C18=true/false
    const { inspector } = makeInspector();
    const source = makeWrapper();
    source.getCtorMetadata.mockReturnValue([
      makeWrapper(),
      makeWrapper({ host: undefined }),
      makeWrapper(),
    ]);
    source.getPropertiesMetadata.mockReturnValue([
      { key: uid('p1'), wrapper: makeWrapper() },
      { key: uid('p2'), wrapper: makeWrapper({ host: undefined }) },
      { key: uid('p3'), wrapper: makeWrapper() },
    ]);
    expect(() =>
      inspector.inspectInstanceWrapper(source, makeModule()),
    ).not.toThrow();
  });

  // ===== insertOrphanedEnhancer =====
  it('insertOrphanedEnhancer: ref undefined', () => {
    // covers P16, C7=true
    const { inspector } = makeInspector();
    expect(() =>
      inspector.insertOrphanedEnhancer({ subtype: 'guard' } as any),
    ).not.toThrow();
  });

  it('insertOrphanedEnhancer: ref không có constructor', () => {
    // covers P17, C7=false, C8=true
    const { inspector } = makeInspector();
    expect(() =>
      inspector.insertOrphanedEnhancer({ ref: Object.create(null) } as any),
    ).not.toThrow();
  });

  it('insertOrphanedEnhancer: constructor có nhưng name undefined', () => {
    // covers P18, C8=false, C9=true
    const { inspector } = makeInspector();
    expect(() =>
      inspector.insertOrphanedEnhancer({ ref: { constructor: {} } } as any),
    ).not.toThrow();
  });

  it('insertOrphanedEnhancer: ref là instance của class có tên', () => {
    // covers P19, C9=false
    const { inspector } = makeInspector();
    class NamedRef {}
    expect(() =>
      inspector.insertOrphanedEnhancer({ ref: new NamedRef() } as any),
    ).not.toThrow();
  });

  // ===== các hàm không rẽ nhánh =====
  it('insertAttachedEnhancer / insertEntrypointDefinition / insertClassNode', () => {
    // covers P20 (đường thẳng)
    const { inspector, graph } = makeInspector();
    const wrapper = makeWrapper();
    graph.nodes.set(wrapper.id, { id: wrapper.id, metadata: {} });
    expect(() => inspector.insertAttachedEnhancer(wrapper)).not.toThrow();
    expect(() =>
      inspector.insertEntrypointDefinition(
        { classNodeId: uid('cls'), methodName: uid('m') } as any,
        uid('parent'),
      ),
    ).not.toThrow();
    expect(() =>
      inspector.insertClassNode(makeModule(), makeWrapper(), 'provider'),
    ).not.toThrow();
  });
});
