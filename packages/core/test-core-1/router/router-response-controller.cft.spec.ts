import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpException,
  HttpStatus,
  IntrinsicException,
  Logger,
  RequestMethod,
  SSE_ABORT_CONTROLLER,
  StreamableFile,
  type HttpServer,
} from '@nestjs/common';
import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough, type Readable } from 'node:stream';
import {
  EMPTY,
  NEVER,
  Observable,
  concat,
  of,
  throwError,
} from 'rxjs';
import {
  RouterResponseController,
  pickCloseSource,
} from '../../router/router-response-controller.js';
import { MESSAGES } from '../../constants.js';

// Deliberately narrow adapter mock: all behavior under test belongs to the real
// RouterResponseController, SseStream and streaming-body implementations.
function createController() {
  const adapter = {
    reply: vi.fn((_response: unknown, body: unknown, _status?: number) => body),
    redirect: vi.fn((_response: unknown, status: number, url: string) => ({ status, url })),
    render: vi.fn((_response: unknown, template: string, result: unknown) => ({ template, result })),
    setHeader: vi.fn(),
    appendHeader: vi.fn(),
    status: vi.fn(),
  };
  return {
    adapter,
    controller: new RouterResponseController(adapter as unknown as HttpServer),
  };
}

function makeRequest(method = 'GET', socket?: EventEmitter): IncomingMessage {
  return { method, socket, httpVersionMajor: 1 } as unknown as IncomingMessage;
}

function makeResponse(consume = true) {
  const chunks: string[] = [];
  const response = Object.assign(new PassThrough(), {
    statusCode: 209,
    writeHead: vi.fn((_status: number, _headers: OutgoingHttpHeaders) => undefined),
    flushHeaders: vi.fn(() => undefined),
  });
  if (consume) {
    response.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
  }
  return { response, chunks, text: () => chunks.join('') };
}

function requestSignal(request: IncomingMessage): AbortSignal {
  const carrier = request as unknown as Record<PropertyKey, AbortController>;
  return carrier[SSE_ABORT_CONTROLLER].signal;
}

async function nextMacrotask(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
}

// Fixed-seed LCG: produces a reproducible interior value (200..799).
function seededInteriorInt(seed = 1808): number {
  const state = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return 200 + (state % 600);
}

function oneChunk(value: unknown): AsyncIterable<unknown> {
  return (async function* () {
    yield value;
  })();
}

function emptyChunks(): AsyncIterable<unknown> {
  return (async function* () {})();
}

