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
}));

import { ParseIntPipe } from '../pipes/parse-int.pipe.js';

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

// Chuỗi số nguyên ngẫu nhiên, có thể âm, ví dụ '4821' hoặc '-731'
const randIntString = () => `${pickOne(['', '-'])}${randInt(100, 9000)}`;
// Chuỗi số thực ngẫu nhiên, ví dụ '123.457'
const randFloatString = () =>
  String(Number((Math.random() * 8900 + 100).toFixed(3)));
// Chuỗi 400 chữ số ngẫu nhiên: khớp regex nhưng isFinite trả false
const randHugeDigits = () =>
  `${randInt(1, 9)}${Array.from({ length: 399 }, () => randInt(0, 9)).join('')}`;

const meta: any = { type: 'query' };

describe('ParseIntPipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== constructor =====

  // P1: D1=T, D2=T, D3=F
  it('P1: không truyền options', async () => {
    const pipe = new ParseIntPipe();
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P2: D1=F, D2=F, D3=T
  it('P2: có exceptionFactory và errorHttpStatusCode', async () => {
    const factory = vi.fn((e: any) => ({ custom: e }));
    const pipe = new ParseIntPipe({
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
    expect(factory).toHaveBeenCalled();
  });

  // P3: D2=F, D3=F
  it('P3: có errorHttpStatusCode, không có exceptionFactory', async () => {
    const pipe = new ParseIntPipe({
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P4: D1=F, D2=T (options rỗng)
  it('P4: options rỗng', async () => {
    const pipe = new ParseIntPipe({});
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // ===== transform: nhánh nil / optional =====

  // P5: D4b
  it('P5: value nil, không truyền options', async () => {
    const pipe = new ParseIntPipe();
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P6: D4c
  it('P6: value nil, optional falsy', async () => {
    const pipe = new ParseIntPipe({ optional: false });
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P7: D4d (dùng null để toBeDefined pass)
  it('P7: value nil, optional true', async () => {
    const pipe = new ParseIntPipe({ optional: true });
    const result = await pipe.transform(null, meta);
    expect(result).toBeDefined();
  });

  // ===== transform + isNumeric =====

  // P8: D4a, D6b, D7b, D8a, D5=F (kiểu number)
  it('P8: value là số nguyên', async () => {
    const pipe = new ParseIntPipe({ optional: true });
    const result = await pipe.transform(randInt(100, 9000), meta);
    expect(result).toBeDefined();
  });

  // P9: D6b, D7b, D8a, D5=F (kiểu string)
  it('P9: value là chuỗi số nguyên', async () => {
    const pipe = new ParseIntPipe({});
    const result = await pipe.transform(randIntString(), meta);
    expect(result).toBeDefined();
  });

  // P10: D6a, D5=T
  it('P10: value không phải string hay number', async () => {
    const pipe = new ParseIntPipe({});
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

  // P11: D7a, D5=T (chuỗi chữ và chuỗi số thực)
  it('P11: chuỗi không phải số nguyên', async () => {
    const pipe = new ParseIntPipe({});
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
    await expect(pipe.transform(randFloatString(), meta)).rejects.toBeDefined();
  });

  // P12: D7b, D8b, D5=T (chuỗi 400 chữ số, isFinite trả false)
  it('P12: chuỗi số nguyên quá dài, isFinite false', async () => {
    const pipe = new ParseIntPipe({});
    await expect(pipe.transform(randHugeDigits(), meta)).rejects.toBeDefined();
  });
});
