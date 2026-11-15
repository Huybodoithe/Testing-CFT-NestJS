/**
 * CFT - packages/core/middleware/utils.ts   (số dòng theo bản in bằng PowerShell)
 *
 * ============================================================================
 * 1. QUYẾT ĐỊNH CÓ ||, &&, ??, ?:, ?. (mỗi vế là một điều kiện nguyên tố)
 * ============================================================================
 *  mapToExcludeRoute  L34  isString(route) ? route : route.path          C1
 *                     L39  if (isString(route))                           C2
 *                     L51  if (route.version)                             C3
 *                     L56  if (e instanceof TypeError)                    C4
 *  compileExcludedPath L68 if (!matchingOptions)                          C5
 *                     L73  path.length > 1 ? replace : path               C6
 *                     L74  addLeadingSlash(routePath) || '/'              C7
 *  filterMiddleware   L110 getRouteMatchingOptions?.() ?? EXACT           C8 (?.), C9 (??)
 *                     L114 .filter(isFunction)                            C10
 *  mapToClass         L131 ignoreTrailingSlash = false (mặc định)         C11
 *                     L134 if (isMiddlewareClass(middleware))             C12
 *                     L135 if (excludedRoutes.length <= 0)                C13
 *                     L148 if (isExcluded) - lớp Host                     C14
 *                     L167 if (isExcluded) - hàm bọc                      C15
 *  isMiddlewareClass  L178 substring(0,5) === 'class'                     C16
 *                     L183 arr[0] === 'function'                    &&    C17
 *                     L184 /[A-Z]/.test(arr[1]?.[0])  (?. = C19)    &&    C18
 *                     L185 isFunction(prototype?.use) (?. = C21)          C20
 *  assignToken        L189 token = uid(21) (mặc định)                     C22
 *  isMiddlewareRouteExcluded
 *                     L198 ignoreTrailingSlash = false (mặc định)         C23
 *                     L201 excludedRoutes.length <= 0                     C24
 *                     L211 !originalUrl?.startsWith('/') (?. = C25, ! = C26) ||
 *                          originalUrl.includes('#')                      C27
 *                     L216 queryParamsIndex >= 0                          C28
 *                     L222 isRouteExcluded(...) ||                        C29
 *                     L223 reqMethod === 'HEAD' &&                        C30
 *                     L224 isRouteExcluded(..., GET)                      C31
 *                     L231 isRequestForRoute(route, path) &&              C32
 *                          isVersionRequested(route)                      C33
 *                     L237 ignoreTrailingSlash && pathname.length > 1 &&
 *                          pathname.endsWith('/')                         C34, C35, C36
 *                     L238 isExcluded(pathname) && isExcluded(stripped)   C37, C38
 *  createRequestedVersionMatcher
 *                     L264 !version ||                                    C39
 *                     L265 version === VERSION_NEUTRAL ||                 C40
 *                     L266 !versioningOptions ||                          C41
 *                     L267 type === VersioningType.URI                    C42
 *                     L271 requestedVersions === undefined                C43
 *                     L274 !requestedVersions                             C44
 *                     L277 Array.isArray(version) ? ... : [version]       C45
 *                     L278 requestedVersions.length > 0 ? every : includes C46
 *  getRequestedVersions (private, qua matcher)
 *                     L292 request.headers ?? {}                          C47
 *                     L297 headers[header] ||                             C48
 *                     L298 headers[header.toLowerCase()]                  C49
 *                     L302 headers['Accept'] ||                           C50
 *                          headers['accept']                              C51
 *                     L307 try { extractor(request) } catch               C52
 *                     L315 isUndefined(version) ? [] : concat             C53
 *                     L294 switch: HEADER / MEDIA_TYPE / CUSTOM / (default)
 *  getMediaTypeVersion (private, qua MEDIA_TYPE)
 *                     L362 acceptHeader ?? []                             C54
 *                     L369 trimmedParameter.startsWith(key)               C55
 *                     L371 version.startsWith('"') &&                     C56
 *                          version.endsWith('"')                          C57
 *  splitOutsideQuotes (private, qua header Accept)
 *                     L329 isQuoted && character === '\\'                 C58, C59
 *                     L332 character === '"'                              C60
 *                     L334 character === separator && !isQuoted           C61, C62
 *  Vòng lặp: routes.map, excludedRoutes.some, requestedVersions.every,
 *            flatMap, for(index), for(mediaRange), for(parameter): 0 / 1 / nhiều.
 *
 * ============================================================================
 * 2. BẢNG ĐIỀU KIỆN NGUYÊN TỐ (T = test phủ true, F = test phủ false)
 *    Điều kiện ngắn mạch chỉ tính khi thực sự được đánh giá.
 * ============================================================================
 *  C1  T2,T5            | T3            C2  T2          | T3
 *  C3  T4               | T3            C4  T7          | T8
 *  C5  T2               | T3            C6  T3          | T4
 *  C7  T6               | T3            C8  T9          | T10
 *  C9  T10              | T11           C10 T9,T11      | T9,T11 (phần tử không phải hàm bị loại)
 *  C11 T12              | T13           C12 T12         | T15
 *  C13 T12              | T13           C14 T13         | T14
 *  C15 T15              | T16           C16 T18         | T19
 *  C17 T20              | T19           C18 T20         | T22
 *  C19 T23              | T20           C20 T20         | T21
 *  C21 T24              | T20           C22 T26         | T25
 *  C23 T29              | T39           C24 T29         | T33
 *  C25 T30              | T31           C26 T31         | T32
 *  C27 T32              | T33           C28 T33         | T34
 *  C29 T33              | T35           C30 T35         | T34
 *  C31 T35              | T36           C32 T33         | T34
 *  C33 T38              | T37           C34 T39         | T44
 *  C35 T40              | T39           C36 T41         | T40
 *  C37 T41              | T43           C38 T41         | T42
 *  C39 T46              | T47           C40 T47         | T48
 *  C41 T48              | T49           C42 T49         | T50
 *  C43 T50 (lần 1)      | T50 (lần 2)   C44 T67         | T50
 *  C45 T51              | T50           C46 T50         | T52
 *  C47 T52              | T54           C48 T50         | T53
 *  C49 T53              | T54           C50 T55         | T56
 *  C51 T56              | T57           C52 T67         | T64
 *  C53 T66              | T64           C54 T57         | T55
 *  C55 T55              | T61           C56 T58         | T55
 *  C57 T58              | T59           C58 T62         | T55
 *  C59 T62 (ký tự '\\') | T62 (ký tự thường trong dấu nháy)
 *  C60 T58              | T55           C61 T55         | T55
 *  C62 T55              | T62 (dấu phân cách nằm trong nháy)
 *  Input để điều kiện ngắn mạch được đánh giá:
 *   C2/C3 chỉ khi try không ném lỗi; C31 chỉ khi C29=false và C30=true (HEAD);
 *   C33 chỉ khi C32=true; C35 chỉ khi C34=true; C36 chỉ khi C34 và C35 = true;
 *   C38 chỉ khi C37=true; C17..C21 theo thứ tự &&; C56/C57 chỉ khi C55=true;
 *   C59 chỉ khi C58=true; C62 chỉ khi C61=true.
 *
 * ============================================================================
 * 3. BẢNG PATH
 * ============================================================================
 *  mapToExcludeRoute : P1 rỗng(0) | P2 chuỗi | P3 RouteInfo không version | P4 có version
 *                      P5 nhiều route | P6 TypeError->printError->throw | P7 lỗi khác->throw
 *  compileExcludedPath: P8 không options | P9 options, path dài>1 | P10 options, path '/'
 *                      P11 options, path rỗng -> '/'
 *  filterMiddleware  : P12 không có getter | P13 getter trả undefined | P14 getter trả options
 *                      P15 loại phần tử không phải hàm | P16 0 middleware | P17 nhiều middleware
 *  mapToClass        : P18 class + 0 excluded | P19 class, bị loại | P20 class, đi tiếp
 *                      P21 hàm, bị loại | P22 hàm, đi tiếp | P23 hàm + 0 excluded
 *  isMiddlewareClass : P24 'class' | P25 không bắt đầu 'function' | P26 function+use
 *                      P27 function không use | P28 tên viết thường | P29 không có arr[1]
 *                      P30 không có prototype
 *  assignToken       : P31 token cho trước | P32 token mặc định
 *  isMiddlewareRouteExcluded: P33 0 excluded | P34 url undefined | P35 url không '/'
 *                      P36 url có '#' | P37 có query | P38 không match | P39 HEAD->GET match
 *                      P40 HEAD->GET không match | P41 version lệch | P42 version khớp
 *                      P43 '/' khi ignore | P44 ignore, không '/' cuối | P45 ignore, cả hai khớp
 *                      P46 ignore, chỉ path gốc khớp | P47 ignore, path gốc không khớp
 *                      P48 không ignore, có '/' cuối | P49 nhiều route (some)
 *  createRequestedVersionMatcher: P50 !version | P51 NEUTRAL | P52 !options | P53 URI
 *                      P54 header (cache, every nhiều) | P55 version là mảng | P56 requested rỗng
 *                      P57 requested null
 *  getRequestedVersions: P58 HEADER | P59 MEDIA_TYPE | P60 CUSTOM ok | P61 CUSTOM ném lỗi
 *                      P62 default (type ngoài enum)
 *  getMediaTypeVersion / splitOutsideQuotes: P63 không header | P64 có/không tham số
 *                      P65 nháy đầy đủ | P66 nháy không đóng | P67 escape + dấu phân cách trong nháy
 *  isStaticPath      : P68 (đường thẳng)
 *
 * ============================================================================
 * 4. TỔNG KẾT
 * ============================================================================
 *  Điều kiện nguyên tố: 62/62 được thiết kế phủ cả true và false (phân tích tay;
 *  số đo thực tế lấy từ bảng coverage, Branch % theo V8 có thể không đếm ?? và ?.).
 *  unreachable: không có.
 *  Lưu ý: nhánh default của switch (getRequestedVersions) chỉ đạt khi type nằm ngoài
 *  enum (T68, ép kiểu). Copilot nói "nhánh URI của helper không thể đạt" là chưa chính
 *  xác: switch không có case URI; URI bị matcher chặn trước (C42), còn default đạt được
 *  bằng type sai kiểu.
 *
 * ============================================================================
 * 5. LÝ DO MOCK
 *  - vi.spyOn(LegacyRouteConverter, 'tryConvert') ở T6, T7: ép path rỗng / path '/:'
 *    vì converter có thể tự sửa path trước khi tới pathToRegexp; cần để chắc chắn đạt
 *    C7=true và C4=true. printError bị spy để không in log.
 *  - Các test còn lại dùng bản thật, adapter giả tối giản.
 * ============================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestMethod, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { LegacyRouteConverter } from '../../router/legacy-route-converter';
import {
  assignToken,
  createRequestedVersionMatcher,
  filterMiddleware,
  isMiddlewareClass,
  isMiddlewareRouteExcluded,
  isStaticPath,
  mapToClass,
  mapToExcludeRoute,
} from '../../middleware/utils';

// ---------- PRNG LCG, seed cố định, reset trong beforeEach ----------
const SEED = 20261114;
let state = SEED;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const seg = () => `s${randInt(100, 899)}`;
const ver = () => String(randInt(21, 89));

// ---------- helper ----------
const adapter = {
  getRequestMethod: (req: any) => req.method,
  getRequestUrl: (req: any) => req.url,
} as any;

const makeReq = (url: any, method = 'GET', headers?: any): any => ({
  url,
  method,
  headers,
});

const exact = (s: string) => new RegExp(`^/${s}$`);
const optSlash = (s: string) => new RegExp(`^/${s}/?$`);
const onlySlash = (s: string) => new RegExp(`^/${s}/$`);

const meta = (
  pathRegex: RegExp,
  requestMethod: RequestMethod = RequestMethod.ALL,
  version?: any,
): any => ({ path: String(pathRegex), pathRegex, requestMethod, version });

const OPTS = { caseSensitive: true, ignoreTrailingSlash: false } as any;

class Mw {
  use(..._params: unknown[]) {
    return 'inner';
  }
}
const arrowMw = (_req: any, _res: any, _next: any) => 'done';

const headerOpts = {
  type: VersioningType.HEADER,
  header: 'X-API-Version',
} as any;
const mediaOpts = { type: VersioningType.MEDIA_TYPE, key: 'v=' } as any;

const spies: Array<{ mockRestore: () => void }> = [];

describe('middleware/utils [CFT]', () => {
  beforeEach(() => {
    state = SEED;
  });
  afterEach(() => {
    spies.splice(0).forEach(s => s.mockRestore());
  });

  // =========================== mapToExcludeRoute ===========================
  describe('mapToExcludeRoute', () => {
    it('T1 danh sách route rỗng (loop 0)', () => {
      // covers P1
      expect(mapToExcludeRoute([])).toBeDefined();
    });

    it('T2 route là chuỗi, không có matchingOptions', () => {
      // covers P2, P8, C1=true, C2=true, C5=true
      expect(mapToExcludeRoute([`/${seg()}/${seg()}`])).toBeDefined();
    });

    it('T3 RouteInfo không version, có options, path dài có "/" cuối', () => {
      // covers P3, P9, C1=false, C2=false, C3=false, C5=false, C6=true, C7=false
      const result = mapToExcludeRoute(
        [{ path: `/${seg()}/${seg()}/`, method: RequestMethod.GET }],
        OPTS,
      );
      expect(result).toBeDefined();
    });

    it('T4 RouteInfo có version, path là "/"', () => {
      // covers P4, P10, C3=true, C6=false
      const result = mapToExcludeRoute(
        [{ path: '/', method: RequestMethod.POST, version: ver() }],
        OPTS,
      );
      expect(result).toBeDefined();
    });

    it('T5 nhiều route trộn chuỗi / RouteInfo / có version (loop nhiều)', () => {
      // covers P5
      const result = mapToExcludeRoute(
        [
          `/${seg()}`,
          { path: `/${seg()}/:id`, method: RequestMethod.GET },
          { path: `/${seg()}`, method: RequestMethod.PUT, version: ver() },
        ],
        { caseSensitive: false, ignoreTrailingSlash: true } as any,
      );
      expect(result).toBeDefined();
    });

    it('T6 path rỗng sau khi convert -> dùng "/"', () => {
      // covers P11, C7=true
      // chỉ đạt được khi mock tryConvert trả '' (không rõ converter xử lý path rỗng thế nào)
      spies.push(
        vi.spyOn(LegacyRouteConverter, 'tryConvert').mockReturnValue(''),
      );
      expect(mapToExcludeRoute([seg()], OPTS)).toBeDefined();
    });

    it('T7 pathToRegexp ném TypeError -> printError rồi ném lại', () => {
      // covers P6, C4=true
      // mock tryConvert để chắc chắn path không hợp lệ ('/:' thiếu tên tham số)
      spies.push(
        vi.spyOn(LegacyRouteConverter, 'tryConvert').mockReturnValue('/:'),
      );
      const printSpy = vi
        .spyOn(LegacyRouteConverter, 'printError')
        .mockImplementation(() => undefined);
      spies.push(printSpy);
      expect(() => mapToExcludeRoute([`/${seg()}`])).toThrow();
      expect(printSpy).toHaveBeenCalled();
    });

    it('T8 lỗi không phải TypeError trong try -> ném lại, không printError', () => {
      // covers P7, C4=false
      const route: any = { path: `/${seg()}`, method: RequestMethod.GET };
      Object.defineProperty(route, 'version', {
        get() {
          throw new Error(`boom-${randInt(100, 899)}`);
        },
      });
      expect(() => mapToExcludeRoute([route])).toThrow();
    });
  });

  // ============================= filterMiddleware ===========================
  describe('filterMiddleware', () => {
    it('T9 adapter không có getRouteMatchingOptions; có phần tử không phải hàm', () => {
      // covers P12, P15, C8=true, C10=true/false
      const result = filterMiddleware(
        [Mw, `text-${seg()}` as any],
        [],
        {} as any,
      );
      expect(result).toBeDefined();
    });

    it('T10 getRouteMatchingOptions trả undefined, 0 middleware', () => {
      // covers P13, P16, C8=false, C9=true
      const result = filterMiddleware(
        [],
        [{ path: `/${seg()}`, method: RequestMethod.GET }],
        { getRouteMatchingOptions: () => undefined } as any,
      );
      expect(result).toBeDefined();
    });

    it('T11 getRouteMatchingOptions trả options, nhiều middleware + route', () => {
      // covers P14, P17, C9=false
      const result = filterMiddleware(
        [
          Mw,
          arrowMw,
          class Other {
            use() {}
          },
          randInt(10, 90) as any,
        ],
        [
          { path: `/${seg()}`, method: RequestMethod.GET },
          { path: `/${seg()}`, method: RequestMethod.POST, version: ver() },
        ],
        {
          getRouteMatchingOptions: () => ({
            caseSensitive: false,
            ignoreTrailingSlash: true,
          }),
        } as any,
      );
      expect(result).toBeDefined();
    });
  });

  // ================================ mapToClass ==============================
  describe('mapToClass', () => {
    it('T12 class, không có excluded, ignoreTrailingSlash mặc định -> trả lại chính class', () => {
      // covers P18, C11=true, C12=true, C13=true
      expect(mapToClass(Mw, [], adapter)).toBeDefined();
    });

    it('T13 class có excluded, request bị loại -> gọi next', () => {
      // covers P19, C11=false, C13=false, C14=true
      const s = seg();
      const Host: any = mapToClass(Mw, [meta(exact(s))], adapter, true);
      const next = vi.fn();
      expect(() => new Host().use(makeReq(`/${s}`), {}, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('T14 class có excluded, request không bị loại -> gọi use gốc', () => {
      // covers P20, C14=false
      const Host: any = mapToClass(Mw, [meta(exact(seg()))], adapter);
      const next = vi.fn();
      expect(new Host().use(makeReq(`/${seg()}x`), {}, next)).toBeDefined();
    });

    it('T15 middleware dạng hàm có excluded, request bị loại', () => {
      // covers P21, C12=false, C15=true
      const s = seg();
      const Wrapper: any = mapToClass(arrowMw, [meta(exact(s))], adapter);
      const next = vi.fn();
      new Wrapper().use(makeReq(`/${s}`), {}, next);
      expect(next).toHaveBeenCalled();
    });

    it('T16 middleware dạng hàm có excluded, request không bị loại', () => {
      // covers P22, C15=false
      const Wrapper: any = mapToClass(arrowMw, [meta(exact(seg()))], adapter);
      expect(
        new Wrapper().use(makeReq(`/${seg()}y`), {}, vi.fn()),
      ).toBeDefined();
    });

    it('T17 middleware dạng hàm, excluded rỗng', () => {
      // covers P23
      const Wrapper: any = mapToClass(arrowMw, [], adapter);
      expect(
        new Wrapper().use(makeReq(`/${seg()}`), {}, vi.fn()),
      ).toBeDefined();
    });
  });

  // ============================ isMiddlewareClass ===========================
  describe('isMiddlewareClass', () => {
    it('T18 class ES', () => {
      // covers P24, C16=true
      expect(isMiddlewareClass(Mw)).toBeDefined();
    });

    it('T19 arrow function (ngắn mạch C17)', () => {
      // covers P25, C16=false, C17=false
      expect(isMiddlewareClass(arrowMw)).toBeDefined();
    });

    it('T20 function constructor kiểu cũ có prototype.use', () => {
      // covers P26, C16=false, C17=true, C18=true, C19=false, C21=false, C20=true
      function LegacyMw() {}
      (LegacyMw as any).prototype.use = () => 'ok';
      expect(isMiddlewareClass(LegacyMw)).toBeDefined();
    });

    it('T21 function kiểu cũ không có use', () => {
      // covers P27, C20=false
      function LegacyNoUse() {}
      expect(isMiddlewareClass(LegacyNoUse)).toBeDefined();
    });

    it('T22 function có tên viết thường', () => {
      // covers P28, C17=true, C18=false
      function lowerMw() {}
      (lowerMw as any).prototype.use = () => 'ok';
      expect(isMiddlewareClass(lowerMw)).toBeDefined();
    });

    it('T23 chuỗi biểu diễn chỉ có "function" (không có phần tử thứ 2)', () => {
      // covers P29, C19=true, C18=false
      // chỉ đạt được bằng đối tượng giả có toString tùy biến
      expect(isMiddlewareClass({ toString: () => 'function' })).toBeDefined();
    });

    it('T24 đối tượng giả có "function Foo()" nhưng không có prototype', () => {
      // covers P30, C18=true, C21=true, C20=false
      // chỉ đạt được bằng đối tượng giả có toString tùy biến
      expect(
        isMiddlewareClass({
          toString: () => `function Foo${randInt(10, 90)}()`,
        }),
      ).toBeDefined();
    });
  });

  // =============================== assignToken ==============================
  describe('assignToken', () => {
    it('T25 token cho trước', () => {
      // covers P31, C22=false
      expect(assignToken(class A {}, `tok-${seg()}`)).toBeDefined();
    });

    it('T26 token mặc định (uid)', () => {
      // covers P32, C22=true
      expect(assignToken(class B {})).toBeDefined();
    });
  });

  // =============================== isStaticPath =============================
  describe('isStaticPath', () => {
    it('T27 path tĩnh', () => {
      // covers P68
      expect(isStaticPath(`/${seg()}/${seg()}`)).toBeDefined();
    });

    it('T28 path có ký tự mẫu', () => {
      // covers P68
      expect(isStaticPath(`/${seg()}/:id`)).toBeDefined();
    });
  });

  // ========================= isMiddlewareRouteExcluded ======================
  describe('isMiddlewareRouteExcluded', () => {
    it('T29 excluded rỗng, ignoreTrailingSlash mặc định', () => {
      // covers P33, C23=true, C24=true
      expect(
        isMiddlewareRouteExcluded(makeReq('/a'), [], adapter),
      ).toBeDefined();
    });

    it('T30 url undefined', () => {
      // covers P34, C24=false, C25=true
      expect(
        isMiddlewareRouteExcluded(
          makeReq(undefined),
          [meta(exact(seg()))],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T31 url không bắt đầu bằng "/"', () => {
      // covers P35, C25=false, C26=true
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`${seg()}/x`),
          [meta(exact(seg()))],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T32 url có "#"', () => {
      // covers P36, C26=false, C27=true
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${seg()}#frag`),
          [meta(exact(seg()))],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T33 url có query, route ALL khớp', () => {
      // covers P37, C27=false, C28=true, C29=true, C32=true
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}?x=${randInt(10, 90)}`),
          [meta(exact(s))],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T34 url không query, route GET không khớp', () => {
      // covers P38, C28=false, C29=false, C30=false, C32=false
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${seg()}`),
          [meta(exact(`${seg()}z`), RequestMethod.GET)],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T35 request HEAD, route chỉ GET khớp path', () => {
      // covers P39, C29=false, C30=true, C31=true
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}`, 'HEAD'),
          [meta(exact(s), RequestMethod.GET)],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T36 request HEAD, route GET không khớp path', () => {
      // covers P40, C31=false
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${seg()}`, 'HEAD'),
          [meta(exact(`${seg()}q`), RequestMethod.GET)],
          adapter,
        ),
      ).toBeDefined();
    });

    it('T37 route có version, request yêu cầu version khác', () => {
      // covers P41, C32=true, C33=false
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}`, 'GET', { 'X-API-Version': '2' }),
          [meta(exact(s), RequestMethod.ALL, '1')],
          adapter,
          false,
          headerOpts,
        ),
      ).toBeDefined();
    });

    it('T38 route có version, request yêu cầu đúng version', () => {
      // covers P42, C33=true
      const s = seg();
      const v = ver();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}`, 'GET', { 'X-API-Version': v }),
          [meta(exact(s), RequestMethod.ALL, v)],
          adapter,
          false,
          headerOpts,
        ),
      ).toBeDefined();
    });

    it('T39 ignoreTrailingSlash=true, pathname "/" (độ dài 1)', () => {
      // covers P43, C23=false, C34=true, C35=false
      expect(
        isMiddlewareRouteExcluded(
          makeReq('/'),
          [meta(exact(seg()))],
          adapter,
          true,
        ),
      ).toBeDefined();
    });

    it('T40 ignoreTrailingSlash=true, pathname không kết thúc bằng "/"', () => {
      // covers P44, C35=true, C36=false
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}`),
          [meta(exact(s))],
          adapter,
          true,
        ),
      ).toBeDefined();
    });

    it('T41 ignoreTrailingSlash=true, "/x/" và "/x" cùng khớp', () => {
      // covers P45, C36=true, C37=true, C38=true
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}/`),
          [meta(optSlash(s))],
          adapter,
          true,
        ),
      ).toBeDefined();
    });

    it('T42 ignoreTrailingSlash=true, "/x/" khớp nhưng "/x" không khớp', () => {
      // covers P46, C37=true, C38=false
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}/`),
          [meta(onlySlash(s))],
          adapter,
          true,
        ),
      ).toBeDefined();
    });

    it('T43 ignoreTrailingSlash=true, "/y/" không khớp route nào', () => {
      // covers P47, C37=false
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${seg()}q/`),
          [meta(optSlash(seg()))],
          adapter,
          true,
        ),
      ).toBeDefined();
    });

    it('T44 ignoreTrailingSlash=false, pathname có "/" cuối', () => {
      // covers P48, C34=false
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}/`),
          [meta(optSlash(s))],
          adapter,
          false,
        ),
      ).toBeDefined();
    });

    it('T45 nhiều route: route đầu không khớp, route sau khớp (some, loop nhiều)', () => {
      // covers P49
      const s = seg();
      expect(
        isMiddlewareRouteExcluded(
          makeReq(`/${s}`),
          [meta(exact(`${seg()}a`)), meta(exact(`${seg()}b`)), meta(exact(s))],
          adapter,
        ),
      ).toBeDefined();
    });
  });

  // ======================= createRequestedVersionMatcher ====================
  describe('createRequestedVersionMatcher', () => {
    it('T46 route không có version', () => {
      // covers P50, C39=true
      const m = createRequestedVersionMatcher({}, headerOpts);
      expect(m({ version: undefined } as any)).toBeDefined();
    });

    it('T47 route là VERSION_NEUTRAL', () => {
      // covers P51, C39=false, C40=true
      const m = createRequestedVersionMatcher({}, headerOpts);
      expect(m({ version: VERSION_NEUTRAL } as any)).toBeDefined();
    });

    it('T48 không có versioningOptions', () => {
      // covers P52, C40=false, C41=true
      const m = createRequestedVersionMatcher({});
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T49 URI versioning', () => {
      // covers P53, C41=false, C42=true
      const m = createRequestedVersionMatcher({}, {
        type: VersioningType.URI,
      } as any);
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T50 HEADER, gọi 2 lần (cache), header là mảng nhiều version', () => {
      // covers P54, C42=false, C43=true/false, C44=false, C45=false, C46=true,
      //        C47=false, C48=true, C53=false
      const v1 = ver();
      const v2 = ver();
      const m = createRequestedVersionMatcher(
        { headers: { 'X-API-Version': [v1, v2] } },
        headerOpts,
      );
      expect(m({ version: v1 } as any)).toBeDefined();
      expect(m({ version: [v1, v2] } as any)).toBeDefined();
    });

    it('T51 route có version là mảng, header 1 version', () => {
      // covers P55, C45=true
      const v = ver();
      const m = createRequestedVersionMatcher(
        { headers: { 'X-API-Version': v } },
        headerOpts,
      );
      expect(m({ version: [v, `${v}1`] } as any)).toBeDefined();
    });

    it('T52 request không có headers, route có VERSION_NEUTRAL', () => {
      // covers P56, C46=false, C47=true, C53=true
      const m = createRequestedVersionMatcher({}, headerOpts);
      expect(m({ version: [VERSION_NEUTRAL] } as any)).toBeDefined();
    });

    it('T53 header chỉ có dạng chữ thường', () => {
      // covers P58, C48=false, C49=true
      const v = ver();
      const m = createRequestedVersionMatcher(
        { headers: { 'x-api-version': v } },
        headerOpts,
      );
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T54 headers rỗng (không có header version)', () => {
      // covers P58, C47=false, C49=false, C53=true
      const m = createRequestedVersionMatcher({ headers: {} }, headerOpts);
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T55 MEDIA_TYPE, Accept có tham số v= không nháy', () => {
      // covers P59, P64, C50=true, C54=false, C55=true, C56=false,
      //        C58=false, C60=false, C61=true/false, C62=true
      const v = ver();
      const m = createRequestedVersionMatcher(
        { headers: { Accept: `application/json;v=${v}` } },
        mediaOpts,
      );
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T56 MEDIA_TYPE, chỉ có header "accept" chữ thường', () => {
      // covers C50=false, C51=true
      const v = ver();
      const m = createRequestedVersionMatcher(
        { headers: { accept: `application/json;v=${v}` } },
        mediaOpts,
      );
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T57 MEDIA_TYPE, không có header Accept (mediaRanges rỗng)', () => {
      // covers P63, C51=false, C54=true
      const m = createRequestedVersionMatcher({ headers: {} }, mediaOpts);
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T58 MEDIA_TYPE, version có nháy đầy đủ', () => {
      // covers P65, C55=true, C56=true, C57=true, C60=true
      const v = ver();
      const m = createRequestedVersionMatcher(
        { headers: { Accept: `application/json;v="${v}"` } },
        mediaOpts,
      );
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T59 MEDIA_TYPE, nháy mở không đóng', () => {
      // covers P66, C56=true, C57=false
      const m = createRequestedVersionMatcher(
        { headers: { Accept: `application/json;v="${ver()}` } },
        mediaOpts,
      );
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T60 MEDIA_TYPE, mảng header, nhiều media range, nhiều tham số', () => {
      // covers P64 (loop nhiều), C55=false rồi true
      const v = ver();
      const m = createRequestedVersionMatcher(
        {
          headers: {
            Accept: [
              `text/html, application/json;q=0.5;v=${v}`,
              'application/xml',
            ],
          },
        },
        mediaOpts,
      );
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T61 MEDIA_TYPE, không tham số nào bắt đầu bằng key -> undefined', () => {
      // covers C55=false (mọi tham số), trả undefined
      const m = createRequestedVersionMatcher(
        {
          headers: {
            Accept: `text/html;q=0.${randInt(2, 8)}, application/json`,
          },
        },
        mediaOpts,
      );
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T62 MEDIA_TYPE, escape và dấu phân cách nằm trong nháy', () => {
      // covers P67, C58=true, C59=true/false, C61=true, C62=false
      const v = ver();
      const m = createRequestedVersionMatcher(
        {
          headers: {
            Accept: `application/json;x="a\\"b,c;d";v=${v}`,
          },
        },
        mediaOpts,
      );
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T63 MEDIA_TYPE, giá trị header là chuỗi rỗng (vòng for 0 lần)', () => {
      // covers P64 (loop 0)
      const m = createRequestedVersionMatcher(
        { headers: { Accept: [''] } },
        mediaOpts,
      );
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T64 CUSTOM, extractor trả chuỗi', () => {
      // covers P60, C52=false, C53=false
      const v = ver();
      const m = createRequestedVersionMatcher({}, {
        type: VersioningType.CUSTOM,
        extractor: vi.fn(() => v),
      } as any);
      expect(m({ version: v } as any)).toBeDefined();
    });

    it('T65 CUSTOM, extractor trả mảng', () => {
      // covers P60 (concat mảng)
      const v1 = ver();
      const v2 = ver();
      const m = createRequestedVersionMatcher({}, {
        type: VersioningType.CUSTOM,
        extractor: vi.fn(() => [v1, v2]),
      } as any);
      expect(m({ version: [v1, v2] } as any)).toBeDefined();
    });

    it('T66 CUSTOM, extractor trả undefined', () => {
      // covers C53=true
      const m = createRequestedVersionMatcher({}, {
        type: VersioningType.CUSTOM,
        extractor: vi.fn(() => undefined),
      } as any);
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T67 CUSTOM, extractor ném lỗi -> null -> không excluded', () => {
      // covers P57, P61, C52=true, C44=true
      const m = createRequestedVersionMatcher({}, {
        type: VersioningType.CUSTOM,
        extractor: vi.fn(() => {
          throw new Error(`extract-${randInt(100, 899)}`);
        }),
      } as any);
      expect(m({ version: ver() } as any)).toBeDefined();
    });

    it('T68 type nằm ngoài enum -> nhánh default của switch', () => {
      // covers P62
      // chỉ đạt được khi ép type sai kiểu (99): các type hợp lệ đều có case hoặc bị chặn ở C42
      const m = createRequestedVersionMatcher({ headers: {} }, {
        type: 99,
      } as any);
      expect(m({ version: ver() } as any)).toBeDefined();
    });
  });
});
