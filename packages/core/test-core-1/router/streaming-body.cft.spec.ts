import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  cancelStreamingBody,
  getWebResponseHeaders,
  inferContentType,
  isStreamingBody,
  isStreamingBodyConsumed,
  isWebResponse,
  openStreamingBody,
  toReadable,
  toResponseChunk,
  type StreamingBodyIterator,
} from '../../router/streaming-body.js';

// Reproducible, bounded xorshift32 fixtures (RANDOM_SEED = 1808).
function seededBytes(salt: number, count = 12): Uint8Array {
  let state = (1808 ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  const result = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result[index] = 33 + ((state >>> 0) % 90);
  }
  return result;
}

function seededWord(salt: number): string {
  return Array.from(seededBytes(salt, 13), byte =>
    String.fromCharCode(97 + (byte % 26)),
  ).join('');
}

// Models Response.type === 'basic' without fetching a URL.
class SyntheticFetchedResponse extends Response {
  override get type(): ResponseType {
    return 'basic';
  }
}

describe('streaming-body.ts — CFT', () => {
  describe('detection and consumed state', () => {
    it('T01 recognizes a genuine web Response but not unrelated values', () => {
      expect(isWebResponse(new Response(null))).toBe(true);
      expect(isWebResponse({})).toBe(false);
      expect(isWebResponse(null)).toBe(false);
      expect(isWebResponse(seededWord(1))).toBe(false);
    });

    it('T02 rejects primitives, sync iterables and objects without an async iterator, short-circuiting then', () => {
      const thenGetter = vi.fn(() => Promise.resolve());
      const noIterator = Object.defineProperty({}, 'then', { get: thenGetter });
      const functionWithIterator = Object.assign(
        () => seededWord(2),
        { [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }) },
      );
      for (const value of [
        null,
        undefined,
        false,
        0,
        seededWord(2),
        [],
        {},
        Promise.resolve(seededWord(2)),
        noIterator,
        functionWithIterator,
      ]) {
        expect(isStreamingBody(value)).toBe(false);
      }
      expect(thenGetter).not.toHaveBeenCalled();
    });

    it('T03 accepts an async iterable but rejects one that is also thenable', () => {
      const iteratorFactory = vi.fn(() => ({
        next: async () => ({ done: true as const, value: undefined }),
      }));
      const iterable = { [Symbol.asyncIterator]: iteratorFactory };
      const thenableIterable = {
        [Symbol.asyncIterator]: iteratorFactory,
        then: () => Promise.resolve(seededWord(3)),
      };
      expect(isStreamingBody(iterable)).toBe(true);
      expect(isStreamingBody(thenableIterable)).toBe(false);
      expect(iteratorFactory).not.toHaveBeenCalled();
    });

    it('T04 falls back to the Response brand when the async iterator is absent', () => {
      const response = new Response(null);
      expect(isStreamingBody(response)).toBe(true);
      expect(isWebResponse(response)).toBe(true);
    });

    it('T05 reports an empty Response and an untouched web stream as not consumed', async () => {
      const web = new ReadableStream<Uint8Array>();
      expect(isStreamingBodyConsumed(new Response(null))).toBe(false);
      expect(isStreamingBodyConsumed(web)).toBe(false);
      await web.cancel();
    });

    it('T06 reports a locked web stream as consumed before checking disturbance', async () => {
      const web = new ReadableStream<string>();
      const reader = web.getReader();
      expect(web.locked).toBe(true);
      expect(isStreamingBodyConsumed(web)).toBe(true);
      await reader.cancel();
      reader.releaseLock();
    });

    it('T07 reports a disturbed, non-errored Node readable as consumed', async () => {
      const value = seededWord(7);
      const nodeStream = Readable.from([value, seededWord(70)]);
      const iterator = nodeStream[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toBe(value);
      expect(Readable.isDisturbed(nodeStream)).toBe(true);
      expect(nodeStream.errored).toBeNull();
      expect(isStreamingBodyConsumed(nodeStream)).toBe(true);
      await iterator.return?.();
    });

    it('T08 excludes a disturbed Node readable with a recorded error', async () => {
      const nodeStream = Readable.from([
        seededWord(8),
        seededWord(80),
        seededWord(81),
      ]);
      const iterator = nodeStream[Symbol.asyncIterator]();
      await iterator.next();
      const failure = new Error('intentionally interrupted stream');
      nodeStream.on('error', () => undefined);
      const closed = new Promise<void>(resolve => nodeStream.once('close', resolve));
      nodeStream.destroy(failure);
      expect(Readable.isDisturbed(nodeStream)).toBe(true);
      expect(nodeStream.errored).toBe(failure);
      expect(isStreamingBodyConsumed(nodeStream)).toBe(false);
      await closed;
    });
  });

  describe('opening and cancelling a body', () => {
    it('T09 opens a web stream with getReader, reads and cancels through its reader', async () => {
      const value = seededWord(9);
      const cancel = vi.fn(async () => undefined);
      const web = new ReadableStream<string>({
        start(controller) { controller.enqueue(value); },
        cancel,
      });
      const opened = openStreamingBody(web);
      expect(await opened.next()).toEqual({ done: false, value });
      expect(await opened.return()).toBeUndefined();
      expect(cancel).toHaveBeenCalledOnce();
    });

    it('T10 uses an async iterator and destroys a Node-style source before returning', async () => {
      const value = seededWord(10);
      const calls: string[] = [];
      const next = vi.fn(async (): Promise<IteratorResult<string>> => {
        calls.push('next');
        return { done: false, value };
      });
      const finish = vi.fn(async (): Promise<IteratorResult<string>> => {
        calls.push('return');
        return { done: true, value: undefined };
      });
      const destroy = vi.fn(() => { calls.push('destroy'); });
      const source: AsyncIterable<string> & { destroy(): void } = {
        [Symbol.asyncIterator]: () => ({ next, return: finish }),
        destroy,
      };
      const opened = openStreamingBody(source);
      expect(await opened.next()).toEqual({ done: false, value });
      expect(await opened.return()).toEqual({ done: true, value: undefined });
      expect(calls).toEqual(['next', 'destroy', 'return']);
      expect(destroy).toHaveBeenCalledOnce();
      expect(finish).toHaveBeenCalledOnce();
    });

    it('T11 permits an async iterator without destroy or return hooks', async () => {
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return { next: async () => ({ done: true as const, value: undefined }) };
        },
      };
      const opened = openStreamingBody(source);
      expect(await opened.next()).toEqual({ done: true, value: undefined });
      expect(await opened.return()).toBeUndefined();
    });

    it('T12 returns early when a Response has no body to cancel', async () => {
      await expect(cancelStreamingBody(new Response(null))).resolves.toBeUndefined();
    });

    it('T13 returns early when the underlying web stream is locked', async () => {
      const cancel = vi.fn(async () => undefined);
      const web = new ReadableStream<string>({ cancel });
      const reader = web.getReader();
      await expect(cancelStreamingBody(web)).resolves.toBeUndefined();
      expect(cancel).not.toHaveBeenCalled();
      expect(web.locked).toBe(true);
      await reader.cancel();
      reader.releaseLock();
      expect(cancel).toHaveBeenCalledOnce();
    });

    it('T14 cancels both a direct web stream and a Response-wrapped body', async () => {
      const cancelDirect = vi.fn(async () => undefined);
      const direct = new ReadableStream<Uint8Array>({ cancel: cancelDirect });
      await cancelStreamingBody(direct);
      expect(cancelDirect).toHaveBeenCalledOnce();

      const cancelWrapped = vi.fn(async () => undefined);
      const wrapped = new Response(
        new ReadableStream<Uint8Array>({ cancel: cancelWrapped }),
      );
      await cancelStreamingBody(wrapped);
      expect(cancelWrapped).toHaveBeenCalledOnce();
    });

    it('T15 calls iterator return and swallows an asynchronous cancellation failure', async () => {
      const completed = vi.fn(async () => ({ done: true as const, value: undefined }));
      const successful: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true as const, value: undefined }),
          return: completed,
        }),
      };
      await cancelStreamingBody(successful);
      expect(completed).toHaveBeenCalledOnce();

      const fail = vi.fn(async (): Promise<IteratorResult<unknown>> => {
        throw new Error('cancellation rejected');
      });
      const rejecting: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true as const, value: undefined }),
          return: fail,
        }),
      };
      await expect(cancelStreamingBody(rejecting)).resolves.toBeUndefined();
      expect(fail).toHaveBeenCalledOnce();
    });

    it('T29 propagates a rejection from the fallback iterator next method', async () => {
      const failure = new Error('iterator read rejected');
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({
          next: async (): Promise<IteratorResult<unknown>> => { throw failure; },
        }),
      };
      await expect(openStreamingBody(source).next()).rejects.toBe(failure);
    });

    it('T30 cancels an async iterable whose underlying iterator has no return hook', async () => {
      const iteratorFactory = vi.fn(() => ({
        next: async () => ({ done: true as const, value: undefined }),
      }));
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: iteratorFactory,
      };
      await expect(cancelStreamingBody(source)).resolves.toBeUndefined();
      expect(iteratorFactory).toHaveBeenCalledOnce();
    });
  });

  describe('chunk and content-type conversion', () => {
    it('T16 preserves strings and copies the exact offset of a typed view', () => {
      const value = seededWord(16);
      const bytes = seededBytes(160);
      const view = new DataView(bytes.buffer, 2, 6);
      expect(toResponseChunk(value)).toBe(value);
      const chunk = toResponseChunk(view);
      expect(Buffer.isBuffer(chunk)).toBe(true);
      expect(chunk).toEqual(Buffer.from(bytes.subarray(2, 8)));
    });

    it('T17 converts ArrayBuffer and SharedArrayBuffer to binary chunks', () => {
      const arrayBuffer = seededBytes(17).buffer;
      expect(toResponseChunk(arrayBuffer)).toEqual(Buffer.from(arrayBuffer));
      const shared = new SharedArrayBuffer(9);
      new Uint8Array(shared).set(seededBytes(170, 9));
      expect(toResponseChunk(shared)).toEqual(Buffer.from(shared));
    });

    it('T18 emits NDJSON for other values and an empty string for undefined JSON', () => {
      const data = { label: seededWord(18), count: 316 };
      expect(toResponseChunk(data)).toBe(`${JSON.stringify(data)}\n`);
      expect(toResponseChunk(null)).toBe('null\n');
      expect(toResponseChunk(undefined)).toBe('');
    });

    it('T19 propagates a JSON serialization error for a circular object', () => {
      const circular: { self?: unknown } = {};
      circular.self = circular;
      expect(() => toResponseChunk(circular)).toThrow(TypeError);
    });

    it('T20 infers text, binary-view, binary-buffer and NDJSON media types', () => {
      expect(inferContentType(seededWord(20))).toBe('text/plain; charset=utf-8');
      expect(inferContentType(new DataView(seededBytes(200).buffer))).toBe(
        'application/octet-stream',
      );
      expect(inferContentType(seededBytes(201).buffer)).toBe(
        'application/octet-stream',
      );
      expect(inferContentType({ text: seededWord(202) })).toBe(
        'application/x-ndjson',
      );
    });
  });

  describe('web Response header forwarding', () => {
    it('T21 retains default Response headers except set-cookie and skips encoding detection', () => {
      const token = seededWord(21);
      const response = new Response(null, {
        headers: {
          connection: 'keep-alive',
          'content-encoding': 'gzip',
          'content-length': '145',
          'set-cookie': `session=${token}`,
          'x-token': token,
        },
      });
      const has = vi.spyOn(response.headers, 'has');
      try {
        expect(Object.fromEntries(getWebResponseHeaders(response))).toEqual({
          connection: 'keep-alive',
          'content-encoding': 'gzip',
          'content-length': '145',
          'x-token': token,
        });
        expect(has).not.toHaveBeenCalled();
      } finally {
        has.mockRestore();
      }
    });

    it('T22 drops hop-by-hop headers on fetched responses without decoding', () => {
      const token = seededWord(22);
      const headers = new Headers({
        'content-length': '452',
        'set-cookie': `session=${token}`,
        'x-token': token,
      });
      for (const name of [
        'connection',
        'keep-alive',
        'proxy-connection',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
      ]) {
        headers.set(name, 'forwarded');
      }
      const response = new SyntheticFetchedResponse(null, { headers });
      expect(response.type).toBe('basic');
      expect(Object.fromEntries(getWebResponseHeaders(response))).toEqual({
        'content-length': '452',
        'x-token': token,
      });
    });

    it('T23 strips decoded content-encoding and encoded length while keeping end-to-end headers', () => {
      const token = seededWord(23);
      const response = new SyntheticFetchedResponse(null, {
        headers: {
          connection: 'close',
          'content-encoding': 'br',
          'content-length': '748',
          'set-cookie': `session=${token}`,
          'x-token': token,
        },
      });
      expect(Object.fromEntries(getWebResponseHeaders(response))).toEqual({
        'x-token': token,
      });
    });

    it('T24 handles a Response with zero headers without entering the forEach callback', () => {
      expect(getWebResponseHeaders(new Response(null))).toEqual([]);
    });
  });

  describe('Readable adapter', () => {
    it('T25 emits the pending chunk first, converts subsequent chunks and ends on done', async () => {
      const first = seededWord(25);
      const objectValue = { key: seededWord(250) };
      const binaryValue = seededBytes(251);
      const next = vi
        .fn<StreamingBodyIterator['next']>()
        .mockResolvedValueOnce({ done: false, value: objectValue })
        .mockResolvedValueOnce({ done: false, value: binaryValue })
        .mockResolvedValueOnce({ done: true, value: undefined });
      const returned = vi.fn(async () => undefined);
      const chunks: unknown[] = [];
      for await (const chunk of toReadable({ next, return: returned }, first)) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(3);
      expect(String(chunks[0])).toBe(first);
      expect(String(chunks[1])).toBe(`${JSON.stringify(objectValue)}\n`);
      expect(Buffer.from(chunks[2] as Uint8Array)).toEqual(Buffer.from(binaryValue));
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('T26 accepts a binary first chunk and an immediately completed iterator', async () => {
      const first = seededBytes(26);
      const next = vi
        .fn<StreamingBodyIterator['next']>()
        .mockResolvedValue({ done: true, value: undefined });
      const chunks: unknown[] = [];
      for await (const chunk of toReadable(
        { next, return: async () => undefined }, first,
      )) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(Buffer.from(chunks[0] as Uint8Array)).toEqual(Buffer.from(first));
      expect(next).toHaveBeenCalledOnce();
    });

    it('T27 propagates an asynchronous source read failure after the prefetched chunk', async () => {
      const first = seededWord(27);
      const failure = new Error('source next failed');
      const next = vi.fn<StreamingBodyIterator['next']>().mockRejectedValue(failure);
      const chunks: string[] = [];
      const readable = toReadable({ next, return: async () => undefined }, first);
      await expect(
        (async () => {
          for await (const chunk of readable) {
            chunks.push(String(chunk));
          }
        })(),
      ).rejects.toThrow('source next failed');
      expect(chunks).toEqual([first]);
      expect(next).toHaveBeenCalled();
    });

    it('T28 runs early-stop cleanup in the AsyncResource creation context', async () => {
      const context = new AsyncLocalStorage<string>();
      const creatingContext = `create-${seededWord(28)}`;
      const first = seededWord(280);
      let cleanupContext: string | undefined;
      const returned = vi.fn(async () => {
        cleanupContext = context.getStore();
        return undefined;
      });
      const next = vi.fn(async (): Promise<IteratorResult<unknown>> => ({
        done: false,
        value: seededWord(281),
      }));
      const readable = context.run(creatingContext, () =>
        toReadable({ next, return: returned }, first),
      );
      await context.run(`consumer-${seededWord(282)}`, async () => {
        let readCount = 0;
        for await (const chunk of readable) {
          readCount++;
          expect(String(chunk)).toBe(first);
          break;
        }
        expect(readCount).toBe(1);
      });
      expect(returned).toHaveBeenCalled();
      expect(cleanupContext).toBe(creatingContext);
      context.disable();
    });
  });
});
