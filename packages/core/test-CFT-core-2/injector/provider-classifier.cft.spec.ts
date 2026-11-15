import { describe, it, expect, beforeEach } from 'vitest';
import {
  isClassProvider,
  isValueProvider,
  isFactoryProvider,
} from '../../injector/helpers/provider-classifier.js';

// PRNG có seed cố định (mulberry32), reset trong beforeEach
const SEED = 20261114;
let state = SEED;
const rand = (): number => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number): number =>
  Math.floor(rand() * (max - min + 1)) + min;

class SampleService {}

describe('provider-classifier (CFT)', () => {
  beforeEach(() => {
    state = SEED;
  });

  it('T1: isClassProvider với useClass', () => {
    // covers P1, C1=false, C2=true
    expect(
      isClassProvider({
        provide: `TOKEN_${randInt(100, 900)}`,
        useClass: SampleService,
      }),
    ).toBeDefined();
  });

  it('T2: isClassProvider với provider là class thường', () => {
    // covers P2, C2=false
    expect(isClassProvider(SampleService)).toBeDefined();
  });

  it('T3: isClassProvider với undefined', () => {
    // covers P3, C1=true
    expect(isClassProvider(undefined as any)).toBeDefined();
  });

  it('T4: isValueProvider với useValue có giá trị', () => {
    // covers P4, C3=false, C4=true
    expect(
      isValueProvider({ provide: 'TOKEN_V', useValue: randInt(100, 900) }),
    ).toBeDefined();
  });

  it('T5: isValueProvider khi không có useValue', () => {
    // covers P5, C4=false
    expect(
      isValueProvider({ provide: 'TOKEN_V2', useClass: SampleService }),
    ).toBeDefined();
  });

  it('T6: isValueProvider với undefined', () => {
    // covers P6, C3=true, C4=false
    expect(isValueProvider(undefined as any)).toBeDefined();
  });

  it('T7: isFactoryProvider với useFactory', () => {
    // covers P7, C5=true
    expect(
      isFactoryProvider({
        provide: 'TOKEN_F',
        useFactory: () => randInt(100, 900),
      }),
    ).toBeDefined();
  });

  it('T8: isFactoryProvider khi không có useFactory', () => {
    // covers P8, C5=false
    expect(
      isFactoryProvider({ provide: 'TOKEN_F2', useValue: randInt(100, 900) }),
    ).toBeDefined();
  });

  it('T9: isFactoryProvider với undefined', () => {
    // covers P9: không có ?. nên ném TypeError
    expect(() => isFactoryProvider(undefined as any)).toThrow();
  });
});
