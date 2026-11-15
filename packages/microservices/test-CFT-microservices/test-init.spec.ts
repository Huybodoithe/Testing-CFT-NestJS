import { describe, expect, it, vi } from 'vitest';
import { MetadataScanner } from '../../core/metadata-scanner.js';
import { NestContainer } from '../../core/injector/container.js';
import { Injector } from '../../core/injector/injector.js';
import { GraphInspector } from '../../core/inspector/graph-inspector.js';
import {
  CLIENT_CONFIGURATION_METADATA,
  CLIENT_METADATA,
  PATTERN_EXTRAS_METADATA,
  PATTERN_HANDLER_METADATA,
  PATTERN_METADATA,
  TRANSPORT_METADATA,
} from '../constants.js';
import { ClientsContainer } from '../container.js';
import { RequestContextHost } from '../context/request-context-host.js';
import { ExceptionFiltersContext } from '../context/exception-filters-context.js';
import { RpcContextCreator } from '../context/rpc-context-creator.js';
import { PatternHandler } from '../enums/pattern-handler.enum.js';
import { Transport } from '../enums/transport.enum.js';
import { ListenerMetadataExplorer } from '../listener-metadata-explorer.js';
import { ListenersController } from '../listeners-controller.js';
import { MicroservicesModule } from '../microservices-module.js';
import { NestMicroservice } from '../nest-microservice.js';
import { ClientProxyFactory } from '../client/client-proxy-factory.js';
import { Server } from '../server/server.js';
import { ServerFactory } from '../server/server-factory.js';
import { Observable, lastValueFrom, of } from 'rxjs';

vi.mock('@nestjs/platform-socket.io', () => ({
  SocketModule: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    close: vi.fn(),
  })),
}));

const randomText = () =>
  Array.from(
    { length: 14 + Math.floor(Math.random() * 12) },
    () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)],
  ).join('');

const mockContainer = () =>
  ({
    getModuleCompiler: vi.fn(),
    getModules: () =>
      Object.assign(new Map(), {
        addRpcTarget: vi.fn(),
      }),
    get: vi.fn(() => undefined),
    getHttpAdapterHost: vi.fn(() => undefined),
    getModuleByKey: vi.fn(() => ({ controllers: new Map() })),
    registerRequestProvider: vi.fn(),
    contextOptions: {},
  }) as any;

const mockApplicationConfig = () =>
  ({
    useGlobalFilters: vi.fn(),
    useGlobalPipes: vi.fn(),
    useGlobalGuards: vi.fn(),
    useGlobalInterceptors: vi.fn(),
    registerPreRequestHook: vi.fn(),
    setIoAdapter: vi.fn(),
  }) as any;

const mockGraphInspector = () =>
  ({
    insertOrphanedEnhancer: vi.fn(),
    insertEntrypointDefinition: vi.fn(),
  }) as any;

const mockServer = () =>
  new (class extends Server {
    listen = vi.fn((callback?: (error?: Error, info?: unknown) => void) =>
      callback?.(undefined, randomText()),
    );
    close = vi.fn();
    on = vi.fn();
    unwrap = vi.fn(() => randomText());
  })();

