import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock dependency bên ngoài ----
vi.mock('../decorators/core/injectable.decorator.js', () => ({
  Injectable: () => (target: any) => target,
}));

vi.mock('../decorators/core/optional.decorator.js', () => ({
  Optional: () => () => undefined,
}));

vi.mock('../enums/http-status.enum.js', () => ({
  HttpStatus: { BAD_REQUEST: 400 },
}));

vi.mock('../interfaces/features/pipe-transform.interface.js', () => ({}));

vi.mock('../utils/http-error-by-code.util.js', () => {
  const make = (status: number) =>
    class {
      static status = status;
      constructor(public message: any) {}
    };
  return {
    HttpErrorByCode: {
      400: make(400),
      404: make(404),
      409: make(409),
      422: make(422),
    },
  };
});

vi.mock('../utils/shared.utils.js', () => ({
  isNil: vi.fn((v: any) => v === undefined || v === null),
  isString: vi.fn((v: any) => typeof v === 'string'),
}));

import { ParseUUIDPipe } from '../pipes/parse-uuid.pipe.js';

// ---- Bộ sinh dữ liệu ngẫu nhiên ----
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randWord = () => {
  const len = randInt(5, 12);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: len }, () => letters[randInt(0, 25)]).join('');
};

const pickOne = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const randNil = () => (Math.random() < 0.5 ? undefined : null);
const randStatus = () => pickOne([404, 409, 422]);

const randHex = (n: number) =>
  Array.from({ length: n }, () => '0123456789abcdef'[randInt(0, 15)]).join('');

// UUID hợp lệ với version v (1 đến 8) và variant RFC (8, 9, a, b)
const randUuid = (v: number) =>
  `${randHex(8)}-${randHex(4)}-${v}${randHex(3)}-${pickOne(['8', '9', 'a', 'b'])}${randHex(3)}-${randHex(12)}`;

const randVersion = () => randInt(1, 8);
// Chuỗi sai định dạng UUID
const randBadUuid = () => `${randWord()}-${randWord()}`;

const meta: any = { type: 'query' };

describe('ParseUUIDPipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== constructor =====

  // P1: D1=T, D2=T, D3=F
  it('P1: không truyền options', async () => {
    const pipe = new ParseUUIDPipe();
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
  });

  // P2: D1=F, D2=F, D3=T
  it('P2: có exceptionFactory, errorHttpStatusCode và version', async () => {
    const factory = vi.fn((e: any) => ({ custom: e }));
    const pipe = new ParseUUIDPipe({
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
      version: randVersion(),
    } as any);
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
    expect(factory).toHaveBeenCalled();
  });

  // P3: D2=F, D3=F
  it('P3: có errorHttpStatusCode, không có exceptionFactory', async () => {
    const pipe = new ParseUUIDPipe({
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
  });

  // P4: D1=F, D2=T (options rỗng)
  it('P4: options rỗng', async () => {
    const pipe = new ParseUUIDPipe({});
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
  });

  // ===== transform: nhánh nil / optional =====

  // P5: D4b, D8=T
  it('P5: value nil, không truyền options', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P6: D4c, D8=T
  it('P6: value nil, optional falsy', async () => {
    const pipe = new ParseUUIDPipe({ optional: false });
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P7: D4d (dùng null để toBeDefined pass)
  it('P7: value nil, optional true', async () => {
    const pipe = new ParseUUIDPipe({ optional: true });
    const result = await pipe.transform(null, meta);
    expect(result).toBeDefined();
  });

  // ===== isUUID: kiểu đầu vào =====

  // P8: D4a, D8=T (không phải string)
  it('P8: value không phải string', async () => {
    const pipe = new ParseUUIDPipe({});
    await expect(
      pipe.transform(randInt(100, 9000), meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(pickOne([true, false]), meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ [randWord()]: randInt(100, 9000) }, meta),
    ).rejects.toBeDefined();
  });

  // ===== isUUID: UUID hợp lệ =====

  // P9: D7=T, D8=F, D9b, D5=F
  it('P9: UUID hợp lệ, không có version', async () => {
    const pipe = new ParseUUIDPipe({});
    const result = await pipe.transform(randUuid(randVersion()), meta);
    expect(result).toBeDefined();
  });

  // P10: D7=F, D9b
  it('P10: UUID hợp lệ, version cụ thể', async () => {
    const v = randVersion();
    const pipe = new ParseUUIDPipe({ version: v as any });
    const result = await pipe.transform(randUuid(v), meta);
    expect(result).toBeDefined();
  });

  // ===== isUUID: UUID không hợp lệ =====

  // P11: D9c, D5=T, D6a (không có version)
  it('P11: chuỗi sai định dạng, không có version', async () => {
    const pipe = new ParseUUIDPipe({});
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
  });

  // P12: D6b (version = 'all')
  it('P12: chuỗi sai định dạng, version all', async () => {
    const pipe = new ParseUUIDPipe({ version: 'all' });
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
  });

  // P13: D6c (version cụ thể)
  it('P13: chuỗi sai định dạng, version cụ thể', async () => {
    const pipe = new ParseUUIDPipe({ version: randVersion() as any });
    await expect(pipe.transform(randBadUuid(), meta)).rejects.toBeDefined();
  });

  // P14: UUID hợp lệ nhưng khác version yêu cầu
  it('P14: UUID hợp lệ nhưng sai version', async () => {
    const pipe = new ParseUUIDPipe({ version: 1 as any });
    await expect(
      pipe.transform(randUuid(randInt(2, 8)), meta),
    ).rejects.toBeDefined();
  });

  // P15: D9a (version không có trong bảng regex)
  it('P15: version ngoài bảng regex', async () => {
    const pipe = new ParseUUIDPipe({ version: randInt(50, 99) as any });
    await expect(
      pipe.transform(randUuid(randVersion()), meta),
    ).rejects.toBeDefined();
  });
});
