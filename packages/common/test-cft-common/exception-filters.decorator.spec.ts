import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock các dependency bên ngoài ----
vi.mock('../../constants.js', () => ({
  EXCEPTION_FILTERS_METADATA: '__exceptionFilters__',
}));

// ExceptionFilter chỉ là type, mock để không phải nạp toàn bộ index
vi.mock('../../index.js', () => ({}));

vi.mock('../utils/extend-metadata.util.js', () => ({
  extendArrayMetadata: vi.fn(),
}));

vi.mock('../../utils/shared.utils.js', () => ({
  isFunction: vi.fn((val: any) => typeof val === 'function'),
}));

// validateEach giả: gọi predicate cho từng phần tử để chạm vào các nhánh
// của isFilterValid, nhưng KHÔNG ném lỗi khi filter không hợp lệ.
vi.mock('../utils/validate-each.util.js', () => ({
  validateEach: vi.fn(
    (
      _context: any,
      arr: any[],
      predicate: (item: any) => boolean,
      _decorator: string,
      _item: string,
    ) => {
      arr.forEach(item => predicate(item));
      return true;
    },
  ),
}));

import { extendArrayMetadata } from '../utils/extend-metadata.util.js';
import { validateEach } from '../utils/validate-each.util.js';
import { UseFilters } from '../decorators/core/exception-filters.decorator.js';

// ---- Bộ sinh dữ liệu ngẫu nhiên ----
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randWord = () => {
  const len = randInt(5, 12);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: len }, () => letters[randInt(0, 25)]).join('');
};

// F2: class/function filter ngẫu nhiên
const randClassFilter = (): Function => {
  const name = `Filter_${randWord()}`;
  return { [name]: class {} }[name];
};

// F3: object có method catch
const randInstanceFilter = () => ({
  catch: vi.fn(),
  [randWord()]: randInt(10, 500),
});

// F4: object không có catch
const randInvalidFilter = () => ({
  [randWord()]: randWord(),
  [randWord()]: randInt(10, 500),
});

// F1: nhánh falsy chỉ có thể là null/undefined
const randFalsyFilter = () => (Math.random() < 0.5 ? undefined : null);

// ---- Dựng target / descriptor ngẫu nhiên ----
const makeClassTarget = () => {
  class TargetController {}
  return TargetController as any;
};

const makeMethodArgs = () => {
  class TargetController {}
  const proto = TargetController.prototype as any;
  const key = randWord();
  const descriptor: TypedPropertyDescriptor<any> = {
    value: function () {
      return randInt(10, 500);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  };
  return { proto, key, descriptor };
};

// Áp decorator ở chế độ phương thức (D1 = True)
const applyOnMethod = (filters: any[]) => {
  const { proto, key, descriptor } = makeMethodArgs();
  return (UseFilters(...filters) as MethodDecorator)(proto, key, descriptor);
};

// Áp decorator ở chế độ lớp (D1 = False)
const applyOnClass = (filters: any[]) => {
  const target = makeClassTarget();
  return (UseFilters(...filters) as ClassDecorator)(target);
};

describe('UseFilters decorator - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== D1 = True: có descriptor (method decorator) =====

  // P1: D1=T, D2=F (filter falsy)
  it('P1: method decorator, filter là null/undefined', () => {
    const result = applyOnMethod([randFalsyFilter()]);
    expect(result).toBeDefined();
    expect(validateEach).toHaveBeenCalled();
  });

  // P2: D1=T, D2=T, D3a (filter là class/function)
  it('P2: method decorator, filter là class', () => {
    const result = applyOnMethod([randClassFilter()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P3: D1=T, D2=T, D3b (object có catch)
  it('P3: method decorator, filter là instance có catch', () => {
    const result = applyOnMethod([randInstanceFilter()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P4: D1=T, D2=T, D3c (object không có catch)
  it('P4: method decorator, filter là object không hợp lệ', () => {
    const result = applyOnMethod([randInvalidFilter()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // ===== D1 = False: không có descriptor (class decorator) =====

  // P5: D1=F, D2=F
  it('P5: class decorator, filter là null/undefined', () => {
    const result = applyOnClass([randFalsyFilter()]);
    expect(result).toBeDefined();
    expect(validateEach).toHaveBeenCalled();
  });

  // P6: D1=F, D2=T, D3a
  it('P6: class decorator, filter là class', () => {
    const result = applyOnClass([randClassFilter()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P7: D1=F, D2=T, D3b
  it('P7: class decorator, filter là instance có catch', () => {
    const result = applyOnClass([randInstanceFilter()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P8: D1=F, D2=T, D3c
  it('P8: class decorator, filter là object không hợp lệ', () => {
    const result = applyOnClass([randInvalidFilter()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });
});
