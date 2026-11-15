/**
 * CFT - packages/core/security/cross-origin-protection.ts
 *
 * Mã nguồn không có số dòng, nên vị trí ghi theo "hàm + biểu thức".
 * Nhãn: <F>.B<n> = quyết định, <F>.C<n> = điều kiện nguyên tố, <F>.P<n> = path.
 *   T = test phủ true, F = test phủ false. Mỗi path có đúng một test cùng số (E.P3 -> E3).
 *   F: E = evaluateCrossOriginRequest, X = exemptOr, M = originMatchesHost,
 *      N = normalizeTrustedOrigin, K = constructor, R = toRouteInfo, Q = compileExclusion,
 *      V = resolveExclusions, H = check, D = readHeader, I = isExcluded.
 *   X, M, R, Q, D, I là hàm/method private hoặc không export: được gọi gián tiếp qua hàm public.
 *
 * ============================================================================
 * E. evaluateCrossOriginRequest(request, exemptions = {})
 * ----------------------------------------------------------------------------
 * Quyết định:
 *   E.B1 tham số mặc định `exemptions = {}`
 *   E.B2 if (SAFE_METHODS.has(request.method))
 *   E.B3 if (secFetchSite)
 *   E.B4 if (secFetchSite === 'same-origin' || secFetchSite === 'none')
 *   E.B5 if (!origin)
 *   E.B6 if (request.host !== undefined && originMatchesHost(origin, request.host))
 * Điều kiện nguyên tố (T / F):
 *   E.C1 không truyền exemptions            T: E1            F: E2..E8
 *   E.C2 method thuộc SAFE_METHODS          T: E1            F: E2..E8
 *   E.C3 secFetchSite truthy                T: E2,E3,E4      F: E5..E8
 *   E.C4 secFetchSite === 'same-origin'     T: E2            F: E3,E4
 *   E.C5 secFetchSite === 'none' (chỉ khi C4 false)   T: E3  F: E4
 *   E.C6 !origin                            T: E5            F: E6,E7,E8
 *   E.C7 host !== undefined                 T: E6,E8         F: E7
 *   E.C8 originMatchesHost(...) (chỉ khi C7 true)     T: E6  F: E8
 * Path:
 *   E.P1 E1 GET/HEAD/OPTIONS, exemptions mặc định  -> allowed (safe-method)
 *   E.P2 E2 method không an toàn + same-origin     -> allowed (same-origin)
 *   E.P3 E3 method không an toàn + none            -> allowed (same-origin)
 *   E.P4 E4 method không an toàn + cross-site      -> exemptOr, bị từ chối
 *   E.P5 E5 không có header nào                    -> allowed (no-browser-headers)
 *   E.P6 E6 origin khớp host                       -> allowed (origin-matches-host)
 *   E.P7 E7 có origin, không có host               -> exemptOr, bị từ chối
 *   E.P8 E8 origin khác host                       -> exemptOr, bị từ chối
 *
 * ============================================================================
 * X. exemptOr (đạt tới qua evaluateCrossOriginRequest với Sec-Fetch-Site cross-site)
 * ----------------------------------------------------------------------------
 * Quyết định:
 *   X.B1 if (exemptions.isExcluded?.())
 *   X.B2 if (request.origin !== undefined && exemptions.trustedOrigins?.has(request.origin))
 * Điều kiện nguyên tố (T / F):
 *   X.C1 isExcluded là nil (?.)                       T: X4,X5   F: X1,X2,X3
 *   X.C2 kết quả isExcluded() truthy (khi C1 false)   T: X1      F: X2,X3
 *   X.C3 request.origin !== undefined                 T: X3,X4,X5  F: X2
 *   X.C4 trustedOrigins là nil (?., khi C3 true)      T: X3      F: X4,X5
 *   X.C5 trustedOrigins.has(origin) (khi C4 false)    T: X4      F: X5
 * Path:
 *   X.P1 X1 isExcluded trả true                        -> allowed (excluded)
 *   X.P2 X2 isExcluded trả false, không có origin       -> bị từ chối
 *   X.P3 X3 isExcluded trả false, có origin, không có trustedOrigins -> bị từ chối
 *   X.P4 X4 không có isExcluded, origin nằm trong trustedOrigins -> allowed (trusted-origin)
 *   X.P5 X5 trustedOrigins không chứa origin             -> bị từ chối
 *
 * ============================================================================
 * M. originMatchesHost (đạt tới qua evaluateCrossOriginRequest, không có Sec-Fetch-Site)
 * ----------------------------------------------------------------------------
 * Quyết định:
 *   M.B1 try { new URL(origin) } catch
 *   M.B2 if (!url.host)
 *   M.B3 if (url.host === authority)
 *   M.B4 return !url.port && defaultPort !== undefined && `${hostname}:${defaultPort}` === authority
 * Điều kiện nguyên tố (T / F):
 *   M.C1 !url.host                                    T: M2      F: M3..M7
 *   M.C2 url.host === authority                       T: M3      F: M4..M7
 *   M.C3 !url.port                                    T: M5,M6,M7  F: M4
 *   M.C4 defaultPort !== undefined (khi C3 true)      T: M6,M7   F: M5
 *   M.C5 `${hostname}:${defaultPort}` === authority (khi C3, C4 true)  T: M6  F: M7
 * Path:
 *   M.P1 M1 origin không phải URL ('null')            -> catch, trả false
 *   M.P2 M2 URL hợp lệ nhưng host rỗng (file:///...)  -> trả false
 *   M.P3 M3 url.host trùng authority                  -> trả true
 *   M.P4 M4 origin có cổng, khác authority            -> trả false (C3 false)
 *   M.P5 M5 scheme không có cổng mặc định (ftp)       -> trả false (C4 false)
 *   M.P6 M6 authority = host:443, origin https         -> trả true (C5 true)
 *   M.P7 M7 authority khác host:443                    -> trả false (C5 false)
 *
 * ============================================================================
 * N. normalizeTrustedOrigin(origin)
 * ----------------------------------------------------------------------------
 * Quyết định:
 *   N.B1 if (!isString(origin) || origin.length === 0)
 *   N.B2 if (!regex scheme://host[:port] .test(origin))
 *   N.B3 try { new URL(origin) } catch
 *   N.B4 if (!url.host)
 *   N.B5 if (url.username || url.password)
 *   N.B6 if (url.host.includes('*'))
 * Điều kiện nguyên tố (T / F):
 *   N.C1 !isString(origin)                       T: N1      F: N2..N9
 *   N.C2 origin.length === 0 (khi C1 false)      T: N2      F: N3..N9
 *   N.C3 regex không khớp                        T: N3      F: N4..N9
 *   N.C4 !url.host                               T: N5      F: N6..N9
 *   N.C5 url.username truthy                     T: N6      F: N7,N8,N9
 *   N.C6 url.password truthy (khi C5 false)      T: N7      F: N8,N9
 *   N.C7 url.host.includes('*')                  T: N8      F: N9
 *   (N.B3 catch: T = N4, F = N5..N9)
 * Path:
 *   N.P1 N1 không phải chuỗi             -> ném lỗi
 *   N.P2 N2 chuỗi rỗng                   -> ném lỗi
 *   N.P3 N3 có path / thiếu scheme       -> ném lỗi (regex)
 *   N.P4 N4 regex khớp, URL ném lỗi      -> ném lỗi (catch)
 *   N.P5 N5 host rỗng (file://localhost) -> ném lỗi (xem lưu ý bên dưới)
 *   N.P6 N6 có username                  -> ném lỗi
 *   N.P7 N7 chỉ có password              -> ném lỗi
 *   N.P8 N8 host có '*'                  -> ném lỗi
 *   N.P9 N9 origin hợp lệ                -> trả `scheme//host`
 *   Lưu ý N5: phụ thuộc hành vi chuẩn WHATWG URL (host 'localhost' của file: thành chuỗi rỗng).
 *   Mình chưa chạy; nếu URL không trả host rỗng thì N.C4=true là unreachable.
 *   Vì vậy N5 dùng attempt() (không assert ném hay không), các test N khác dùng toThrow().
 *
 * ============================================================================
 * K. constructor(httpAdapter, options = {})
 * ----------------------------------------------------------------------------
 * Quyết định:
 *   K.B1 tham số mặc định `options = {}`          K.B2 if (!isPlainObject(options))
 *   K.B3 for (key of Object.keys(options)): 0 / 1 / nhiều lần
 *   K.B4 if (key !== 'trustedOrigins' && key !== 'exclude')
 *   K.B5 destructuring mặc định `trustedOrigins = []`
 *   K.B6 if (!Array.isArray(trustedOrigins))
 *   K.B7 if (isFunction(exclude))   K.B8 else if (Array.isArray(exclude))
 *   K.B9 else if (exclude !== undefined)
 *   K.B10 for (route of this.excludedRoutes): 0 / 1 / nhiều lần
 * Điều kiện nguyên tố (T / F):
 *   K.C1 không truyền options                    T: K1       F: K2..K11
 *   K.C2 !isPlainObject(options)                 T: K2       F: K1,K3..K11
 *   K.C3 key !== 'trustedOrigins'                T: K3,K4,K7,K8,K9,K10   F: K4,K11
 *   K.C4 key !== 'exclude' (khi C3 true)         T: K3       F: K4,K7,K8,K9,K10
 *   K.C5 không truyền trustedOrigins             T: K1,K7,K8,K9,K10   F: K4,K5,K6,K11
 *   K.C6 !Array.isArray(trustedOrigins)          T: K5       F: K4,K6,K11
 *   K.C7 isFunction(exclude)                     T: K4       F: K1,K7,K8,K9,K10,K11
 *   K.C8 Array.isArray(exclude)                  T: K7,K8,K10   F: K1,K9,K11
 *   K.C9 exclude !== undefined (khi C7, C8 false)  T: K9     F: K1,K11
 *   Vòng K.B3: 0 lần K1; 1 lần K10; nhiều lần K4. Vòng K.B10: 0 lần K8; 1 lần K10; nhiều lần K7.
 * Path (mỗi path một test cùng số):
 *   K.P1 K1 không truyền options        K.P2 K2 options không phải object -> ném lỗi
 *   K.P3 K3 key lạ -> ném lỗi           K.P4 K4 trustedOrigins + exclude là hàm
 *   K.P5 K5 trustedOrigins không phải mảng -> ném lỗi
 *   K.P6 K6 trustedOrigins có origin sai -> ném lỗi (từ normalizeTrustedOrigin)
 *   K.P7 K7 exclude là mảng nhiều route (chuỗi và object)
 *   K.P8 K8 exclude là mảng rỗng        K.P9 K9 exclude sai kiểu -> ném lỗi
 *   K.P10 K10 exclude là mảng một route K.P11 K11 chỉ có trustedOrigins hợp lệ
 *
 * ============================================================================
 * R. toRouteInfo(route) (đạt tới qua constructor với exclude là mảng)
 * ----------------------------------------------------------------------------
 * Quyết định: R.B1 if (isString(route))
 *   R.B2 if (!route || !isString(route.path) || typeof route.method !== 'number'
 *            || RequestMethod[route.method] === undefined)
 * Điều kiện nguyên tố (T / F):
 *   R.C1 isString(route)                         T: R1       F: R2..R6
 *   R.C2 !route                                  T: R2       F: R3..R6
 *   R.C3 !isString(route.path)                   T: R3       F: R4,R5,R6
 *   R.C4 typeof route.method !== 'number'        T: R4       F: R5,R6
 *   R.C5 RequestMethod[route.method] === undefined  T: R5    F: R6
 * Path: R.P1 R1 route là chuỗi; R.P2 R2 route là null (ném lỗi); R.P3 R3 path không phải chuỗi
 *   (ném lỗi); R.P4 R4 method không phải số (ném lỗi); R.P5 R5 method số không có trong enum
 *   (ném lỗi); R.P6 R6 route object hợp lệ.
 *
 * ============================================================================
 * Q. compileExclusion(path, requestMethod, logs) (đạt tới qua constructor)
 * ----------------------------------------------------------------------------
 * Quyết định: Q.B1 converted.length > 1 ? converted.replace(...) : converted
 *             Q.B2 addLeadingSlash(normalized) || '/'
 * Điều kiện nguyên tố (T / F):
 *   Q.C1 converted.length > 1                    T: Q1       F: Q2,Q3
 *   Q.C2 addLeadingSlash(normalized) truthy      T: Q1,Q2    F: Q3
 * Path: Q.P1 Q1 chuỗi dài, bỏ dấu '/' cuối; Q.P2 Q2 chuỗi '/' (độ dài 1); Q.P3 Q3 chuỗi rỗng
 *   (dùng '/' dự phòng).
 *
 * ============================================================================
 * V. resolveExclusions(pathExtractor)
 * ----------------------------------------------------------------------------
 * Quyết định: V.B1 flatMap trên excludedRoutes (0 / 1 / nhiều); V.B2 map trên kết quả
 *   extractExclusionsFrom (0 / 1 / nhiều); V.B3 if (route.version);
 *   V.B4 !!httpAdapter.getRouteMatchingOptions?.()?.ignoreTrailingSlash
 * Điều kiện nguyên tố (T / F):
 *   V.C1 route.version truthy                        T: V3      F: V2,V5
 *   V.C2 getRouteMatchingOptions là nil (?.())       T: V1      F: V2,V3,V4
 *   V.C3 kết quả của nó là nil (?.), khi C2 false    T: V2      F: V3,V4
 *   V.C4 ignoreTrailingSlash truthy, khi C3 false    T: V3      F: V4
 *   Vòng ngoài: 0 lần V1; 1 lần V2; nhiều lần V5. Vòng trong: 0 lần V4; 1 lần V2; nhiều lần V3.
 * Path: V.P1 V1 không có route nào; V.P2 V2 một route không version, getRouteMatchingOptions trả
 *   undefined; V.P3 V3 route có version, extractor trả 2 mục, ignoreTrailingSlash = true;
 *   V.P4 V4 extractor trả 0 mục, ignoreTrailingSlash = false; V.P5 V5 hai route.
 *
 * ============================================================================
 * H. check(request)
 * ----------------------------------------------------------------------------
 * Quyết định: H.B1 `(request.headers ?? {})`; H.B2 `readHeader(':authority') ?? readHeader('host')`;
 *   H.B3 if (decision.allowed)
 * Điều kiện nguyên tố (T / F):
 *   H.C1 request.headers là nullish                  T: H1      F: H2..H5
 *   H.C2 header ':authority' là nullish              T: H1..H4  F: H5
 *   H.C3 decision.allowed                            T: H1,H2,H5  F: H3,H4
 * Path: H.P1 H1 request không có headers, method an toàn (trả undefined); H.P2 H2 same-origin
 *   (trả undefined); H.P3 H3 cross-site (trả ForbiddenException, closure isExcluded được gọi);
 *   H.P4 H4 origin khác host dùng header 'host' (từ chối); H.P5 H5 có ':authority' (HTTP/2, cho qua).
 *
 * ============================================================================
 * D. readHeader(headers, name)
 * ----------------------------------------------------------------------------
 * Quyết định: D.B1 if (value === undefined); D.B2 Array.isArray(value) ? value.join(', ') : value
 * Điều kiện nguyên tố (T / F):
 *   D.C1 value === undefined                         T: D1      F: D2,D3
 *   D.C2 Array.isArray(value) (khi C1 false)         T: D3      F: D2
 * Path: D.P1 D1 header vắng mặt; D.P2 D2 header là chuỗi; D.P3 D3 header lặp (mảng, nối bằng ', ').
 *
 * ============================================================================
 * I. isExcluded(request) (đạt tới qua check với Sec-Fetch-Site cross-site)
 * ----------------------------------------------------------------------------
 * Quyết định:
 *   I.B1 if (this.excludePredicate)     I.B2 if (this.resolvedExclusions.length === 0)
 *   I.B3 `getRequestUrl(request) ?? ''` I.B4 queryIndex >= 0 ? slice : url
 *   I.B5 if (!pathname.startsWith('/') || NON_CANONICAL_PATH.test(pathname))
 *   I.B6 isRouteExcluded(...) && isVersionRequested(exclusion) (trong some: 1 / nhiều exclusion)
 *   I.B7 if (this.ignoreTrailingSlash && pathname.length > 1 && pathname.endsWith('/'))
 *   I.B8 isPathExcluded(pathname) && isPathExcluded(pathname không có '/' cuối)
 * Điều kiện nguyên tố (T / F):
 *   I.C1  excludePredicate được đặt                   T: I1,I2      F: I3..I17
 *   I.C2  resolvedExclusions.length === 0              T: I3         F: I4..I17
 *   I.C3  getRequestUrl trả nullish                    T: I4         F: I5..I17
 *   I.C4  queryIndex >= 0                              T: I5         F: I4,I6..I17
 *   I.C5  !pathname.startsWith('/')                    T: I4,I7      F: I5,I6,I8..I17
 *   I.C6  NON_CANONICAL_PATH.test (khi C5 false)       T: I8         F: I5,I6,I9..I17
 *   I.C7  isRouteExcluded(...)                         T: I6,I9,I11,I14,I16,I17   F: I5,I10,I15,I17
 *   I.C8  isVersionRequested(...) (khi C7 true)        T: I6,I11,I14,I16,I17      F: I9
 *   I.C9  this.ignoreTrailingSlash                     T: I12..I16   F: I6,I9,I11,I17
 *   I.C10 pathname.length > 1 (khi C9 true)            T: I13..I16   F: I12
 *   I.C11 pathname.endsWith('/') (khi C9, C10 true)    T: I14,I15,I16   F: I13
 *   I.C12 isPathExcluded(pathname) (nhánh dấu '/' cuối)  T: I14,I16   F: I15
 *   I.C13 isPathExcluded(bỏ dấu '/', khi C12 true)     T: I14        F: I16
 * Path (mỗi path một test cùng số):
 *   I.P1 I1 predicate trả true -> allowed     I.P2 I2 predicate trả false -> từ chối
 *   I.P3 I3 chưa resolveExclusions -> từ chối  I.P4 I4 request không có url -> từ chối
 *   I.P5 I5 url có query, route không khớp     I.P6 I6 url không query, route + version khớp -> allowed
 *   I.P7 I7 url không bắt đầu bằng '/'          I.P8 I8 url có '//' (không chuẩn hóa)
 *   I.P9 I9 route khớp nhưng version không khớp I.P10 I10 route không khớp
 *   I.P11 I11 không ignoreTrailingSlash, url có '/' cuối, khớp -> allowed
 *   I.P12 I12 ignoreTrailingSlash, url '/'      I.P13 I13 ignoreTrailingSlash, url không có '/' cuối
 *   I.P14 I14 ignoreTrailingSlash, '/' cuối, cả hai path khớp -> allowed
 *   I.P15 I15 path có '/' cuối không khớp       I.P16 I16 path có '/' khớp, path bỏ '/' không khớp
 *   I.P17 I17 hai exclusion, exclusion đầu không khớp, exclusion sau khớp -> allowed
 *
 * ============================================================================
 * Tổng kết (theo thiết kế, CHƯA CHẠY): 79 test cho 79 path.
 *   Quyết định đạt cả hai hướng: 49/49. Điều kiện nguyên tố đạt cả true và false: 63/63.
 *   Unreachable: không có (N.C4=true phụ thuộc hành vi URL, xem lưu ý ở N).
 *   V8 có thể không đếm ?. và ?? là nhánh riêng, nên C3 chứng minh bằng các bảng trên.
 *
 * Lý do mock (chỉ khi nhánh không đạt được bằng cách khác):
 *   1. vi.mock một phần '../../middleware/utils.js' (createRequestedVersionMatcher) và
 *      '../../router/utils/index.js' (isRouteExcluded): chưa xem hành vi thật của hai hàm này,
 *      cần điều khiển true/false của `isRouteExcluded(...) && isVersionRequested(...)` (I.C7, I.C8)
 *      và thứ tự kết quả của hai lần gọi isPathExcluded (I.C12, I.C13).
 *   2. vi.spyOn(LegacyRouteConverter, 'tryConvert') chỉ ở Q1..Q3: cần chuỗi trả về có độ dài
 *      lớn hơn 1, bằng '/', và rỗng để đạt Q.C1 và Q.C2; hành vi thật chưa được xem.
 *   3. HttpServer và RouteInfoPathExtractor là object giả tối giản (chỉ các method file nguồn gọi).
 *   Dùng bản thật: URL, path-to-regexp, @nestjs/common (RequestMethod), @nestjs/common/internal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import {
  CrossOriginProtection,
  evaluateCrossOriginRequest,
  normalizeTrustedOrigin,
} from '../../security/cross-origin-protection.js';
import { createRequestedVersionMatcher } from '../../middleware/utils.js';
import { LegacyRouteConverter } from '../../router/legacy-route-converter.js';
import { isRouteExcluded } from '../../router/utils/index.js';

vi.mock('../../middleware/utils.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createRequestedVersionMatcher: vi.fn(),
}));
vi.mock('../../router/utils/index.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isRouteExcluded: vi.fn(),
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
const pick = <T>(items: readonly T[]): T => items[randInt(0, items.length - 1)];
const randWord = (): string => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const length = randInt(5, 9);
  let word = '';
  for (let i = 0; i < length; i++)
    word += letters[randInt(0, letters.length - 1)];
  return word;
};

const SAFE = ['GET', 'HEAD', 'OPTIONS'];
const UNSAFE = ['POST', 'PUT', 'DELETE', 'PATCH'];

// Chạy hàm và trả về kết quả hoặc lỗi, không làm test thất bại (dùng cho điểm phụ thuộc hành vi URL)
const attempt = (fn: () => unknown): unknown => {
  try {
    return fn();
  } catch (error) {
    return error;
  }
};

// HttpServer giả: chỉ có các method mà file nguồn gọi
const makeAdapter = (getRouteMatchingOptions?: () => unknown) =>
  ({
    getRequestMethod: vi.fn((request: any) => request.method),
    getRequestUrl: vi.fn((request: any) => request.url),
    ...(getRouteMatchingOptions ? { getRouteMatchingOptions } : {}),
  }) as any;

// RouteInfoPathExtractor giả
const makeExtractor = (items: Array<{ path: string; method: RequestMethod }>) =>
  ({
    extractExclusionsFrom: vi.fn(() => items),
    getVersioningOptions: vi.fn(() => undefined),
  }) as any;

// Điều khiển lần lượt kết quả của isRouteExcluded; hết danh sách thì lặp lại giá trị cuối
const setRouteExcluded = (...results: boolean[]) => {
  const fn = vi.mocked(isRouteExcluded);
  results.forEach(result => fn.mockReturnValueOnce(result));
  fn.mockReturnValue(results[results.length - 1]);
};

// Điều khiển lần lượt kết quả của predicate do createRequestedVersionMatcher trả về
const setVersionOk = (...results: boolean[]) => {
  const predicate = vi.fn();
  results.forEach(result => predicate.mockReturnValueOnce(result));
  predicate.mockReturnValue(results[results.length - 1]);
  vi.mocked(createRequestedVersionMatcher).mockReturnValue(predicate as any);
};

const crossSite = (url: string | undefined, method = pick(UNSAFE)) => ({
  method,
  url,
  headers: { 'sec-fetch-site': 'cross-site' },
});

const noTrailing = () => ({ ignoreTrailingSlash: false });
const ignoreTrailing = () => ({ ignoreTrailingSlash: true });

// CrossOriginProtection đã resolveExclusions với itemCount exclusion
const resolved = (matching: () => unknown, itemCount = 1) => {
  const protection = new CrossOriginProtection<any>(makeAdapter(matching), {
    exclude: [`/hooks${randInt(100, 900)}`],
  } as any);
  const items = Array.from({ length: itemCount }, (_, index) => ({
    path: `/hooks${randInt(100, 900)}${index}`,
    method: RequestMethod.ALL,
  }));
  protection.resolveExclusions(makeExtractor(items));
  return protection;
};

let convertSpy: { mockRestore(): void } | undefined;

beforeEach(() => {
  state = SEED;
  vi.resetAllMocks();
});

afterEach(() => {
  convertSpy?.mockRestore();
  convertSpy = undefined;
});

describe('evaluateCrossOriginRequest (CFT)', () => {
  it('E1: method an toàn, không truyền exemptions', () => {
    // covers E.P1, E.C1=true, E.C2=true
    expect(evaluateCrossOriginRequest({ method: pick(SAFE) })).toBeDefined();
  });

  it('E2: Sec-Fetch-Site là same-origin', () => {
    // covers E.P2, E.C1=false, E.C2=false, E.C3=true, E.C4=true
    expect(
      evaluateCrossOriginRequest(
        { method: pick(UNSAFE), secFetchSite: 'same-origin' },
        {},
      ),
    ).toBeDefined();
  });

  it('E3: Sec-Fetch-Site là none', () => {
    // covers E.P3, E.C4=false, E.C5=true
    expect(
      evaluateCrossOriginRequest(
        { method: pick(UNSAFE), secFetchSite: 'none' },
        {},
      ),
    ).toBeDefined();
  });

  it('E4: Sec-Fetch-Site là cross-site hoặc same-site', () => {
    // covers E.P4, E.C4=false, E.C5=false
    expect(
      evaluateCrossOriginRequest(
        {
          method: pick(UNSAFE),
          secFetchSite: pick(['cross-site', 'same-site']),
        },
        {},
      ),
    ).toBeDefined();
  });

  it('E5: không có Sec-Fetch-Site và không có Origin', () => {
    // covers E.P5, E.C3=false, E.C6=true
    expect(
      evaluateCrossOriginRequest({ method: pick(UNSAFE) }, {}),
    ).toBeDefined();
  });

  it('E6: Origin khớp Host', () => {
    // covers E.P6, E.C6=false, E.C7=true, E.C8=true
    const word = randWord();
    expect(
      evaluateCrossOriginRequest(
        {
          method: pick(UNSAFE),
          origin: `https://${word}.example`,
          host: `${word}.example`,
        },
        {},
      ),
    ).toBeDefined();
  });

  it('E7: có Origin nhưng không có Host', () => {
    // covers E.P7, E.C7=false
    expect(
      evaluateCrossOriginRequest(
        { method: pick(UNSAFE), origin: `https://${randWord()}.example` },
        {},
      ),
    ).toBeDefined();
  });

  it('E8: Origin khác Host', () => {
    // covers E.P8, E.C8=false
    const word = randWord();
    expect(
      evaluateCrossOriginRequest(
        {
          method: pick(UNSAFE),
          origin: `https://${word}.example`,
          host: `other${word}.example`,
        },
        {},
      ),
    ).toBeDefined();
  });
});

describe('exemptOr (CFT, qua evaluateCrossOriginRequest)', () => {
  const request = (origin?: string) => ({
    method: pick(UNSAFE),
    secFetchSite: 'cross-site',
    origin,
  });

  it('X1: isExcluded trả true', () => {
    // covers X.P1, X.C1=false, X.C2=true
    const isExcluded = vi.fn(() => true);
    expect(evaluateCrossOriginRequest(request(), { isExcluded })).toBeDefined();
    expect(isExcluded).toHaveBeenCalled();
  });

  it('X2: isExcluded trả false và không có origin', () => {
    // covers X.P2, X.C2=false, X.C3=false
    const isExcluded = vi.fn(() => false);
    expect(evaluateCrossOriginRequest(request(), { isExcluded })).toBeDefined();
  });

  it('X3: isExcluded trả false, có origin, không có trustedOrigins', () => {
    // covers X.P3, X.C3=true, X.C4=true
    const isExcluded = vi.fn(() => false);
    expect(
      evaluateCrossOriginRequest(request(`https://${randWord()}.example`), {
        isExcluded,
      }),
    ).toBeDefined();
  });

  it('X4: không có isExcluded, origin nằm trong trustedOrigins', () => {
    // covers X.P4, X.C1=true, X.C4=false, X.C5=true
    const origin = `https://${randWord()}.example`;
    expect(
      evaluateCrossOriginRequest(request(origin), {
        trustedOrigins: new Set([origin]),
      }),
    ).toBeDefined();
  });

  it('X5: trustedOrigins không chứa origin', () => {
    // covers X.P5, X.C5=false
    const origin = `https://${randWord()}.example`;
    expect(
      evaluateCrossOriginRequest(request(origin), {
        trustedOrigins: new Set([`https://other${randWord()}.example`]),
      }),
    ).toBeDefined();
  });
});

describe('originMatchesHost (CFT, qua evaluateCrossOriginRequest)', () => {
  const evalOrigin = (origin: string, host: string) =>
    evaluateCrossOriginRequest({ method: pick(UNSAFE), origin, host }, {});

  it('M1: origin không phải URL', () => {
    // covers M.P1, M.B1=catch
    expect(evalOrigin('null', `${randWord()}.example`)).toBeDefined();
  });

  it('M2: URL hợp lệ nhưng host rỗng', () => {
    // covers M.P2, M.C1=true
    expect(
      evalOrigin(`file:///${randWord()}`, `${randWord()}.example`),
    ).toBeDefined();
  });

  it('M3: url.host trùng authority', () => {
    // covers M.P3, M.C1=false, M.C2=true
    const word = randWord();
    expect(
      evalOrigin(`https://${word}.example`, `${word}.example`),
    ).toBeDefined();
  });

  it('M4: origin có cổng khác authority', () => {
    // covers M.P4, M.C2=false, M.C3=false
    const word = randWord();
    expect(
      evalOrigin(
        `https://${word}.example:${randInt(8000, 8499)}`,
        `${word}.example:${randInt(8500, 8999)}`,
      ),
    ).toBeDefined();
  });

  it('M5: scheme không có cổng mặc định', () => {
    // covers M.P5, M.C3=true, M.C4=false
    const word = randWord();
    expect(
      evalOrigin(`ftp://${word}.example`, `other${word}.example`),
    ).toBeDefined();
  });

  it('M6: authority bằng host:443 với origin https', () => {
    // covers M.P6, M.C4=true, M.C5=true
    const word = randWord();
    expect(
      evalOrigin(`https://${word}.example`, `${word}.example:443`),
    ).toBeDefined();
  });

  it('M7: authority khác host:443', () => {
    // covers M.P7, M.C5=false
    const word = randWord();
    expect(
      evalOrigin(`https://${word}.example`, `other${word}.example:443`),
    ).toBeDefined();
  });
});

describe('normalizeTrustedOrigin (CFT)', () => {
  it('N1: không phải chuỗi', () => {
    // covers N.P1, N.C1=true
    expect(() => normalizeTrustedOrigin(randInt(100, 900) as any)).toThrow();
  });

  it('N2: chuỗi rỗng', () => {
    // covers N.P2, N.C1=false, N.C2=true
    expect(() => normalizeTrustedOrigin('')).toThrow();
  });

  it('N3: origin có path', () => {
    // covers N.P3, N.C2=false, N.C3=true
    const word = randWord();
    expect(() =>
      normalizeTrustedOrigin(`https://${word}.example/${word}`),
    ).toThrow();
  });

  it('N4: regex khớp nhưng URL không hợp lệ', () => {
    // covers N.P4, N.C3=false, N.B3=catch
    const word = randWord();
    expect(() => normalizeTrustedOrigin(`http://${word} ${word}`)).toThrow();
  });

  it('N5: host rỗng (file://localhost)', () => {
    // covers N.P5, N.C4=true. Phụ thuộc hành vi URL nên dùng attempt(), xem lưu ý ở N.
    expect(
      attempt(() => normalizeTrustedOrigin('file://localhost')),
    ).toBeDefined();
  });

  it('N6: có username', () => {
    // covers N.P6, N.C4=false, N.C5=true
    const word = randWord();
    expect(() =>
      normalizeTrustedOrigin(`https://${word}@${word}.example`),
    ).toThrow();
  });

  it('N7: chỉ có password', () => {
    // covers N.P7, N.C5=false, N.C6=true
    const word = randWord();
    expect(() =>
      normalizeTrustedOrigin(`https://:${word}@${word}.example`),
    ).toThrow();
  });

  it('N8: host có ký tự đại diện', () => {
    // covers N.P8, N.C6=false, N.C7=true
    expect(() =>
      normalizeTrustedOrigin(`https://*.${randWord()}.example`),
    ).toThrow();
  });

  it('N9: origin hợp lệ', () => {
    // covers N.P9, N.C7=false
    expect(
      normalizeTrustedOrigin(
        `https://${randWord()}.example:${randInt(8000, 8999)}`,
      ),
    ).toBeDefined();
  });
});

describe('CrossOriginProtection constructor (CFT)', () => {
  it('K1: không truyền options', () => {
    // covers K.P1, K.C1=true, K.C5=true, K.C7=false, K.C8=false, K.C9=false, K.B3=0 lần
    expect(() => new CrossOriginProtection(makeAdapter())).not.toThrow();
  });

  it('K2: options không phải object', () => {
    // covers K.P2, K.C2=true
    expect(
      () =>
        new CrossOriginProtection(
          makeAdapter(),
          `invalid${randInt(100, 900)}` as any,
        ),
    ).toThrow();
  });

  it('K3: options có key lạ', () => {
    // covers K.P3, K.C3=true, K.C4=true
    expect(
      () =>
        new CrossOriginProtection(makeAdapter(), {
          [`unknown${randInt(100, 900)}`]: true,
        } as any),
    ).toThrow();
  });

  it('K4: trustedOrigins hợp lệ và exclude là hàm', () => {
    // covers K.P4, K.C3=false (key trustedOrigins), K.C4=false (key exclude), K.C5=false, K.C6=false, K.C7=true, K.B3=nhiều lần
    const options = {
      trustedOrigins: [`https://${randWord()}.example`],
      exclude: vi.fn(() => false),
    };
    expect(
      () => new CrossOriginProtection(makeAdapter(), options as any),
    ).not.toThrow();
  });

  it('K5: trustedOrigins không phải mảng', () => {
    // covers K.P5, K.C6=true
    expect(
      () =>
        new CrossOriginProtection(makeAdapter(), {
          trustedOrigins: randWord(),
        } as any),
    ).toThrow();
  });

  it('K6: trustedOrigins chứa origin sai', () => {
    // covers K.P6, normalizeTrustedOrigin ném lỗi trong map
    expect(
      () =>
        new CrossOriginProtection(makeAdapter(), {
          trustedOrigins: [`invalid ${randWord()}`],
        } as any),
    ).toThrow();
  });

  it('K7: exclude là mảng nhiều route', () => {
    // covers K.P7, K.C8=true, K.B10=nhiều lần
    const options = {
      exclude: [
        `/hooks${randInt(100, 900)}`,
        { path: `/api${randInt(100, 900)}`, method: RequestMethod.POST },
      ],
    };
    expect(
      () => new CrossOriginProtection(makeAdapter(), options as any),
    ).not.toThrow();
  });

  it('K8: exclude là mảng rỗng', () => {
    // covers K.P8, K.C8=true, K.B10=0 lần
    expect(
      () => new CrossOriginProtection(makeAdapter(), { exclude: [] } as any),
    ).not.toThrow();
  });

  it('K9: exclude sai kiểu', () => {
    // covers K.P9, K.C9=true
    expect(
      () =>
        new CrossOriginProtection(makeAdapter(), {
          exclude: randWord(),
        } as any),
    ).toThrow();
  });

  it('K10: exclude là mảng một route', () => {
    // covers K.P10, K.B3=1 lần, K.B10=1 lần
    expect(
      () =>
        new CrossOriginProtection(makeAdapter(), {
          exclude: [`/solo${randInt(100, 900)}`],
        } as any),
    ).not.toThrow();
  });

  it('K11: chỉ có trustedOrigins hợp lệ', () => {
    // covers K.P11, K.C3=false, K.C9=false (exclude vắng mặt)
    expect(
      () =>
        new CrossOriginProtection(makeAdapter(), {
          trustedOrigins: [`https://${randWord()}.example`],
        } as any),
    ).not.toThrow();
  });
});

describe('toRouteInfo (CFT, qua constructor)', () => {
  const withExclude = (route: unknown) => () =>
    new CrossOriginProtection(makeAdapter(), { exclude: [route] } as any);

  it('R1: route là chuỗi không có dấu / đầu', () => {
    // covers R.P1, R.C1=true
    expect(withExclude(randWord())).not.toThrow();
  });

  it('R2: route là null', () => {
    // covers R.P2, R.C1=false, R.C2=true
    expect(withExclude(null)).toThrow();
  });

  it('R3: path không phải chuỗi', () => {
    // covers R.P3, R.C2=false, R.C3=true
    expect(
      withExclude({ path: randInt(100, 900), method: RequestMethod.POST }),
    ).toThrow();
  });

  it('R4: method không phải số', () => {
    // covers R.P4, R.C3=false, R.C4=true
    expect(
      withExclude({ path: `/a${randInt(100, 900)}`, method: 'POST' }),
    ).toThrow();
  });

  it('R5: method là số không có trong RequestMethod', () => {
    // covers R.P5, R.C4=false, R.C5=true
    expect(
      withExclude({
        path: `/a${randInt(100, 900)}`,
        method: randInt(9000, 9999),
      }),
    ).toThrow();
  });

  it('R6: route object hợp lệ', () => {
    // covers R.P6, R.C5=false
    const method = pick([
      RequestMethod.POST,
      RequestMethod.PUT,
      RequestMethod.DELETE,
    ]);
    expect(
      withExclude({ path: `a${randInt(100, 900)}`, method }),
    ).not.toThrow();
  });
});

describe('compileExclusion (CFT, qua constructor)', () => {
  const build = () =>
    new CrossOriginProtection(makeAdapter(), {
      exclude: [`/x${randInt(100, 900)}`],
    } as any);

  it('Q1: chuỗi chuyển đổi dài hơn 1 ký tự và có dấu / cuối', () => {
    // covers Q.P1, Q.C1=true, Q.C2=true
    convertSpy = vi
      .spyOn(LegacyRouteConverter, 'tryConvert')
      .mockReturnValue(`/trail${randInt(100, 900)}//`);
    expect(build).not.toThrow();
  });

  it('Q2: chuỗi chuyển đổi chỉ là "/"', () => {
    // covers Q.P2, Q.C1=false, Q.C2=true
    convertSpy = vi
      .spyOn(LegacyRouteConverter, 'tryConvert')
      .mockReturnValue('/');
    expect(build).not.toThrow();
  });

  it('Q3: chuỗi chuyển đổi rỗng, dùng "/" dự phòng', () => {
    // covers Q.P3, Q.C1=false, Q.C2=false
    convertSpy = vi
      .spyOn(LegacyRouteConverter, 'tryConvert')
      .mockReturnValue('');
    expect(build).not.toThrow();
  });
});

describe('resolveExclusions (CFT)', () => {
  const route = () => `/hooks${randInt(100, 900)}`;
  const items = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      path: `${route()}${index}`,
      method: RequestMethod.ALL,
    }));

  it('V1: không có route nào, adapter không có getRouteMatchingOptions', () => {
    // covers V.P1, V.B1=0 lần, V.C2=true
    const protection = new CrossOriginProtection<any>(makeAdapter());
    expect(() => protection.resolveExclusions(makeExtractor([]))).not.toThrow();
  });

  it('V2: một route không có version, getRouteMatchingOptions trả undefined', () => {
    // covers V.P2, V.B1=1 lần, V.B2=1 lần, V.C1=false, V.C2=false, V.C3=true
    const protection = new CrossOriginProtection<any>(
      makeAdapter(() => undefined),
      {
        exclude: [route()],
      } as any,
    );
    expect(() =>
      protection.resolveExclusions(makeExtractor(items(1))),
    ).not.toThrow();
  });

  it('V3: route có version, extractor trả 2 mục, ignoreTrailingSlash = true', () => {
    // covers V.P3, V.C1=true, V.B2=nhiều lần, V.C3=false, V.C4=true
    const protection = new CrossOriginProtection<any>(
      makeAdapter(ignoreTrailing),
      {
        exclude: [
          {
            path: route(),
            method: RequestMethod.POST,
            version: `${randInt(2, 9)}`,
          },
        ],
      } as any,
    );
    expect(() =>
      protection.resolveExclusions(makeExtractor(items(2))),
    ).not.toThrow();
  });

  it('V4: extractor trả 0 mục, ignoreTrailingSlash = false', () => {
    // covers V.P4, V.B2=0 lần, V.C4=false
    const protection = new CrossOriginProtection<any>(makeAdapter(noTrailing), {
      exclude: [route()],
    } as any);
    expect(() => protection.resolveExclusions(makeExtractor([]))).not.toThrow();
  });

  it('V5: hai route', () => {
    // covers V.P5, V.B1=nhiều lần, V.C1=false
    const protection = new CrossOriginProtection<any>(makeAdapter(noTrailing), {
      exclude: [route(), route()],
    } as any);
    expect(() =>
      protection.resolveExclusions(makeExtractor(items(1))),
    ).not.toThrow();
  });
});

describe('check (CFT)', () => {
  it('H1: request không có headers, method an toàn', () => {
    // covers H.P1, H.C1=true, H.C2=true, H.C3=true
    const protection = new CrossOriginProtection(makeAdapter());
    expect(() => protection.check({ method: pick(SAFE) } as any)).not.toThrow();
  });

  it('H2: Sec-Fetch-Site là same-origin', () => {
    // covers H.P2, H.C1=false, H.C3=true
    const protection = new CrossOriginProtection(makeAdapter());
    const request = {
      method: pick(UNSAFE),
      headers: { 'sec-fetch-site': 'same-origin' },
    };
    expect(() => protection.check(request as any)).not.toThrow();
  });

  it('H3: Sec-Fetch-Site là cross-site', () => {
    // covers H.P3, H.C3=false (closure isExcluded được gọi từ exemptOr)
    const protection = new CrossOriginProtection(makeAdapter());
    expect(protection.check(crossSite(undefined) as any)).toBeDefined();
  });

  it('H4: Origin khác Host, dùng header host', () => {
    // covers H.P4, H.C2=true, H.C3=false
    const word = randWord();
    const protection = new CrossOriginProtection(makeAdapter());
    const request = {
      method: pick(UNSAFE),
      headers: {
        origin: `https://${word}.example`,
        host: `other${word}.example`,
      },
    };
    expect(protection.check(request as any)).toBeDefined();
  });

  it('H5: có header :authority (HTTP/2)', () => {
    // covers H.P5, H.C2=false, H.C3=true
    const word = randWord();
    const protection = new CrossOriginProtection(makeAdapter());
    const request = {
      method: pick(UNSAFE),
      headers: {
        origin: `https://${word}.example`,
        ':authority': `${word}.example`,
        host: `other${word}.example`,
      },
    };
    expect(() => protection.check(request as any)).not.toThrow();
  });
});

describe('readHeader (CFT, qua check)', () => {
  it('D1: header vắng mặt', () => {
    // covers D.P1, D.C1=true
    const protection = new CrossOriginProtection(makeAdapter());
    expect(() =>
      protection.check({ method: pick(UNSAFE), headers: {} } as any),
    ).not.toThrow();
  });

  it('D2: header là chuỗi', () => {
    // covers D.P2, D.C1=false, D.C2=false
    const protection = new CrossOriginProtection(makeAdapter());
    const request = {
      method: pick(UNSAFE),
      headers: { 'sec-fetch-site': 'same-origin' },
    };
    expect(() => protection.check(request as any)).not.toThrow();
  });

  it('D3: header lặp (mảng)', () => {
    // covers D.P3, D.C2=true
    const protection = new CrossOriginProtection(makeAdapter());
    const request = {
      method: pick(UNSAFE),
      headers: { 'sec-fetch-site': ['same-origin', 'cross-site'] },
    };
    expect(protection.check(request as any)).toBeDefined();
  });
});

describe('isExcluded (CFT, qua check)', () => {
  it('I1: exclude là hàm trả true', () => {
    // covers I.P1, I.C1=true
    const predicate = vi.fn(() => true);
    const protection = new CrossOriginProtection(makeAdapter(), {
      exclude: predicate,
    } as any);
    expect(() =>
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).not.toThrow();
    expect(predicate).toHaveBeenCalled();
  });

  it('I2: exclude là hàm trả false', () => {
    // covers I.P2, I.C1=true (kết quả false)
    const predicate = vi.fn(() => false);
    const protection = new CrossOriginProtection(makeAdapter(), {
      exclude: predicate,
    } as any);
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).toBeDefined();
    expect(predicate).toHaveBeenCalled();
  });

  it('I3: chưa gọi resolveExclusions', () => {
    // covers I.P3, I.C1=false, I.C2=true
    const protection = new CrossOriginProtection(makeAdapter());
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).toBeDefined();
  });

  it('I4: request không có url', () => {
    // covers I.P4, I.C3=true, I.C4=false, I.C5=true
    setRouteExcluded(false);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(protection.check(crossSite(undefined) as any)).toBeDefined();
  });

  it('I5: url có query, route không khớp', () => {
    // covers I.P5, I.C3=false, I.C4=true, I.C5=false, I.C6=false, I.C7=false
    setRouteExcluded(false);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(
      protection.check(
        crossSite(`/hooks${randInt(100, 900)}?q=${randInt(100, 900)}`) as any,
      ),
    ).toBeDefined();
  });

  it('I6: url không có query, route và version khớp', () => {
    // covers I.P6, I.C4=false, I.C7=true, I.C8=true, I.C9=false
    setRouteExcluded(true);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(() =>
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).not.toThrow();
  });

  it('I7: url không bắt đầu bằng "/"', () => {
    // covers I.P7, I.C5=true
    setRouteExcluded(true);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(
      protection.check(crossSite(`hooks${randInt(100, 900)}`) as any),
    ).toBeDefined();
  });

  it('I8: url có "//" (không chuẩn hóa)', () => {
    // covers I.P8, I.C5=false, I.C6=true
    setRouteExcluded(true);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(
      protection.check(crossSite(`/a${randInt(100, 900)}//b`) as any),
    ).toBeDefined();
  });

  it('I9: route khớp nhưng version không khớp', () => {
    // covers I.P9, I.C7=true, I.C8=false
    setRouteExcluded(true);
    setVersionOk(false);
    const protection = resolved(noTrailing);
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).toBeDefined();
  });

  it('I10: route không khớp', () => {
    // covers I.P10, I.C7=false
    setRouteExcluded(false);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).toBeDefined();
  });

  it('I11: không ignoreTrailingSlash, url có "/" cuối, khớp', () => {
    // covers I.P11, I.C9=false
    setRouteExcluded(true);
    setVersionOk(true);
    const protection = resolved(noTrailing);
    expect(() =>
      protection.check(crossSite(`/hooks${randInt(100, 900)}/`) as any),
    ).not.toThrow();
  });

  it('I12: ignoreTrailingSlash, url là "/"', () => {
    // covers I.P12, I.C9=true, I.C10=false
    setRouteExcluded(false);
    setVersionOk(true);
    const protection = resolved(ignoreTrailing);
    expect(protection.check(crossSite('/') as any)).toBeDefined();
  });

  it('I13: ignoreTrailingSlash, url không có "/" cuối', () => {
    // covers I.P13, I.C10=true, I.C11=false
    setRouteExcluded(false);
    setVersionOk(true);
    const protection = resolved(ignoreTrailing);
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).toBeDefined();
  });

  it('I14: ignoreTrailingSlash, "/" cuối, cả hai path khớp', () => {
    // covers I.P14, I.C11=true, I.C12=true, I.C13=true
    setRouteExcluded(true, true);
    setVersionOk(true);
    const protection = resolved(ignoreTrailing);
    expect(() =>
      protection.check(crossSite(`/hooks${randInt(100, 900)}/`) as any),
    ).not.toThrow();
  });

  it('I15: ignoreTrailingSlash, "/" cuối, path có "/" không khớp', () => {
    // covers I.P15, I.C12=false
    setRouteExcluded(false);
    setVersionOk(true);
    const protection = resolved(ignoreTrailing);
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}/`) as any),
    ).toBeDefined();
  });

  it('I16: ignoreTrailingSlash, path có "/" khớp, path bỏ "/" không khớp', () => {
    // covers I.P16, I.C12=true, I.C13=false
    setRouteExcluded(true, false);
    setVersionOk(true);
    const protection = resolved(ignoreTrailing);
    expect(
      protection.check(crossSite(`/hooks${randInt(100, 900)}/`) as any),
    ).toBeDefined();
  });

  it('I17: hai exclusion, exclusion sau mới khớp', () => {
    // covers I.P17, I.B6=nhiều exclusion trong some(), I.C7=false rồi true
    setRouteExcluded(false, true);
    setVersionOk(true);
    const protection = resolved(noTrailing, 2);
    expect(() =>
      protection.check(crossSite(`/hooks${randInt(100, 900)}`) as any),
    ).not.toThrow();
  });
});
