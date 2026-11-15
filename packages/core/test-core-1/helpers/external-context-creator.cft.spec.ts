import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, of, throwError } from 'rxjs';
import { ForbiddenException, type PipeTransform } from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  PARAMTYPES_METADATA,
} from '@nestjs/common/internal';
import {
  ExternalContextCreator,
  type ParamsFactory,
} from '../../helpers/external-context-creator.js';
import { ExecutionContextHost } from '../../helpers/execution-context-host.js';
import { STATIC_CONTEXT } from '../../injector/constants.js';
import type { ContextId } from '../../injector/instance-wrapper.js';
import type { Module } from '../../injector/module.js';
import type { NestContainer } from '../../injector/container.js';

// Fixed-seed LCG. Values stay well inside the positive-integer equivalence class.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 100 + (state % 800);
  };
}
const random = seeded(1808);
const sample = { first: random(), second: random(), third: random() };

function handlerFixture() {
  class Handler {
    readonly id = sample.first;
    handle(...args: unknown[]) {
      return { owner: this, args };
    }
    other(...args: unknown[]) {
      return args.length;
    }
  }
  const instance = new Handler();
  return { instance, callback: instance.handle };
}

type Wrapper = { id?: string; token?: unknown; instance?: object; isAlias?: boolean };
function moduleStub(options: {
  hasProvider?: (ctor: Function) => boolean;
  wrappers?: Wrapper[];
  entryProviders?: Wrapper[];
  byId?: (id: string) => Wrapper | undefined;
} = {}) {
  const providers = new Map<string, Wrapper>();
  (options.wrappers ?? []).forEach((wrapper, index) => {
    providers.set(`wrapper-${index}`, wrapper);
  });
  return {
    hasProvider: vi.fn(options.hasProvider ?? (() => false)),
    getProviderById: vi.fn(options.byId ?? (() => undefined)),
    providers,
    entryProviders: options.entryProviders ?? [],
  };
}

function moduleMap() {
  return new Map<string, Module>();
}

function harness(modules = moduleMap()) {
  const guardsCreator = { create: vi.fn(() => [] as object[]) };
  const guardsConsumer = { tryActivate: vi.fn(async () => true) };
  const interceptorsCreator = { create: vi.fn(() => [] as object[]) };
  // The boundary calls the supplied `next` exactly as an empty interceptor chain would.
  const interceptorsConsumer = {
    intercept: vi.fn(async (...params: unknown[]) => {
      const next = params[4] as () => Promise<unknown>;
      return next();
    }),
  };
  const pipesCreator = {
    create: vi.fn(() => [] as PipeTransform[]),
    setModuleContext: vi.fn(),
    createConcreteContext: vi.fn((items: PipeTransform[] | undefined) => items ?? []),
  };
  const pipesConsumer = { apply: vi.fn(async (value: unknown, _metadata: unknown, _pipes: PipeTransform[]) => value) };
  const filterNext = vi.fn(async () => 'filtered');
  const filtersCreator = { create: vi.fn(() => ({ next: filterNext })) };
  type Args = ConstructorParameters<typeof ExternalContextCreator>;
  const sut = new ExternalContextCreator(
    guardsCreator as unknown as Args[0],
    guardsConsumer as unknown as Args[1],
    interceptorsCreator as unknown as Args[2],
    interceptorsConsumer as unknown as Args[3],
    modules as unknown as Args[4],
    pipesCreator as unknown as Args[5],
    pipesConsumer as unknown as Args[6],
    filtersCreator as unknown as Args[7],
  );
  return {
    sut,
    modules,
    guardsCreator,
    guardsConsumer,
    interceptorsCreator,
    interceptorsConsumer,
    pipesCreator,
    pipesConsumer,
    filtersCreator,
    filterNext,
  };
}

const pipe: PipeTransform = { transform: (value: unknown) => value };
const noEnhancers = { guards: false, interceptors: false, filters: false };

afterEach(() => vi.restoreAllMocks());