describe('microservices CFT test driver', () => {
  describe('ServerFactory', () => {
    it.each([
      Transport.TCP,
      Transport.REDIS,
      Transport.NATS,
      Transport.MQTT,
      Transport.GRPC,
      Transport.KAFKA,
      Transport.RMQ,
    ])('creates a server for transport %s', transport => {
      expect(ServerFactory.create({ transport } as any)).toBeDefined();
    });

    it('uses the default server for an unrecognized transport', () => {
      expect(
        ServerFactory.create({ transport: Symbol(randomText()) } as any),
      ).toBeDefined();
    });
  });

  describe('ListenerMetadataExplorer', () => {
    it('explores decorated and undecorated methods and scans client hooks', () => {
      class Controller {
        handler() {}
        undecorated() {}
      }
      const instance: Record<string, any> = Object.assign(new Controller(), {
        clientValue: {},
        unmarkedValue: {},
      });
      const method = Controller.prototype.handler;
      Reflect.defineMetadata(
        PATTERN_HANDLER_METADATA,
        PatternHandler.MESSAGE,
        method,
      );
      Reflect.defineMetadata(
        PATTERN_METADATA,
        [{ pattern: randomText() }],
        method,
      );
      Reflect.defineMetadata(TRANSPORT_METADATA, Transport.TCP, method);
      Reflect.defineMetadata(
        PATTERN_EXTRAS_METADATA,
        { tag: randomText() },
        method,
      );
      Reflect.defineMetadata(CLIENT_METADATA, true, instance, 'clientValue');
      Reflect.defineMetadata(
        CLIENT_CONFIGURATION_METADATA,
        { transport: Transport.REDIS },
        instance,
        'clientValue',
      );
      Reflect.defineMetadata(
        CLIENT_METADATA,
        undefined,
        instance,
        'unmarkedValue',
      );

      const explorer = new ListenerMetadataExplorer({
        getAllMethodNames: vi.fn(() => ['handler', 'undecorated']),
      } as unknown as MetadataScanner);

      expect(explorer.explore(instance as any)).toBeDefined();
      expect([...explorer.scanForClientHooks(instance as any)]).toBeDefined();
    });

    it('skips missing pattern metadata and function-valued client members', () => {
      class Controller {
        unmarked() {}
      }
      const instance: Record<string, any> = Object.assign(new Controller(), {
        fnProperty: vi.fn(),
        ordinaryProperty: randomText(),
      });
      Reflect.defineMetadata(CLIENT_METADATA, true, instance, 'fnProperty');
      Reflect.defineMetadata(
        CLIENT_METADATA,
        true,
        instance,
        'ordinaryProperty',
      );
      Reflect.defineMetadata(
        CLIENT_CONFIGURATION_METADATA,
        { transport: Transport.TCP },
        instance,
        'ordinaryProperty',
      );

      const explorer = new ListenerMetadataExplorer({
        getAllMethodNames: vi.fn(() => ['unmarked']),
      } as any);

      expect(explorer.explore(instance as any)).toBeDefined();
      expect([...explorer.scanForClientHooks(instance as any)]).toBeDefined();
    });
  });

  describe('MicroservicesModule', () => {
    it('covers unregistered errors, setup paths, client filtering, and close', async () => {
      const module = new MicroservicesModule();
      const container = mockContainer();
      expect(() => module.setupListeners(container, mockServer())).toThrow();
      expect(() => module.setupClients(container)).toThrow();

      module.register(
        container,
        mockGraphInspector(),
        mockApplicationConfig(),
        { preview: false } as any,
      );
      const controller = (module as any).listenersController;
      const registerSpy = vi.spyOn(controller, 'registerPatternHandlers');
      const assignSpy = vi.spyOn(controller, 'assignClientsToProperties');
      const controllers = new Map([
        ['controller', { instance: {}, isDependencyTreeStatic: vi.fn() }],
      ]);
      const providers = new Map([
        ['provider', { instance: {}, isNotMetatype: false }],
        ['factory', { instance: {}, isNotMetatype: true }],
      ]);
      container.getModules = () =>
        new Map([[randomText(), { controllers, providers }]]);

      module.setupListeners(container, mockServer());
      module.setupClients(container);
      module.bindClients(providers as any);

      const client = { close: vi.fn() };
      (module as any).clientsContainer.addClient(client);
      await module.close();

      expect(registerSpy).toHaveBeenCalled();
      expect(assignSpy).toHaveBeenCalled();
      expect(client.close).toHaveBeenCalled();
    });

    it('skips client setup in preview mode', () => {
      const module = new MicroservicesModule();
      module.register(
        mockContainer(),
        mockGraphInspector(),
        mockApplicationConfig(),
        { preview: true } as any,
      );
      const assignSpy = vi.spyOn(
        (module as any).listenersController,
        'assignClientsToProperties',
      );
      module.setupClients(mockContainer());
      expect(assignSpy).not.toHaveBeenCalled();
    });
  });

  describe('NestMicroservice', () => {
    const makeInstance = (config: any = { strategy: mockServer() }) =>
      new NestMicroservice(
        mockContainer(),
        config,
        mockGraphInspector(),
        mockApplicationConfig(),
      );

    it('covers server creation strategies, optional methods, and listening', async () => {
      const instance = makeInstance();
      const custom = mockServer();
      instance.createServer({ strategy: custom } as any);
      expect(instance.getTransportServer()).toBeDefined();

      instance.createServer({
        useFactory: () => ({ strategy: custom }),
        inject: [],
      } as any);
      const listenInstance = makeInstance({
        strategy: instance.getTransportServer(),
      });
      await listenInstance.listen();

      const unsupported = makeInstance({ strategy: {} });
      expect(() => unsupported.on(randomText(), vi.fn())).toThrow();
      expect(() => unsupported.unwrap()).toThrow();
    });

    it('covers connected, preview, initialized, and terminated lifecycle branches', async () => {
      const instance = makeInstance();
      const microservicesModule = (instance as any).microservicesModule;
      const clientsSpy = vi.spyOn(microservicesModule, 'setupClients');
      const listenersSpy = vi.spyOn(microservicesModule, 'setupListeners');
      (instance as any).socketModule = {
        register: vi.fn(),
        close: vi.fn(),
      };

      await instance.registerModules();
      instance.setIsConnectedToApplication(true);
      await instance.registerModules();
      instance.setIsConnectedToApplication(false);
      (instance as any).appOptions.preview = true;
      await instance.registerModules();

      const warnSpy = vi.spyOn((instance as any).logger, 'warn');
      instance.setIsInitialized(true);
      instance.useGlobalFilters({} as any);
      instance.useGlobalPipes({} as any);
      instance.useGlobalInterceptors({} as any);
      instance.useGlobalGuards({} as any);
      instance.registerPreRequestHook(vi.fn());
      instance.useWebSocketAdapter({} as any);

      const closeApplicationSpy = vi
        .spyOn(instance as any, 'closeApplication')
        .mockResolvedValue(undefined);
      await instance.close();
      await instance.close();

      expect(clientsSpy).toHaveBeenCalled();
      expect(listenersSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(closeApplicationSpy).toHaveBeenCalled();
    });
  });

  describe('ListenersController', () => {
    const makeController = () => {
      const container = mockContainer();
      const graph = mockGraphInspector();
      const controller = new ListenersController(
        new ClientsContainer(),
        {} as RpcContextCreator,
        container as NestContainer,
        new Injector(),
        ClientProxyFactory,
        {} as ExceptionFiltersContext,
        graph as GraphInspector,
      );
      return { controller, graph };
    };

    it('covers entrypoint metadata, assignment, and observable conversions', async () => {
      const { controller, graph } = makeController();
      const wrapper = { id: randomText(), metatype: { name: randomText() } };
      controller.insertEntrypointDefinition(
        wrapper as any,
        {
          methodKey: randomText(),
          patterns: [{ pattern: randomText() }],
          isEventHandler: false,
          targetCallback: vi.fn(),
        },
        Transport.TCP,
      );
      const target = {};
      controller.assignClientToInstance(target as any, 'client', {
        id: randomText(),
      });
      const promiseResult = await lastValueFrom(
        controller.transformToObservable(Promise.resolve(randomText())),
      );
      const observableResult = await lastValueFrom(
        controller.transformToObservable(of(randomText())),
      );
      const scalarResult = await lastValueFrom(
        controller.transformToObservable(randomText()),
      );

      expect(graph.insertEntrypointDefinition).toHaveBeenCalled();
      expect(target).toBeDefined();
      expect(promiseResult).toBeDefined();
      expect(observableResult).toBeDefined();
      expect(scalarResult).toBeDefined();
    });

    it('handles event context stripping and attached or unattached handlers', async () => {
      const { controller } = makeController();
      const context = RequestContextHost.create(
        { pattern: randomText() } as any,
        randomText(),
        {} as any,
      );
      const current = of(randomText());
      const unchained = controller.forkJoinHandlersIfAttached(
        current,
        [randomText()],
        vi.fn(),
      );
      const next = vi.fn(() => of(randomText()));
      const chained = controller.forkJoinHandlersIfAttached(
        current,
        [context],
        Object.assign(vi.fn(), { next }),
      );

      expect(unchained).toBeDefined();
      expect(chained).toBeInstanceOf(Observable);
      expect(await lastValueFrom(chained)).toBeDefined();
    });
  });
});
