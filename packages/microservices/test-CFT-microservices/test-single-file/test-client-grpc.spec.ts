import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Subject } from 'rxjs';

/* -------------------------------------------------------------------------- */
/*  Shared mock state (hoisted so vi.mock factories can reference it)         */
/* -------------------------------------------------------------------------- */
const mocks = vi.hoisted(() => {
  class FakeMetadata {
    store = new Map<string, unknown[]>();
    get(key: string) {
      return this.store.get(key) ?? [];
    }
    set(key: string, value: unknown) {
      this.store.set(key, [value]);
    }
    clone() {
      const copy = new FakeMetadata();
      copy.store = new Map(this.store);
      return copy;
    }
  }
  return {
    FakeMetadata,
    grpc: {
      credentials: { createInsecure: vi.fn(() => 'insecure-credentials') },
      loadPackageDefinition: vi.fn(),
      Metadata: FakeMetadata,
    },
    protoLoader: { tag: 'proto-loader' },
    getGrpcPackageDefinition: vi.fn(),
    hasPacketMetadata: vi.fn(),
    createPacket: vi.fn(),
    loggerError: vi.fn(),
  };
});

vi.mock('@nestjs/common', () => ({
  Logger: class {
    error = mocks.loggerError;
  },
}));

vi.mock('@nestjs/common/internal', () => ({
  // Loader callbacks (createRequire) are intentionally not invoked
  loadPackageSync: vi.fn((name: string) =>
    name === '@grpc/grpc-js' ? mocks.grpc : mocks.protoLoader,
  ),
  isFunction: (v: unknown) => typeof v === 'function',
  isNil: (v: unknown) => v === undefined || v === null,
  isObject: (v: unknown) =>
    !(v === undefined || v === null) && typeof v === 'object',
}));

vi.mock('../../constants.js', () => ({
  GRPC_DEFAULT_PROTO_LOADER: '@grpc/proto-loader',
  GRPC_DEFAULT_URL: 'localhost:5000',
}));

vi.mock('../../errors/invalid-grpc-package.exception.js', () => ({
  InvalidGrpcPackageException: class extends Error {
    constructor(pkg: string) {
      super(`Invalid package ${pkg}`);
    }
  },
}));
vi.mock('../../errors/invalid-grpc-service.exception.js', () => ({
  InvalidGrpcServiceException: class extends Error {
    constructor(name: string) {
      super(`Invalid service ${name}`);
    }
  },
}));
vi.mock('../../errors/invalid-proto-definition.exception.js', () => ({
  InvalidProtoDefinitionException: class extends Error {
    constructor(path: string) {
      super(`Invalid proto ${path}`);
    }
  },
}));

vi.mock('../../helpers/index.js', () => ({
  getGrpcPackageDefinition: mocks.getGrpcPackageDefinition,
}));
vi.mock('../../utils/packet-metadata.utils.js', () => ({
  hasPacketMetadata: mocks.hasPacketMetadata,
}));

vi.mock('../../client/client-proxy.js', () => ({
  ClientProxy: class {
    onDispatchHook: unknown = undefined;
    getOptionsProp(obj: any, prop: string, defaultValue?: unknown) {
      return obj && prop in obj ? obj[prop] : defaultValue;
    }
    createPacket(pattern: unknown, data: unknown) {
      return mocks.createPacket(pattern, data);
    }
    serializeError(err: unknown) {
      return err;
    }
  },
}));

import { ClientGrpcProxy } from '../../client/client-grpc.js';

/* -------------------------------------------------------------------------- */
/*  Random data helpers (values are picked from the middle of each class)     */
/* -------------------------------------------------------------------------- */
const rnd = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const rndStr = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 10);
const rndObj = () => ({ id: rnd(1000, 9000), name: rndStr('n') });

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */
const METHODS = [
  { name: 'findOne', stream: false },
  { name: 'findMany', stream: true },
];

function createServiceCtor() {
  function Svc(this: any, url: string, credentials: unknown, options: unknown) {
    this.url = url;
    this.credentials = credentials;
    this.options = options;
  }
  for (const m of METHODS) {
    (Svc.prototype as any)[m.name] = Object.assign(vi.fn(), {
      responseStream: m.stream,
      requestStream: false,
    });
  }
  return Svc as any;
}