describe('ExternalContextCreator.fromContainer / registerRequestProvider', () => {
  it('T01 builds from a container and forwards request registration', () => {
    const modules = moduleMap();
    const registerRequestProvider = vi.fn();
    const container = {
      applicationConfig: undefined,
      getModules: vi.fn(() => modules),
      registerRequestProvider,
    } as unknown as NestContainer;
    const sut = ExternalContextCreator.fromContainer(container);
    const contextId = { id: sample.first } as ContextId;
    const request = { requestId: sample.second };

    expect(sut).toBeInstanceOf(ExternalContextCreator);
    expect(container.getModules()).toBe(modules);
    sut.registerRequestProvider(request, contextId);
    expect(registerRequestProvider).toHaveBeenCalledExactlyOnceWith(request, contextId);
  });
});

describe('getContextModuleKey', () => {
  it('T02 returns an empty key for missing constructor and an empty container', () => {
    const h = harness();
    class NotRegistered {}
    expect(h.sut.getContextModuleKey(undefined)).toBe('');
    expect(h.sut.getContextModuleKey(NotRegistered)).toBe('');
  });

  it('T03 scans past a non-matching module and returns the first match', () => {
    class Registered {}
    const h = harness();
    const first = moduleStub();
    const second = moduleStub({ hasProvider: ctor => ctor === Registered });
    h.modules.set('one', first as unknown as Module);
    h.modules.set('two', second as unknown as Module);
    expect(h.sut.getContextModuleKey(Registered)).toBe('two');
    expect(first.hasProvider).toHaveBeenCalledWith(Registered);
    expect(second.hasProvider).toHaveBeenCalledWith(Registered);
  });

  it('T04 exhausts multiple non-matching modules', () => {
    class Missing {}
    const h = harness();
    const first = moduleStub();
    const second = moduleStub();
    h.modules.set('one', first as unknown as Module);
    h.modules.set('two', second as unknown as Module);
    expect(h.sut.getContextModuleKey(Missing)).toBe('');
    expect(first.hasProvider).toHaveBeenCalledOnce();
    expect(second.hasProvider).toHaveBeenCalledOnce();
  });
});

describe('getMetadata', () => {
  it('T05 uses empty metadata, omits param extraction, and returns a cached entry', () => {
    const { sut } = harness();
    const { instance } = handlerFixture();
    const first = sut.getMetadata(instance, 'handle');
    const second = sut.getMetadata(instance, 'handle');

    expect(first.argsLength).toBe(0);
    expect(first.paramtypes).toBeUndefined();
    expect(first.getParamsMetadata('missing')).toBeNull();
    expect(second).toBe(first);
  });

  it('T06 reads reflected metadata and builds a factory with explicit context', () => {
    const { sut, pipesCreator } = harness();
    const { instance } = handlerFixture();
    const key = `2:${sample.first}`;
    const metaKey = 'cft:route-arguments';
    Reflect.defineMetadata(
      metaKey,
      { [key]: { index: 2, data: 'payload', pipes: [pipe] } },
      instance.constructor,
      'handle',
    );
    Reflect.defineMetadata(PARAMTYPES_METADATA, [String, Boolean, Number], instance, 'handle');
    const paramsFactory: ParamsFactory = {
      exchangeKeyForValue: vi.fn(() => sample.second),
    };
    const contextId = { id: sample.third } as ContextId;

    const metadata = sut.getMetadata(instance, 'handle', metaKey, paramsFactory, 'rpc');
    const params = metadata.getParamsMetadata('module-x', contextId, 'inquirer-x');
    expect(metadata.argsLength).toBe(3);
    expect(metadata.paramtypes).toEqual([String, Boolean, Number]);
    expect(params).toHaveLength(1);
    expect(params![0]).toMatchObject({ index: 2, type: 2, data: 'payload' });
    expect(params![0].extractValue('request')).toBe(sample.second);
    expect(paramsFactory.exchangeKeyForValue).toHaveBeenCalledWith(2, 'payload', ['request']);
    expect(pipesCreator.setModuleContext).toHaveBeenCalledWith('module-x');
    expect(pipesCreator.createConcreteContext).toHaveBeenCalledWith([pipe], contextId, 'inquirer-x');
  });

  it('T07 partitions cache by method, metadata key, and context type', () => {
    const { sut } = harness();
    const { instance } = handlerFixture();
    const one = sut.getMetadata(instance, 'handle', undefined, undefined, 'http');
    const same = sut.getMetadata(instance, 'handle', '', undefined, 'http');
    const two = sut.getMetadata(instance, 'handle', 'cft:other', undefined, 'http');
    const three = sut.getMetadata(instance, 'handle', 'cft:other', undefined, 'rpc');
    const four = sut.getMetadata(instance, 'other', 'cft:other', undefined, 'http');
    expect(same).toBe(one);
    expect(two).not.toBe(one);
    expect(three).not.toBe(two);
    expect(four).not.toBe(two);
  });
});

