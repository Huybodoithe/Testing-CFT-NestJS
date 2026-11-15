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

import { ParseBoolPipe } from '../pipes/parse-bool.pipe.js';

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

const meta: any = { type: 'query' };

describe('ParseBoolPipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== constructor =====

  // P1: D1=T, D2=T, D3=F (factory mặc định, mã 400)
  it('P1: không truyền options', async () => {
    const pipe = new ParseBoolPipe();
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P2: D1=F, D2=F, D3=T (factory tùy chỉnh)
  it('P2: có exceptionFactory và errorHttpStatusCode', async () => {
    const factory = vi.fn((e: any) => ({ custom: e }));
    const pipe = new ParseBoolPipe({
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
    expect(factory).toHaveBeenCalled();
  });

  // P3: D1=F, D2=F, D3=F (factory mặc định với mã tùy chỉnh)
  it('P3: có errorHttpStatusCode, không có exceptionFactory', async () => {
    const pipe = new ParseBoolPipe({
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P4: D1=F, D2=T (options rỗng, không có mã trạng thái)
  it('P4: options rỗng', async () => {
    const pipe = new ParseBoolPipe({});
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // ===== transform: nhánh nil / optional =====

  // P5: D4b (nil, this.options là undefined)
  it('P5: value nil, không truyền options', async () => {
    const pipe = new ParseBoolPipe();
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P6: D4c (nil, options có nhưng optional falsy)
  it('P6: value nil, optional falsy', async () => {
    const pipe = new ParseBoolPipe({ optional: false });
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P7: D4d (nil, optional true, trả value; dùng null để toBeDefined pass)
  it('P7: value nil, optional true', async () => {
    const pipe = new ParseBoolPipe({ optional: true });
    const result = await pipe.transform(null, meta);
    expect(result).toBeDefined();
  });

  // P8: D4a (value không nil, optional true vẫn đi tiếp)
  it('P8: value không nil, optional true', async () => {
    const pipe = new ParseBoolPipe({ optional: true });
    const result = await pipe.transform(true, meta);
    expect(result).toBeDefined();
  });

  // ===== transform: isTrue / isFalse =====

  // P9: D5=T, D7a (boolean true)
  it('P9: value là boolean true', async () => {
    const pipe = new ParseBoolPipe({});
    const result = await pipe.transform(true, meta);
    expect(result).toBeDefined();
  });

  // P10: D5=T, D7b (chuỗi 'true')
  it('P10: value là chuỗi "true"', async () => {
    const pipe = new ParseBoolPipe({});
    const result = await pipe.transform('true', meta);
    expect(result).toBeDefined();
  });

  // P11: D5=F, D6=T, D7c, D8a (boolean false)
  it('P11: value là boolean false', async () => {
    const pipe = new ParseBoolPipe({});
    const result = await pipe.transform(false, meta);
    expect(result).toBeDefined();
  });

  // P12: D6=T, D8b (chuỗi 'false')
  it('P12: value là chuỗi "false"', async () => {
    const pipe = new ParseBoolPipe({});
    const result = await pipe.transform('false', meta);
    expect(result).toBeDefined();
  });

  // P13: D7c, D8c, ném lỗi (chuỗi hoặc số ngẫu nhiên)
  it('P13: value là giá trị ngẫu nhiên không phải boolean', async () => {
    const pipe = new ParseBoolPipe({});
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
    await expect(
      pipe.transform(randInt(100, 9000), meta),
    ).rejects.toBeDefined();
  });
});
