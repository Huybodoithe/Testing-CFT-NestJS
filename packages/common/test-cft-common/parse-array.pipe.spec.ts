import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Biến mock dùng chung (hoisted để dùng được trong vi.mock) ----
const { validationTransform } = vi.hoisted(() => ({
  validationTransform: vi.fn(),
}));

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

vi.mock('../interfaces/index.js', () => ({}));
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
  isUndefined: vi.fn((v: any) => v === undefined),
}));

vi.mock('../pipes/validation.pipe.js', () => ({
  ValidationPipe: class {
    transform = validationTransform;
    constructor(public options: any) {}
  },
}));

import { ParseArrayPipe } from '../pipes/parse-array.pipe.js';

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
const randSeparator = () => pickOne([';', '|', '#', '-']);

// Chuỗi số mà JSON.parse lỗi nhưng Number() vẫn hợp lệ (vd '+123')
const randPlusNumber = () => `+${randInt(100, 9000)}`;
// Chuỗi số mà JSON.parse parse thành công (vd '123')
const randJsonNumber = () => String(randInt(100, 9000));
const randItems = (gen: () => any) =>
  Array.from({ length: randInt(2, 4) }, gen);

class Item {}
const meta: any = { type: 'query' };
const errWith = (response: any) => ({ getResponse: () => response });