describe('exchangeKeysForValues', () => {
  it('T08 maps zero keys to zero parameters and still selects module context', () => {
    const { sut, pipesCreator } = harness();
    const factory: ParamsFactory = { exchangeKeyForValue: vi.fn() };
    expect(sut.exchangeKeysForValues([], {}, 'empty-module', factory)).toEqual([]);
    expect(pipesCreator.setModuleContext).toHaveBeenCalledExactlyOnceWith('empty-module');
    expect(pipesCreator.createConcreteContext).not.toHaveBeenCalled();
  });

  it('T09 extracts ordinary and custom parameters, preserving pipes and explicit context', () => {
    const { sut, pipesCreator } = harness();
    const ordinary = `3:${sample.first}`;
    const custom = `${CUSTOM_ROUTE_ARGS_METADATA}:${sample.second}`;
    const contextId = { id: sample.third } as ContextId;
    const customFactory = vi.fn((data: unknown, context: ExecutionContextHost) => ({
      data,
      kind: context.getType(),
      args: context.getArgs(),
    }));
    const metadata = {
      [ordinary]: { index: 0, data: 'body', pipes: [pipe], schema: undefined },
      [custom]: { index: 1, data: 'identity', pipes: [], factory: customFactory },
    };
    const exchangeKeyForValue = vi.fn(() => sample.third);
    const factory: ParamsFactory = { exchangeKeyForValue };
    const contextFactory = (args: unknown[]) => {
      const host = new ExecutionContextHost(args);
      host.setType('rpc');
      return host;
    };
    const values = sut.exchangeKeysForValues(
      [ordinary, custom],
      metadata,
      'provider-module',
      factory,
      contextId,
      'inq',
      contextFactory,
    );

    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({ index: 0, type: 3, data: 'body', pipes: [pipe] });
    expect(values[0].extractValue('input')).toBe(sample.third);
    expect(exchangeKeyForValue).toHaveBeenCalledWith(3, 'body', ['input']);
    expect(values[1]).toMatchObject({ index: 1, type: CUSTOM_ROUTE_ARGS_METADATA, data: 'identity' });
    expect(values[1].extractValue('a', 'b')).toEqual({ data: 'identity', kind: 'rpc', args: ['a', 'b'] });
    expect(customFactory).toHaveBeenCalledOnce();
    expect(pipesCreator.createConcreteContext).toHaveBeenNthCalledWith(1, [pipe], contextId, 'inq');
    expect(pipesCreator.createConcreteContext).toHaveBeenNthCalledWith(2, [], contextId, 'inq');
  });

  it('T10 uses the default HTTP context factory for a custom parameter', () => {
    const { sut } = harness();
    const key = `${CUSTOM_ROUTE_ARGS_METADATA}:${sample.first}`;
    const factory: ParamsFactory = { exchangeKeyForValue: vi.fn() };
    const values = sut.exchangeKeysForValues(
      [key],
      { [key]: { index: 0, data: 'data', pipes: [], factory: (_: unknown, ctx: ExecutionContextHost) => ctx.getType() } },
      'module',
      factory,
    );
    expect(values[0].extractValue('request')).toBe('http');
    expect(factory.exchangeKeyForValue).not.toHaveBeenCalled();
  });
});

