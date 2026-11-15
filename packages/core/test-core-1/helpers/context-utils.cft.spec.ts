import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  PARAMTYPES_METADATA,
  RESPONSE_PASSTHROUGH_METADATA,
} from '@nestjs/common/internal';
import {
  ContextUtils,
  type ParamProperties,
} from '../../helpers/context-utils.js';
import { ExecutionContextHost } from '../../helpers/execution-context-host.js';

const RANDOM_SEED = 1808;

/** One independent, reproducible LCG per test (no global random state). */
function seededIntegers(seed = RANDOM_SEED) {
  let state = seed >>> 0;
  return (min: number, max: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return min + (state % (max - min + 1));
  };
}

function makeParam(index: number, type: string): ParamProperties {
  return {
    index,
    type,
    data: 'field',
    pipes: [],
    extractValue: (value: unknown) => value,
  };
}

describe('ContextUtils CFT — packages/core/helpers/context-utils.ts', () => {
  const utils = new ContextUtils();

  describe('mapParamType', () => {
    it('T01 extracts the segment before the first colon or the whole key', () => {
      expect(utils.mapParamType('body:7')).toBe('body');
      expect(utils.mapParamType('custom:token:8')).toBe('custom');
      expect(utils.mapParamType('request')).toBe('request');
    });
  });

  describe('reflectCallbackParamtypes', () => {
    it('T02 reads the design:paramtypes metadata from the instance target', () => {
      class ControllerFixture {
        handle() {}
      }
      const instance = new ControllerFixture();
      const expected = [String, Number];
      Reflect.defineMetadata(PARAMTYPES_METADATA, expected, instance, 'handle');
      Reflect.defineMetadata(
        PARAMTYPES_METADATA,
        [Boolean],
        ControllerFixture,
        'handle',
      );

      expect(utils.reflectCallbackParamtypes(instance, 'handle')).toBe(expected);
    });

    it('T03 returns undefined if the instance has no parameter-type metadata', () => {
      class ControllerFixture {
        handle() {}
      }
      expect(
        utils.reflectCallbackParamtypes(new ControllerFixture(), 'handle'),
      ).toBeUndefined();
    });
  });

  describe('reflectCallbackMetadata', () => {
    it('T04 reads the requested metadata key from the constructor target', () => {
      class ControllerFixture {
        handle() {}
      }
      const instance = new ControllerFixture();
      const random = seededIntegers();
      const key = `cft:callback:${random(100, 999)}`;
      const expected = { policy: 'allow' };
      Reflect.defineMetadata(key, expected, ControllerFixture, 'handle');
      Reflect.defineMetadata(key, { policy: 'deny' }, instance, 'handle');

      expect(
        utils.reflectCallbackMetadata<typeof expected>(instance, 'handle', key),
      ).toBe(expected);
    });

    it('T05 returns undefined when the requested metadata key is missing', () => {
      class ControllerFixture {
        handle() {}
      }
      expect(
        utils.reflectCallbackMetadata(
          new ControllerFixture(),
          'handle',
          'cft:missing',
        ),
      ).toBeUndefined();
    });
  });

  describe('reflectPassthrough', () => {
    it('T06 distinguishes true, false and absent response passthrough metadata', () => {
      class ControllerFixture {
        handle() {}
        undecorated() {}
      }
      const instance = new ControllerFixture();
      Reflect.defineMetadata(
        RESPONSE_PASSTHROUGH_METADATA,
        true,
        ControllerFixture,
        'handle',
      );
      Reflect.defineMetadata(
        RESPONSE_PASSTHROUGH_METADATA,
        false,
        instance,
        'handle',
      );
      expect(utils.reflectPassthrough(instance, 'handle')).toBe(true);

      Reflect.defineMetadata(
        RESPONSE_PASSTHROUGH_METADATA,
        false,
        ControllerFixture,
        'handle',
      );
      expect(utils.reflectPassthrough(instance, 'handle')).toBe(false);
      expect(utils.reflectPassthrough(instance, 'undecorated')).toBeUndefined();
    });
  });

  describe('getArgumentsLength', () => {
    it('T07 takes the empty-keys branch without reading metadata', () => {
      expect(utils.getArgumentsLength([], undefined)).toBe(0);
    });

    it('T08 computes the size from one metadata index', () => {
      const index = seededIntegers()(2, 12);
      expect(
        utils.getArgumentsLength(['body'], { body: { index } }),
      ).toBe(index + 1);
    });

    it('T09 maps multiple keys and uses the largest selected index', () => {
      const random = seededIntegers();
      const low = random(2, 7);
      const high = low + random(4, 8);
      const middle = low + random(1, 3);
      const metadata = {
        low: { index: low },
        high: { index: high },
        middle: { index: middle },
        excluded: { index: high + 20 },
      };

      expect(
        utils.getArgumentsLength(['middle', 'high', 'low'], metadata),
      ).toBe(high + 1);
    });
  });

  describe('createNullArray', () => {
    it('T10 skips the loop for length zero', () => {
      expect(utils.createNullArray(0)).toStrictEqual([]);
    });

    it('T11 executes the loop exactly once for length one', () => {
      const result = utils.createNullArray(1);
      expect(result).toStrictEqual([undefined]);
      expect(Object.hasOwn(result, 0)).toBe(true);
    });

    it('T12 executes multiple iterations and creates dense undefined entries', () => {
      const length = seededIntegers()(4, 9);
      const result = utils.createNullArray(length);
      expect(result).toStrictEqual(
        Array.from({ length }, () => undefined),
      );
      expect(Object.keys(result)).toHaveLength(length);
    });
  });

  describe('mergeParamsMetatypes', () => {
    it('T13 returns the identical properties array if paramtypes is absent', () => {
      const properties = [makeParam(2, 'body')];
      // Deliberate runtime-undefined input: the source explicitly checks !paramtypes.
      const missing = undefined as unknown as unknown[];
      expect(utils.mergeParamsMetatypes(properties, missing)).toBe(properties);
    });

    it('T14 treats an empty paramtypes array as truthy and maps empty properties', () => {
      const properties: ParamProperties[] = [];
      const result = utils.mergeParamsMetatypes(properties, []);
      expect(result).toStrictEqual([]);
      expect(result).not.toBe(properties);
    });

    it('T15 maps each property by index, including a missing metatype', () => {
      const index = seededIntegers()(3, 8);
      const properties = [
        makeParam(index, 'body'),
        makeParam(1, 'query'),
        makeParam(index + 4, 'custom'),
      ];
      const types: unknown[] = Array.from(
        { length: index + 1 },
        () => undefined,
      );
      types[1] = String;
      types[index] = Number;

      const result = utils.mergeParamsMetatypes(properties, types);
      expect(result).toStrictEqual([
        { ...properties[0], metatype: Number },
        { ...properties[1], metatype: String },
        { ...properties[2], metatype: undefined },
      ]);
      expect(result[0]).not.toBe(properties[0]);
      expect(properties[0]).not.toHaveProperty('metatype');
    });
  });

  describe('getCustomFactory', () => {
    it('T16 invokes the context factory first, then a callable custom factory', () => {
      const args: unknown[] = [{ id: 'request' }, 'payload'];
      const context = new ExecutionContextHost(args);
      const contextFactory = vi.fn((_args: unknown[]) => context);
      const customFactory = vi.fn((..._received: unknown[]): void => {});
      const data = { key: 'value' };

      const wrapped = utils.getCustomFactory(customFactory, data, contextFactory);
      expect(contextFactory).not.toHaveBeenCalled();
      expect(customFactory).not.toHaveBeenCalled();

      expect(wrapped(...args)).toBeUndefined();
      expect(contextFactory).toHaveBeenCalledTimes(1);
      expect(contextFactory).toHaveBeenCalledWith(args);
      expect(customFactory).toHaveBeenCalledTimes(1);
      expect(customFactory).toHaveBeenCalledWith(data, context);
      expect(contextFactory.mock.invocationCallOrder[0]).toBeLessThan(
        customFactory.mock.invocationCallOrder[0],
      );
    });

    it('T17 returns a null-producing function for a non-callable factory', () => {
      const contextFactory = vi.fn(
        (_args: unknown[]) => new ExecutionContextHost([]),
      );
      // Runtime non-function input is necessary for the isFunction false branch.
      const nonCallable = { kind: 'data-only' } as unknown as (
        ...args: unknown[]
      ) => void;
      const wrapped = utils.getCustomFactory(
        nonCallable,
        'body',
        contextFactory,
      );

      expect(wrapped('unused', 3)).toBeNull();
      expect(contextFactory).not.toHaveBeenCalled();
    });

    it('T18 propagates a synchronous exception from the callable factory', () => {
      const failure = new Error('custom factory failure');
      const contextFactory = vi.fn(
        (_args: unknown[]) => new ExecutionContextHost([]),
      );
      const customFactory = vi.fn((..._args: unknown[]): void => {
        throw failure;
      });
      const wrapped = utils.getCustomFactory(
        customFactory,
        'body',
        contextFactory,
      );

      expect(() => wrapped('request')).toThrow(failure);
      expect(contextFactory).toHaveBeenCalledTimes(1);
      expect(customFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('getContextFactory', () => {
    it('T19 skips instance.constructor when instance and callback are omitted', () => {
      const makeContext = utils.getContextFactory('http');
      const firstArgs: unknown[] = [{ id: 'first' }, { status: 201 }];
      const secondArgs: unknown[] = [{ id: 'second' }];

      const first = makeContext(firstArgs);
      const second = makeContext(secondArgs);
      expect(first).toBeInstanceOf(ExecutionContextHost);
      expect(first.getType()).toBe('http');
      expect(first.getArgs()).toBe(firstArgs);
      // Explicit undefined constructor/handler arguments use the host's null defaults.
      expect(first.getClass()).toBeNull();
      expect(first.getHandler()).toBeNull();
      expect(second).not.toBe(first);
      expect(second.getArgs()).toBe(secondArgs);
    });

    it('T20 reads instance.constructor and supplies the callback and context type', () => {
      class ControllerFixture {
        handle() {}
      }
      const instance = new ControllerFixture();
      const callback = instance.handle;
      const makeContext = utils.getContextFactory('rpc', instance, callback);
      const args: unknown[] = ['payload', { traceId: 'trace' }];

      const context = makeContext(args);
      expect(context).toBeInstanceOf(ExecutionContextHost);
      expect(context.getType()).toBe('rpc');
      expect(context.getClass()).toBe(ControllerFixture);
      expect(context.getHandler()).toBe(callback);
      expect(context.getArgs()).toBe(args);
      expect(context.getArgByIndex(1)).toBe(args[1]);
    });
  });
});
