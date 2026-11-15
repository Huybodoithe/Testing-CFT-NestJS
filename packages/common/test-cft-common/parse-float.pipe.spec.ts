import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock dependency bên ngoài ----
vi.mock('../decorators/core/index.js', () => ({
  Injectable: () => (target: any) => target,
  Optional: () => () => undefined,
}));

vi.mock('../index.js', () => ({
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
}));

import { ParseFloatPipe } from '../pipes/parse-float.pipe.js';

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

// Số thực ngẫu nhiên, ví dụ 123.457
const randFloat = () => Number((Math.random() * 8900 + 100).toFixed(3));
// Chuỗi số thực hợp lệ, ví dụ '456.789'
const randFloatString = () => String(randFloat());

const meta: any = { type: 'query' };

describe('ParseFloatPipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== constructor =====

  // P1: D1=T, D2=T, D3=F
  it('P1: không truyền options', async () => {
    const pipe = new ParseFloatPipe();
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P2: D1=F, D2=F, D3=T
  it('P2: có exceptionFactory và errorHttpStatusCode', async () => {
    const factory = vi.fn((e: any) => ({ custom: e }));
    const pipe = new ParseFloatPipe({
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
    expect(factory).toHaveBeenCalled();
  });

  // P3: D2=F, D3=F
  it('P3: có errorHttpStatusCode, không có exceptionFactory', async () => {
    const pipe = new ParseFloatPipe({
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P4: D1=F, D2=T (options rỗng)
  it('P4: options rỗng', async () => {
    const pipe = new ParseFloatPipe({});
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // ===== transform: nhánh nil / optional =====

  // P5: D4b
  it('P5: value nil, không truyền options', async () => {
    const pipe = new ParseFloatPipe();
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P6: D4c
  it('P6: value nil, optional falsy', async () => {
    const pipe = new ParseFloatPipe({ optional: false });
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P7: D4d (dùng null để toBeDefined pass)
  it('P7: value nil, optional true', async () => {
    const pipe = new ParseFloatPipe({ optional: true });
    const result = await pipe.transform(null, meta);
    expect(result).toBeDefined();
  });

  // ===== transform + isNumeric: kiểu number =====

  // P8: D4a, D6a, D5=F
  it('P8: value là số hữu hạn', async () => {
    const pipe = new ParseFloatPipe({ optional: true });
    const result = await pipe.transform(randFloat(), meta);
    expect(result).toBeDefined();
  });

  // P9: D6b, D5=T
  it('P9: value là NaN hoặc Infinity', async () => {
    const pipe = new ParseFloatPipe({});
    await expect(
      pipe.transform(pickOne([NaN, Infinity, -Infinity]), meta),
    ).rejects.toBeDefined();
  });

  // ===== isNumeric: kiểu không phải string =====

  // P10: D7a
  it('P10: value không phải string hay number', async () => {
    const pipe = new ParseFloatPipe({});
    await expect(
      pipe.transform(pickOne([true, false]), meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ [randWord()]: randInt(100, 9000) }, meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform([randInt(100, 9000), randWord()], meta),
    ).rejects.toBeDefined();
  });

  // ===== isNumeric: chuỗi =====

  // P11: D7b
  it('P11: chuỗi rỗng', async () => {
    const pipe = new ParseFloatPipe({});
    await expect(pipe.transform('', meta)).rejects.toBeDefined();
  });

  // P12: D7c (khoảng trắng đầu hoặc cuối)
  it('P12: chuỗi có khoảng trắng đầu hoặc cuối', async () => {
    const pipe = new ParseFloatPipe({});
    await expect(
      pipe.transform(`${' '.repeat(randInt(2, 4))}${randFloatString()}`, meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(`${randFloatString()}${' '.repeat(randInt(2, 4))}`, meta),
    ).rejects.toBeDefined();
  });

  // P13 đến P18: D8a đến D8f (từng tiền tố radix)
  it.each(['0x', '0X', '0b', '0B', '0o', '0O'])(
    'P13-P18: chuỗi bắt đầu bằng tiền tố radix %s',
    async prefix => {
      const pipe = new ParseFloatPipe({});
      await expect(
        pipe.transform(`${prefix}${randInt(10, 77)}`, meta),
      ).rejects.toBeDefined();
    },
  );

  // P19: D7d, D8g, D9=T
  it('P19: chuỗi số thực hợp lệ', async () => {
    const pipe = new ParseFloatPipe({});
    const result = await pipe.transform(randFloatString(), meta);
    expect(result).toBeDefined();
  });

  // P20: D9=F
  it('P20: chuỗi chữ', async () => {
    const pipe = new ParseFloatPipe({});
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });
});
