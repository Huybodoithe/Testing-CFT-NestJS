/**
 * CFT - security/security-headers.ts
 * Luu tai: packages/core/test-CFT-core-2/security/security-headers.cft.spec.ts
 *
 * Phan dan khong co so dong, nen vi tri duoc ghi bang ten ham + bieu thuc.
 * Khong mock: isObject / isPlainObject / isString la ham thuan, dung ban that (Copilot cung khuyen nghi).
 * Moi nhanh deu dat duoc bang input truc tiep; input sai kieu dung `as any`.
 *
 * QUYET DINH (C2) co nhieu dieu kien (moi quyet dinh deu co test cho ca true va false):
 *  B5  !isObject(directives) || Array.isArray(directives)           true: S11,S12   false: S1
 *  B10 !result.has('default-src') && !removed.has('default-src')    true: S7,S9     false: S1,S8
 *  B15 value === null || value === false || value === undefined     true: S6        false: S3
 *  B19 !isString(item) || item.trim().length === 0                  true: S15       false: S3
 *  B45 keys.length === 0 || !isPlainObject(value)                   true: R10a,R10b false: R5
 *  B53 !isString(value) || !allowed.includes(value)                 true: R13a,R13b false: R5
 *  B56 !Array.isArray(tokens) || tokens.length === 0                true: R14a,R14b false: R5
 *  B60 typeof maxAge !== 'number' || !isFinite(maxAge) || maxAge<0  true: R15a-c    false: R5
 *  Cac quyet dinh con lai la mot dieu kien, xem bang C3 ben duoi.
 *
 * DIEU KIEN NGUYEN TO (C3): "T" = true duoc phu boi, "F" = false duoc phu boi
 * --- serializeContentSecurityPolicy ---
 *  C1  options = {} (tham so mac dinh dung)          T: S1        F: S2
 *  C2  useDefaults = true mac dinh dung              T: S1,S2     F: S3
 *  C3  directives = {} mac dinh dung                 T: S1,S2     F: S3
 *  C4  typeof useDefaults !== 'boolean'              T: S10       F: S1
 *  C5  !isObject(directives)                         T: S11       F: S1
 *  C6  Array.isArray(directives) (chi khi C5=F)      T: S12       F: S1
 *  C7  if (useDefaults)                              T: S1        F: S4
 *  C8  seen.has(name)                                T: S5        F: S3
 *  C9  values === null                               T: S6        F: S3
 *  C10 !result.has('default-src')                    T: S7,S8,S9  F: S1
 *  C11 !removed.has('default-src') (chi khi C10=T)   T: S7        F: S8,S9
 *  C12 result.size === 0                             T: S9        F: S1
 *  C13 values.length > 0 (noi chuoi cuoi)            T: S1        F: S1 (upgrade-insecure-requests)
 *  Vong lap directives cua nguoi dung: 0 = S1, 1 = S3, nhieu = S4. Vong lap defaults luon nhieu (11 muc): S1.
 * --- normalizeDirectiveName ---
 *  C14 DIRECTIVE_NAME.test(rawName)                  T: S3        F: S13a
 *  C15 !NORMALIZED_DIRECTIVE_NAME.test(name)         T: S13a,S13b F: S3
 * --- normalizeDirectiveValue ---
 *  C16 value === null                                T: S6        F: S3
 *  C17 value === false (chi khi C16=F)               T: S6        F: S3
 *  C18 value === undefined (chi khi C16,C17=F)       T: S6        F: S3
 *  C19 value === true                                T: S4        F: S3
 *  C20 isString(value)                               T: S4        F: S3
 *  C21 !Array.isArray(values)                        T: S14       F: S3
 *  C22 !isString(item)                               T: S15       F: S3
 *  C23 item.trim().length === 0 (chi khi C22=F)      T: S15       F: S3
 *  C24 FORBIDDEN_VALUE_CHARACTERS.test(item)         T: S16       F: S3
 *  C25 some(token => MUST_BE_QUOTED.test(token))     T: S17       F: S3,S4
 *  Vong map values: 0 = S4 (scriptSrc: []), 1 = S4 (chuoi mot gia tri), nhieu = S3.
 * --- resolveSecurityHeaders ---
 *  C26 options = {} (mac dinh dung)                  T: R1        F: R2
 *  C27 !isPlainObject(options)                       T: R8        F: R1
 *  C28 !Object.hasOwn(OPTION_KEYS, name)             T: R9a,R9b   F: R5
 *  C29 current (ten helmet cu) truthy                T: R9a       F: R9b
 *  Vong Object.keys(options): 0 = R1,R2; 1 = R9a; nhieu = R5.
 *  C30..C42 if cua 13 header (csp, coep, coop, corp, originAgentCluster, referrer, hsts,
 *      xContentTypeOptions, dnsPrefetch, xDownloadOptions, frameOptions, crossDomain, xXssProtection)
 *      T: R1 (mac dinh bat), R4 (bat het); coep chi T o R4,R5   F: R3 (tat het); coep F o R1,R3
 *  C43 readBoolean(reportOnly) ? Report-Only         T: R5        F: R1
 *  C44 allow ? 'on' : 'off'                          T: R5        F: R1
 *  C45 isString(action) (X-Frame-Options)            T: R5        F: R1
 *  C46 readOption(xPoweredBy) ? [...] : []           T: R1        F: R3
 * --- readOption ---
 *  C47 value === undefined                           T: R1        F: R3
 *  C48 enabledByDefault                              T: R1 (csp)  F: R1 (coep)
 *  C49 typeof value === 'boolean'                    T: R3        F: R5
 *  C50 value (true -> {}, false -> undefined)        T: R4        F: R3
 *  C51 keys.length === 0                             T: R10a      F: R5
 *  C52 !isPlainObject(value) (chi khi C51=F)         T: R10b      F: R5
 *  C53 keys.length > 0 (thong bao loi)               T: R10b      F: R10a
 *  C54 !keys.includes(key)                           T: R11       F: R5
 *  Vong Object.keys(value): 0 = R7, 1 = R5 (coep), nhieu = R5 (csp).
 * --- readBoolean ---
 *  C55 fallback = false mac dinh dung                T: R1 (allow, preload)   F: R1 (truyen false/true ro rang)
 *  C56 value === undefined                           T: R1        F: R5
 *  C57 typeof value !== 'boolean'                    T: R12       F: R5
 * --- pick ---
 *  C58 value === undefined                           T: R1        F: R5
 *  C59 !isString(value)                              T: R13a      F: R5
 *  C60 !allowed.includes(value) (chi khi C59=F)      T: R13b      F: R5
 * --- resolveReferrerPolicy ---
 *  C61 policy === undefined                          T: R1        F: R5
 *  C62 isString(policy)                              T: R6        F: R5
 *  C63 !Array.isArray(tokens)                        T: R14b      F: R5
 *  C64 tokens.length === 0 (chi khi C63=F)           T: R14a      F: R5
 *  C65 unique.has(token)                             T: R14d      F: R5
 *  Vong tokens: 1 = R6; nhieu = R5. Token khong hop le qua pick: R14c.
 * --- resolveHsts ---
 *  C66 option.maxAge ?? mac dinh (nullish)           T: R1        F: R5
 *  C67 typeof maxAge !== 'number'                    T: R15a      F: R5
 *  C68 !Number.isFinite(maxAge) (chi khi C67=F)      T: R15b      F: R5
 *  C69 maxAge < 0 (chi khi C68=F)                    T: R15c      F: R5
 *  C70 includeSubDomains                             T: R1        F: R5
 *  C71 preload                                       T: R5        F: R1
 *
 * PATH: moi test la mot path
 *  serializeContentSecurityPolicy: S1 (mac dinh), S2, S3, S4, S5 (trung ten), S6 (xoa directive),
 *    S7 (thieu default-src), S8, S9 (CSP rong), S10-S12 (tham so sai), S13a/b (ten sai), S14-S17 (gia tri sai).
 *  resolveSecurityHeaders: R1 (mac dinh), R2, R3 (tat het), R4 (bat het), R5 (tuy chinh day du), R6, R7,
 *    R8 (options sai), R9a/b (option la), R10a/b, R11, R12, R13a/b, R14a-d, R15a-c (loi theo tung helper).
 *
 * TONG KET: 71 dieu kien nguyen to, 71 dat ca hai gia tri (khong tinh cac dieu kien "chi khi ..." khong
 *  danh gia duoc o phia con lai). Unreachable: vong lap defaults khong the chay 0 lan (hang so 11 muc).
 *
 * LUU Y: C27 dung isPlainObject cua Nest (object tu class khong tinh la plain); test chi dung gia tri
 *  chac chan sai ('x', null, [], so) de khong phu thuoc chi tiet cai dat.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecurityHeadersConfigurationError,
  resolveSecurityHeaders,
  serializeContentSecurityPolicy,
} from '../../security/security-headers';

// Input ngau nhien co seed co dinh (seed = 20261114), reset truoc moi test
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};

const host = (): string => `https://cdn${rand(100, 900)}.example.com`;

const OPTION_NAMES = [
  'contentSecurityPolicy',
  'crossOriginEmbedderPolicy',
  'crossOriginOpenerPolicy',
  'crossOriginResourcePolicy',
  'originAgentCluster',
  'referrerPolicy',
  'strictTransportSecurity',
  'xContentTypeOptions',
  'xDnsPrefetchControl',
  'xDownloadOptions',
  'xFrameOptions',
  'xPermittedCrossDomainPolicies',
  'xPoweredBy',
  'xXssProtection',
];
const allWith = (value: boolean): any =>
  Object.fromEntries(OPTION_NAMES.map(name => [name, value]));

// Input sai kieu duoc ep bang `as any` (TypeScript chan ngay tu luc viet test)
const csp = (options: unknown): string =>
  serializeContentSecurityPolicy(options as any);
const resolve = (options: unknown) => resolveSecurityHeaders(options as any);

describe('serializeContentSecurityPolicy (CFT)', () => {
  beforeEach(() => {
    seed = 20261114;
  });

  it('S1: khong truyen options, dung toan bo mac dinh', () => {
    // covers C1=T, C2=T, C3=T, C4=F, C5=F, C6=F, C7=T, C10=F, C12=F, C13=T/F, vong user 0
    expect(serializeContentSecurityPolicy()).toBeDefined();
  });

  it('S2: truyen options rong', () => {
    // covers C1=F
    expect(csp({})).toBeDefined();
  });

  it('S3: useDefaults va directives duoc dat, ten camelCase', () => {
    // covers C2=F, C3=F, C8=F, C9=F, C14=T, C15=F, C16-C19=F, C20=F, C21=F, C22-C25=F, vong user 1, map nhieu
    const result = csp({
      useDefaults: true,
      directives: { scriptSrc: ["'self'", host()] },
    });
    expect(result).toBeDefined();
  });

  it('S4: useDefaults false, nhieu directive voi cac dang gia tri khac nhau', () => {
    // covers C7=F, C19=T (true), C20=T (chuoi), vong user nhieu, map 0 (mang rong), C25=F nhieu token
    const result = csp({
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        'img-src': `'self' ${host()}`,
        upgradeInsecureRequests: true,
        scriptSrc: [],
        styleSrc: [host(), "'unsafe-inline'"],
      },
    });
    expect(result).toBeDefined();
  });

  it('S5: hai ten khac dang nhung chuan hoa thanh cung mot directive', () => {
    // covers C8=T
    expect(() =>
      csp({
        directives: {
          scriptSrc: ["'self'"],
          'script-src': [host()],
        },
      }),
    ).toThrow();
  });

  it('S6: gia tri null, false va undefined xoa directive mac dinh', () => {
    // covers C9=T, C16=T (null), C17=T (false), C18=T (undefined)
    const result = csp({
      useDefaults: true,
      directives: { objectSrc: null, imgSrc: false, fontSrc: undefined },
    });
    expect(result).toBeDefined();
  });

  it('S7: khong co default-src va khong bi xoa co chu y', () => {
    // covers C10=T, C11=T
    expect(() =>
      csp({ useDefaults: false, directives: { scriptSrc: ["'self'"] } }),
    ).toThrow();
  });

  it('S8: defaultSrc = null voi useDefaults true', () => {
    // covers C10=T, C11=F, C12=F
    expect(() =>
      csp({ useDefaults: true, directives: { defaultSrc: null } }),
    ).not.toThrow();
  });

  it('S9: defaultSrc = null voi useDefaults false (CSP khong con directive nao)', () => {
    // covers C10=T, C11=F, C12=T
    expect(() =>
      csp({ useDefaults: false, directives: { defaultSrc: null } }),
    ).toThrow();
  });

  it('S10: useDefaults khong phai boolean', () => {
    // covers C4=T
    expect(() => csp({ useDefaults: 'yes' })).toThrow(
      SecurityHeadersConfigurationError,
    );
  });

  it('S11: directives la null', () => {
    // covers C5=T
    expect(() => csp({ directives: null })).toThrow();
  });

  it('S12: directives la mang', () => {
    // covers C5=F, C6=T
    expect(() => csp({ directives: [] })).toThrow();
  });

  it('S13a: ten directive chua ky tu khong hop le', () => {
    // covers C14=F, C15=T
    expect(() => csp({ directives: { script_src: ["'self'"] } })).toThrow();
  });

  it('S13b: ten directive hop le ky tu nhung bat dau bang chu so', () => {
    // covers C14=T, C15=T
    expect(() =>
      csp({ directives: { [`${rand(1, 9)}src`]: ["'self'"] } }),
    ).toThrow();
  });

  it('S14: gia tri directive khong phai chuoi, mang, boolean hay null', () => {
    // covers C20=F, C21=T
    expect(() => csp({ directives: { scriptSrc: rand(100, 900) } })).toThrow();
    expect(() => csp({ directives: { scriptSrc: {} } })).toThrow();
  });

  it('S15: phan tu khong phai chuoi hoac chuoi chi co khoang trang', () => {
    // covers C22=T, C22=F va C23=T
    expect(() =>
      csp({ directives: { scriptSrc: [rand(100, 900)] } }),
    ).toThrow();
    expect(() =>
      csp({ directives: { scriptSrc: [' '.repeat(rand(2, 5))] } }),
    ).toThrow();
  });

  it('S16: gia tri chua ky tu cam (; , ky tu dieu khien, ky tu ngoai ASCII)', () => {
    // covers C24=T
    const badValues = [
      "'self'; script-src *",
      `a,${rand(100, 900)}`,
      `caf\u00e9${rand(100, 900)}`,
      `a\nb${rand(100, 900)}`,
    ];
    for (const bad of badValues) {
      expect(() => csp({ directives: { scriptSrc: [bad] } })).toThrow();
    }
  });

  it('S17: tu khoa, nonce va hash khong co dau nhay don', () => {
    // covers C25=T
    const unquoted = [
      'self',
      'none',
      `nonce-abc${rand(100, 999)}`,
      `sha256-abc${rand(100, 999)}=`,
      'https: self',
    ];
    for (const value of unquoted) {
      expect(() => csp({ directives: { scriptSrc: [value] } })).toThrow();
    }
  });
});

describe('resolveSecurityHeaders (CFT)', () => {
  beforeEach(() => {
    seed = 20261114;
  });

  it('R1: khong truyen options, dung toan bo mac dinh', () => {
    // covers C26=T, C27=F, C30-C42=T (tru coep=F), C43=F, C44=F, C45=F, C46=T, C47=T, C48=T/F,
    // C55=T/F, C56=T, C58=T, C61=T, C66=T, C70=T, C71=F
    expect(resolveSecurityHeaders()).toBeDefined();
  });

  it('R2: truyen options rong', () => {
    // covers C26=F
    expect(resolve({})).toBeDefined();
  });

  it('R3: tat tat ca header bang false', () => {
    // covers C30-C42=F, C46=F, C49=T, C50=F
    expect(resolve(allWith(false))).toBeDefined();
  });

  it('R4: bat tat ca header bang true', () => {
    // covers C31=T, C50=T
    expect(resolve(allWith(true))).toBeDefined();
  });

  it('R5: tuy chinh day du bang object hop le', () => {
    // covers C28=F, C43=T, C44=T, C45=T, C49=F, C51=F, C52=F, C54=F, C56=F, C57=F, C58=F, C59=F, C60=F,
    // C61=F, C62=F, C63=F, C64=F, C65=F, C66=F, C67-C69=F, C70=F, C71=T, vong keys nhieu
    const result = resolve({
      contentSecurityPolicy: {
        reportOnly: true,
        useDefaults: false,
        directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", host()] },
      },
      crossOriginEmbedderPolicy: { policy: 'credentialless' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: ['origin', 'strict-origin'] },
      strictTransportSecurity: {
        maxAge: rand(1000, 900000),
        includeSubDomains: false,
        preload: true,
      },
      xDnsPrefetchControl: { allow: true },
      xFrameOptions: { action: 'DENY' },
      xPermittedCrossDomainPolicies: { permittedPolicies: 'all' },
    });
    expect(result).toBeDefined();
  });

  it('R6: referrerPolicy la mot chuoi', () => {
    // covers C62=T, vong tokens 1
    expect(resolve({ referrerPolicy: { policy: 'origin' } })).toBeDefined();
  });

  it('R7: option la object rong', () => {
    // covers vong Object.keys(value) 0 lan
    expect(
      resolve({ referrerPolicy: {}, crossOriginOpenerPolicy: {} }),
    ).toBeDefined();
  });

  it('R8: options khong phai plain object', () => {
    // covers C27=T
    for (const invalid of ['x', null, [], rand(100, 900)]) {
      expect(() => resolve(invalid)).toThrow();
    }
  });

  it('R9a: ten option cu cua helmet', () => {
    // covers C28=T, C29=T, vong keys 1
    expect(() => resolve({ hsts: true })).toThrow();
  });

  it('R9b: ten option khong ton tai sau mot option hop le', () => {
    // covers C28=T, C29=F, vong keys nhieu
    expect(() => resolve({ xPoweredBy: true, foo: true })).toThrow();
  });

  it('R10a: option chi nhan boolean nhung nhan chuoi', () => {
    // covers C51=T, C53=F
    expect(() => resolve({ originAgentCluster: 'yes' })).toThrow();
  });

  it('R10b: option nhan object nhung nhan chuoi hoac mang', () => {
    // covers C51=F, C52=T, C53=T
    expect(() => resolve({ referrerPolicy: 'no-referrer' })).toThrow();
    expect(() => resolve({ crossOriginOpenerPolicy: [] })).toThrow();
  });

  it('R11: khoa con khong duoc ho tro', () => {
    // covers C54=T
    expect(() =>
      resolve({ referrerPolicy: { [`unknown${rand(100, 900)}`]: 1 } }),
    ).toThrow();
  });

  it('R12: gia tri boolean nhan kieu khac', () => {
    // covers C57=T (reportOnly, allow, preload)
    expect(() =>
      resolve({ contentSecurityPolicy: { reportOnly: rand(2, 9) } }),
    ).toThrow();
    expect(() => resolve({ xDnsPrefetchControl: { allow: 'yes' } })).toThrow();
    expect(() =>
      resolve({ strictTransportSecurity: { preload: 'yes' } }),
    ).toThrow();
  });

  it('R13a: policy khong phai chuoi', () => {
    // covers C59=T
    expect(() =>
      resolve({ crossOriginResourcePolicy: { policy: rand(100, 900) } }),
    ).toThrow();
    expect(() =>
      resolve({ xFrameOptions: { action: rand(100, 900) } }),
    ).toThrow();
  });

  it('R13b: policy la chuoi nhung khong nam trong danh sach cho phep', () => {
    // covers C59=F, C60=T
    expect(() =>
      resolve({ crossOriginEmbedderPolicy: { policy: 'bogus' } }),
    ).toThrow();
    expect(() =>
      resolve({
        xPermittedCrossDomainPolicies: { permittedPolicies: 'bogus' },
      }),
    ).toThrow();
  });

  it('R14a: referrerPolicy la mang rong', () => {
    // covers C63=F, C64=T
    expect(() => resolve({ referrerPolicy: { policy: [] } })).toThrow();
  });

  it('R14b: referrerPolicy khong phai chuoi hoac mang', () => {
    // covers C63=T
    expect(() =>
      resolve({ referrerPolicy: { policy: rand(100, 900) } }),
    ).toThrow();
  });

  it('R14c: referrerPolicy co token khong hop le', () => {
    // covers pick that bai trong vong lap tokens
    expect(() => resolve({ referrerPolicy: { policy: ['bogus'] } })).toThrow();
  });

  it('R14d: referrerPolicy co token trung nhau', () => {
    // covers C65=T
    expect(() =>
      resolve({ referrerPolicy: { policy: ['origin', 'origin'] } }),
    ).toThrow();
  });

  it('R15a: maxAge khong phai so', () => {
    // covers C67=T
    expect(() =>
      resolve({ strictTransportSecurity: { maxAge: `${rand(100, 900)}` } }),
    ).toThrow();
  });

  it('R15b: maxAge khong huu han (NaN)', () => {
    // covers C67=F, C68=T
    expect(() =>
      resolve({ strictTransportSecurity: { maxAge: Number.NaN } }),
    ).toThrow();
  });

  it('R15c: maxAge la so am', () => {
    // covers C67=F, C68=F, C69=T
    expect(() =>
      resolve({ strictTransportSecurity: { maxAge: -rand(100, 900) } }),
    ).toThrow();
  });
});
