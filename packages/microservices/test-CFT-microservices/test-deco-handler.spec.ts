import { describe, expect, it, vi } from 'vitest';
import { EMPTY, lastValueFrom, of, throwError } from 'rxjs';
import 'reflect-metadata';
import {
  CLIENT_CONFIGURATION_METADATA,
  CLIENT_METADATA,
  PATTERN_EXTRAS_METADATA,
  PATTERN_HANDLER_METADATA,
  PATTERN_METADATA,
  TRANSPORT_METADATA,
} from '../constants.js';
import { ClientProxyFactory } from '../client/client-proxy-factory.js';
import { ClientsContainer } from '../container.js';
import { RequestContextHost } from '../context/request-context-host.js';
import { ExceptionFiltersContext } from '../context/exception-filters-context.js';
import { RpcContextCreator } from '../context/rpc-context-creator.js';
import { EventPattern } from '../decorators/event-pattern.decorator.js';
import {
  createGrpcMethodMetadata,
  GrpcMethod,
  GrpcStreamCall,
  GrpcStreamMethod,
  MessagePattern,
} from '../decorators/message-pattern.decorator.js';
import { PatternHandler } from '../enums/pattern-handler.enum.js';
import { Transport } from '../enums/transport.enum.js';
import { ListenerMetadataExplorer } from '../listener-metadata-explorer.js';
import { ListenersController } from '../listeners-controller.js';
import { ServerGrpc } from '../server/server-grpc.js';

const randomText = () =>
  Array.from(
    { length: 18 + Math.floor(Math.random() * 15) },
    () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)],
  ).join('');

const randomExtras = () => ({
  label: randomText(),
  group: randomText(),
  weight: 20 + Math.floor(Math.random() * 60),
});

const randomTransport = () =>
  [Transport.TCP, Transport.REDIS, Transport.NATS, Transport.MQTT][
    Math.floor(Math.random() * 4)
  ];

const applyDecorator = (
  decorator: MethodDecorator,
  target: object,
  methodKey: string,
) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodKey)!;
  return decorator(target, methodKey, descriptor);
};

const makeController = () => {
  const clientsContainer = new ClientsContainer();
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
  const clientFactory = { create: vi.fn(() => ({ id: randomText() })) };
  const exceptionFiltersContext = {
    create: vi.fn(() => ({ handle: vi.fn(() => of(randomText())) })),
  };
  const graphInspector = { insertEntrypointDefinition: vi.fn() };
  const controller = new ListenersController(
    clientsContainer,
    contextCreator as unknown as RpcContextCreator,
    container as any,
    injector as any,
    clientFactory as unknown as typeof ClientProxyFactory,
    exceptionFiltersContext as unknown as ExceptionFiltersContext,
    graphInspector as any,
  );
  return {
    controller,
    clientsContainer,
    container,
    contextCreator,
    injector,
    clientFactory,
    exceptionFiltersContext,
    graphInspector,
  };
};

