import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller } from '../decorators/core/controller.decorator.js';

// ---- Mock dependency bên ngoài: file constants ----
vi.mock('../../constants.js', () => ({
  CONTROLLER_WATERMARK: '__controller__',
  HOST_METADATA: 'host',
  PATH_METADATA: 'path',
  SCOPE_OPTIONS_METADATA: 'scope:options',
  VERSION_METADATA: '__version__',
}));

// ---- Bộ sinh dữ liệu ngẫu nhiên (nằm sâu trong lớp tương đương) ----
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randWord = () => {
  const len = randInt(5, 12);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: len }, () => letters[randInt(0, 25)]).join('');
};

const randPath = () => `/${randWord()}/${randWord()}`;
const randPathArray = () =>
  Array.from({ length: randInt(2, 4) }, () => randPath());
const randVersion = () => String(randInt(3, 80));
// Mảng version có phần tử trùng lặp để chạm vào new Set(...)
const randVersionArray = () => {
  const a = randVersion();
  const b = randVersion();
  return [a, b, a];
};
const randScope = () => randInt(1, 3) as any;
const randBool = () => Math.random() < 0.5;

describe('Controller decorator - Control Flow Testing', () => {
  let defineMetadataMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock Reflect.defineMetadata (thường do reflect-metadata cung cấp)
    defineMetadataMock = vi.fn();
    (Reflect as any).defineMetadata = defineMetadataMock;
  });

  const applyDecorator = (decorator: ClassDecorator) => {
    class TargetController {}
    decorator(TargetController);
    return TargetController;
  };

  // P1: D1 = True (không có tham số)
  it('P1: không truyền tham số', () => {
    const decorator = Controller();
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
    expect(defineMetadataMock).toBeDefined();
  });

  // P2: D1 = False, D2 = True (isString = true)
  it('P2: tham số là một string prefix', () => {
    const decorator = Controller(randPath());
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
  });

  // P3: D1 = False, D2 = True (isString = false, Array.isArray = true)
  it('P3: tham số là một mảng string prefix', () => {
    const decorator = Controller(randPathArray());
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
  });

  // P4: D2 = False, D3 = True, D4 = True
  it('P4: options có path và version là mảng', () => {
    const decorator = Controller({
      path: randPath(),
      host: `${randWord()}.com`,
      scope: randScope(),
      durable: randBool(),
      version: randVersionArray(),
    });
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
  });

  // P5: D2 = False, D3 = True, D4 = False
  it('P5: options có path và version không phải mảng', () => {
    const decorator = Controller({
      path: randPath(),
      host: `${randWord()}.org`,
      scope: randScope(),
      durable: randBool(),
      version: randVersion(),
    });
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
  });

  // P6: D2 = False, D3 = False, D4 = True
  it('P6: options không có path và version là mảng', () => {
    const decorator = Controller({
      host: `${randWord()}.net`,
      scope: randScope(),
      durable: randBool(),
      version: randVersionArray(),
    });
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
  });

  // P7: D2 = False, D3 = False, D4 = False
  it('P7: options không có path và version không phải mảng', () => {
    const decorator = Controller({
      host: `${randWord()}.io`,
      scope: randScope(),
      durable: randBool(),
      version: randVersion(),
    });
    expect(decorator).toBeDefined();

    const target = applyDecorator(decorator);
    expect(target).toBeDefined();
  });
});
