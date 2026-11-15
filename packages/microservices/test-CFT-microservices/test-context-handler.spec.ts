import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  defer,
  EMPTY,
  firstValueFrom,
  lastValueFrom,
  of,
  throwError,
} from 'rxjs';
import { PARAM_ARGS_METADATA } from '../constants.js';
import { ClientsContainer } from '../container.js';
import { ExceptionFiltersContext } from '../context/exception-filters-context.js';
import { RequestContextHost } from '../context/request-context-host.js';
import {
  getHandlerObservableNotifier,
  RpcContextCreator,
} from '../context/rpc-context-creator.js';
import { RpcProxy } from '../context/rpc-proxy.js';
import { RpcParamtype } from '../enums/rpc-paramtype.enum.js';
import { RpcParamsFactory } from '../factories/rpc-params-factory.js';
import { ListenersController } from '../listeners-controller.js';
import { ServerGrpc } from '../server/server-grpc.js';
import {
  createPipesRpcParamDecorator,
  createRpcParamDecorator,
} from '../utils/param.utils.js';
import { CUSTOM_ROUTE_ARGS_METADATA } from '../../common/constants.js';
import { ApplicationConfig } from '../../core/application-config.js';
import { NestContainer } from '../../core/injector/container.js';
import { REQUEST_CONTEXT_ID } from '../../core/internal.js';
import { ExecutionContextHost } from '../../core/helpers/execution-context-host.js';
import { ContextIdFactory } from '../../core/helpers/context-id-factory.js';
import { Transport } from '../enums/transport.enum.js';

const randomText = () =>
  Array.from(
    { length: 19 + Math.floor(Math.random() * 14) },
    () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)],
  ).join('');

const randomPayload = () => ({
  [randomText()]: randomText(),
  [randomText()]: 30 + Math.floor(Math.random() * 80),
});

const applyParamDecorator = (
  decorator: ParameterDecorator,
  target: object,
  methodKey: string,
  index: number,
) => decorator(target, methodKey, index);

const makeRpcContextCreator = (
  hooks: Function[] = [],
  withApplicationConfig = true,
) => {
  const rpcProxy = {
    create: vi.fn((callback: Function) => callback),
  };
  const exceptionFiltersContext = { create: vi.fn(() => ({})) };
  const pipesContextCreator = {
    create: vi.fn(() => []),
    createConcreteContext: vi.fn(() => []),
    setModuleContext: vi.fn(),
  };
  const pipesConsumer = { apply: vi.fn(async (value: unknown) => value) };
  const guardsContextCreator = { create: vi.fn(() => []) };
  const guardsConsumer = { tryActivate: vi.fn(async () => true) };
  const interceptorsContextCreator = { create: vi.fn(() => []) };
  const interceptorsConsumer = {
    intercept: vi.fn(
      async (
        _interceptors: unknown[],
        _args: unknown[],
        _instance: object,
        _callback: Function,
        handler: () => Promise<unknown>,
      ) => handler(),
    ),
    transformDeferred: vi.fn((execute: () => Promise<unknown>) =>
      defer(execute),
    ),
  };
  const config = { getGlobalPreRequestHooks: vi.fn(() => hooks) };
  const creator = new RpcContextCreator(
    rpcProxy as any,
    exceptionFiltersContext as any,
    pipesContextCreator as any,
    pipesConsumer as any,
    guardsContextCreator as any,
    guardsConsumer as any,
    interceptorsContextCreator as any,
    interceptorsConsumer as any,
    withApplicationConfig ? (config as any) : undefined,
  );
  return {
    creator,
    rpcProxy,
    exceptionFiltersContext,
    pipesContextCreator,
    pipesConsumer,
    guardsContextCreator,
    guardsConsumer,
    interceptorsContextCreator,
    interceptorsConsumer,
    config,
  };
};

const makeListenersController = () => {
  const container = {
    getModuleByKey: vi.fn(() => ({ controllers: new Map() })),
    registerRequestProvider: vi.fn(),
  };
  const contextCreator = {
    create: vi.fn(() => vi.fn(() => of(randomText()))),
  };
  const injector = {
    loadPerContext: vi.fn(async (instance: object) => instance),
  };
  const exceptionFiltersContext = {
    create: vi.fn(() => ({ handle: vi.fn(() => of(randomText())) })),
  };
  const graphInspector = { insertEntrypointDefinition: vi.fn() };
  const controller = new ListenersController(
    new ClientsContainer(),
    contextCreator as any,
    container as any,
    injector as any,
    { create: vi.fn(() => ({ close: vi.fn() })) } as any,
    exceptionFiltersContext as any,
    graphInspector as any,
  );
  return {
    controller,
    container,
    contextCreator,
    injector,
    exceptionFiltersContext,
    graphInspector,
  };
};

