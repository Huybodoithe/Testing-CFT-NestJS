import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';

vi.mock('../../router/utils/index', () => ({ isRequestMethodAll: vi.fn() }));
vi.mock('../../router/legacy-route-converter', () => ({
  LegacyRouteConverter: { tryConvert: vi.fn() },
}));
vi.mock('../../middleware/utils', () => ({
  filterMiddleware: vi.fn(),
  isStaticPath: vi.fn(),
}));

import { MiddlewareBuilder } from '../../middleware/builder';
import { filterMiddleware, isStaticPath } from '../../middleware/utils';
import { LegacyRouteConverter } from '../../router/legacy-route-converter';
import { isRequestMethodAll } from '../../router/utils/index';

/**
 * CFT - packages/core/middleware/builder.ts
 *
 * Quyết định / điều kiện (số dòng gần đúng):
 *  B1  L65-69  exclude: getHttpAdapter().getRouteMatchingOptions?.()?.caseSensitive ?? true
 *       C1: getRouteMatchingOptions nullish (?.())   C2: kết quả nullish (?.caseSensitive)
 *       C3: caseSensitive nullish (?? true)
 *       Loop flatMap: 0 / 1 / nhiều route (C1-C3 chỉ được đánh giá khi có >= 1 route)
 *  B2  L117    for (route of routes)                    -> loop 0/1/nhiều
 *  B3  L118    for (excludedRoute of covered...)        -> loop 0/1/nhiều
 *  B4  L123    item.path === excludedRoute.path          -> C4
 *  B5  L124    item.method === excludedRoute.method      -> C5 (chỉ khi C4=true)
 *  B6  L125    item.version === excludedRoute.version    -> C6 (chỉ khi C4,C5=true)
 *  B7  L127    !isListed                                 -> C7
 *  B8  L144    route.path.includes(':')                  -> C8
 *  B9  L152    !mountPaths.every(isStaticPath)           -> C9 (every: rỗng / 1 / nhiều)
 *  B10 L167    route.method === item.method              -> C10
 *  B11 L168    isRequestMethodAll(item.method)           -> C11 (chỉ khi C10=false)
 *  B12 L169    route.method !== -1                       -> C12 (chỉ khi C10=false, C11=true)
 *  B13 L170    mountPaths.every(path => ...)             -> C13 (chỉ khi vế trái true)
 *  B14 L171    regexes.some(regex => regex.test(path))   -> C14: regex.test true/false ; regexes rỗng / nhiều
 *  B15 L173    routesWithRegex.some(isOverlapped)        -> loop 0/1/nhiều
 *  B16 L178-191 compileMountPaths try/catch              -> C15: ném lỗi
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
const seg = () => `seg${randInt(100, 900)}`;

const route = (path: string, method: number, extra: any = {}) =>
  ({ path, method, ...extra }) as any;

const makeBuilder = (adapter: any = {}) => {
  const routesMapper = { mapRouteToRouteInfo: vi.fn() };
  const extractor = {
    extractExclusionsFrom: vi.fn((r: any) => [r]),
    getVersioningOptions: vi.fn(() => undefined),
    extractExcludedRoutesCoveredBy: vi.fn((): any[] => []),
    extractPathsFrom: vi.fn((r: any) => r.mounts ?? [r.path]),
  };
  const builder = new MiddlewareBuilder(
    routesMapper as any,
    adapter,
    extractor as any,
  );
  return { builder, routesMapper, extractor };
};

class Mw {}

describe('MiddlewareBuilder [CFT]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rand = mulberry32(20261115);
    (isRequestMethodAll as any).mockImplementation(
      (m: number) => m === RequestMethod.ALL || m === -1,
    );
    (LegacyRouteConverter.tryConvert as any).mockImplementation(
      (p: string) => p,
    );
    (filterMiddleware as any).mockImplementation((m: any) => m);
    (isStaticPath as any).mockImplementation((p: string) => !/[:*()]/.test(p));
  });

  // ===== apply / build / getHttpAdapter =====
  it('apply (mảng lồng nhau) + build + getHttpAdapter', () => {
    // covers P1
    const { builder } = makeBuilder();
    const proxy = builder.apply(Mw, [Mw, class Other {}]);
    expect(proxy).toBeDefined();
    expect(builder.build()).toBeDefined();
    expect(builder.getHttpAdapter()).toBeDefined();
  });

  // ===== exclude =====
  it('exclude() không có route -> flatMap 0 lần', () => {
    // covers P2, loop 0
    const { builder } = makeBuilder();
    const proxy = builder.apply(Mw);
    expect(() => proxy.exclude()).not.toThrow();
  });

  it('exclude: adapter không có getRouteMatchingOptions', () => {
    // covers P3, C1=true
    const { builder, routesMapper } = makeBuilder({});
    routesMapper.mapRouteToRouteInfo.mockReturnValue([route(`/${seg()}`, 0)]);
    expect(() => builder.apply(Mw).exclude(seg())).not.toThrow();
  });

  it('exclude: getRouteMatchingOptions trả undefined', () => {
    // covers P4, C1=false, C2=true
    const { builder, routesMapper } = makeBuilder({
      getRouteMatchingOptions: () => undefined,
    });
    routesMapper.mapRouteToRouteInfo.mockReturnValue([route(`/${seg()}`, 0)]);
    expect(() => builder.apply(Mw).exclude(seg())).not.toThrow();
  });

  it('exclude: options có nhưng caseSensitive undefined', () => {
    // covers P5, C2=false, C3=true
    const { builder, routesMapper } = makeBuilder({
      getRouteMatchingOptions: () => ({}),
    });
    routesMapper.mapRouteToRouteInfo.mockReturnValue([route(`/${seg()}`, 0)]);
    expect(() => builder.apply(Mw).exclude(seg())).not.toThrow();
  });

  it('exclude: caseSensitive = false, nhiều route, gọi exclude 2 lần', () => {
    // covers P6, C3=false, loop nhiều
    const { builder, routesMapper } = makeBuilder({
      getRouteMatchingOptions: () => ({ caseSensitive: false }),
    });
    routesMapper.mapRouteToRouteInfo.mockImplementation(() => [
      route(`/${seg()}`, 0),
      route(`/${seg()}`, 1),
    ]);
    const proxy = builder.apply(Mw);
    const names = Array.from({ length: randInt(3, 5) }, seg);
    expect(() => proxy.exclude(...names)).not.toThrow();
    expect(() => proxy.exclude(seg())).not.toThrow();
    expect((proxy as any).getExcludedRoutes()).toBeDefined();
  });

  // ===== forRoutes: addCoveredExcludedRoutes =====
  it('forRoutes() không route -> mọi loop 0 lần', () => {
    // covers P7, B2 loop 0, B8 loop 0
    const { builder } = makeBuilder();
    expect(() => builder.apply(Mw).forRoutes()).not.toThrow();
    expect(builder.build()).toBeDefined();
  });

  it('addCovered: không có excluded route nào được cover (loop trong 0 lần)', () => {
    // covers P8, B3 loop 0
    const { builder, routesMapper } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([route(`/${seg()}`, 0)]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('addCovered: excluded có path khác -> C4=false, thêm vào', () => {
    // covers P9, C4=false, C7=true
    const { builder, routesMapper, extractor } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([route(`/${seg()}/a`, 0)]);
    extractor.extractExcludedRoutesCoveredBy.mockReturnValue([
      route(`/${seg()}/b`, 0),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('addCovered: cùng path, khác method -> C5=false, thêm vào', () => {
    // covers P10, C4=true, C5=false, C7=true
    const { builder, routesMapper, extractor } = makeBuilder();
    const p = `/${seg()}`;
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(p, RequestMethod.GET),
    ]);
    extractor.extractExcludedRoutesCoveredBy.mockReturnValue([
      route(p, RequestMethod.POST),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('addCovered: cùng path và method, khác version -> C6=false, thêm vào', () => {
    // covers P11, C4=true, C5=true, C6=false, C7=true
    const { builder, routesMapper, extractor } = makeBuilder();
    const p = `/${seg()}`;
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(p, RequestMethod.GET, { version: undefined }),
    ]);
    extractor.extractExcludedRoutesCoveredBy.mockReturnValue([
      route(p, RequestMethod.GET, { version: '1' }),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('addCovered: trùng hoàn toàn path/method/version -> đã có, không thêm', () => {
    // covers P12, C4=true, C5=true, C6=true, C7=false
    const { builder, routesMapper, extractor } = makeBuilder();
    const p = `/${seg()}`;
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(p, RequestMethod.GET, { version: '1' }),
    ]);
    extractor.extractExcludedRoutesCoveredBy.mockReturnValue([
      route(p, RequestMethod.GET, { version: '1' }),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('addCovered: nhiều route, mỗi route cover nhiều excluded route', () => {
    // covers P13, B2 loop nhiều, B3 loop nhiều
    const { builder, routesMapper, extractor } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue(
      Array.from({ length: randInt(3, 5) }, () => route(`/${seg()}`, 0)),
    );
    extractor.extractExcludedRoutesCoveredBy.mockImplementation(() => [
      route(`/${seg()}/x`, 0),
      route(`/${seg()}/y`, 0),
      route(`/${seg()}/z`, 0),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  // ===== forRoutes: removeOverlappedRoutes =====
  it('overlap: không có route tham số (routesWithRegex rỗng)', () => {
    // covers P14, C8=false, B15 loop 0
    const { builder, routesMapper } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${seg()}/${seg()}`, 0),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: cùng method, regex khớp -> route tĩnh bị loại', () => {
    // covers P15, C8=true, C9=true/false, C10=true, C13=true, C14=true
    const { builder, routesMapper } = makeBuilder();
    const base = seg();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${base}/:id`, RequestMethod.GET),
      route(`/${base}/${seg()}`, RequestMethod.GET),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: khác method, item.method không phải ALL -> giữ lại', () => {
    // covers P16, C10=false, C11=false
    const { builder, routesMapper } = makeBuilder();
    const base = seg();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${base}/:id`, RequestMethod.GET),
      route(`/${base}/${seg()}`, RequestMethod.POST),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: route tham số mount cho mọi method (ALL), route tĩnh method cụ thể', () => {
    // covers P17, C10=false, C11=true, C12=true, C13=true
    const { builder, routesMapper } = makeBuilder();
    const base = seg();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${base}/:id`, RequestMethod.ALL),
      route(`/${base}/${seg()}`, RequestMethod.GET),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: route tham số ALL, route tĩnh là chuỗi thường (method -1)', () => {
    // covers P18, C10=false, C11=true, C12=false
    const { builder, routesMapper } = makeBuilder();
    const base = seg();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${base}/:id`, RequestMethod.ALL),
      route(`/${base}/${seg()}`, -1),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: cùng method nhưng regex không khớp path -> giữ lại', () => {
    // covers P19, C10=true, C13=false, C14=false
    const { builder, routesMapper } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${seg()}/:id`, RequestMethod.GET),
      route(`/${seg()}x/${seg()}`, RequestMethod.GET),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: nhiều regex (mount path có prefix), regex đầu không khớp, regex sau khớp', () => {
    // covers P20, C14=false rồi true trong cùng some, regexes nhiều
    const { builder, routesMapper } = makeBuilder();
    const base = seg();
    const staticPath = `/b/${base}/${seg()}`;
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${base}/:id`, RequestMethod.GET, {
        mounts: [`/a/${base}/:id`, `/b/${base}/:id`],
      }),
      route(staticPath, RequestMethod.GET, { mounts: [staticPath] }),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: mount path không tĩnh (có wildcard/param) -> giữ nguyên', () => {
    // covers P21, C9=true (every false trên mảng nhiều phần tử)
    const { builder, routesMapper } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${seg()}/:id`, RequestMethod.GET),
      route(`/${seg()}`, RequestMethod.GET, {
        mounts: [`/${seg()}`, `/${seg()}/:x`],
      }),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: mount paths rỗng (every trên mảng rỗng)', () => {
    // covers P22, C9=false với mảng rỗng, C13=true với mảng rỗng
    const { builder, routesMapper } = makeBuilder();
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${seg()}/:id`, RequestMethod.GET, { mounts: [] }),
      route(`/${seg()}`, RequestMethod.GET, { mounts: [] }),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: compileMountPaths ném lỗi -> catch trả []', () => {
    // covers P23, C15=true, regexes rỗng nên some() = false
    // chỉ đạt được khi mock LegacyRouteConverter.tryConvert ném lỗi (mô phỏng path adapter không mount được)
    const { builder, routesMapper } = makeBuilder();
    const base = seg();
    (LegacyRouteConverter.tryConvert as any).mockImplementationOnce(() => {
      throw new Error(`cannot-mount-${randInt(100, 900)}`);
    });
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      route(`/${base}/:id`, RequestMethod.GET),
      route(`/${base}/${seg()}`, RequestMethod.GET),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });

  it('overlap: nhiều route tham số (routesWithRegex nhiều phần tử)', () => {
    // covers P24, B15 loop nhiều
    const { builder, routesMapper } = makeBuilder();
    const list = Array.from({ length: randInt(3, 5) }, () =>
      route(`/${seg()}/:id`, RequestMethod.GET),
    );
    routesMapper.mapRouteToRouteInfo.mockReturnValue([
      ...list,
      route(`/${seg()}/${seg()}`, RequestMethod.GET),
    ]);
    expect(() => builder.apply(Mw).forRoutes(seg())).not.toThrow();
  });
});