describe('createPipesFn / getParamValue', () => {
  it('T11 returns null for zero parameter options', () => {
    const { sut } = harness();
    expect(sut.createPipesFn([], [])).toBeNull();
  });

  it('T12 copies an extracted value directly when no pipe is present', async () => {
    const { sut, pipesConsumer } = harness();
    const extractValue = vi.fn((value: unknown) => value);
    const fn = sut.createPipesFn([], [{ index: 1, type: 2, data: 'body', pipes: [], extractValue }]);
    const args: unknown[] = [undefined, undefined];
    expect(fn).not.toBeNull();
    await fn!(args, sample.first);
    expect(extractValue).toHaveBeenCalledWith(sample.first);
    expect(args).toEqual([undefined, sample.first]);
    expect(pipesConsumer.apply).not.toHaveBeenCalled();
  });

  it('T13 processes multiple parameters and concatenates global and local pipes', async () => {
    const { sut, pipesConsumer } = harness();
    pipesConsumer.apply.mockImplementation(async (value: unknown, metadata: unknown, pipes: PipeTransform[]) => ({
      value,
      type: (metadata as { type: number }).type,
      count: pipes.length,
    }));
    const fn = sut.createPipesFn([pipe], [
      { index: 0, type: 4, data: 'one', pipes: [pipe], metatype: Number, extractValue: () => sample.first },
      { index: 1, type: 5, data: 'two', pipes: [], metatype: String, extractValue: () => sample.second },
    ]);
    const args: unknown[] = [];
    await fn!(args, 'request');
    expect(args).toEqual([
      { value: sample.first, type: 4, count: 2 },
      { value: sample.second, type: 5, count: 1 },
    ]);
    expect(pipesConsumer.apply).toHaveBeenCalledWith(sample.first, expect.objectContaining({ type: 4, metatype: Number }), [pipe, pipe]);
    expect(pipesConsumer.apply).toHaveBeenCalledWith(sample.second, expect.objectContaining({ type: 5, metatype: String }), [pipe]);
  });

  it('T14 propagates a synchronous extractor failure from the async parameters step', async () => {
    const { sut } = harness();
    const error = new Error('extractor failed');
    const fn = sut.createPipesFn([], [
      { index: 0, type: 1, data: 'arg', pipes: [], extractValue: () => { throw error; } },
    ]);
    await expect(fn!([])).rejects.toBe(error);
  });

  it('T15 propagates a rejected pipe transformation from the parameters step', async () => {
    const { sut, pipesConsumer } = harness();
    const error = new Error('pipe failed');
    pipesConsumer.apply.mockRejectedValueOnce(error);
    const fn = sut.createPipesFn([pipe], [
      { index: 0, type: 1, data: 'arg', pipes: [], extractValue: () => sample.first },
    ]);
    await expect(fn!([])).rejects.toBe(error);
  });

  it('T16 bypasses the pipe consumer for an empty pipe list', async () => {
    const { sut, pipesConsumer } = harness();
    const metadata = { type: 'payload', data: 'arg' };
    await expect(sut.getParamValue(sample.first, metadata, [])).resolves.toBe(sample.first);
    expect(pipesConsumer.apply).not.toHaveBeenCalled();
  });

  it('T17 returns the awaited pipe-consumer value for non-empty pipes', async () => {
    const { sut, pipesConsumer } = harness();
    const metadata = { type: 'body', data: 'arg' };
    pipesConsumer.apply.mockResolvedValueOnce(sample.second);
    await expect(sut.getParamValue(sample.first, metadata, [pipe])).resolves.toBe(sample.second);
    expect(pipesConsumer.apply).toHaveBeenCalledExactlyOnceWith(sample.first, metadata, [pipe]);
  });

  it('T18 rejects when the pipe consumer rejects', async () => {
    const { sut, pipesConsumer } = harness();
    const error = new Error('invalid parameter');
    pipesConsumer.apply.mockRejectedValueOnce(error);
    await expect(sut.getParamValue(sample.first, { type: 'body' }, [pipe])).rejects.toBe(error);
  });
});

describe('transformToResult', () => {
  it('T19 returns non-observable values (including a resolved promise)', async () => {
    const { sut } = harness();
    await expect(sut.transformToResult(sample.first)).resolves.toBe(sample.first);
    await expect(sut.transformToResult(Promise.resolve(sample.second))).resolves.toBe(sample.second);
  });

  it('T20 awaits the final emission of an Observable', async () => {
    const { sut } = harness();
    await expect(sut.transformToResult(of(sample.first, sample.second))).resolves.toBe(sample.second);
  });

  it('T21 propagates Observable completion without a value and Observable errors', async () => {
    const { sut } = harness();
    await expect(sut.transformToResult(EMPTY)).rejects.toThrow();
    const error = new Error('stream failed');
    await expect(sut.transformToResult(throwError(() => error))).rejects.toBe(error);
  });
});

