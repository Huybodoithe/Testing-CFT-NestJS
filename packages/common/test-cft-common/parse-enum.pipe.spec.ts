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

import { ParseEnumPipe } from '../pipes/parse-enum.pipe.js';

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

// Enum chuỗi: { KEY1: 'val1', KEY2: 'val2' }
const makeStringEnum = () => {
  const k1 = randWord().toUpperCase();
  const k2 = randWord().toUpperCase();
  const v1 = randWord();
  const v2 = randWord();
  return { enumObj: { [k1]: v1, [k2]: v2 } as any, values: [v1, v2] };
};

// Enum số có reverse mapping, giống TypeScript: { A: 101, 101: 'A', B: 202, 202: 'B' }
const makeNumericEnum = () => {
  const a = randWord().toUpperCase();
  const b = randWord().toUpperCase();
  const na = randInt(100, 400);
  const nb = randInt(500, 900);
  return {
    enumObj: { [a]: na, [na]: a, [b]: nb, [nb]: b } as any,
    numbers: [na, nb],
  };
};

const meta: any = { type: 'query' };

describe('ParseEnumPipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== constructor =====

  // P1: D1=T
  it('P1: enumType falsy thì ném lỗi', () => {
    expect(() => new ParseEnumPipe(randNil() as any)).toThrow();
  });

  // P2: D1=F, D2=T, D3=T, D4=F
  it('P2: không truyền options', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj);
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P3: D2=F, D3=F, D4=T
  it('P3: có exceptionFactory và errorHttpStatusCode', async () => {
    const { enumObj } = makeStringEnum();
    const factory = vi.fn((e: any) => ({ custom: e }));
    const pipe = new ParseEnumPipe(enumObj, {
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
    expect(factory).toHaveBeenCalled();
  });

  // P4: D3=F, D4=F
  it('P4: có errorHttpStatusCode, không có exceptionFactory', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj, {
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P5: D2=F, D3=T (options rỗng)
  it('P5: options rỗng', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj, {});
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // ===== transform: nhánh nil / optional =====

  // P6: D5b
  it('P6: value nil, không truyền options', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj);
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P7: D5c
  it('P7: value nil, optional falsy', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj, { optional: false });
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P8: D5d (dùng null để toBeDefined pass)
  it('P8: value nil, optional true', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj, { optional: true });
    const result = await pipe.transform(null, meta);
    expect(result).toBeDefined();
  });

  // ===== transform: enum chuỗi =====

  // P9: D5a, D8a, D6=F, D7=F
  it('P9: enum chuỗi, giá trị hợp lệ', async () => {
    const { enumObj, values } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj, { optional: true });
    const result = await pipe.transform(pickOne(values), meta);
    expect(result).toBeDefined();
  });

  // P14: D9a, D12a, D6=T (enum chuỗi, giá trị không thuộc enum)
  it('P14: enum chuỗi, giá trị không thuộc enum', async () => {
    const { enumObj } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj);
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // ===== transform: enum số =====

  // P10: D12d (reverse mapping bị loại), D8a (truyền số)
  it('P10: enum số, truyền số', async () => {
    const { enumObj, numbers } = makeNumericEnum();
    const pipe = new ParseEnumPipe(enumObj);
    const result = await pipe.transform(pickOne(numbers), meta);
    expect(result).toBeDefined();
  });

  // P11: D9d (chuỗi số khớp)
  it('P11: enum số, truyền chuỗi số', async () => {
    const { enumObj, numbers } = makeNumericEnum();
    const pipe = new ParseEnumPipe(enumObj);
    const result = await pipe.transform(String(pickOne(numbers)), meta);
    expect(result).toBeDefined();
  });

  // P12: D9c (chuỗi số không khớp), D6=T
  it('P12: enum số, chuỗi số không khớp', async () => {
    const { enumObj } = makeNumericEnum();
    const pipe = new ParseEnumPipe(enumObj);
    await expect(
      pipe.transform(String(randInt(9100, 9900)), meta),
    ).rejects.toBeDefined();
  });

  // P13: D9b (value không phải chuỗi), D6=T
  it('P13: enum số, truyền giá trị không phải chuỗi hoặc số', async () => {
    const { enumObj } = makeNumericEnum();
    const pipe = new ParseEnumPipe(enumObj);
    await expect(
      pipe.transform({ [randWord()]: randInt(100, 9000) }, meta),
    ).rejects.toBeDefined();
  });

  // ===== cache =====

  // P15: D11=F (lần gọi thứ hai dùng cache)
  it('P15: gọi transform hai lần để dùng cache', async () => {
    const { enumObj, values } = makeStringEnum();
    const pipe = new ParseEnumPipe(enumObj);
    const first = await pipe.transform(pickOne(values), meta);
    const second = await pipe.transform(pickOne(values), meta);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
  });

  // ===== computeEnumValues: các enum tự chế =====

  // P17: D12b (enumValue là string nhưng enumType[enumValue] không phải number)
  it('P17: thuộc tính chuỗi trỏ tới key không phải number', async () => {
    const a = randWord().toUpperCase();
    const x = randWord();
    const y = randWord();
    const enumObj: any = { [a]: x, [x]: y };
    const pipe = new ParseEnumPipe(enumObj);
    const result = await pipe.transform(x, meta);
    expect(result).toBeDefined();
  });

  // P18: D12c (là number nhưng String(number) khác key)
  it('P18: thuộc tính chuỗi trỏ tới number nhưng không phải reverse mapping', async () => {
    const a = randWord().toUpperCase();
    const b = randWord().toUpperCase();
    const n = randInt(100, 900);
    const enumObj: any = { [a]: b, [b]: n };
    const pipe = new ParseEnumPipe(enumObj);
    const result = await pipe.transform(b, meta);
    expect(result).toBeDefined();
  });

  // ===== P16: chỉ tới được bằng spy =====

  // P16: D7=T (toEnumValue trả undefined ở lần gọi thứ hai)
  it('P16: toEnumValue ép trả undefined sau khi isEnum đã true', async () => {
    const { enumObj, values } = makeStringEnum();
    const pipe: any = new ParseEnumPipe(enumObj);
    const value = pickOne(values);
    const spy = vi
      .spyOn(pipe, 'toEnumValue')
      .mockReturnValueOnce(value)
      .mockReturnValueOnce(undefined);
    const result = await pipe.transform(value, meta);
    expect(result).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
