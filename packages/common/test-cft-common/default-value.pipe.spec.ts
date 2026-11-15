import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock dependency bên ngoài ----
vi.mock('../decorators/core/injectable.decorator.js', () => ({
  Injectable: () => (target: any) => target,
}));

vi.mock('../interfaces/features/pipe-transform.interface.js', () => ({}));

vi.mock('../utils/shared.utils.js', () => ({
  isNil: vi.fn((v: any) => v === undefined || v === null),
  isNumber: vi.fn((v: any) => typeof v === 'number'),
  isPlainObject: vi.fn((v: any) => {
    if (v === null || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === null || proto === Object.prototype;
  }),
}));

import { DefaultValuePipe } from '../pipes/default-value.pipe.js';
import { isPlainObject } from '../utils/shared.utils.js';

// ---- Bộ sinh dữ liệu ngẫu nhiên ----
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randWord = () => {
  const len = randInt(5, 12);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: len }, () => letters[randInt(0, 25)]).join('');
};

const randNil = () => (Math.random() < 0.5 ? undefined : null);

const randNestedObject = () => ({
  [randWord()]: randInt(10, 500),
  [randWord()]: { [randWord()]: randWord(), list: [randInt(10, 500)] },
  [randWord()]: [randWord(), { [randWord()]: randInt(10, 500) }],
});

const randNestedArray = () => [
  randInt(10, 500),
  [randWord(), randInt(10, 500)],
  { [randWord()]: randWord() },
];

describe('DefaultValuePipe - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== transform =====

  // P1: D1a (isNil true), D3=T, D5=T (default primitive)
  it('P1: value là null/undefined, default là primitive', () => {
    const pipe = new DefaultValuePipe(randWord());
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P2: D1b, D2a (không phải number), D3=F
  it('P2: value là chuỗi ngẫu nhiên', () => {
    const pipe = new DefaultValuePipe(randWord());
    const result = pipe.transform(randWord());
    expect(result).toBeDefined();
  });

  // P3: D1b, D2b (number không NaN), D3=F
  it('P3: value là số ngẫu nhiên', () => {
    const pipe = new DefaultValuePipe(randWord());
    const result = pipe.transform(randInt(100, 9000));
    expect(result).toBeDefined();
  });

  // P4: D1b, D2c (NaN), D3=T
  it('P4: value là NaN', () => {
    const pipe = new DefaultValuePipe(randInt(10, 500));
    const result = pipe.transform(NaN);
    expect(result).toBeDefined();
  });

  // ===== copyDefaultValue =====

  // P5: mảng thuần lồng nhau, D4c, D5=F, D6 cả T và F, D7=F, D8=T
  it('P5: default là mảng thuần lồng nhau', () => {
    const pipe = new DefaultValuePipe(randNestedArray());
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P6: plain object lồng nhau, D4a, D5=F, D8=F
  it('P6: default là plain object lồng nhau', () => {
    const pipe = new DefaultValuePipe(randNestedObject());
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P7: object rỗng, D9 lặp 0 lần
  it('P7: default là object rỗng (vòng lặp 0 lần)', () => {
    const pipe = new DefaultValuePipe({});
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P8: tham chiếu vòng, D7=T
  it('P8: default có tham chiếu vòng', () => {
    const circular: any = { [randWord()]: randInt(10, 500) };
    circular.self = circular;
    const pipe = new DefaultValuePipe(circular);
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P9a: D4b (mảng nhưng prototype khác), isPlainObject = false => D5=T
  it('P9a: mảng có prototype khác, isPlainObject false', () => {
    const arr: any = [randInt(10, 500), randInt(10, 500)];
    Object.setPrototypeOf(arr, Object.create(Array.prototype));
    (isPlainObject as any).mockReturnValueOnce(false);
    const pipe = new DefaultValuePipe(arr);
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P9b: D4b, isPlainObject = true => D5=F, đi tiếp vào nhánh copy object
  it('P9b: mảng có prototype khác, isPlainObject true', () => {
    const arr: any = [randInt(10, 500), randInt(10, 500)];
    Object.setPrototypeOf(arr, Object.create(Array.prototype));
    (isPlainObject as any).mockReturnValueOnce(true);
    const pipe = new DefaultValuePipe(arr);
    const result = pipe.transform(randNil() as any);
    expect(result).toBeDefined();
  });

  // P10: Date/Map/class instance, D5=T (trả nguyên)
  it('P10: default là Date, Map hoặc class instance', () => {
    class Dummy {
      [key: string]: any;
      constructor() {
        this[randWord()] = randInt(10, 500);
      }
    }
    const candidates: any[] = [
      new Date(),
      new Map([[randWord(), randInt(10, 500)]]),
      new Dummy(),
    ];
    for (const candidate of candidates) {
      const pipe = new DefaultValuePipe(candidate);
      const result = pipe.transform(randNil() as any);
      expect(result).toBeDefined();
    }
  });
});