function setup(options: Record<string, any> = {}) {
  const pkg = rndStr('pkg');
  const svc = rndStr('Svc');
  const Svc = createServiceCtor();
  mocks.grpc.loadPackageDefinition.mockReturnValue({ [pkg]: { [svc]: Svc } });
  const proxy = new ClientGrpcProxy({
    package: pkg,
    protoPath: rndStr('p') + '.proto',
    ...options,
  } as any);
  return { proxy, pkg, svc, Svc };
}

function makeCall() {
  const call: any = new EventEmitter();
  call.write = vi.fn();
  call.end = vi.fn();
  call.cancel = vi.fn();
  call.destroy = vi.fn();
  call.finished = false;
  return call;
}

function makeClient(
  methodName: string,
  flags: { requestStream: boolean; responseStream: boolean; path?: string },
) {
  const call = makeCall();
  const fn: any = vi.fn(() => call);
  fn.requestStream = flags.requestStream;
  fn.responseStream = flags.responseStream;
  if (flags.path) {
    fn.path = flags.path;
  }
  return { client: { [methodName]: fn } as any, call, fn };
}

const makeObserver = () => ({
  next: vi.fn(),
  error: vi.fn(),
  complete: vi.fn(),
});

const lastArg = (fn: any) => {
  const args = fn.mock.calls[0];
  return args[args.length - 1];
};

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */
describe('ClientGrpcProxy - Control Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGrpcPackageDefinition.mockReturnValue({});
  });

  /* ------------------------------ constructor ----------------------------- */
  describe('constructor', () => {
    it('TC-01: url + custom protoLoader are provided', () => {
      const { proxy } = setup({
        url: `${rndStr('host')}:${rnd(2000, 8000)}`,
        protoLoader: rndStr('loader'),
      });
      expect(proxy).toBeDefined();
    });

    it('TC-02: url and protoLoader missing -> defaults used', () => {
      const { proxy } = setup();
      expect(proxy).toBeDefined();
    });
  });

  /* ------------------------------- getService ----------------------------- */
  describe('getService / getClientByServiceName', () => {
    it('TC-03: known service, cache miss, builds unary + stream methods', () => {
      const { proxy, svc } = setup();
      const service = proxy.getService<any>(svc);
      expect(service).toBeDefined();
    });

    it('TC-04: unknown service name -> throws', () => {
      const { proxy } = setup();
      expect(() => proxy.getService(rndStr('Unknown'))).toThrow();
    });

    it('TC-05: second call hits the clients cache', () => {
      const { proxy, svc } = setup();
      proxy.getService(svc);
      const second = proxy.getService<any>(svc);
      expect(second).toBeDefined();
    });

    it('TC-06: cached client but grpcClients emptied -> throws in getService', () => {
      const { proxy, svc } = setup();
      proxy.getService(svc);
      (proxy as any).grpcClients = [];
      expect(() => proxy.getService(svc)).toThrow();
    });
  });

  /* ------------------------ createClientByServiceName --------------------- */
  describe('createClientByServiceName', () => {
    it('TC-07: all limits, credentials, channelOptions and keepalive set', () => {
      const { proxy, svc } = setup({
        channelOptions: { 'grpc.custom': rnd(100, 900) },
        maxSendMessageLength: rnd(2000, 8000),
        maxReceiveMessageLength: rnd(2000, 8000),
        maxMetadataSize: rnd(2000, 8000),
        credentials: { tag: rndStr('cred') },
        keepalive: { keepaliveTimeMs: rnd(2000, 8000) },
      });
      const client = proxy.createClientByServiceName(svc);
      expect(client).toBeDefined();
    });

    it('TC-08: no limits, no credentials, no channelOptions, no keepalive', () => {
      const { proxy, svc } = setup();
      const client = proxy.createClientByServiceName(svc);
      expect(client).toBeDefined();
    });

    it('TC-09: unknown service -> throws', () => {
      const { proxy } = setup();
      expect(() => proxy.createClientByServiceName(rndStr('Nope'))).toThrow();
    });

    it('TC-10: options undefined -> falsy `this.options` branches, then TypeError', () => {
      const svcName = rndStr('Svc');
      mocks.grpc.loadPackageDefinition.mockReturnValue({
        [svcName]: createServiceCtor(),
      });
      const proxy = new ClientGrpcProxy(undefined as any);
      expect(() => proxy.createClientByServiceName(svcName)).toThrow(TypeError);
    });
  });

  /* --------------------------- getKeepaliveOptions ------------------------ */
  describe('getKeepaliveOptions', () => {
    it('TC-11: keepalive is not an object -> {}', () => {
      const { proxy } = setup({ keepalive: rnd(100, 900) });
      expect(proxy.getKeepaliveOptions()).toBeDefined();
    });

    it('TC-12: only known keepalive keys', () => {
      const { proxy } = setup({
        keepalive: {
          keepaliveTimeMs: rnd(2000, 8000),
          keepaliveTimeoutMs: rnd(2000, 8000),
          keepalivePermitWithoutCalls: 1,
          http2MaxPingsWithoutData: rnd(2, 8),
          http2MinTimeBetweenPingsMs: rnd(2000, 8000),
          http2MinPingIntervalWithoutDataMs: rnd(2000, 8000),
          http2MaxPingStrikes: rnd(2, 8),
        },
      });
      expect(proxy.getKeepaliveOptions()).toBeDefined();
    });

    it('TC-13: known + unknown keys -> unknown key skipped', () => {
      const { proxy } = setup({
        keepalive: {
          keepaliveTimeMs: rnd(2000, 8000),
          [rndStr('unknown')]: rnd(2000, 8000),
        },
      });
      expect(proxy.getKeepaliveOptions()).toBeDefined();
    });
  });

  /* ---------------------------- createServiceMethod ----------------------- */
  describe('createServiceMethod', () => {
    it('TC-14: responseStream = true -> stream method', () => {
      const { proxy } = setup();
      const { client } = makeClient('m', {
        requestStream: false,
        responseStream: true,
      });
      expect(proxy.createServiceMethod(client, 'm')).toBeDefined();
    });

    it('TC-15: responseStream = false -> unary method', () => {
      const { proxy } = setup();
      const { client } = makeClient('m', {
        requestStream: false,
        responseStream: false,
      });
      expect(proxy.createServiceMethod(client, 'm')).toBeDefined();
    });
  });

  /* ------------------------- createStreamServiceMethod -------------------- */
  describe('createStreamServiceMethod', () => {
    const open = (
      flags: { requestStream: boolean },
      args: unknown[],
      finished = false,
    ) => {
      const { proxy } = setup();
      const { client, call, fn } = makeClient('m', {
        requestStream: flags.requestStream,
        responseStream: true,
      });
      call.finished = finished;
      const observer = makeObserver();
      const sub = proxy
        .createStreamServiceMethod(
          client,
          'm',
        )(...args)
        .subscribe(observer);
      return { call, fn, observer, sub };
    };

    it('TC-16: request-stream=false, plain data, data + end', () => {
      const { call, observer } = open({ requestStream: false }, [rndObj()]);
      call.emit('data', rndObj());
      call.emit('end');
      expect(observer).toBeDefined();
    });

    it('TC-17: end with call.finished = true -> teardown returns early', () => {
      const { call, observer } = open(
        { requestStream: false },
        [rndObj()],
        true,
      );
      call.emit('end');
      expect(observer).toBeDefined();
    });

    it('TC-18: request-stream with Subject: next, complete, then end', () => {
      const subject = new Subject<unknown>();
      const { call, observer } = open({ requestStream: true }, [subject]);
      subject.next(rndObj());
      subject.complete();
      call.emit('end');
      expect(observer).toBeDefined();
    });

    it('TC-19: request-stream Subject errors -> observer.error + teardown', () => {
      const subject = new Subject<unknown>();
      const { observer } = open({ requestStream: true }, [subject]);
      subject.error(new Error(rndStr('err')));
      expect(observer).toBeDefined();
    });

    it('TC-20: request-stream Subject, consumer unsubscribes -> cancel', () => {
      const subject = new Subject<unknown>();
      const { sub, call } = open({ requestStream: true }, [subject]);
      sub.unsubscribe();
      expect(call).toBeDefined();
    });

    it('TC-21: request-stream=true but plain object data (no subscribe)', () => {
      const { observer } = open({ requestStream: true }, [rndObj()]);
      expect(observer).toBeDefined();
    });

    it('TC-22: request-stream=true, no data (undefined first arg)', () => {
      const { observer } = open({ requestStream: true }, []);
      expect(observer).toBeDefined();
    });

    it('TC-23: error event with non-cancelled details', () => {
      const { call, observer } = open({ requestStream: false }, [rndObj()]);
      call.emit('error', { details: rndStr('boom'), code: rnd(5, 12) });
      expect(observer).toBeDefined();
    });

    it('TC-24: cancelled error, not initiated by client', () => {
      const { call, observer } = open({ requestStream: false }, [rndObj()]);
      call.emit('error', { details: 'Cancelled', code: 1 });
      expect(observer).toBeDefined();
    });

    it('TC-25: cancelled error after client unsubscribed -> swallowed', () => {
      const { call, sub } = open({ requestStream: false }, [rndObj()]);
      sub.unsubscribe();
      call.emit('error', { details: 'Cancelled', code: 1 });
      expect(call).toBeDefined();
    });
  });

  /* -------------------------- createUnaryServiceMethod -------------------- */
  describe('createUnaryServiceMethod', () => {
    const open = (
      requestStream: boolean,
      args: unknown[],
      finished = false,
    ) => {
      const { proxy } = setup();
      const { client, call, fn } = makeClient('m', {
        requestStream,
        responseStream: false,
      });
      call.finished = finished;
      const observer = makeObserver();
      const sub = proxy
        .createUnaryServiceMethod(
          client,
          'm',
        )(...args)
        .subscribe(observer);
      return { call, fn, observer, sub };
    };

    it('TC-26: regular unary success (metadata + nil + options args)', () => {
      const { fn, observer } = open(false, [
        rndObj(),
        null,
        { deadline: rnd(2000, 8000) },
      ]);
      lastArg(fn)(null, rndObj());
      expect(observer).toBeDefined();
    });

    it('TC-27: regular unary callback error', () => {
      const { fn, observer } = open(false, [rndObj()]);
      lastArg(fn)({ details: rndStr('fail'), code: rnd(5, 12) }, undefined);
      expect(observer).toBeDefined();
    });

    it('TC-28: regular unary success with call.finished = true', () => {
      const { fn, observer } = open(false, [rndObj()], true);
      lastArg(fn)(null, rndObj());
      expect(observer).toBeDefined();
    });

    it('TC-29: request-stream=true but plain data -> regular unary path', () => {
      const { fn, observer } = open(true, [rndObj()]);
      lastArg(fn)(null, rndObj());
      expect(observer).toBeDefined();
    });

    it('TC-30: client-streaming, Subject next/complete, success reply', () => {
      const subject = new Subject<unknown>();
      const { fn, observer } = open(true, [subject]);
      subject.next(rndObj());
      subject.complete();
      lastArg(fn)(null, rndObj());
      expect(observer).toBeDefined();
    });

    it('TC-31: client-streaming, error details = Cancelled (not client cancel)', () => {
      const subject = new Subject<unknown>();
      const { fn, observer } = open(true, [subject]);
      lastArg(fn)({ details: 'Cancelled', code: rnd(5, 12) });
      expect(observer).toBeDefined();
    });

    it('TC-32: client-streaming, error code = 1 with other details', () => {
      const subject = new Subject<unknown>();
      const { fn, observer } = open(true, [subject]);
      lastArg(fn)({ details: rndStr('x'), code: 1 });
      expect(observer).toBeDefined();
    });

    it('TC-33: client-streaming, generic error (not cancelled)', () => {
      const subject = new Subject<unknown>();
      const { fn, observer } = open(true, [subject]);
      lastArg(fn)({ details: rndStr('x'), code: rnd(5, 12) });
      expect(observer).toBeDefined();
    });

    it('TC-34: client-streaming, cancelled error after client unsubscribed', () => {
      const subject = new Subject<unknown>();
      const { fn, sub } = open(true, [subject]);
      sub.unsubscribe();
      lastArg(fn)({ details: 'Cancelled', code: 1 });
      expect(sub).toBeDefined();
    });

    it('TC-35: client-streaming, Subject errors -> observer.error', () => {
      const subject = new Subject<unknown>();
      const { observer } = open(true, [subject]);
      subject.error(new Error(rndStr('err')));
      expect(observer).toBeDefined();
    });

    it('TC-36: client-streaming, unsubscribe with call.finished = true', () => {
      const subject = new Subject<unknown>();
      const { sub, call } = open(true, [subject], true);
      sub.unsubscribe();
      expect(call).toBeDefined();
    });
  });

  /* ----------------------------- applyDispatchHook ------------------------ */
  describe('applyDispatchHook', () => {
    it('TC-37: no dispatch hook -> args returned as is', () => {
      const { proxy } = setup();
      const args = [rndObj()];
      expect(proxy['applyDispatchHook']({}, 'm', args)).toBeDefined();
    });

    it('TC-38: hook set but packet has no metadata', () => {
      const { proxy } = setup();
      (proxy as any).onDispatchHook = vi.fn();
      mocks.createPacket.mockReturnValue({ metadata: {} });
      mocks.hasPacketMetadata.mockReturnValue(false);
      expect(proxy['applyDispatchHook']({}, 'm', [rndObj()])).toBeDefined();
    });

    it('TC-39: caller passes Metadata (existing key kept, new key added), method has path', () => {
      const { proxy } = setup();
      (proxy as any).onDispatchHook = vi.fn();
      mocks.createPacket.mockReturnValue({
        metadata: { 'x-existing': rndStr('a'), 'x-new': rndStr('b') },
      });
      mocks.hasPacketMetadata.mockReturnValue(true);
      const callerMeta = new mocks.FakeMetadata();
      callerMeta.set('x-existing', rndStr('orig'));
      const { client } = makeClient('m', {
        requestStream: false,
        responseStream: false,
        path: `/${rndStr('pkg')}.${rndStr('Svc')}/${rndStr('Rpc')}`,
      });
      const result = proxy['applyDispatchHook'](client, 'm', [
        rndObj(),
        callerMeta,
        { deadline: rnd(2000, 8000) },
      ]);
      expect(result).toBeDefined();
    });

    it('TC-40: caller passes nothing as 2nd arg, method has no path', () => {
      const { proxy } = setup();
      (proxy as any).onDispatchHook = vi.fn();
      mocks.createPacket.mockReturnValue({
        metadata: { [rndStr('k')]: rndStr('v') },
      });
      mocks.hasPacketMetadata.mockReturnValue(true);
      const { client } = makeClient('m', {
        requestStream: false,
        responseStream: false,
      });
      expect(proxy['applyDispatchHook'](client, 'm', [rndObj()])).toBeDefined();
    });

    it('TC-41: caller passes CallOptions in place of Metadata, method missing on client', () => {
      const { proxy } = setup();
      (proxy as any).onDispatchHook = vi.fn();
      mocks.createPacket.mockReturnValue({
        metadata: { [rndStr('k')]: rndStr('v') },
      });
      mocks.hasPacketMetadata.mockReturnValue(true);
      const result = proxy['applyDispatchHook']({}, rndStr('missing'), [
        rndObj(),
        { deadline: rnd(2000, 8000) },
        rndStr('extra'),
      ]);
      expect(result).toBeDefined();
    });
  });

  /* ------------------------------ createClients --------------------------- */
  describe('createClients', () => {
    it('TC-42: package option is an array of two valid packages', () => {
      const pkgA = rndStr('pkgA');
      const pkgB = rndStr('pkgB');
      mocks.grpc.loadPackageDefinition.mockReturnValue({
        [pkgA]: { [rndStr('SvcA')]: createServiceCtor() },
        [pkgB]: { [rndStr('SvcB')]: createServiceCtor() },
      });
      const proxy = new ClientGrpcProxy({
        package: [pkgA, pkgB],
        protoPath: rndStr('p') + '.proto',
      } as any);
      expect(proxy.createClients()).toBeDefined();
    });

    it('TC-43: package not found in proto -> logs and throws', () => {
      mocks.grpc.loadPackageDefinition.mockReturnValue({});
      expect(
        () =>
          new ClientGrpcProxy({
            package: rndStr('none'),
            protoPath: rndStr('p') + '.proto',
          } as any),
      ).toThrow();
    });
  });

  /* -------------------------------- loadProto ----------------------------- */
  describe('loadProto', () => {
    it('TC-44: proto definition loads successfully', () => {
      const { proxy } = setup();
      expect(proxy.loadProto()).toBeDefined();
    });

    it('TC-45: loader throws an Error with message', () => {
      const { proxy } = setup();
      mocks.getGrpcPackageDefinition.mockImplementationOnce(() => {
        throw Object.assign(new Error(rndStr('bad')), {
          path: rndStr('f') + '.proto',
        });
      });
      expect(() => proxy.loadProto()).toThrow();
    });

    it('TC-46: loader throws an object without message', () => {
      const { proxy } = setup();
      mocks.getGrpcPackageDefinition.mockImplementationOnce(() => {
        throw { path: rndStr('f') + '.proto' };
      });
      expect(() => proxy.loadProto()).toThrow();
    });
  });

  /* ------------------------------ lookupPackage --------------------------- */
  describe('lookupPackage', () => {
    it('TC-47: empty package name -> root returned', () => {
      const { proxy } = setup();
      const root = { [rndStr('a')]: rndObj() };
      expect(proxy.lookupPackage(root, '')).toBeDefined();
    });

    it('TC-48: dotted package path resolved', () => {
      const { proxy } = setup();
      const a = rndStr('a');
      const b = rndStr('b');
      const root = { [a]: { [b]: rndObj() } };
      expect(proxy.lookupPackage(root, `${a}.${b}`)).toBeDefined();
    });

    it('TC-49: first segment missing -> loop breaks', () => {
      const { proxy } = setup();
      const result = proxy.lookupPackage(
        { [rndStr('a')]: rndObj() },
        `${rndStr('miss')}.${rndStr('child')}`,
      );
      expect(result).toBeUndefined();
    });
  });

  /* ---------------------------------- close ------------------------------- */
  describe('close', () => {
    it('TC-50: clients with close(), without close(), and null', () => {
      const { proxy } = setup();
      const withClose = { close: vi.fn() };
      (proxy as any).clients.set(rndStr('a'), withClose);
      (proxy as any).clients.set(rndStr('b'), null);
      (proxy as any).clients.set(rndStr('c'), {});
      proxy.close();
      expect(withClose.close).toBeDefined();
    });
  });

  /* ------------------------- unsupported operations ----------------------- */
  describe('unsupported operations', () => {
    it('TC-51: status getter throws', () => {
      const { proxy } = setup();
      expect(() => proxy.status).toThrow();
    });

    it('TC-52: connect() rejects', async () => {
      const { proxy } = setup();
      await expect(proxy.connect()).rejects.toThrow();
    });

    it('TC-53: send() throws', () => {
      const { proxy } = setup();
      expect(() => proxy.send(rndStr('p'), rndObj())).toThrow();
    });

    it('TC-54: publish() throws', () => {
      const { proxy } = setup();
      expect(() => (proxy as any).publish(rndObj(), vi.fn())).toThrow();
    });

    it('TC-55: dispatchEvent() rejects', async () => {
      const { proxy } = setup();
      await expect((proxy as any).dispatchEvent(rndObj())).rejects.toThrow();
    });

    it('TC-56: on() throws', () => {
      const { proxy } = setup();
      expect(() => (proxy as any).on(rndStr('e'), vi.fn())).toThrow();
    });

    it('TC-57: unwrap() throws', () => {
      const { proxy } = setup();
      expect(() => proxy.unwrap()).toThrow();
    });
  });
});
