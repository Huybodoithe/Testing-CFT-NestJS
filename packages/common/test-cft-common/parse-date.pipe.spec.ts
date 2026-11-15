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
  isNumber: vi.fn((v: any) => typeof v === 'number'),
}));

import { ParseDatePipe } from '../pipes/parse-date.pipe.js';

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

// Chuỗi ngày hợp lệ ngẫu nhiên (ISO)
const randDateString = () =>
  new Date(randInt(1_000_000_000_000, 1_900_000_000_000)).toISOString();
// Timestamp hợp lệ ngẫu nhiên
const randTimestamp = () => randInt(1_000_000_000_000, 1_900_000_000_000);

describe('ParseDatePipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== constructor =====

  // P1: D1=T, D2=T, D3=F
  it('P1: không truyền options', () => {
    const pipe = new ParseDatePipe();
    expect(pipe).toBeDefined();
    expect(() => pipe.transform(randNil())).toThrow();
  });

  // P2: D1=F, D2=F, D3=T
  it('P2: có exceptionFactory và errorHttpStatusCode', () => {
    const factory = vi.fn((e: any) => new Error(e));
    const pipe = new ParseDatePipe({
      exceptionFactory: factory,
      errorHttpStatusCode: randStatus(),
    } as any);
    expect(() => pipe.transform(randNil())).toThrow();
    expect(factory).toHaveBeenCalled();
  });

  // P3: D2=F, D3=F
  it('P3: có errorHttpStatusCode, không có exceptionFactory', () => {
    const pipe = new ParseDatePipe({
      errorHttpStatusCode: randStatus(),
    } as any);
    expect(() => pipe.transform(randNil())).toThrow();
  });

  // ===== transform: nhánh nil =====

  // P4: D4=T, D5=T
  it('P4: value nil, có default', () => {
    const pipe = new ParseDatePipe({
      default: () => new Date(randTimestamp()),
    });
    const result = pipe.transform(randNil());
    expect(result).toBeDefined();
  });

  // P5: D5=F, D6=T (dùng null để toBeDefined pass)
  it('P5: value nil, optional true', () => {
    const pipe = new ParseDatePipe({ optional: true });
    const result = pipe.transform(null);
    expect(result).toBeDefined();
  });

  // P6: D6=F, D7a
  it('P6: value nil, không default, không optional', () => {
    const pipe = new ParseDatePipe({});
    expect(() => pipe.transform(randNil())).toThrow();
  });

  // ===== transform: chuỗi rỗng =====

  // P7: D4=F, D7b
  it('P7: value là chuỗi rỗng', () => {
    const pipe = new ParseDatePipe({});
    expect(() => pipe.transform('')).toThrow();
  });

  // ===== transform: chuyển đổi ngày =====

  // P8: D7c, D8a, D9=F
  it('P8: value là chuỗi ngày hợp lệ', () => {
    const pipe = new ParseDatePipe({});
    const result = pipe.transform(randDateString());
    expect(result).toBeDefined();
  });

  // P9: D8b, D9=F
  it('P9: value là timestamp hợp lệ', () => {
    const pipe = new ParseDatePipe({});
    const result = pipe.transform(randTimestamp());
    expect(result).toBeDefined();
  });

  // P10: D8c, D9=F
  it('P10: value là đối tượng Date', () => {
    const pipe = new ParseDatePipe({});
    const result = pipe.transform(new Date(randTimestamp()));
    expect(result).toBeDefined();
  });

  // P11: D8d, D9=T (boolean, object, mảng)
  it('P11: value là kiểu khác (boolean, object, mảng)', () => {
    const pipe = new ParseDatePipe({});
    expect(() => pipe.transform(pickOne([true, false]))).toThrow();
    expect(() =>
      pipe.transform({ [randWord()]: randInt(100, 9000) }),
    ).toThrow();
    expect(() => pipe.transform([randInt(100, 9000), randWord()])).toThrow();
  });

  // P12: D8a, D9=T (chuỗi không phải ngày)
  it('P12: value là chuỗi không phải ngày', () => {
    const pipe = new ParseDatePipe({});
    expect(() => pipe.transform(randWord())).toThrow();
  });
});