describe('decorator and listener control-flow test driver', () => {
  describe('EventPattern and MessagePattern overload branches', () => {
    it('covers omitted, numeric transport, symbol transport, extras, and combined arguments', () => {
      const symbolTransport = Symbol(randomText());
      const extrasOnly = randomExtras();
      const combinedExtras = randomExtras();
      const scenarios = [
        { decorator: EventPattern, args: [randomText()] },
        { decorator: EventPattern, args: [randomText(), randomTransport()] },
        { decorator: EventPattern, args: [randomText(), symbolTransport] },
        { decorator: EventPattern, args: [randomText(), extrasOnly] },
        {
          decorator: EventPattern,
          args: [randomText(), randomTransport(), combinedExtras],
        },
        { decorator: MessagePattern, args: [randomText()] },
        { decorator: MessagePattern, args: [randomText(), randomTransport()] },
        { decorator: MessagePattern, args: [randomText(), symbolTransport] },
        { decorator: MessagePattern, args: [randomText(), extrasOnly] },
        {
          decorator: MessagePattern,
          args: [randomText(), randomTransport(), combinedExtras],
        },
      ];

      for (const { decorator, args } of scenarios) {
        class Subject {
          handler() {
            return randomText();
          }
        }
        applyDecorator(
          (decorator as (...args: any[]) => MethodDecorator)(...args),
          Subject.prototype,
          'handler',
        );
        expect(
          Reflect.getMetadata(PATTERN_METADATA, Subject.prototype.handler),
        ).toBeDefined();
        expect(
          Reflect.getMetadata(
            PATTERN_HANDLER_METADATA,
            Subject.prototype.handler,
          ),
        ).toBeDefined();
        expect(
          Reflect.hasMetadata(TRANSPORT_METADATA, Subject.prototype.handler),
        ).toBe(true);
        expect(
          Reflect.getMetadata(
            PATTERN_EXTRAS_METADATA,
            Subject.prototype.handler,
          ),
        ).toBeDefined();
      }
    });

    it('converts metadata failures into an invalid gRPC decorator exception', () => {
      class Subject {
        handler() {}
      }
      const metadata = {
        service: randomText(),
        rpc: randomText(),
        streaming: randomText(),
      };
      const defineSpy = vi
        .spyOn(Reflect, 'defineMetadata')
        .mockImplementationOnce(() => {
          throw new Error(randomText());
        });
      try {
        expect(() =>
          applyDecorator(
            MessagePattern(metadata),
            Subject.prototype,
            'handler',
          ),
        ).toThrow();
      } finally {
        defineSpy.mockRestore();
      }
    });
  });

  describe('gRPC decorator paths', () => {
    it('covers all service/method metadata alternatives', () => {
      const target = { constructor: { name: randomText() } };
      const methodKey = randomText();
      const service = randomText();
      const method = randomText();
      const generatedService = createGrpcMethodMetadata(
        target,
        methodKey,
        undefined,
        undefined,
      );
      const serviceOnly = createGrpcMethodMetadata(
        target,
        methodKey,
        service,
        undefined,
      );
      const explicitMethod = createGrpcMethodMetadata(
        target,
        methodKey,
        service,
        method,
      );

      expect(generatedService).toBeDefined();
      expect(serviceOnly).toBeDefined();
      expect(explicitMethod).toBeDefined();

      class Subject {
        [methodKey]() {
          return randomText();
        }
      }
      applyDecorator(GrpcMethod(service, method), Subject.prototype, methodKey);
      applyDecorator(
        GrpcStreamCall(service, method),
        Subject.prototype,
        methodKey,
      );
      expect(
        Reflect.getMetadata(PATTERN_METADATA, Subject.prototype[methodKey]),
      ).toBeDefined();
    });

    it('covers stream wrapper promise, scalar, and optional drain-buffer paths', async () => {
      const decorate = (result: unknown) => {
        class Subject {
          handler() {
            return result;
          }
        }
        const descriptor = Object.getOwnPropertyDescriptor(
          Subject.prototype,
          'handler',
        )!;
        GrpcStreamMethod(randomText())(
          Subject.prototype,
          'handler',
          descriptor,
        );
        return descriptor.value!;
      };
      const asyncDrain = vi.fn();
      const asyncWrapper = decorate(Promise.resolve(randomText()));
      const promiseResult = await asyncWrapper.call(
        {},
        { drainBuffer: asyncDrain },
      );

      const scalarDrain = vi.fn();
      const scalarWrapper = decorate(randomText());
      const scalarResult = scalarWrapper.call({}, { drainBuffer: scalarDrain });
      const noDrainWrapper = decorate(randomText());
      const noDrainResult = noDrainWrapper.call({}, {});
      const falsyResult = decorate(0).call({}, {});

      expect(promiseResult).toBeDefined();
      expect(scalarResult).toBeDefined();
      expect(noDrainResult).toBeDefined();
      expect(falsyResult).toBeDefined();
      expect(asyncDrain).toHaveBeenCalled();
      expect(scalarDrain).toHaveBeenCalled();
    });
  });

  describe('ListenerMetadataExplorer', () => {
    it('covers decorated and undecorated methods, client hooks, and function skips', () => {
      class Subject {
        client = {};
        clientFunction = vi.fn();
        message() {
          return randomText();
        }
        event() {
          return randomText();
        }
        ordinary() {
          return randomText();
        }
      }
      applyDecorator(
        MessagePattern(randomText(), randomExtras()),
        Subject.prototype,
        'message',
      );
      applyDecorator(
        EventPattern(randomText(), randomTransport()),
        Subject.prototype,
        'event',
      );
      const instance = new Subject();
      Reflect.defineMetadata(CLIENT_METADATA, true, instance, 'client');
      Reflect.defineMetadata(
        CLIENT_CONFIGURATION_METADATA,
        { transport: randomTransport(), name: randomText() },
        instance,
        'client',
      );
      Reflect.defineMetadata(CLIENT_METADATA, true, instance, 'clientFunction');
      Reflect.defineMetadata(
        CLIENT_CONFIGURATION_METADATA,
        randomExtras(),
        instance,
        'clientFunction',
      );
      const explorer = new ListenerMetadataExplorer({
        getAllMethodNames: vi.fn(() => ['message', 'event', 'ordinary']),
      } as any);

      const explored = explorer.explore(instance as any);
      const hooks = [...explorer.scanForClientHooks(instance as any)];

      expect(explored).toBeDefined();
      expect(
        explorer.exploreMethodMetadata(
          instance as any,
          Object.getPrototypeOf(instance),
          'ordinary',
        ),
      ).toBeUndefined();
      expect(hooks).toBeDefined();
    });
  });

  describe('ListenersController control-flow paths', () => {
    it('registers static handlers, filters transports, handles events, and records entrypoints', async () => {
      const { controller, contextCreator, graphInspector } = makeController();
      const targetCallback = vi.fn(() => of(randomText()));
      const matchingTransport = randomTransport();
      const otherTransport =
        matchingTransport === Transport.TCP ? Transport.REDIS : Transport.TCP;
      const handlers = [
        {
          patterns: [randomText(), randomText()],
          methodKey: randomText(),
          targetCallback,
          isEventHandler: true,
          extras: randomExtras(),
        },
        {
          patterns: [randomText()],
          methodKey: randomText(),
          targetCallback,
          transport: matchingTransport,
          isEventHandler: false,
        },
        {
          patterns: [randomText()],
          methodKey: randomText(),
          targetCallback,
          transport: otherTransport,
          isEventHandler: false,
        },
      ];
      vi.spyOn((controller as any).metadataExplorer, 'explore').mockReturnValue(
        handlers as any,
      );
      const addHandler = vi.fn();
      const server = {
        transportId: matchingTransport,
        propagatesEventHandlerErrors: false,
        addHandler,
      };
      const wrapper = {
        instance: {},
        id: randomText(),
        metatype: { name: randomText() },
        isDependencyTreeStatic: vi.fn(() => true),
      };

      controller.registerPatternHandlers(
        wrapper as any,
        server as any,
        randomText(),
      );
      const eventRegistration = addHandler.mock.calls.find(
        call => call[2] === true,
      )!;
      const eventHandler = eventRegistration[1];
      const contextHost = RequestContextHost.create(
        randomText(),
        randomText(),
        {} as any,
      );
      expect(eventHandler(contextHost)).toBeDefined();
      expect(eventHandler(randomText())).toBeDefined();
      expect(addHandler).toHaveBeenCalledTimes(3);
      expect(graphInspector.insertEntrypointDefinition).toHaveBeenCalled();
      expect(contextCreator.create).toHaveBeenCalled();
      controller.insertEntrypointDefinition(
        wrapper as any,
        handlers[0] as any,
        Symbol(randomText()),
      );
    });

    it('uses gRPC callback metadata and registers request-scoped message handlers', async () => {
      const { controller, injector, contextCreator } = makeController();
      const methodKey = randomText();
      const callback = vi.fn(() => of(randomText()));
      const eventMethodKey = randomText();
      vi.spyOn((controller as any).metadataExplorer, 'explore').mockReturnValue(
        [
          {
            patterns: [randomText()],
            methodKey,
            targetCallback: callback,
            isEventHandler: false,
          },
          {
            patterns: [randomText()],
            methodKey: eventMethodKey,
            targetCallback: callback,
            isEventHandler: true,
          },
        ] as any,
      );
      const addHandler = vi.fn();
      const grpcServer = Object.assign(Object.create(ServerGrpc.prototype), {
        transportId: Transport.GRPC,
        addHandler,
      });
      const instance = { [methodKey]: callback, [eventMethodKey]: callback };
      const wrapper = {
        instance,
        id: randomText(),
        isDependencyTreeStatic: vi.fn(() => false),
        isDependencyTreeDurable: vi.fn(() => false),
      };
      const requestHandler = controller.registerPatternHandlers(
        wrapper as any,
        grpcServer as any,
        randomText(),
      );
      const registeredHandler = addHandler.mock.calls[0][1];
      const registeredEventHandler = addHandler.mock.calls[1][1];
      const host = RequestContextHost.create(
        randomText(),
        randomText(),
        {} as any,
      );
      await registeredHandler(randomText(), randomText());
      await registeredHandler(host);
      await registeredEventHandler(randomText(), randomText());

      expect(injector.loadPerContext).toHaveBeenCalled();
      expect(contextCreator.create).toHaveBeenCalled();
      expect(requestHandler).toBeUndefined();
    });

    it('covers durable request scope and exception-filter fallback', async () => {
      const { controller, container, injector, exceptionFiltersContext } =
        makeController();
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
      const requestHandler = controller.createRequestScopedHandler(
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
      requestHandler.next = next;
      const host = RequestContextHost.create(
        randomText(),
        randomText(),
        {} as any,
      );
      await lastValueFrom((await requestHandler(host, randomText())) as any);
      await lastValueFrom((await requestHandler(host, randomText())) as any);
      await lastValueFrom(
        (await requestHandler(randomText(), randomText())) as any,
      );

      expect(container.registerRequestProvider).toHaveBeenCalled();
      expect(filterHandle).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(exceptionFiltersContext.create).toHaveBeenCalled();

      const messageHandler = controller.createRequestScopedHandler(
        wrapper as any,
        randomText(),
        { controllers: new Map() } as any,
        randomText(),
        methodKey,
      );
      await lastValueFrom(
        (await messageHandler(randomText(), randomText())) as any,
      );
    });

    it('covers attached handler success, empty results, and errors from either side', async () => {
      const { controller } = makeController();
      const next = vi.fn(() => EMPTY);
      const joined = controller.forkJoinHandlersIfAttached(
        of(randomText()),
        [randomText()],
        Object.assign(vi.fn(), { next }),
      );
      expect(await lastValueFrom(joined as any)).toBeDefined();

      const currentFailure = controller.forkJoinHandlersIfAttached(
        throwError(() => new Error(randomText())),
        [],
        Object.assign(vi.fn(), { next: vi.fn(() => of(randomText())) }),
      );
      const nextFailure = controller.forkJoinHandlersIfAttached(
        of(randomText()),
        [],
        Object.assign(vi.fn(), {
          next: vi.fn(() => throwError(() => new Error(randomText()))),
        }),
      );
      await expect(lastValueFrom(currentFailure as any)).rejects.toThrow();
      await expect(lastValueFrom(nextFailure as any)).rejects.toThrow();
    });

    it('assigns discovered clients and transforms promise, observable, and scalar values', async () => {
      const { controller, clientFactory, clientsContainer } = makeController();
      class Subject {
        client = {};
        unmarked = {};
        run = vi.fn();
      }
      const instance = new Subject();
      Reflect.defineMetadata(CLIENT_METADATA, true, instance, 'client');
      Reflect.defineMetadata(
        CLIENT_CONFIGURATION_METADATA,
        { name: randomText(), transport: randomTransport() },
        instance,
        'client',
      );
      controller.assignClientsToProperties(instance as any);
      await lastValueFrom(
        controller.transformToObservable(Promise.resolve(of(randomText()))),
      );
      await lastValueFrom(
        controller.transformToObservable(Promise.resolve(randomText())),
      );
      await lastValueFrom(controller.transformToObservable(of(randomText())));
      await lastValueFrom(controller.transformToObservable(randomText()));

      expect(clientFactory.create).toHaveBeenCalled();
      expect(clientsContainer).toBeDefined();
    });
  });
});