describe('router-response-controller.ts / control flow', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('pickCloseSource and ordinary response APIs', () => {
    it('T01 B1: prefers a socket that has once()', () => {
      const socket = new EventEmitter();
      const response = new EventEmitter();
      expect(pickCloseSource(socket, response)).toBe(socket);
    });

    it('T02 B1/B2: falls back to a response close emitter', () => {
      const response = new EventEmitter();
      expect(pickCloseSource({ destroyed: false }, response)).toBe(response);
    });

    it('T03 B1/B2: returns undefined when neither side can emit close', () => {
      expect(pickCloseSource(undefined, { destroyed: true })).toBeUndefined();
    });

    it('T04: apply delegates body and explicit status', async () => {
      const { controller, adapter } = createController();
      const response = {};
      const body = { payload: seededInteriorInt() };
      await expect(controller.apply(body, response, 218)).resolves.toBe(body);
      expect(adapter.reply).toHaveBeenCalledWith(response, body, 218);
    });

    it('T05: setStatus delegates status', () => {
      const { controller, adapter } = createController();
      const response = {};
      controller.setStatus(response, 219);
      expect(adapter.status).toHaveBeenCalledWith(response, 219);
    });

    it('T06 B20: setHeaders supports zero, static and evaluated function values', () => {
      const { controller, adapter } = createController();
      const response = {};
      const dynamic = vi.fn(() => 'seed-1808');
      controller.setHeaders(response, []);
      expect(adapter.setHeader).not.toHaveBeenCalled();
      controller.setHeaders(response, [
        { name: 'X-Static', value: 'fixed' },
        { name: 'X-Dynamic', value: dynamic },
      ]);
      expect(adapter.setHeader).toHaveBeenNthCalledWith(1, response, 'X-Static', 'fixed');
      expect(adapter.setHeader).toHaveBeenNthCalledWith(2, response, 'X-Dynamic', 'seed-1808');
      expect(dynamic).toHaveBeenCalledOnce();
    });

    it('T07 B18: transformToResult returns an unwrapped value or the last Observable value', async () => {
      const { controller } = createController();
      const literal = { stable: 1808 };
      await expect(controller.transformToResult(literal)).resolves.toBe(literal);
      await expect(controller.transformToResult(of('earlier', 'later'))).resolves.toBe('later');
    });

    it('T08 B18: an empty Observable rejects rather than returning a made-up result', async () => {
      const { controller } = createController();
      await expect(controller.transformToResult(EMPTY)).rejects.toBeDefined();
    });

    it('T09 B19: POST yields CREATED while other request methods yield OK', () => {
      const { controller } = createController();
      expect(controller.getStatusByMethod(RequestMethod.POST)).toBe(HttpStatus.CREATED);
      expect(controller.getStatusByMethod(RequestMethod.GET)).toBe(HttpStatus.OK);
    });

    it('T10 B15-B17: redirect prioritizes truthy result status and URL', async () => {
      const { controller, adapter } = createController();
      const response = {};
      await controller.redirect(
        { statusCode: 308, url: '/from-result' },
        response,
        { statusCode: 307, url: '/fallback' },
      );
      expect(adapter.redirect).toHaveBeenCalledWith(response, 308, '/from-result');
    });

    it('T11 B15-B17: redirect falls through result then config then default FOUND', async () => {
      const { controller, adapter } = createController();
      const response = {};
      await controller.redirect({ statusCode: 0, url: '' }, response, {
        url: '/configured',
        statusCode: 303,
      });
      expect(adapter.redirect).toHaveBeenLastCalledWith(response, 303, '/configured');
      await controller.redirect(null, response, { url: '/default' });
      expect(adapter.redirect).toHaveBeenLastCalledWith(response, HttpStatus.FOUND, '/default');
    });

    it('T12: render awaits the last observable value and delegates template', async () => {
      const { controller, adapter } = createController();
      const response = {};
      await controller.render(of({ view: 1808 }), response, 'example');
      expect(adapter.render).toHaveBeenCalledWith(response, 'example', { view: 1808 });
    });
  });

  describe('stream / first chunk, disconnect and Response headers', () => {
    it('T13 B6: refuses an already locked ReadableStream before reply', async () => {
      const { controller, adapter } = createController();
      const source = new ReadableStream<string>();
      const reader = source.getReader();
      try {
        await expect(controller.stream(source, {}, makeRequest())).rejects.toThrow(
          /read already/,
        );
        expect(adapter.reply).not.toHaveBeenCalled();
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    });

    it('T14 B4/B8/B14: a Response with a null body applies headers then replies empty', async () => {
      const { controller, adapter } = createController();
      const response = {};
      const web = new Response(null, {
        status: 204,
        headers: { 'X-Trace': 'seed-1808' },
      });
      await controller.stream(web, response, makeRequest(), { statusCode: 222 });
      expect(adapter.setHeader).toHaveBeenCalledWith(response, 'x-trace', 'seed-1808');
      expect(adapter.reply).toHaveBeenCalledWith(response, undefined, 204);
    });

    it('T15 B9: HEAD cancels an async iterator without requesting its first item', async () => {
      const { controller, adapter } = createController();
      const next = vi.fn(async () => ({ done: false as const, value: 'never-read' }));
      const finish = vi.fn(async () => ({ done: true as const, value: undefined }));
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({ next, return: finish }),
      };
      await controller.stream(source, {}, makeRequest('HEAD'));
      expect(next).not.toHaveBeenCalled();
      expect(finish).toHaveBeenCalledOnce();
      const sent = adapter.reply.mock.lastCall?.[1];
      expect(sent).toBeInstanceOf(StreamableFile);
      if (!(sent instanceof StreamableFile)) throw new Error('expected StreamableFile');
      expect(await sent.getStream().toArray()).toEqual([]);
    });

    it('T16 B11/B12: an empty async iterator sends an empty reply', async () => {
      const { controller, adapter } = createController();
      const response = {};
      await controller.stream(emptyChunks(), response, makeRequest());
      expect(adapter.reply).toHaveBeenCalledWith(response, undefined, undefined);
    });

    it('T17 B11/B12: a replacement wins over an exhausted body', async () => {
      const { controller, adapter } = createController();
      const response = {};
      const replacement = { substitute: true };
      await controller.stream(emptyChunks(), response, makeRequest(), {
        statusCode: 212,
        replacement,
      });
      expect(adapter.reply).toHaveBeenCalledWith(response, replacement, 212);
    });

    it('T18 B9: request.raw HEAD is honored despite outer request.method', async () => {
      const { controller, adapter } = createController();
      const req = { method: 'GET', raw: makeRequest('HEAD') };
      await controller.stream(oneChunk('unread'), {}, req);
      expect(adapter.reply.mock.lastCall?.[1]).toBeInstanceOf(StreamableFile);
    });

    it('T19 B10/B13: destroyed request socket prevents the first read and cancels iterator', async () => {
      const { controller, adapter } = createController();
      const socket = Object.assign(new EventEmitter(), { destroyed: true });
      const next = vi.fn(async () => ({ done: false as const, value: 'never' }));
      const finish = vi.fn(async () => ({ done: true as const, value: undefined }));
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({ next, return: finish }),
      };
      await controller.stream(source, {}, makeRequest('GET', socket));
      await Promise.resolve();
      expect(next).not.toHaveBeenCalled();
      expect(finish).toHaveBeenCalledOnce();
      expect(adapter.reply).not.toHaveBeenCalled();
    });

    it('T20 B10/B13: close during a pending first read wins and removes close listener', async () => {
      const { controller, adapter } = createController();
      const socket = new EventEmitter();
      let releaseFirst!: (value: IteratorResult<unknown>) => void;
      const next = vi.fn(() => new Promise<IteratorResult<unknown>>(resolve => { releaseFirst = resolve; }));
      const finish = vi.fn(async () => ({ done: true as const, value: undefined }));
      const body: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({ next, return: finish }),
      };
      const sending = controller.stream(body, {}, makeRequest('GET', socket));
      expect(socket.listenerCount('close')).toBe(1);
      socket.emit('close');
      await sending;
      releaseFirst({ done: true, value: undefined });
      await nextMacrotask();
      expect(finish).toHaveBeenCalledOnce();
      expect(socket.listenerCount('close')).toBe(0);
      expect(adapter.reply).not.toHaveBeenCalled();
    });

    it('T44 B10: response.raw can provide the destroyed close source when socket is absent', async () => {
      const { controller, adapter } = createController();
      const raw = Object.assign(new EventEmitter(), { destroyed: true });
      await controller.stream(oneChunk('unused'), { raw }, makeRequest());
      expect(adapter.reply).not.toHaveBeenCalled();
    });

    it('T21: a first iterator rejection propagates and detaches the close listener', async () => {
      const { controller, adapter } = createController();
      const socket = new EventEmitter();
      const problem = new Error('producer rejected');
      const body: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({ next: async () => { throw problem; } }),
      };
      await expect(controller.stream(body, {}, makeRequest('GET', socket))).rejects.toBe(problem);
      await Promise.resolve();
      expect(socket.listenerCount('close')).toBe(0);
      expect(adapter.reply).not.toHaveBeenCalled();
    });

    it('T22 B4/B14: a string stream infers text content type and streams every chunk', async () => {
      const { controller, adapter } = createController();
      const response = {};
      const source = (async function* () { yield 'seed-'; yield '1808'; })();
      const sent = await controller.stream(source, response, makeRequest(), { statusCode: 206 });
      expect(sent).toBeInstanceOf(StreamableFile);
      if (!(sent instanceof StreamableFile)) throw new Error('expected StreamableFile');
      expect(sent.getHeaders().type).toBe('text/plain; charset=utf-8');
      const parts = await sent.getStream().toArray();
      expect(parts.map(part => String(part)).join('')).toBe('seed-1808');
      expect(adapter.reply).toHaveBeenCalledWith(response, sent, 206);
    });

    it('T23 B14: an object stream is transformed to NDJSON instead of plain text', async () => {
      const { controller } = createController();
      const source = (async function* () { yield { part: 1 }; yield { part: 2 }; })();
      const sent = await controller.stream(source, {}, makeRequest());
      expect(sent).toBeInstanceOf(StreamableFile);
      if (!(sent instanceof StreamableFile)) throw new Error('expected StreamableFile');
      expect(sent.getHeaders().type).toBe('application/x-ndjson');
      const parts = await sent.getStream().toArray();
      expect(parts.map(part => String(part)).join('')).toBe('{"part":1}\n{"part":2}\n');
    });

    it('T24 B4/B14: nonempty Web Response forwards status, header and separate cookies', async () => {
      const { controller, adapter } = createController();
      const response = {};
      const headers = new Headers({ 'X-Trace': 'stream', 'Content-Type': 'text/custom' });
      headers.append('Set-Cookie', 'a=1; Path=/');
      headers.append('Set-Cookie', 'b=2; Path=/');
      const web = new Response('web-data', { status: 201, headers });
      const sent = await controller.stream(web, response, makeRequest(), { statusCode: 222 });
      expect(sent).toBeInstanceOf(StreamableFile);
      if (!(sent instanceof StreamableFile)) throw new Error('expected StreamableFile');
      expect(adapter.reply).toHaveBeenCalledWith(response, sent, 201);
      expect(adapter.setHeader).toHaveBeenCalledWith(response, 'x-trace', 'stream');
      expect(adapter.appendHeader).toHaveBeenCalledWith(response, 'Set-Cookie', 'a=1; Path=/');
      expect(adapter.appendHeader).toHaveBeenCalledWith(response, 'Set-Cookie', 'b=2; Path=/');
      expect(adapter.appendHeader).toHaveBeenCalledTimes(2);
      expect((await sent.getStream().toArray()).map(String).join('')).toBe('web-data');
    });

    it('T25 B13/catch: an unserializable first chunk closes the iterator and throws', async () => {
      const { controller, adapter } = createController();
      const circular: Record<string, unknown> = { seed: 1808 };
      circular.self = circular;
      const finish = vi.fn(async () => ({ done: true as const, value: undefined }));
      const body: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false as const, value: circular }),
          return: finish,
        }),
      };
      await expect(controller.stream(body, {}, makeRequest())).rejects.toThrow(TypeError);
      await Promise.resolve();
      expect(finish).toHaveBeenCalledOnce();
      expect(adapter.reply).not.toHaveBeenCalled();
    });

    it('T26 B14/catch: a rejecting adapter reply destroys the created readable', async () => {
      const { controller, adapter } = createController();
      const problem = new Error('adapter rejected');
      let readable: Readable | undefined;
      adapter.reply.mockImplementation((_response, body) => {
        if (body instanceof StreamableFile) readable = body.getStream();
        return Promise.reject(problem);
      });
      await expect(controller.stream(oneChunk('sample'), {}, makeRequest())).rejects.toBe(problem);
      expect(readable?.destroyed).toBe(true);
    });

    it('T27 B14/error callback: logs unexpected stream errors but not IntrinsicException', async () => {
      const { controller } = createController();
      const sent = await controller.stream(oneChunk('sample'), {}, makeRequest());
      if (!(sent instanceof StreamableFile)) throw new Error('expected StreamableFile');
      const errorSpy = vi.mocked(Logger.prototype.error);
      const stream = sent.getStream();
      const unexpected = new Error('stream error');
      stream.emit('error', unexpected);
      stream.emit('error', new IntrinsicException());
      expect(errorSpy).toHaveBeenCalledWith(unexpected);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      stream.destroy();
    });
  });

  describe('sse / setup, stream messages, terminal paths', () => {
    it('T28 B21/B44: already-ended responses abort immediately and observe late rejection', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response } = makeResponse();
      response.end();
      const problem = new Error('late handler rejection');
      await controller.sse(Promise.reject(problem), response, request);
      await nextMacrotask();
      expect(requestSignal(request).aborted).toBe(true);
      expect(Logger.prototype.error).toHaveBeenCalledWith(problem);
    });

    it('T29 B45: a non-Observable setup result rejects and aborts signal', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response } = makeResponse();
      await expect(controller.sse('invalid' as unknown as Observable<unknown>, response, request))
        .rejects.toThrow(/Observable stream/);
      expect(requestSignal(request).aborted).toBe(true);
      expect(response.writableEnded).toBe(true);
    });

    it('T30 B22/B35: empty producer still commits headers and completes with default status', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response, text } = makeResponse();
      await controller.sse(EMPTY, response, request);
      await nextMacrotask();
      expect(response.writeHead).toHaveBeenCalledWith(
        209,
        expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
      );
      expect(response.writableEnded).toBe(true);
      expect(requestSignal(request).aborted).toBe(true);
      expect(text()).toContain('\n');
    });

    it('T31 B23-B30: serializes primitive/object/null data with configured status and headers', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response, text } = makeResponse();
      const extra = vi.fn(() => ({ 'X-Test': 'seed-1808' }));
      const status = vi.fn(() => 207);
      await controller.sse(
        of('plain', { data: { id: seededInteriorInt() }, comment: 'note' }, { data: null, comment: 'only' }),
        response,
        request,
        { additionalHeaders: extra, statusCode: status, maxPendingDataLength: 0 },
      );
      await nextMacrotask();
      expect(response.writeHead).toHaveBeenCalledWith(
        207,
        expect.objectContaining({ 'X-Test': 'seed-1808' }),
      );
      expect(extra).toHaveBeenCalled();
      expect(status).toHaveBeenCalled();
      expect(text()).toContain('data: plain');
      expect(text()).toContain(`data: {"id":${seededInteriorInt()}}`);
      expect(text()).toContain(': note');
      expect(text()).toContain(': only');
      expect(requestSignal(request).aborted).toBe(true);
    });

    it('T32 B24/B25: close before async setup resolves skips producer subscription', async () => {
      const { controller } = createController();
      const socket = new EventEmitter();
      const request = makeRequest('GET', socket);
      const { response } = makeResponse();
      let finishSetup!: (observable: Observable<unknown>) => void;
      const pending = new Promise<Observable<unknown>>(resolve => { finishSetup = resolve; });
      const subscribe = vi.fn();
      const observable = new Observable<unknown>(() => { subscribe(); });
      const lifecycle = controller.sse(pending, response, request);
      expect(socket.listenerCount('close')).toBe(1);
      socket.emit('close');
      await lifecycle;
      finishSetup(observable);
      await nextMacrotask();
      expect(subscribe).not.toHaveBeenCalled();
      expect(socket.listenerCount('close')).toBe(0);
      expect(requestSignal(request).aborted).toBe(true);
    });

    it('T33 B24: an already-destroyed socket closes the SSE lifecycle immediately', async () => {
      const { controller } = createController();
      const socket = Object.assign(new EventEmitter(), { destroyed: true });
      const request = makeRequest('GET', socket);
      const { response } = makeResponse();
      await controller.sse(NEVER, response, request);
      expect(requestSignal(request).aborted).toBe(true);
      expect(response.writableEnded).toBe(true);
      expect(socket.listenerCount('close')).toBe(0);
    });

    it('T34 B36: HEAD sends SSE headers and unsubscribes from a nonterminating producer', async () => {
      const { controller } = createController();
      const request = makeRequest('HEAD');
      const { response } = makeResponse();
      const cleanup = vi.fn();
      const producer = new Observable<string>(() => cleanup);
      await controller.sse(producer, response, request);
      expect(response.writeHead).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(requestSignal(request).aborted).toBe(true);
      expect(response.writableEnded).toBe(true);
    });

    it('T35 B26/B35: invalid headers fail a completing producer before reply is committed', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response } = makeResponse();
      const problem = new TypeError('invalid header value');
      response.writeHead.mockImplementation(() => { throw problem; });
      await expect(controller.sse(EMPTY, response, request)).rejects.toBe(problem);
      expect(requestSignal(request).aborted).toBe(true);
      expect(response.writableEnded).toBe(true);
    });

    it('T36 B26/B37: deferred header commit also catches invalid header values', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response } = makeResponse();
      const problem = new TypeError('deferred header error');
      response.writeHead.mockImplementation(() => { throw problem; });
      await expect(controller.sse(NEVER, response, request)).rejects.toBe(problem);
      expect(requestSignal(request).aborted).toBe(true);
    });

    it('T37 B31: producer error before headers propagates to the exception layer', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response } = makeResponse();
      const problem = new Error('producer failed early');
      await expect(controller.sse(throwError(() => problem), response, request)).rejects.toBe(problem);
      expect(response.writeHead).not.toHaveBeenCalled();
      expect(requestSignal(request).aborted).toBe(true);
    });

    it('T38 B31/B32/B34: committed HttpException is sent as an error event without logging', async () => {
      const { controller } = createController();
      const { response, text } = makeResponse();
      await controller.sse(
        concat(of('first'), throwError(() => new HttpException('client detail', 400))),
        response,
        makeRequest(),
      );
      await nextMacrotask();
      expect(text()).toContain('event: error');
      expect(text()).toContain('data: client detail');
      expect(Logger.prototype.error).not.toHaveBeenCalled();
    });

    it('T39 B31-B34: committed HTTP-shaped error exposes its message and is logged', async () => {
      const { controller } = createController();
      const { response, text } = makeResponse();
      const problem = { statusCode: 422, message: 'invalid payload' };
      await controller.sse(concat(of('first'), throwError(() => problem)), response, makeRequest());
      await nextMacrotask();
      expect(text()).toContain('data: invalid payload');
      expect(Logger.prototype.error).toHaveBeenCalledWith(problem);
    });

    it('T40 B31-B34: committed unknown Error uses a generic client message and logs', async () => {
      const { controller } = createController();
      const { response, text } = makeResponse();
      const problem = new Error('private diagnostic');
      await controller.sse(concat(of('first'), throwError(() => problem)), response, makeRequest());
      await nextMacrotask();
      expect(text()).toContain(`data: ${MESSAGES.UNKNOWN_EXCEPTION_MESSAGE}`);
      expect(text()).not.toContain('private diagnostic');
      expect(Logger.prototype.error).toHaveBeenCalledWith(problem);
    });

    it('T41 B28/B31: JSON serialization failures after a committed event become SSE errors', async () => {
      const { controller } = createController();
      const { response, text } = makeResponse();
      const circular: Record<string, unknown> = { seq: 1808 };
      circular.self = circular;
      await controller.sse(of('first', { data: circular }), response, makeRequest());
      await nextMacrotask();
      expect(text()).toContain('data: first');
      expect(text()).toContain('event: error');
      expect(text()).toContain(`data: ${MESSAGES.UNKNOWN_EXCEPTION_MESSAGE}`);
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('T42 B23/B36: reuses an existing abort controller and can close a silent GET producer', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const existing = new AbortController();
      (request as unknown as Record<PropertyKey, AbortController>)[SSE_ABORT_CONTROLLER] = existing;
      const { response } = makeResponse();
      const cleanup = vi.fn();
      const producer = new Observable<never>(() => cleanup);
      const lifecycle = controller.sse(producer, response, request);
      await nextMacrotask();
      expect(response.writeHead).toHaveBeenCalledOnce();
      response.emit('close');
      await lifecycle;
      expect(cleanup).toHaveBeenCalledOnce();
      expect(existing.signal.aborted).toBe(true);
    });

    it('T43 B27: an async setup rejection terminates the lifecycle without headers', async () => {
      const { controller } = createController();
      const request = makeRequest();
      const { response } = makeResponse();
      const problem = new Error('setup rejected');
      await expect(controller.sse(Promise.reject(problem), response, request)).rejects.toBe(problem);
      expect(response.writeHead).not.toHaveBeenCalled();
      expect(requestSignal(request).aborted).toBe(true);
    });
  });
});