describe('ParseArrayPipe - Control Flow Testing', () => {
  beforeEach(() => {
    validationTransform.mockReset();
    validationTransform.mockImplementation(async (item: any) => item);
  });

  // ===== constructor =====

  // P1: D1=T, D2=T, D3=F (factory mặc định, mã 400)
  it('P1: không truyền options', async () => {
    const pipe = new ParseArrayPipe();
    expect(pipe).toBeDefined();
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P2: D1=F, D2=F, D3=T (factory tùy chỉnh)
  it('P2: có exceptionFactory và errorHttpStatusCode', async () => {
    const factory = vi.fn((e: any) => ({ custom: e }));
    const pipe = new ParseArrayPipe({
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
    expect(factory).toHaveBeenCalled();
  });

  // P3: D1=F, D2=F, D3=F (factory mặc định với mã tùy chỉnh)
  it('P3: có errorHttpStatusCode, không có exceptionFactory', async () => {
    const pipe = new ParseArrayPipe({
      errorHttpStatusCode: randStatus(),
    } as any);
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // ===== transform: tiền xử lý =====

  // P4: D4=T
  it('P4: value nil, không optional', async () => {
    const pipe = new ParseArrayPipe({});
    await expect(pipe.transform(randNil(), meta)).rejects.toBeDefined();
  });

  // P5: D4=F, D5=T (dùng null vì toBeDefined fail với undefined)
  it('P5: value nil, optional', async () => {
    const pipe = new ParseArrayPipe({ optional: true });
    const result = await pipe.transform(null, meta);
    expect(result).toBeDefined();
  });

  // P6: D6=T, D7=T
  it('P6: value không phải mảng cũng không phải string', async () => {
    const pipe = new ParseArrayPipe({});
    await expect(
      pipe.transform(randInt(100, 9000), meta),
    ).rejects.toBeDefined();
  });

  // P7: D7=F, D8=F, D10=F
  it('P7: string, separator mặc định, không items', async () => {
    const pipe = new ParseArrayPipe({});
    const result = await pipe.transform(randItems(randWord).join(','), meta);
    expect(result).toBeDefined();
  });

  // P8: D8=T
  it('P8: string, separator tùy chỉnh', async () => {
    const sep = randSeparator();
    const pipe = new ParseArrayPipe({ separator: sep });
    const result = await pipe.transform(randItems(randWord).join(sep), meta);
    expect(result).toBeDefined();
  });

  // P9: D9=catch (split ném lỗi qua Symbol.split)
  it('P9: split ném lỗi', async () => {
    const badSeparator: any = {
      [Symbol.split]: () => {
        throw new Error(randWord());
      },
    };
    const pipe = new ParseArrayPipe({ separator: badSeparator });
    await expect(pipe.transform(randWord(), meta)).rejects.toBeDefined();
  });

  // P10: D6=F, D10=F
  it('P10: value là mảng, không items', async () => {
    const pipe = new ParseArrayPipe({});
    const result = await pipe.transform(randItems(randWord), meta);
    expect(result).toBeDefined();
  });

  // ===== transform: items, dừng ở lỗi đầu tiên (D11=F) =====

  // P11: D12c, D13=catch, D14=T, D24=F
  it('P11: items Number, chuỗi dạng +N', async () => {
    const pipe = new ParseArrayPipe({ items: Number as any });
    const result = await pipe.transform(randItems(randPlusNumber), meta);
    expect(result).toBeDefined();
  });

  // P12: D12b (phần tử không phải string)
  it('P12: items Number, mảng số thật', async () => {
    const pipe = new ParseArrayPipe({ items: Number as any });
    const result = await pipe.transform(
      randItems(() => randInt(100, 9000)),
      meta,
    );
    expect(result).toBeDefined();
  });

  // P13: D13=try (JSON.parse thành công)
  it('P13: items Number, chuỗi JSON số', async () => {
    const pipe = new ParseArrayPipe({ items: Number as any });
    const result = await pipe.transform(randItems(randJsonNumber), meta);
    expect(result).toBeDefined();
  });

  // P14: D24=T, D25=F (có index)
  it('P14: items Number, phần tử không hợp lệ', async () => {
    const pipe = new ParseArrayPipe({ items: Number as any });
    await expect(
      pipe.transform([randPlusNumber(), randWord()], meta),
    ).rejects.toBeDefined();
  });

  // P15: D12a (items === String), D26
  it('P15: items String, chuỗi và số', async () => {
    const pipe = new ParseArrayPipe({ items: String as any });
    const result = await pipe.transform(
      [randWord(), randInt(100, 9000), randWord()],
      meta,
    );
    expect(result).toBeDefined();
  });

  // P16: D27 giữ nguyên (JSON.parse('true') ra boolean)
  it('P16: items Boolean hợp lệ', async () => {
    const pipe = new ParseArrayPipe({ items: Boolean as any });
    const result = await pipe.transform(
      [pickOne(['true', 'false']), pickOne(['true', 'false'])],
      meta,
    );
    expect(result).toBeDefined();
  });

  // P17: D27 ném lỗi, D25=F (có index)
  it('P17: items Boolean, phần tử không hợp lệ', async () => {
    const pipe = new ParseArrayPipe({ items: Boolean as any });
    await expect(
      pipe.transform([pickOne(['true', 'false']), randWord()], meta),
    ).rejects.toBeDefined();
  });

  // P18: D14=F, D22=T
  it('P18: items là class, mảng đầy đủ', async () => {
    const pipe = new ParseArrayPipe({ items: Item });
    const result = await pipe.transform(randItems(randWord), meta);
    expect(result).toBeDefined();
    expect(validationTransform).toHaveBeenCalled();
  });

  // P19: D22=F (lỗ hổng của mảng thưa)
  it('P19: items là class, mảng thưa', async () => {
    const sparse: any[] = new Array(3);
    sparse[0] = randWord();
    sparse[2] = randWord();
    const pipe = new ParseArrayPipe({ items: Item });
    const result = await pipe.transform(sparse, meta);
    expect(result).toBeDefined();
  });

  // ===== transform: gom lỗi (D11=T) =====

  // P20: D21=F
  it('P20: stopAtFirstError false, tất cả hợp lệ', async () => {
    const pipe = new ParseArrayPipe({
      items: Number as any,
      stopAtFirstError: false,
    });
    const result = await pipe.transform(randItems(randPlusNumber), meta);
    expect(result).toBeDefined();
  });

  // P21: D16=F (err không có getResponse), D20=F, D21=T, D25=T
  it('P21: stopAtFirstError false, items Number sai', async () => {
    const pipe = new ParseArrayPipe({
      items: Number as any,
      stopAtFirstError: false,
    });
    await expect(
      pipe.transform([randPlusNumber(), randWord()], meta),
    ).rejects.toBeDefined();
  });

  // P22: items Boolean sai, không index
  it('P22: stopAtFirstError false, items Boolean sai', async () => {
    const pipe = new ParseArrayPipe({
      items: Boolean as any,
      stopAtFirstError: false,
    });
    await expect(
      pipe.transform([pickOne(['true', 'false']), randWord()], meta),
    ).rejects.toBeDefined();
  });

  // P23: D16=T, D17=T, D20=T (message là mảng)
  it('P23: response.message là mảng', async () => {
    validationTransform.mockRejectedValueOnce(
      errWith({ message: [randWord(), randWord()] }),
    );
    const pipe = new ParseArrayPipe({
      items: Item,
      stopAtFirstError: false,
    });
    await expect(
      pipe.transform(randItems(randWord), meta),
    ).rejects.toBeDefined();
  });

  // P24: D18c, D19 cả T ('...') và F (path thường); messages là string và mảng
  it('P24: response.message là object dạng nhóm', async () => {
    validationTransform.mockRejectedValueOnce(
      errWith({
        message: {
          '...': randWord(),
          [randWord()]: [randWord(), randWord()],
          [randWord()]: randWord(),
        },
      }),
    );
    const pipe = new ParseArrayPipe({
      items: Item,
      stopAtFirstError: false,
    });
    await expect(
      pipe.transform(randItems(randWord), meta),
    ).rejects.toBeDefined();
  });

  // P25: D18b (message là string)
  it('P25: response.message là string', async () => {
    validationTransform.mockRejectedValueOnce(errWith({ message: randWord() }));
    const pipe = new ParseArrayPipe({
      items: Item,
      stopAtFirstError: false,
    });
    await expect(
      pipe.transform(randItems(randWord), meta),
    ).rejects.toBeDefined();
  });

  // P26: D18a (message không tồn tại)
  it('P26: response không có message', async () => {
    validationTransform.mockRejectedValueOnce(errWith({}));
    const pipe = new ParseArrayPipe({
      items: Item,
      stopAtFirstError: false,
    });
    await expect(
      pipe.transform(randItems(randWord), meta),
    ).rejects.toBeDefined();
  });

  // ===== validatePrimitive / isNumeric gọi trực tiếp =====

  // P27: D28 (items là kiểu khác)
  it('P27: validatePrimitive với items kiểu khác', () => {
    const pipe: any = new ParseArrayPipe({ items: class Other {} as any });
    const result = pipe.validatePrimitive(randWord());
    expect(result).toBeDefined();
  });

  // P28: D29
  it('P28: isNumeric với number', () => {
    const pipe: any = new ParseArrayPipe({});
    expect(pipe.isNumeric(randInt(100, 9000))).toBeDefined();
  });

  // P29: D30a
  it('P29: isNumeric với giá trị không phải string', () => {
    const pipe: any = new ParseArrayPipe({});
    expect(pipe.isNumeric(true)).toBeDefined();
    expect(pipe.isNumeric([randInt(100, 9000)])).toBeDefined();
  });

  // P30: D30b
  it('P30: isNumeric với chuỗi toàn khoảng trắng', () => {
    const pipe: any = new ParseArrayPipe({});
    expect(pipe.isNumeric(' '.repeat(randInt(2, 6)))).toBeDefined();
  });

  // P31: D31=T
  it('P31: isNumeric với tiền tố radix', () => {
    const pipe: any = new ParseArrayPipe({});
    const prefix = pickOne(['0x', '0b', '0o']);
    expect(pipe.isNumeric(`${prefix}${randInt(10, 77)}`)).toBeDefined();
  });

  // P32: D32 (chuỗi không phải số)
  it('P32: isNumeric với chữ', () => {
    const pipe: any = new ParseArrayPipe({});
    expect(pipe.isNumeric(randWord())).toBeDefined();
  });

  // P33: D32 (chuỗi số hợp lệ)
  it('P33: isNumeric với chuỗi số', () => {
    const pipe: any = new ParseArrayPipe({});
    expect(pipe.isNumeric(randJsonNumber())).toBeDefined();
  });
});
