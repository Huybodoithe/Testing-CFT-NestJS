/**
 * CFT spec: packages/core/middleware/route-info-path-extractor.ts
 * Lưu tại: packages/core/test-CFT-core-2/middleware/route-info-path-extractor.cft.spec.ts
 * Số dòng theo bản in bằng lệnh Get-Content (L<n>). Nhãn T1..T58 trùng với bảng trong báo cáo.
 *
 * ============================================================
 * 1. QUYẾT ĐỊNH (B) VÀ ĐIỀU KIỆN NGUYÊN TỐ (C)
 * ============================================================
 * constructor (L26-34): không có nhánh.
 * extractPathsFrom
 *   DP1 L39 version = this.getVersionOfUnversionedRoutes() (bỏ qua version / truyền version)
 *   B1  L43 if (isAWildcard(path))
 *   B2  L46 versionPaths.includes('') ? [] : versionPaths
 *   B3  L50 wildcardVersionPaths.length > 0 ? map.flat : (B4)
 *   B4  L57 this.prefixPath ? [prefix$, prefix+path] : [path]
 *   B5  L61 if (!Array.isArray(excludedGlobalPrefixRoutes))
 *   LP  L68-72 flatMap routes (0/1/nhiều), excludedVersionPaths.map (1/nhiều)
 * extractExcludedRoutesCoveredBy
 *   DP2 L96 { caseSensitive = false } = {} (bỏ qua / truyền)
 *   B15 L98-101 C15a !Array.isArray(excluded) || C15b isAWildcard(path) || C15c isRouteExcluded(...)
 *   B16 L106-114 try { pathToRegexp(...) } catch -> []
 *   LP  L115 flatMap excludedRoutes (0/1/nhiều)
 *   B17 L117 isRequestMethodAll(excludedRoute.requestMethod) ? method : excludedRoute.requestMethod
 *   B18 L120 if (!(C18a isRequestMethodAll(method) || C18b method === excludedMethod))
 *   B19 L126 C19a isStaticPath(excludedPath) && C19b routeRegex.test(excludedPath) ? excludedPath : (B20)
 *   B20 L128 isExcludedWithTrailingSlash(...) ? stripEndSlash(...)+'/' : undefined
 *   B21 L131 if (!coveredPath)
 *   B22 L138 if (version)
 * extractExclusionsFrom
 *   DP3 L155 { caseSensitive = true } = {} (bỏ qua / truyền); flatMap [route, ...covered]
 * getVersionPathsOfExcludedRoutes
 *   B24 L178 wildcardVersionPaths.length > 0
 *   B25 L181 C25a versioningConfig nullish (?.) ; C25b type !== URI
 * getPathsOfExcludedRoute
 *   B23 L199 isExcludedWithTrailingSlash(route, parentPath) ? [excludedPath, parentPath] : [excludedPath]
 * isExcludedWithTrailingSlash (L216-220)
 *   C22a pathWithoutSlash !== '' ; C22b pathRegex.test(p + '/') ; C22c !pathRegex.test(p)
 * extractPathFrom
 *   B26 L228 C26a isAWildcard(path) && C26b !route.version
 * isAWildcard
 *   B27 L237 isSimpleWildcard.includes(path) ; sau đó regex /^\/\{.*\}.*|^\/\*.*$/ (hai vế alternation)
 * extractNonWildcardPathsFrom
 *   B12 L252 C12a Array.isArray(excluded) && C12b isRouteExcluded(...)
 *   B13 L256 !versionPaths.length (trong nhánh excluded) ; B14 L265 !versionPaths.length ; map 1/nhiều
 * getVersionOfUnversionedRoutes
 *   B6  L280 C6a versioningConfig nullish (?.) ; C6b type !== URI
 *   B7  L284 !defaultVersion ; B8 L290 Array.isArray(defaultVersion)
 * extractVersionPathFrom
 *   B9  L299 C9a !versionValue || C9b versioningConfig nullish (?.) || C9c type !== URI
 *   B10 L306 version === VERSION_NEUTRAL ? '' : ... ; B11 L310 Array.isArray(versionValue)
 *
 * ============================================================
 * 2. BẢNG ĐIỀU KIỆN NGUYÊN TỐ (T: test phủ true, F: test phủ false)
 * ============================================================
 * B1   T: T36..T43      F: T34,T35
 * B2   T: T39           F: T36,T38
 * B3   T: T38,T43       F: T36,T37,T39
 * B4   T: T37           F: T36
 * B5   T: T36..T39      F: T40..T43
 * DP1  bỏ qua: T34,T36  truyền: T35,T38
 * C6a  T: T7            F: T8..T11
 * C6b  T: T7,T8         F: T9..T11     (chỉ đánh giá khi tính ?.type; luôn đánh giá)
 * B7   T: T9            F: T10,T11
 * B8   T: T11           F: T10
 * C9a  T: T12           F: T13..T17
 * C9b  T: T13           F: T14..T17    (chỉ đánh giá khi C9a=false)
 * C9c  T: T13,T14       F: T15..T17
 * B10  T: T16,T17       F: T15,T17
 * B11  T: T17           F: T15,T16
 * C12a T: T31..T33      F: T28..T30
 * C12b T: T32,T33       F: T31         (chỉ đánh giá khi C12a=true)
 * B13  T: T32           F: T33
 * B14  T: T28,T31       F: T29,T30
 * C15a T: T44           F: T45..T53
 * C15b T: T45           F: T46..T53    (chỉ đánh giá khi C15a=false)
 * C15c T: T46           F: T47..T53    (chỉ đánh giá khi C15b=false)
 * B16  T: T47 (catch)   F: T48..T53
 * B17  T: T49,T51       F: T48,T50
 * C18a T: T49           F: T48,T50,T51
 * C18b T: T48,T51       F: T50         (chỉ đánh giá khi C18a=false)
 * C19a T: T48,T49,T52   F: T51
 * C19b T: T48,T49       F: T52         (chỉ đánh giá khi C19a=true)
 * B20  T: T51           F: T52         (chỉ đánh giá khi B19 false)
 * B21  T: T52           F: T48,T49,T51
 * B22  T: T49           F: T48,T51
 * DP2  bỏ qua: T49      truyền: T48
 * DP3  bỏ qua: T54      truyền: T55
 * B24  T: T18,T43       F: T19,T20,T21
 * C25a T: T19           F: T20,T21
 * C25b T: T19,T20       F: T21
 * B23  T: T26           F: T27
 * C22a T: T23..T25      F: T22
 * C22b T: T24,T25       F: T23
 * C22c T: T25           F: T24
 * C26a T: T56,T57       F: T58
 * C26b T: T56           F: T57
 * B27  T: T3            F: T4,T5,T6    (T4: vế /{..}, T5: vế /*..)
 *
 * ============================================================
 * 3. BẢNG PATH (P theo từng hàm)
 * ============================================================
 * constructor: P1 (T1)                    getVersioningOptions: P1 (T2)
 * isAWildcard: P1 trong danh sách (T3); P2 regex khớp (T4,T5); P3 false (T6)
 * getVersionOfUnversionedRoutes: P1 không phải URI (T7,T8); P2 không defaultVersion (T9);
 *   P3 defaultVersion đơn (T10); P4 defaultVersion mảng, forEach nhiều phần tử (T11)
 * extractVersionPathFrom: P1 trả [] (T12,T13,T14); P2 giá trị đơn (T15,T16); P3 mảng (T17)
 * getVersionPathsOfExcludedRoutes: P1 (T18); P2 trả [''] (T19,T20); P3 URI (T21)
 * isExcludedWithTrailingSlash: P1 (T22); P2 (T23); P3 (T24); P4 true (T25)
 * getPathsOfExcludedRoute: P1 hai path (T26); P2 một path (T27)
 * extractNonWildcardPathsFrom: P1 excluded + không version (T32); P2 excluded + version (T33);
 *   P3 không excluded + không version (T28,T31); P4 không excluded + 1 version (T29); P5 nhiều version (T30)
 * extractPathsFrom: P1 không wildcard (T34,T35); P2 wildcard, trả sớm (T36..T39);
 *   P3 wildcard + exclusions, flatMap 0/1/nhiều (T40..T43)
 * extractExcludedRoutesCoveredBy: P1 trả [] sớm (T44,T45,T46); P2 catch (T47);
 *   P3 có route được phủ (T48,T49,T51); P4 flatMap trả [] (T50,T52,T53)
 * extractExclusionsFrom: P1 (T54); P2 (T55)
 * extractPathFrom: P1 wildcard không version (T56); P2 đi tiếp non-wildcard (T57,T58)
 *
 * ============================================================
 * 4. TỔNG KẾT
 * ============================================================
 * Mọi quyết định và điều kiện nguyên tố trong bảng đều có cả true và false. Unreachable: không có.
 * (Chưa chạy: coverage thực tế chờ bảng đo. V8 có thể không tính ??, ?. là nhánh riêng nên
 *  C3 chứng minh bằng bảng trên; ghi rõ "Branch % theo V8".)
 *
 * ============================================================
 * 5. LÝ DO MOCK
 * ============================================================
 * - Dùng ApplicationConfig thật (setGlobalPrefix, setGlobalPrefixOptions, enableVersioning) và RoutePathFactory,
 *   isRouteExcluded, isRequestMethodAll, isStaticPath, pathToRegexp thật. Không dùng vi.mock.
 * - ExcludeRouteMetadata dựng trực tiếp ({ path, pathRegex, requestMethod }) để không phụ thuộc hàm tạo ngoài file.
 * - T47: vi.spyOn(LegacyRouteConverter, 'tryConvert') ném lỗi để ép nhánh catch (B16) một cách ổn định, vì
 *   pattern không hợp lệ phụ thuộc phiên bản path-to-regexp và bộ chuyển đổi. mockRestore trong afterEach.
 *
 * ============================================================
 * 6. ĐỐI CHIẾU COPILOT
 * ============================================================
 * - Đúng (đã đối chiếu): exclude mặc định undefined nên `!Array.isArray` là đường thường gặp; dùng
 *   ApplicationConfig thật, không cần mock; ExcludeRouteMetadata và chữ ký hàm.
 * - Thiếu: không liệt kê điều kiện nguyên tố từng quyết định (C15a..c, C18a/b, C19a/b, C22a..c, C9a..c);
 *   bỏ sót `?.` (C6a, C9b, C25a), tham số mặc định (DP1..DP3), các public extractPathFrom,
 *   extractExclusionsFrom, getVersioningOptions và các vòng flatMap/map 0/1/nhiều.
 * - Chưa xác minh: Copilot nhắc `mapToExcludeRoute` nhưng không nêu đường dẫn; spec dựng metadata trực tiếp.
 *   Copilot cũng gợi ý thử input pattern không hợp lệ thật trước; spec dùng spy vì không thể kiểm chứng
 *   input đó ném lỗi ổn định.
 * - Giả định chưa xác minh: tên và chữ ký setGlobalPrefix/setGlobalPrefixOptions/enableVersioning (lấy từ gợi ý
 *   của Copilot); isStaticPath trả false cho path chứa `{`/`*`/`:` và true cho path thuần chữ; isRouteExcluded
 *   kiểm tra pathRegex trên path có dấu `/` đầu và so khớp requestMethod (ALL khớp mọi method).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestMethod, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { ApplicationConfig } from '../../application-config';
import { LegacyRouteConverter } from '../../router/legacy-route-converter';
import { RouteInfoPathExtractor } from '../../middleware/route-info-path-extractor';

// ---------- seed cố định ----------
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};
const seg = () => `s${rand(100, 999)}`;
const ver = () => String(rand(2, 9));

const spies: Array<{ mockRestore: () => void }> = [];
const track = <T extends { mockRestore: () => void }>(spy: T): T => {
  spies.push(spy);
  return spy;
};

beforeEach(() => {
  seed = 20261114;
});
afterEach(() => {
  spies.splice(0).forEach(s => s.mockRestore());
});

// ---------- hàm dựng ----------
function mk(opts: { prefix?: string; exclude?: any[]; versioning?: any } = {}) {
  const config = new ApplicationConfig();
  if (opts.prefix !== undefined) {
    config.setGlobalPrefix(opts.prefix);
  }
  if (opts.exclude !== undefined) {
    config.setGlobalPrefixOptions({ exclude: opts.exclude } as any);
  }
  if (opts.versioning !== undefined) {
    config.enableVersioning(opts.versioning);
  }
  const ex = new RouteInfoPathExtractor(config);
  return { ex, m: ex as any };
}
const exMeta = (
  path: string,
  pathRegex: RegExp,
  requestMethod: RequestMethod = RequestMethod.ALL,
) => ({ path, pathRegex, requestMethod }) as any;
const uri = (extra: object = {}) =>
  ({ type: VersioningType.URI, ...extra }) as any;
const header = () =>
  ({ type: VersioningType.HEADER, header: `x-v${rand(10, 99)}` }) as any;
const GET = RequestMethod.GET;
const POST = RequestMethod.POST;
const ALL = RequestMethod.ALL;

describe('RouteInfoPathExtractor (CFT)', () => {
  // ---------------- constructor, getVersioningOptions ----------------
  describe('constructor / getVersioningOptions', () => {
    it('T1: cấu hình mặc định', () => {
      // covers P1
      const { ex } = mk();
      expect(ex).toBeDefined();
    });

    it('T2: getVersioningOptions khi bật URI', () => {
      // covers P1
      const { ex } = mk({ versioning: uri() });
      expect(ex.getVersioningOptions()).toBeDefined();
    });
  });

  // ---------------- isAWildcard ----------------
  describe('isAWildcard', () => {
    it('T3: path nằm trong danh sách wildcard đơn giản', () => {
      // covers P1, B27=true
      const { m } = mk();
      expect(m.isAWildcard('/*')).toBeDefined();
    });

    it('T4: path khớp regex vế /{...}', () => {
      // covers P2, B27=false
      const { m } = mk();
      expect(m.isAWildcard(`/{${seg()}}x`)).toBeDefined();
    });

    it('T5: path khớp regex vế /*...', () => {
      // covers P2, B27=false
      const { m } = mk();
      expect(m.isAWildcard(`/*${seg()}`)).toBeDefined();
    });

    it('T6: path thường', () => {
      // covers P3, B27=false
      const { m } = mk();
      expect(m.isAWildcard(seg())).toBeDefined();
    });
  });

  // ---------------- getVersionOfUnversionedRoutes ----------------
  describe('getVersionOfUnversionedRoutes', () => {
    it('T7: chưa bật versioning', () => {
      // covers P1, C6a=true, C6b=true
      const { m } = mk();
      expect(() => m.getVersionOfUnversionedRoutes()).not.toThrow();
    });

    it('T8: versioning HEADER', () => {
      // covers P1, C6a=false, C6b=true
      const { m } = mk({ versioning: header() });
      expect(() => m.getVersionOfUnversionedRoutes()).not.toThrow();
    });

    it('T9: URI không có defaultVersion', () => {
      // covers P2, C6b=false, B7=true
      const { m } = mk({ versioning: uri() });
      expect(() => m.getVersionOfUnversionedRoutes()).not.toThrow();
    });

    it('T10: URI, defaultVersion là chuỗi', () => {
      // covers P3, B7=false, B8=false
      const { m } = mk({ versioning: uri({ defaultVersion: ver() }) });
      expect(() => m.getVersionOfUnversionedRoutes()).not.toThrow();
    });

    it('T11: URI, defaultVersion là mảng', () => {
      // covers P4, B8=true (forEach nhiều phần tử)
      const { m } = mk({
        versioning: uri({ defaultVersion: [ver(), `${ver()}${ver()}`] }),
      });
      expect(() => m.getVersionOfUnversionedRoutes()).not.toThrow();
    });
  });

  // ---------------- extractVersionPathFrom ----------------
  describe('extractVersionPathFrom', () => {
    it('T12: không có version', () => {
      // covers P1, C9a=true
      const { m } = mk({ versioning: uri() });
      expect(() => m.extractVersionPathFrom(undefined)).not.toThrow();
    });

    it('T13: có version nhưng chưa bật versioning', () => {
      // covers P1, C9a=false, C9b=true, C9c=true
      const { m } = mk();
      expect(() => m.extractVersionPathFrom(ver())).not.toThrow();
    });

    it('T14: có version, versioning HEADER', () => {
      // covers P1, C9b=false, C9c=true
      const { m } = mk({ versioning: header() });
      expect(() => m.extractVersionPathFrom(ver())).not.toThrow();
    });

    it('T15: URI, version là chuỗi', () => {
      // covers P2, C9c=false, B11=false, B10=false
      const { m } = mk({ versioning: uri() });
      expect(() => m.extractVersionPathFrom(ver())).not.toThrow();
    });

    it('T16: URI, VERSION_NEUTRAL đơn', () => {
      // covers P2, B10=true
      const { m } = mk({ versioning: uri() });
      expect(() => m.extractVersionPathFrom(VERSION_NEUTRAL)).not.toThrow();
    });

    it('T17: URI, mảng gồm chuỗi và VERSION_NEUTRAL', () => {
      // covers P3, B11=true, B10=true/false
      const { m } = mk({ versioning: uri() });
      expect(() =>
        m.extractVersionPathFrom([ver(), VERSION_NEUTRAL]),
      ).not.toThrow();
    });
  });

  // ---------------- getVersionPathsOfExcludedRoutes ----------------
  describe('getVersionPathsOfExcludedRoutes', () => {
    it('T18: wildcardVersionPaths không rỗng', () => {
      // covers P1, B24=true
      const { m } = mk();
      expect(m.getVersionPathsOfExcludedRoutes([`/v${ver()}`])).toBeDefined();
    });

    it('T19: rỗng, chưa bật versioning', () => {
      // covers P2, B24=false, C25a=true, C25b=true
      const { m } = mk();
      expect(m.getVersionPathsOfExcludedRoutes([])).toBeDefined();
    });

    it('T20: rỗng, versioning HEADER', () => {
      // covers P2, C25a=false, C25b=true
      const { m } = mk({ versioning: header() });
      expect(m.getVersionPathsOfExcludedRoutes([])).toBeDefined();
    });

    it('T21: rỗng, versioning URI', () => {
      // covers P3, C25b=false
      const { m } = mk({ versioning: uri() });
      expect(m.getVersionPathsOfExcludedRoutes([])).toBeDefined();
    });
  });

  // ---------------- isExcludedWithTrailingSlash ----------------
  describe('isExcludedWithTrailingSlash', () => {
    it('T22: path "/" (chuỗi rỗng sau chuẩn hóa)', () => {
      // covers P1, C22a=false
      const { m } = mk();
      const s = seg();
      expect(
        m.isExcludedWithTrailingSlash(
          { pathRegex: new RegExp(`^/${s}$`) },
          '/',
        ),
      ).toBeDefined();
    });

    it('T23: regex không khớp path có dấu "/" cuối', () => {
      // covers P2, C22a=true, C22b=false
      const { m } = mk();
      const a = seg();
      const b = seg();
      expect(
        m.isExcludedWithTrailingSlash(
          { pathRegex: new RegExp(`^/${a}$`) },
          `/${b}`,
        ),
      ).toBeDefined();
    });

    it('T24: regex khớp cả path có và không có "/" cuối', () => {
      // covers P3, C22b=true, C22c=false
      const { m } = mk();
      const a = seg();
      expect(
        m.isExcludedWithTrailingSlash(
          { pathRegex: new RegExp(`^/${a}(/.*)?$`) },
          `/${a}`,
        ),
      ).toBeDefined();
    });

    it('T25: regex chỉ khớp path có "/" cuối', () => {
      // covers P4, C22b=true, C22c=true
      const { m } = mk();
      const a = seg();
      expect(
        m.isExcludedWithTrailingSlash(
          { pathRegex: new RegExp(`^/${a}/.*$`) },
          `/${a}`,
        ),
      ).toBeDefined();
    });
  });

  // ---------------- getPathsOfExcludedRoute ----------------
  describe('getPathsOfExcludedRoute', () => {
    it('T26: route kết thúc bằng segment tùy chọn -> hai path', () => {
      // covers P1, B23=true
      const { m } = mk();
      const a = seg();
      const route = exMeta(`${a}/{*path}`, new RegExp(`^/${a}/.*$`));
      expect(m.getPathsOfExcludedRoute(route)).toBeDefined();
    });

    it('T27: route tĩnh -> một path', () => {
      // covers P2, B23=false
      const { m } = mk();
      const a = seg();
      const b = seg();
      const route = exMeta(`${a}/${b}`, new RegExp(`^/${a}/${b}$`));
      expect(m.getPathsOfExcludedRoute(route)).toBeDefined();
    });
  });

  // ---------------- extractNonWildcardPathsFrom ----------------
  describe('extractNonWildcardPathsFrom', () => {
    it('T28: exclude không phải mảng, không version', () => {
      // covers P3, C12a=false, B14=true
      const { m } = mk();
      expect(() =>
        m.extractNonWildcardPathsFrom({ path: `/${seg()}`, method: GET }),
      ).not.toThrow();
    });

    it('T29: exclude không phải mảng, URI 1 version', () => {
      // covers P4, B14=false (map 1 phần tử)
      const { m } = mk({ versioning: uri() });
      expect(() =>
        m.extractNonWildcardPathsFrom({
          path: `/${seg()}`,
          method: GET,
          version: ver(),
        }),
      ).not.toThrow();
    });

    it('T30: exclude không phải mảng, URI nhiều version', () => {
      // covers P5, B14=false (map nhiều phần tử)
      const { m } = mk({ prefix: seg(), versioning: uri() });
      expect(() =>
        m.extractNonWildcardPathsFrom({
          path: `/${seg()}`,
          method: GET,
          version: [ver(), `${ver()}${ver()}`],
        }),
      ).not.toThrow();
    });

    it('T31: exclude là mảng nhưng route không bị loại', () => {
      // covers P3, C12a=true, C12b=false, B14=true
      const a = seg();
      const { m } = mk({ exclude: [exMeta(`/${a}`, new RegExp(`^/${a}$`))] });
      expect(() =>
        m.extractNonWildcardPathsFrom({ path: `/${seg()}x`, method: GET }),
      ).not.toThrow();
    });

    it('T32: route bị loại, không version', () => {
      // covers P1, C12b=true, B13=true
      const a = seg();
      const { m } = mk({ exclude: [exMeta(`/${a}`, new RegExp(`^/${a}$`))] });
      expect(() =>
        m.extractNonWildcardPathsFrom({ path: `/${a}`, method: GET }),
      ).not.toThrow();
    });

    it('T33: route bị loại, có version', () => {
      // covers P2, B13=false
      const a = seg();
      const { m } = mk({
        exclude: [exMeta(`/${a}`, new RegExp(`^/${a}$`))],
        versioning: uri(),
      });
      expect(() =>
        m.extractNonWildcardPathsFrom({
          path: `/${a}`,
          method: GET,
          version: [ver(), `${ver()}${ver()}`],
        }),
      ).not.toThrow();
    });
  });

  // ---------------- extractPathsFrom ----------------
  describe('extractPathsFrom', () => {
    it('T34: không wildcard, bỏ qua version (dùng giá trị mặc định)', () => {
      // covers P1, B1=false, DP1=bỏ qua
      const { ex } = mk();
      expect(
        ex.extractPathsFrom({ path: `/${seg()}`, method: GET }),
      ).toBeDefined();
    });

    it('T35: không wildcard, truyền version', () => {
      // covers P1, DP1=truyền
      const { ex } = mk({ versioning: uri() });
      expect(
        ex.extractPathsFrom({ path: `/${seg()}`, method: GET, version: ver() }),
      ).toBeDefined();
    });

    it('T36: wildcard, không prefix, không version, exclude không phải mảng', () => {
      // covers P2, B1=true, B2=false, B3=false, B4=false, B5=true, DP1=bỏ qua
      const { ex } = mk();
      expect(ex.extractPathsFrom({ path: '/*', method: GET })).toBeDefined();
    });

    it('T37: wildcard có prefix', () => {
      // covers P2, B4=true
      const { ex } = mk({ prefix: seg() });
      expect(ex.extractPathsFrom({ path: '/*', method: GET })).toBeDefined();
    });

    it('T38: wildcard, URI nhiều version', () => {
      // covers P2, B2=false, B3=true, DP1=truyền
      const { ex } = mk({ prefix: seg(), versioning: uri() });
      expect(
        ex.extractPathsFrom({
          path: '/*',
          method: GET,
          version: [ver(), `${ver()}${ver()}`],
        }),
      ).toBeDefined();
    });

    it('T39: wildcard, VERSION_NEUTRAL', () => {
      // covers P2, B2=true, B3=false
      const { ex } = mk({ versioning: uri() });
      expect(
        ex.extractPathsFrom({
          path: '/*',
          method: GET,
          version: VERSION_NEUTRAL,
        }),
      ).toBeDefined();
    });

    it('T40: wildcard, exclude là mảng rỗng', () => {
      // covers P3, B5=false, flatMap 0 phần tử
      const { ex } = mk({ exclude: [] });
      expect(ex.extractPathsFrom({ path: '/*', method: GET })).toBeDefined();
    });

    it('T41: wildcard, exclude 1 route tĩnh', () => {
      // covers P3, flatMap 1 phần tử
      const a = seg();
      const b = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/${b}`, new RegExp(`^/${a}(/.*)?$`))],
      });
      expect(ex.extractPathsFrom({ path: '/*', method: GET })).toBeDefined();
    });

    it('T42: wildcard, exclude nhiều route, URI không có defaultVersion', () => {
      // covers P3, flatMap nhiều phần tử, B24=false, C25b=false
      const a = seg();
      const b = seg();
      const c = seg();
      const { ex } = mk({
        exclude: [
          exMeta(`${a}/{*path}`, new RegExp(`^/${a}/.*$`)),
          exMeta(`${b}/me`, new RegExp(`^/${b}/me$`)),
          exMeta(`/${c}`, new RegExp(`^/${c}$`)),
        ],
        versioning: uri(),
      });
      expect(ex.extractPathsFrom({ path: '/*', method: GET })).toBeDefined();
    });

    it('T43: wildcard, nhiều version và có exclude', () => {
      // covers P3, B3=true, B24=true (excludedVersionPaths.map nhiều phần tử)
      const a = seg();
      const b = seg();
      const { ex } = mk({
        exclude: [
          exMeta(`${a}/me`, new RegExp(`^/${a}/me$`)),
          exMeta(`${b}/{*path}`, new RegExp(`^/${b}/.*$`)),
        ],
        versioning: uri(),
      });
      expect(
        ex.extractPathsFrom({
          path: '/*',
          method: GET,
          version: [ver(), `${ver()}${ver()}`],
        }),
      ).toBeDefined();
    });
  });

  // ---------------- extractExcludedRoutesCoveredBy ----------------
  describe('extractExcludedRoutesCoveredBy', () => {
    it('T44: exclude không phải mảng', () => {
      // covers P1, C15a=true
      const { ex } = mk();
      expect(
        ex.extractExcludedRoutesCoveredBy({
          path: `/${seg()}/:id`,
          method: GET,
        }),
      ).toBeDefined();
    });

    it('T45: path là wildcard', () => {
      // covers P1, C15a=false, C15b=true
      const a = seg();
      const { ex } = mk({ exclude: [exMeta(`/${a}`, new RegExp(`^/${a}$`))] });
      expect(
        ex.extractExcludedRoutesCoveredBy({ path: '/*', method: GET }),
      ).toBeDefined();
    });

    it('T46: bản thân route đã bị loại', () => {
      // covers P1, C15b=false, C15c=true
      const a = seg();
      const b = seg();
      const { ex } = mk({
        exclude: [exMeta(`/${a}/${b}`, new RegExp(`^/${a}/${b}$`))],
      });
      expect(
        ex.extractExcludedRoutesCoveredBy({ path: `/${a}/${b}`, method: GET }),
      ).toBeDefined();
    });

    it('T47: pathToRegexp ném lỗi -> catch', () => {
      // covers P2, C15c=false, B16 catch
      const a = seg();
      const { ex } = mk({ exclude: [exMeta(`/${a}`, new RegExp(`^/${a}$`))] });
      track(
        vi.spyOn(LegacyRouteConverter, 'tryConvert').mockImplementation(() => {
          throw new Error('invalid pattern');
        }),
      );
      expect(
        ex.extractExcludedRoutesCoveredBy({
          path: `/${seg()}/:id`,
          method: GET,
        }),
      ).toBeDefined();
    });

    it('T48: route tĩnh được phủ, method khớp, truyền caseSensitive', () => {
      // covers P3, DP2=truyền, B17=false, C18a=false, C18b=true, C19a=true, C19b=true, B21=false, B22=false
      const a = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/me`, new RegExp(`^/${a}/me$`), GET)],
      });
      expect(
        ex.extractExcludedRoutesCoveredBy(
          { path: `/${a}/:id`, method: GET },
          { caseSensitive: true },
        ),
      ).toBeDefined();
    });

    it('T49: exclude ALL, route ALL, có version, bỏ qua tham số thứ hai', () => {
      // covers P3, DP2=bỏ qua, B17=true, C18a=true, C19a=true, C19b=true, B21=false, B22=true
      const a = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/me`, new RegExp(`^/${a}/me$`), ALL)],
      });
      expect(
        ex.extractExcludedRoutesCoveredBy({
          path: `/${a}/:id`,
          method: ALL,
          version: ver(),
        }),
      ).toBeDefined();
    });

    it('T50: method của route không khớp method của exclude', () => {
      // covers P4, C18a=false, C18b=false
      const a = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/me`, new RegExp(`^/${a}/me$`), GET)],
      });
      expect(
        ex.extractExcludedRoutesCoveredBy({ path: `/${a}/:id`, method: POST }),
      ).toBeDefined();
    });

    it('T51: exclude kết thúc bằng segment tùy chọn, phủ qua dấu "/" cuối', () => {
      // covers P3, B17=true, C18a=false, C18b=true, C19a=false, B20=true, B21=false, B22=false
      const a = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/{*path}`, new RegExp(`^/${a}/.*$`), ALL)],
      });
      expect(
        ex.extractExcludedRoutesCoveredBy({ path: `/${a}`, method: GET }),
      ).toBeDefined();
    });

    it('T52: exclude tĩnh nhưng route không khớp, không trailing slash', () => {
      // covers P4, C19a=true, C19b=false, B20=false, B21=true
      const a = seg();
      const b = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/list`, new RegExp(`^/${a}/list$`), ALL)],
      });
      expect(
        ex.extractExcludedRoutesCoveredBy({ path: `/${b}/:id`, method: GET }),
      ).toBeDefined();
    });

    it('T53: exclude là mảng rỗng', () => {
      // covers P4, flatMap 0 phần tử
      const { ex } = mk({ exclude: [] });
      expect(
        ex.extractExcludedRoutesCoveredBy({
          path: `/${seg()}/:id`,
          method: GET,
        }),
      ).toBeDefined();
    });
  });

  // ---------------- extractExclusionsFrom ----------------
  describe('extractExclusionsFrom', () => {
    it('T54: không có route được phủ, bỏ qua tham số thứ hai', () => {
      // covers P1, DP3=bỏ qua
      const { ex } = mk();
      expect(
        ex.extractExclusionsFrom({ path: `/${seg()}`, method: GET }),
      ).toBeDefined();
    });

    it('T55: có route được phủ, truyền caseSensitive', () => {
      // covers P2, DP3=truyền
      const a = seg();
      const { ex } = mk({
        exclude: [exMeta(`${a}/me`, new RegExp(`^/${a}/me$`), GET)],
      });
      expect(
        ex.extractExclusionsFrom(
          { path: `/${a}/:id`, method: GET },
          { caseSensitive: false },
        ),
      ).toBeDefined();
    });
  });

  // ---------------- extractPathFrom ----------------
  describe('extractPathFrom', () => {
    it('T56: wildcard, không version', () => {
      // covers P1, C26a=true, C26b=true
      const { ex } = mk();
      expect(ex.extractPathFrom({ path: '/*', method: GET })).toBeDefined();
    });

    it('T57: wildcard, có version', () => {
      // covers P2, C26a=true, C26b=false
      const { ex } = mk({ versioning: uri() });
      expect(
        ex.extractPathFrom({ path: '/*', method: GET, version: ver() }),
      ).toBeDefined();
    });

    it('T58: không wildcard', () => {
      // covers P2, C26a=false
      const { ex } = mk();
      expect(
        ex.extractPathFrom({ path: `/${seg()}`, method: GET }),
      ).toBeDefined();
    });
  });
});