describe('createGuardsFn', () => {
  it('T22 returns null for no guards', () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    expect(h.sut.createGuardsFn([], instance, callback)).toBeNull();
    expect(h.guardsConsumer.tryActivate).not.toHaveBeenCalled();
  });

  it('T23 calls the consumer and resolves when guards permit the request', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    const guards = [{}];
    const fn = h.sut.createGuardsFn(guards, instance, callback, 'rpc') as (args: unknown[]) => Promise<void>;
    const args = [sample.first];
    await expect(fn(args)).resolves.toBeUndefined();
    expect(h.guardsConsumer.tryActivate).toHaveBeenCalledExactlyOnceWith(guards, args, instance, callback, 'rpc');
  });

  it('T24 rejects with ForbiddenException when guards deny access', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    h.guardsConsumer.tryActivate.mockResolvedValueOnce(false);
    const fn = h.sut.createGuardsFn([{}], instance, callback) as (args: unknown[]) => Promise<void>;
    await expect(fn(['request'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('T25 propagates an asynchronous guard-consumer failure', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    const error = new Error('guard failed');
    h.guardsConsumer.tryActivate.mockRejectedValueOnce(error);
    const fn = h.sut.createGuardsFn([{}], instance, callback) as (args: unknown[]) => Promise<void>;
    await expect(fn(['request'])).rejects.toBe(error);
  });
});

describe('create: execution pipeline and option branches', () => {
  it('T26 uses default flags, no metadata, and the raw arguments path', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    const wrapped = h.sut.create(instance, callback, 'handle');
    const result = await wrapped(sample.first, sample.second);
    expect(result).toEqual({ owner: instance, args: [sample.first, sample.second] });
    expect(h.guardsCreator.create).toHaveBeenCalledWith(instance, callback, '', STATIC_CONTEXT, undefined);
    expect(h.pipesCreator.create).toHaveBeenCalledWith(instance, callback, '', STATIC_CONTEXT, undefined);
    expect(h.filtersCreator.create).toHaveBeenCalledWith(instance, callback, '', STATIC_CONTEXT, undefined);
    expect(h.interceptorsCreator.create).toHaveBeenCalledOnce();
    expect(h.interceptorsConsumer.intercept).toHaveBeenCalledWith([], [sample.first, sample.second], instance, callback, expect.any(Function), 'http');
    expect(h.guardsConsumer.tryActivate).not.toHaveBeenCalled();
    expect(h.pipesConsumer.apply).not.toHaveBeenCalled();
    expect(h.filterNext).not.toHaveBeenCalled();
  });

  it('T27 disables all optional stages, skips guard/proxy, and propagates handler errors', async () => {
    const h = harness();
    const error = new Error('callback failed');
    class Handler { handle() { throw error; } }
    const instance = new Handler();
    const wrapped = h.sut.create(instance, instance.handle, 'handle', undefined, undefined, undefined, undefined, noEnhancers);
    await expect(wrapped(sample.first)).rejects.toBe(error);
    expect(h.interceptorsCreator.create).not.toHaveBeenCalled();
    expect(h.guardsConsumer.tryActivate).not.toHaveBeenCalled();
    expect(h.filterNext).not.toHaveBeenCalled();
    // Context creators for guards and filters run even when their optional stages are disabled.
    expect(h.guardsCreator.create).toHaveBeenCalledOnce();
    expect(h.filtersCreator.create).toHaveBeenCalledOnce();
    expect(h.interceptorsConsumer.intercept).toHaveBeenCalledWith([], [sample.first], instance, instance.handle, expect.any(Function), 'http');
  });

  it('T28 performs guard approval before invoking the interceptor consumer', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    h.guardsCreator.create.mockReturnValue([{}]);
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, undefined, undefined,
      { guards: true, interceptors: false, filters: false });
    expect(await wrapped(sample.first)).toEqual({ owner: instance, args: [sample.first] });
    expect(h.guardsConsumer.tryActivate).toHaveBeenCalledOnce();
    expect(h.guardsConsumer.tryActivate.mock.invocationCallOrder[0]).toBeLessThan(
      h.interceptorsConsumer.intercept.mock.invocationCallOrder[0],
    );
    expect(h.interceptorsCreator.create).not.toHaveBeenCalled();
  });

  it('T29 stops before interceptors when a nonempty guard list denies access', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    h.guardsCreator.create.mockReturnValue([{}]);
    h.guardsConsumer.tryActivate.mockResolvedValueOnce(false);
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, undefined, undefined,
      { guards: true, interceptors: true, filters: false });
    await expect(wrapped(sample.first)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.interceptorsConsumer.intercept).not.toHaveBeenCalled();
  });

  it('T30 lets the default error proxy pass a guard error to the filter', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    h.guardsCreator.create.mockReturnValue([{}]);
    h.guardsConsumer.tryActivate.mockResolvedValueOnce(false);
    const wrapped = h.sut.create(instance, callback, 'handle');
    await expect(wrapped(sample.first)).resolves.toBe('filtered');
    expect(h.filterNext).toHaveBeenCalledOnce();
    const [error, host] = h.filterNext.mock.calls[0] as unknown as [Error, ExecutionContextHost];
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(host.getType()).toBe('http');
    expect(host.getArgs()).toEqual([sample.first]);
    expect(h.interceptorsConsumer.intercept).not.toHaveBeenCalled();
  });

  it('T31 applies an enabled interceptor context and normalizes its Observable result', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    const interceptors = [{ intercept: vi.fn() }];
    h.interceptorsCreator.create.mockReturnValue(interceptors);
    h.interceptorsConsumer.intercept.mockImplementation(async () => of(sample.first, sample.third));
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, undefined, undefined,
      { guards: false, interceptors: true, filters: false }, 'rpc');
    await expect(wrapped(sample.second)).resolves.toBe(sample.third);
    expect(h.interceptorsConsumer.intercept).toHaveBeenCalledWith(interceptors, [sample.second], instance, callback, expect.any(Function), 'rpc');
    expect(h.guardsConsumer.tryActivate).not.toHaveBeenCalled();
  });

  it('T32 reflects a numeric parameter and calls the handler with piped positional arguments', async () => {
    const { instance, callback } = handlerFixture();
    const modules = moduleMap();
    const ref = moduleStub({
      hasProvider: ctor => ctor === instance.constructor,
      entryProviders: [{ id: 'entry-token', token: instance.constructor, instance: {} }],
    });
    modules.set('class-module', ref as unknown as Module);
    const h = harness(modules);
    const key = `1:${sample.first}`;
    const metadataKey = 'cft:parameter-metadata';
    Reflect.defineMetadata(metadataKey, { [key]: { index: 1, data: 'field', pipes: [] } }, instance.constructor, 'handle');
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Object, Number], instance, 'handle');
    const exchangeKeyForValue = vi.fn(() => sample.first);
    h.pipesCreator.create.mockReturnValue([pipe]);
    h.pipesConsumer.apply.mockResolvedValueOnce(sample.second);
    const wrapped = h.sut.create(instance, callback, 'handle', metadataKey, { exchangeKeyForValue },
      undefined, undefined, noEnhancers);
    const result = await wrapped({ input: sample.third });
    expect(result).toEqual({ owner: instance, args: [undefined, sample.second] });
    expect(exchangeKeyForValue).toHaveBeenCalledWith(1, 'field', [{ input: sample.third }]);
    expect(h.pipesConsumer.apply).toHaveBeenCalledWith(sample.first,
      expect.objectContaining({ type: 1, data: 'field', metatype: Number }), [pipe]);
    expect(h.pipesCreator.create).toHaveBeenCalledWith(instance, callback, 'class-module', STATIC_CONTEXT, 'entry-token');
    expect(h.guardsCreator.create).toHaveBeenCalledWith(instance, callback, 'class-module', STATIC_CONTEXT, 'entry-token');
  });

  it('T33 finds an entry-provider inquirer by instance when its token differs', async () => {
    const { instance, callback } = handlerFixture();
    const modules = moduleMap();
    const ref = moduleStub({
      hasProvider: ctor => ctor === instance.constructor,
      entryProviders: [
        { id: 'non-match', token: Object, instance: {} },
        { id: 'instance-match', token: Object, instance },
      ],
    });
    modules.set('entry-module', ref as unknown as Module);
    const h = harness(modules);
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, undefined, undefined, noEnhancers);
    await expect(wrapped(sample.first)).resolves.toEqual({ owner: instance, args: [sample.first] });
    expect(h.pipesCreator.create).toHaveBeenCalledWith(instance, callback, 'entry-module', STATIC_CONTEXT, 'instance-match');
  });

  it('T34 falls back to the host module, ignoring aliases and unrelated instances', async () => {
    const { instance, callback } = handlerFixture();
    const modules = moduleMap();
    const unmatched = moduleStub({ wrappers: [
      { instance, isAlias: true },
      { instance: {}, isAlias: false },
    ] });
    const matched = moduleStub({ wrappers: [{ instance, isAlias: false }] });
    modules.set('unmatched', unmatched as unknown as Module);
    modules.set('host-module', matched as unknown as Module);
    const h = harness(modules);
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, undefined, undefined, noEnhancers);
    await expect(wrapped(sample.first)).resolves.toEqual({ owner: instance, args: [sample.first] });
    expect(h.pipesCreator.create).toHaveBeenCalledWith(instance, callback, 'host-module', STATIC_CONTEXT, undefined);
    expect(unmatched.getProviderById).not.toHaveBeenCalled();
    expect(matched.getProviderById).not.toHaveBeenCalled();
  });

  it('T35 uses an explicit inquirer to locate the host provider and preserves the context id', async () => {
    const { instance, callback } = handlerFixture();
    const modules = moduleMap();
    const first = moduleStub({ byId: () => undefined });
    const second = moduleStub({ byId: id => id === 'explicit-inquirer' ? { id } : undefined });
    modules.set('first', first as unknown as Module);
    modules.set('host-by-id', second as unknown as Module);
    const h = harness(modules);
    const contextId = { id: sample.third } as ContextId;
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, contextId,
      'explicit-inquirer', noEnhancers);
    await expect(wrapped(sample.second)).resolves.toEqual({ owner: instance, args: [sample.second] });
    expect(first.getProviderById).toHaveBeenCalledWith('explicit-inquirer');
    expect(second.getProviderById).toHaveBeenCalledWith('explicit-inquirer');
    expect(h.pipesCreator.create).toHaveBeenCalledWith(instance, callback, 'host-by-id', contextId, 'explicit-inquirer');
  });

  it('T36 uses an empty module key if neither class nor host can be located', async () => {
    const { instance, callback } = handlerFixture();
    const modules = moduleMap();
    const missing = moduleStub({ wrappers: [{ instance: {}, isAlias: false }] });
    modules.set('unrelated', missing as unknown as Module);
    const h = harness(modules);
    const wrapped = h.sut.create(instance, callback, 'handle', undefined, undefined, undefined, undefined, noEnhancers);
    await expect(wrapped(sample.third)).resolves.toEqual({ owner: instance, args: [sample.third] });
    expect(h.pipesCreator.create).toHaveBeenCalledWith(instance, callback, '', STATIC_CONTEXT, undefined);
    expect(missing.hasProvider).toHaveBeenCalledWith(instance.constructor);
  });
  it('T37 forwards an asynchronous interceptor failure to the enabled error filter', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    const error = new Error('interceptor failed');
    h.interceptorsConsumer.intercept.mockRejectedValueOnce(error);
    const wrapped = h.sut.create(instance, callback, 'handle');
    await expect(wrapped(sample.second)).resolves.toBe('filtered');
    expect(h.filterNext).toHaveBeenCalledOnce();
    const [received] = h.filterNext.mock.calls[0] as unknown as [Error, ExecutionContextHost];
    expect(received).toBe(error);
  });

  it('T38 evaluates custom reflected parameters through create with the requested context type', async () => {
    const h = harness();
    const { instance, callback } = handlerFixture();
    const metaKey = 'cft:custom-parameter';
    const key = `${CUSTOM_ROUTE_ARGS_METADATA}:${sample.third}`;
    const customFactory = vi.fn((_data: unknown, ctx: ExecutionContextHost) => ctx.getType());
    Reflect.defineMetadata(metaKey,
      { [key]: { index: 0, data: 'identity', pipes: [], factory: customFactory } },
      instance.constructor, 'handle');
    const factory: ParamsFactory = { exchangeKeyForValue: vi.fn() };
    const wrapped = h.sut.create(instance, callback, 'handle', metaKey, factory,
      undefined, undefined, noEnhancers, 'rpc');
    await expect(wrapped(sample.first)).resolves.toEqual({ owner: instance, args: ['rpc'] });
    expect(customFactory).toHaveBeenCalledOnce();
    expect(factory.exchangeKeyForValue).not.toHaveBeenCalled();
  });
});
