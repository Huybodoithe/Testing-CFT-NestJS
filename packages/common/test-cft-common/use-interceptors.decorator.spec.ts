import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock các dependency bên ngoài ----
vi.mock('../../constants.js', () => ({
  INTERCEPTORS_METADATA: '__interceptors__',
}));

// NestInterceptor chỉ là type, mock để không phải nạp toàn bộ interfaces
vi.mock('../../interfaces/index.js', () => ({}));

vi.mock('../utils/extend-metadata.util.js', () => ({
  extendArrayMetadata: vi.fn(),
}));

vi.mock('../../utils/shared.utils.js', () => ({
  isFunction: vi.fn((val: any) => typeof val === 'function'),
}));

// validateEach giả: gọi predicate cho từng phần tử để chạm các nhánh
// của isInterceptorValid, nhưng KHÔNG ném lỗi khi interceptor không hợp lệ.
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
import { UseInterceptors } from '../decorators/core/use-interceptors.decorator.js';

// ---- Bộ sinh dữ liệu ngẫu nhiên ----
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randWord = () => {
  const len = randInt(5, 12);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: len }, () => letters[randInt(0, 25)]).join('');
};

// I2: class/function interceptor ngẫu nhiên
const randClassInterceptor = (): Function => {
  const name = `Interceptor_${randWord()}`;
  return { [name]: class {} }[name];
};

// I3: object có method intercept
const randInstanceInterceptor = () => ({
  intercept: vi.fn(),
  [randWord()]: randInt(10, 500),
});

// I4: object không có intercept
const randInvalidInterceptor = () => ({
  [randWord()]: randWord(),
  [randWord()]: randInt(10, 500),
});

// I1: nhánh falsy chỉ có thể là null/undefined
const randFalsyInterceptor = () => (Math.random() < 0.5 ? undefined : null);

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
const applyOnMethod = (interceptors: any[]) => {
  const { proto, key, descriptor } = makeMethodArgs();
  return (UseInterceptors(...interceptors) as MethodDecorator)(
    proto,
    key,
    descriptor,
  );
};

// Áp decorator ở chế độ lớp (D1 = False)
const applyOnClass = (interceptors: any[]) => {
  const target = makeClassTarget();
  return (UseInterceptors(...interceptors) as ClassDecorator)(target);
};

describe('UseInterceptors decorator - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== D1 = True: có descriptor (method decorator) =====

  // P1: D1=T, D2=F (interceptor falsy)
  it('P1: method decorator, interceptor là null/undefined', () => {
    const result = applyOnMethod([randFalsyInterceptor()]);
    expect(result).toBeDefined();
    expect(validateEach).toHaveBeenCalled();
  });

  // P2: D1=T, D2=T, D3a (interceptor là class/function)
  it('P2: method decorator, interceptor là class', () => {
    const result = applyOnMethod([randClassInterceptor()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P3: D1=T, D2=T, D3b (object có intercept)
  it('P3: method decorator, interceptor là instance có intercept', () => {
    const result = applyOnMethod([randInstanceInterceptor()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P4: D1=T, D2=T, D3c (object không có intercept)
  it('P4: method decorator, interceptor là object không hợp lệ', () => {
    const result = applyOnMethod([randInvalidInterceptor()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // ===== D1 = False: không có descriptor (class decorator) =====

  // P5: D1=F, D2=F
  it('P5: class decorator, interceptor là null/undefined', () => {
    const result = applyOnClass([randFalsyInterceptor()]);
    expect(result).toBeDefined();
    expect(validateEach).toHaveBeenCalled();
  });

  // P6: D1=F, D2=T, D3a
  it('P6: class decorator, interceptor là class', () => {
    const result = applyOnClass([randClassInterceptor()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P7: D1=F, D2=T, D3b
  it('P7: class decorator, interceptor là instance có intercept', () => {
    const result = applyOnClass([randInstanceInterceptor()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });

  // P8: D1=F, D2=T, D3c
  it('P8: class decorator, interceptor là object không hợp lệ', () => {
    const result = applyOnClass([randInvalidInterceptor()]);
    expect(result).toBeDefined();
    expect(extendArrayMetadata).toHaveBeenCalled();
  });
});