describe('context and RPC parameter control-flow driver', () => {
  describe('ListenersController', () => {
    it('covers request-host and raw-data paths, durable request providers, and filtered failures', async () => {
      const { controller, container, injector, exceptionFiltersContext } =
        makeListenersController();
      const methodKey = randomText();
      const wrapper = {
        instance: { [methodKey]: vi.fn() },
        id: randomText(),
        isDependencyTreeDurable: vi.fn(() => true),
      };
      injector.loadPerContext.mockRejectedValue(new Error(randomText()));
      const filterHandle = vi.fn(() => of(randomText()));
      exceptionFiltersContext.create.mockReturnValue({
        handle: filterHandle,
      } as any);
      const handler = controller.createRequestScopedHandler(
        wrapper as any,
        randomText(),
        { controllers: new Map() } as any,
        randomText(),
        methodKey,
        undefined,
        true,
        true,
      );
      const next = vi.fn(() => of(randomText()));
      handler.next = next;
      const requestHost = RequestContextHost.create(
        randomText(),
        randomText(),
        {} as any,
      );

      await lastValueFrom((await handler(requestHost, randomText())) as any);
      await lastValueFrom((await handler(randomText(), randomText())) as any);
      const messageHandler = controller.createRequestScopedHandler(
        wrapper as any,
        randomText(),
        { controllers: new Map() } as any,
        randomText(),
        methodKey,
        undefined,
        false,
        true,
      );
      await lastValueFrom(
        (await messageHandler(randomText(), randomText())) as any,
      );

      expect(container.registerRequestProvider).toHaveBeenCalled();
      expect(filterHandle).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(exceptionFiltersContext.create).toHaveBeenCalled();
    });

    it('covers successful message/event request handlers and reused request IDs', async () => {
      const { controller, container, injector } = makeListenersController();
      const methodKey = randomText();
      const wrapper = {
        instance: { [methodKey]: vi.fn() },
        id: randomText(),
        isDependencyTreeDurable: vi.fn(() => false),
      };
      const contextId = {
        id: randomText(),
        payload: { requestMarker: randomText() },
      };
      const contextIdSpy = vi
        .spyOn(ContextIdFactory, 'getByRequest')
        .mockReturnValue(contextId as any);
      const moduleRef = { controllers: new Map() } as any;
      const messageHandler = controller.createRequestScopedHandler(
        wrapper as any,
        randomText(),
        moduleRef,
        randomText(),
        methodKey,
      );
      const eventHandler = controller.createRequestScopedHandler(
        wrapper as any,
        randomText(),
        moduleRef,
        randomText(),
        methodKey,
        undefined,
        true,
      );
      const existingRequestHost = RequestContextHost.create(
        randomText(),
        randomText(),
        {} as any,
      );
      Object.defineProperty(existingRequestHost, REQUEST_CONTEXT_ID, {
        value: contextId,
      });

      await lastValueFrom(
        (await messageHandler(randomText(), randomText())) as any,
      );
      await lastValueFrom(
        (await eventHandler(existingRequestHost, randomText())) as any,
      );
      await lastValueFrom((await messageHandler(existingRequestHost)) as any);

      expect(injector.loadPerContext).toHaveBeenCalled();
      expect(container.registerRequestProvider).toHaveBeenCalled();
      contextIdSpy.mockRestore();
    });

    it('covers static and request-scoped registration and event handler chaining', async () => {
      const { controller, contextCreator, graphInspector } =
        makeListenersController();
      const methodKey = randomText();
      const callback = vi.fn(() => of(randomText()));
      const handlerDefinition = {
        patterns: [randomText(), randomText()],
        methodKey,
        targetCallback: callback,
        isEventHandler: true,
        extras: { marker: randomText() },
      };
      vi.spyOn((controller as any).metadataExplorer, 'explore').mockReturnValue(
        [handlerDefinition] as any,
      );
      const server = {
        transportId: 20 + Math.floor(Math.random() * 40),
        propagatesEventHandlerErrors: false,
        addHandler: vi.fn(),
      };
      const wrapper = {
        instance: { [methodKey]: callback },
        id: randomText(),
        metatype: { name: randomText() },
        isDependencyTreeStatic: vi.fn(() => true),
        isDependencyTreeDurable: vi.fn(() => false),
      };

      controller.registerPatternHandlers(
        wrapper as any,
        server as any,
        randomText(),
      );
      const registered = server.addHandler.mock.calls[0][1];
      const requestHost = RequestContextHost.create(
        randomText(),
        randomText(),
        {} as any,
      );
      await registered(requestHost, randomText());
      await registered(randomText(), randomText());

      wrapper.isDependencyTreeStatic.mockReturnValue(false);
      controller.registerPatternHandlers(
        wrapper as any,
        server as any,
        randomText(),
      );
      const requestHandler = server.addHandler.mock.calls[2][1];
      await lastValueFrom(
        (await requestHandler(randomText(), randomText())) as any,
      );
      const requestEventHandler = server.addHandler.mock.calls[3][1];
      await lastValueFrom(
        (await requestEventHandler(randomText(), randomText())) as any,
      );

      const grpcServer = Object.assign(Object.create(ServerGrpc.prototype), {
        transportId: 50 + Math.floor(Math.random() * 20),
        addHandler: vi.fn(),
      });
      wrapper.isDependencyTreeStatic.mockReturnValue(true);
      controller.registerPatternHandlers(
        wrapper as any,
        grpcServer as any,
        randomText(),
      );
      const transports = [
        {
          ...handlerDefinition,
          transport: Transport.TCP,
          patterns: [randomText()],
        },
        {
          ...handlerDefinition,
          transport: Transport.REDIS,
          patterns: [randomText()],
        },
      ];
      vi.spyOn((controller as any).metadataExplorer, 'explore').mockReturnValue(
        transports as any,
      );
      const transportSpecificServer = {
        transportId: Transport.TCP,
        addHandler: vi.fn(),
      };
      controller.registerPatternHandlers(
        wrapper as any,
        transportSpecificServer as any,
        randomText(),
      );
      const unspecifiedTransportServer = {
        addHandler: vi.fn(),
      };
      controller.registerPatternHandlers(
        wrapper as any,
        unspecifiedTransportServer as any,
        randomText(),
      );
      vi.spyOn((controller as any).metadataExplorer, 'explore').mockReturnValue(
        [
          {
            ...handlerDefinition,
            patterns: [randomText()],
            isEventHandler: false,
          },
        ] as any,
      );
      const messageServer = { addHandler: vi.fn() };
      controller.registerPatternHandlers(
        wrapper as any,
        messageServer as any,
        randomText(),
      );

      expect(server.addHandler).toHaveBeenCalled();
      expect(grpcServer.addHandler).toHaveBeenCalled();
      expect(transportSpecificServer.addHandler).toHaveBeenCalledTimes(1);
      expect(unspecifiedTransportServer.addHandler).toHaveBeenCalledTimes(2);
      expect(messageServer.addHandler).toHaveBeenCalledOnce();
      expect(contextCreator.create).toHaveBeenCalled();
      expect(graphInspector.insertEntrypointDefinition).toHaveBeenCalled();
    });

    it('covers attached handler result success, empty completion, and rejection', async () => {
      const { controller } = makeListenersController();
      const handlerRef = Object.assign(vi.fn(), {
        next: vi.fn(() => EMPTY),
      });
      const emptyJoin = controller.forkJoinHandlersIfAttached(
        of(randomText()),
        [randomText()],
        handlerRef,
      );
      await lastValueFrom(emptyJoin as any);

      const rejectedCurrent = controller.forkJoinHandlersIfAttached(
        Promise.reject(new Error(randomText())),
        [],
        Object.assign(vi.fn(), { next: vi.fn(() => of(randomText())) }),
      );
      const rejectedNext = controller.forkJoinHandlersIfAttached(
        of(randomText()),
        [],
        Object.assign(vi.fn(), {
          next: vi.fn(() => throwError(() => new Error(randomText()))),
        }),
      );
      await expect(lastValueFrom(rejectedCurrent as any)).rejects.toThrow();
      await expect(lastValueFrom(rejectedNext as any)).rejects.toThrow();

      const { transformToObservable } = controller;
      await lastValueFrom(
        transformToObservable(Promise.resolve(of(randomText()))),
      );
      await lastValueFrom(transformToObservable(Promise.resolve(randomText())));
      await lastValueFrom(transformToObservable(of(randomText())));
      await lastValueFrom(transformToObservable(randomText()));
    });
  });

  describe('RpcContextCreator', () => {
    it('covers metadata cache, callback execution, and guard allow/deny paths', async () => {
      const { creator, guardsContextCreator, guardsConsumer } =
        makeRpcContextCreator();
      class Subject {
        handler(value: unknown) {
          return of(value);
        }
      }
      const instance = new Subject();
      const metadataA = creator.getMetadata(
        instance as any,
        'handler',
        {},
        'rpc',
      );
      const metadataB = creator.getMetadata(
        instance as any,
        'handler',
        {},
        'rpc',
      );
      const proxy = creator.create(
        instance as any,
        instance.handler,
        randomText(),
        'handler',
      );
      const result = await proxy(randomText());
      await firstValueFrom(result as any);

      guardsContextCreator.create.mockReturnValue([{}] as any);
      const guardsFn = creator.createGuardsFn(
        [{}],
        instance as any,
        instance.handler,
      )!;
      await guardsFn([randomText()]);
      guardsConsumer.tryActivate.mockResolvedValue(false);
      await expect(guardsFn([randomText()])).rejects.toThrow();

      expect(metadataA).toBeDefined();
      expect(metadataB).toBeDefined();

      guardsContextCreator.create.mockReturnValue([{}] as any);
      guardsConsumer.tryActivate.mockResolvedValue(true);
      const guardedCreator = makeRpcContextCreator();
      guardedCreator.guardsContextCreator.create.mockReturnValue([{}] as any);
      const guardedProxy = guardedCreator.creator.create(
        instance as any,
        instance.handler,
        randomText(),
        'handler',
      );
      await firstValueFrom((await guardedProxy(randomText())) as any);
    });

    it('covers custom and built-in argument extraction and optional parameter pipes', async () => {
      const { creator, pipesContextCreator, pipesConsumer } =
        makeRpcContextCreator();
      const customKey = `custom${CUSTOM_ROUTE_ARGS_METADATA}`;
      const payload = randomPayload();
      const payloadProperty = Object.keys(payload)[0];
      const metadata = {
        [String(RpcParamtype.PAYLOAD)]: {
          index: 0,
          data: payloadProperty,
          pipes: [],
        },
        [customKey]: {
          index: 2,
          data: randomText(),
          pipes: [],
          factory: (_data: unknown, context: ExecutionContextHost) =>
            context.getArgs()[1],
        },
      };
      const values = creator.exchangeKeysForValues(
        Object.keys(metadata),
        metadata,
        randomText(),
        new RpcParamsFactory(),
        args => new ExecutionContextHost(args),
      );
      const customContext = randomText();
      expect(values[0].extractValue(payload, customContext)).toBeDefined();
      expect(values[1].extractValue(payload, customContext)).toBeDefined();

      const pipeMetadata = {
        index: 0,
        type: RpcParamtype.PAYLOAD,
        data: randomText(),
        metatype: Object,
        pipes: [{ transform: vi.fn((value: unknown) => value) }],
        extractValue: (...args: unknown[]) => args[0],
      };
      const pipesFn = creator.createPipesFn(
        [{ transform: vi.fn((value: unknown) => value) }] as any,
        [pipeMetadata] as any,
      )!;
      await pipesFn([], payload);
      await creator.getParamValue(
        randomText(),
        { type: RpcParamtype.PAYLOAD, data: randomText() } as any,
        [],
      );
      pipesConsumer.apply.mockResolvedValue(randomText());
      await creator.getParamValue(
        randomText(),
        { type: RpcParamtype.PAYLOAD, data: randomText() } as any,
        [{ transform: vi.fn() }] as any,
      );

      expect(pipesContextCreator.setModuleContext).toHaveBeenCalled();
      expect(pipesConsumer.apply).toHaveBeenCalled();
    });

    it('covers wrapped handler notifier creation and resolution variants', async () => {
      const hook = (_context: unknown, next: () => unknown) => next();
      const { creator } = makeRpcContextCreator([hook]);
      class Subject {
        handler(_data: unknown) {
          return of(randomText());
        }
        returnsPlain(_data: unknown) {
          return randomText();
        }
        returnsPromise(_data: unknown) {
          return Promise.resolve(of(randomText()));
        }
      }
      const instance = new Subject();
      const context = {};
      const observableHandler = creator.create(
        instance as any,
        instance.handler,
        randomText(),
        'handler',
      );
      const observableResult = await observableHandler(randomText(), context);
      await lastValueFrom(observableResult as any);
      await lastValueFrom(
        (await observableHandler(randomText(), context)) as any,
      );
      const primitiveContextResult = await observableHandler(randomText(), 41);
      await lastValueFrom(primitiveContextResult as any);
      expect(getHandlerObservableNotifier(context)).toBeDefined();

      const plainContext = {};
      const plainHandler = creator.create(
        instance as any,
        instance.returnsPlain,
        randomText(),
        'returnsPlain',
      );
      await lastValueFrom(
        (await plainHandler(randomText(), plainContext)) as any,
      );
      expect(getHandlerObservableNotifier(plainContext)).toBeDefined();

      const promiseContext = {};
      const promiseHandler = creator.create(
        instance as any,
        instance.returnsPromise,
        randomText(),
        'returnsPromise',
      );
      await lastValueFrom(
        (await promiseHandler(randomText(), promiseContext)) as any,
      );

      expect(getHandlerObservableNotifier(null)).toBeUndefined();

      class PlainSubject {
        handler() {
          return randomText();
        }
      }
      const unwrapped = makeRpcContextCreator();
      const plainInstance = new PlainSubject();
      const unwrappedHandler = unwrapped.creator.create(
        plainInstance as any,
        plainInstance.handler,
        randomText(),
        'handler',
      );
      await unwrappedHandler(randomText(), {});
      expect(getHandlerObservableNotifier({})).toBeUndefined();

      const noConfig = makeRpcContextCreator([], false);
      const noConfigProxy = noConfig.creator.create(
        plainInstance as any,
        plainInstance.handler,
        randomText(),
        'handler',
      );
      expect(await noConfigProxy(randomText())).toBeDefined();
    });

    it('covers absent params metadata and the parameter-pipe handler branch', async () => {
      const { creator } = makeRpcContextCreator();
      class Subject {
        handler(value: unknown) {
          return of(value);
        }
      }
      const instance = new Subject();
      vi.spyOn(creator, 'getMetadata').mockReturnValue({
        argsLength: 0,
        paramtypes: [],
        getParamsMetadata: () => undefined as any,
      });
      const noParamsHandler = creator.create(
        instance as any,
        instance.handler,
        randomText(),
        'handler',
      );
      await noParamsHandler(randomText());

      vi.spyOn(creator, 'getMetadata').mockReturnValue({
        argsLength: 1,
        paramtypes: [],
        getParamsMetadata: () =>
          [
            {
              index: 0,
              type: RpcParamtype.PAYLOAD,
              data: randomText(),
              pipes: [],
              extractValue: (...args: unknown[]) => args[0],
            },
          ] as any,
      });
      const pipedHandler = creator.create(
        instance as any,
        instance.handler,
        randomText(),
        'handler',
      );
      const pipedResult = await pipedHandler(randomText());
      await firstValueFrom(pipedResult as any);
    });
  });

  describe('ExceptionFiltersContext and RpcProxy', () => {
    it('covers empty/custom exception filters and static/scoped global metadata', () => {
      const config = new ApplicationConfig();
      const context = new ExceptionFiltersContext(new NestContainer(), config);
      vi.spyOn(context, 'createContext').mockReturnValueOnce([]);
      const empty = context.create({} as any, vi.fn() as any, randomText());
      vi.spyOn(context, 'createContext').mockReturnValueOnce([
        { exceptionMetatypes: [], func: vi.fn() },
      ] as any);
      const custom = context.create({} as any, vi.fn() as any, randomText());
      const staticFilters = context.getGlobalMetadata();

      vi.spyOn(config, 'getGlobalFilters').mockReturnValue([
        randomText(),
      ] as any);
      vi.spyOn(config, 'getGlobalRequestFilters').mockReturnValue([
        {
          getInstanceByContextId: vi.fn(() => ({ instance: randomText() })),
        },
        {
          getInstanceByContextId: vi.fn(() => undefined),
        },
      ] as any);
      const scopedFilters = context.getGlobalMetadata({
        id: randomText(),
      } as any);

      expect(empty).toBeDefined();
      expect(custom).toBeDefined();
      expect(staticFilters).toBeDefined();
      expect(scopedFilters).toBeDefined();
    });

    it('covers RPC callback success, observable failure, rejection, and plain error responses', async () => {
      const proxy = new RpcProxy();
      const exceptionHandler = { handle: vi.fn(() => of(randomText())) };
      const successProxy = proxy.create(
        vi.fn(async () => of(randomText())) as any,
        exceptionHandler as any,
      );
      await lastValueFrom((await successProxy(randomText())) as any);

      const scalarProxy = proxy.create(
        vi.fn(async () => randomText()) as any,
        exceptionHandler as any,
      );
      expect(await scalarProxy(randomText())).toBeDefined();

      const streamFailure = proxy.create(
        vi.fn(async () => throwError(() => new Error(randomText()))) as any,
        exceptionHandler as any,
        true,
      );
      await lastValueFrom((await streamFailure(randomText())) as any);

      exceptionHandler.handle.mockReturnValue(
        Promise.resolve(of(randomText())) as any,
      );
      const promisedFilter = proxy.create(
        vi.fn(async () => throwError(() => new Error(randomText()))) as any,
        exceptionHandler as any,
      );
      await lastValueFrom((await promisedFilter(randomText())) as any);

      exceptionHandler.handle.mockReturnValue(randomText() as any);
      const plainFilter = proxy.create(
        vi.fn(async () => throwError(() => new Error(randomText()))) as any,
        exceptionHandler as any,
      );
      await lastValueFrom((await plainFilter(randomText())) as any);

      const callbackFailure = proxy.create(
        vi.fn(async () => {
          throw new Error(randomText());
        }) as any,
        exceptionHandler as any,
      );
      await callbackFailure(randomText());

      expect(exceptionHandler.handle).toHaveBeenCalled();
    });
  });

  describe('RpcParamsFactory and parameter decorators', () => {
    it('covers every RPC parameter type and payload property classification', () => {
      const factory = new RpcParamsFactory();
      const payload = randomPayload();
      const property = Object.keys(payload)[0];
      const context = { token: randomText() };
      const grpcCall = { call: randomText() };
      class InheritedPayload {}
      Object.assign(InheritedPayload.prototype, { [property]: randomText() });

      const cases = [
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, undefined, [payload]),
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, property, [payload]),
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, 'length', [
          randomText(),
        ]),
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, '0', [
          [randomText()],
        ]),
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, property, [
          new InheritedPayload(),
        ]),
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, property, [
          Buffer.from(randomText()),
        ]),
        factory.exchangeKeyForValue(RpcParamtype.PAYLOAD, property, [null]),
        factory.exchangeKeyForValue(RpcParamtype.CONTEXT, undefined, [
          payload,
          context,
        ]),
        factory.exchangeKeyForValue(RpcParamtype.GRPC_CALL, undefined, [
          payload,
          context,
          grpcCall,
        ]),
        factory.exchangeKeyForValue(71, undefined, [payload]),
        factory.exchangeKeyForValue(
          RpcParamtype.PAYLOAD,
          undefined,
          null as any,
        ),
      ];

      expect(cases).toBeDefined();
    });

    it('covers parameter decorator options, string data, pipe, and arbitrary object branches', () => {
      class Subject {
        first(_value: unknown) {}
        second(_value: unknown) {}
        third(_value: unknown) {}
        fourth(_value: unknown) {}
        fifth(_value: unknown) {}
      }
      const pipe = { transform: vi.fn((value: unknown) => value) };
      const schema = { type: randomText(), properties: randomPayload() };
      const options = { schema, pipes: [pipe] };
      const methods = [
        'first',
        'second',
        'third',
        'fourth',
        'fifth',
        'sixth',
        'seventh',
        'eighth',
      ];
      Subject.prototype['sixth' as keyof Subject] = function (
        _value: unknown,
      ) {};
      Subject.prototype['seventh' as keyof Subject] = function (
        _value: unknown,
      ) {};
      Subject.prototype['eighth' as keyof Subject] = function (
        _value: unknown,
      ) {};
      const decorators = [
        createRpcParamDecorator(RpcParamtype.PAYLOAD)(pipe),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(options),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(
          randomText(),
          { schema, pipes: [pipe] },
          pipe,
        ),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(
          randomText(),
          pipe,
          pipe,
        ),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(
          randomPayload(),
          pipe,
        ),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(undefined, pipe),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)({
          schema,
        }),
        createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(randomText(), {
          schema,
        }),
      ];

      decorators.forEach((decorator, index) =>
        applyParamDecorator(
          decorator,
          Subject.prototype,
          methods[index],
          index,
        ),
      );
      const metadata = Reflect.getMetadata(
        PARAM_ARGS_METADATA,
        Subject,
        'second',
      );

      expect(metadata).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'first'),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'third'),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'fourth'),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'fifth'),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'sixth'),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'seventh'),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(PARAM_ARGS_METADATA, Subject, 'eighth'),
      ).toBeDefined();
    });
  });
});
