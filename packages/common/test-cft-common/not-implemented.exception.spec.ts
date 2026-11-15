import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock dependency bên ngoài ----
vi.mock('../enums/http-status.enum.js', () => ({
  HttpStatus: { NOT_IMPLEMENTED: 501 },
}));

// HttpException giả: mô phỏng hành vi của extractDescriptionAndOptionsFrom
// (string -> description; object -> description + options) và createBody.
vi.mock('../exceptions/http.exception.js', () => {
  class HttpException {
    static extractDescriptionAndOptionsFrom = vi.fn((d: any) =>
      typeof d === 'string'
        ? { description: d, httpExceptionOptions: undefined }
        : { description: d?.description, httpExceptionOptions: d },
    );
    static createBody = vi.fn((..._args: any[]) => ({ body: true }));
    constructor(
      public response: any,
      public status: number,
      public options?: any,
    ) {}
  }
  return { HttpException };
});

import { HttpException, NotImplementedException } from '../exceptions/index.js';

// ---- Bộ sinh dữ liệu ngẫu nhiên ----
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randWord = () => {
  const len = randInt(5, 12);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: len }, () => letters[randInt(0, 25)]).join('');
};

const randObjectOrError = () =>
  Math.random() < 0.5
    ? randWord()
    : { [randWord()]: randWord(), code: randInt(10, 500) };

const randCause = () => new Error(randWord());

describe('NotImplementedException - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // P1: D1=T (dùng default), D2=F, D3=T (options undefined)
  it('P1: không truyền descriptionOrOptions', () => {
    const ex = new NotImplementedException(randObjectOrError());
    expect(ex).toBeDefined();
    expect(HttpException.createBody).toHaveBeenCalled();
  });

  // P2: D1=F, D2=F, D3=T (description là string)
  it('P2: descriptionOrOptions là string', () => {
    const ex = new NotImplementedException(randObjectOrError(), randWord());
    expect(ex).toBeDefined();
    expect(HttpException.createBody).toHaveBeenCalled();
  });

  // P3: D1=F, D2=F, D3=F (object có description và errorCode)
  it('P3: descriptionOrOptions là object có description', () => {
    const ex = new NotImplementedException(randObjectOrError(), {
      description: randWord(),
      cause: randCause(),
      errorCode: randWord(),
    } as any);
    expect(ex).toBeDefined();
    expect(HttpException.createBody).toHaveBeenCalled();
  });

  // P4: D1=F, D2=T (không có description), D3=F (có options)
  it('P4: descriptionOrOptions là object không có description', () => {
    const ex = new NotImplementedException(randObjectOrError(), {
      cause: randCause(),
      errorCode: randWord(),
    } as any);
    expect(ex).toBeDefined();
    expect(HttpException.createBody).toHaveBeenCalled();
  });

  // P5 (chỉ tới được bằng mock): D1=F, D2=T, D3=T
  // Ép extractDescriptionAndOptionsFrom trả về object rỗng.
  it('P5: mock ép description và httpExceptionOptions đều undefined', () => {
    (HttpException.extractDescriptionAndOptionsFrom as any).mockReturnValueOnce(
      {},
    );
    const ex = new NotImplementedException(randObjectOrError(), randWord());
    expect(ex).toBeDefined();
    expect(HttpException.createBody).toHaveBeenCalled();
  });
});
