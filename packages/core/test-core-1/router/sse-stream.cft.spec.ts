import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { Writable } from 'node:stream';
import {
  SseStream,
  type AdditionalHeaders,
} from '../../router/sse-stream.js';

type SseMessage = Parameters<SseStream['writeMessage']>[0];
const RANDOM_SEED = 1808;

// One-step xorshift32: deterministic in-class input values.
function seededInteger(min: number, max: number): number {
  let state = RANDOM_SEED | 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return min + ((state >>> 0) % (max - min + 1));
}

const activeStreams: SseStream[] = [];
const activeSinks: Writable[] = [];

function newStream(request?: IncomingMessage): SseStream {
  const stream = new SseStream(request);
  activeStreams.push(stream);
  return stream;
}

// Limited cast: the target accesses only httpVersionMajor and socket.
function requestWith(
  httpVersionMajor?: number,
  socket?: object,
): IncomingMessage {
  return { httpVersionMajor, socket } as unknown as IncomingMessage;
}

// Real Writable, but its only I/O destination is this in-memory array.
function newSink(): { sink: Writable; chunks: string[] } {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      callback();
    },
  });
  activeSinks.push(sink);
  return { sink, chunks };
}

function readOne(stream: SseStream): string {
  const value: unknown = stream.read();
  expect(typeof value).toBe('string');
  return value as string;
}

async function writeMessageAndRead(
  stream: SseStream,
  message: SseMessage,
): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    stream.writeMessage(message, error => {
      if (error) reject(error);
      else resolve();
    });
  });
  return readOne(stream);
}

afterEach(() => {
  for (const stream of activeStreams.splice(0)) stream.destroy();
  for (const sink of activeSinks.splice(0)) sink.destroy();
  vi.restoreAllMocks();
});

describe('SseStream constructor and request handling', () => {
  it('T01 defaults to HTTP/1 without a request, and cannot commit before pipe()', () => {
    const stream = newStream();
    expect(stream.headersCommitted).toBe(false);
    stream.commitHeaders();
    expect(stream.headersCommitted).toBe(false);
  });

  it('T02 accepts a missing socket or an HTTP/1 socket lacking optional methods', () => {
    expect(() => newStream(requestWith(1))).not.toThrow();
    expect(() => newStream(requestWith(1, {}))).not.toThrow();
  });

  it('T03 configures an HTTP/1 socket with a nullish-default version', () => {
    const setKeepAlive = vi.fn();
    const setNoDelay = vi.fn();
    const setTimeout = vi.fn();
    newStream(requestWith(undefined, { setKeepAlive, setNoDelay, setTimeout }));
    expect(setKeepAlive).toHaveBeenCalledTimes(1);
    expect(setKeepAlive).toHaveBeenCalledWith(true);
    expect(setNoDelay).toHaveBeenCalledTimes(1);
    expect(setNoDelay).toHaveBeenCalledWith(true);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenCalledWith(0);
  });

  it('T04 does not tune an HTTP/2 socket or send its forbidden Connection header', () => {
    const setKeepAlive = vi.fn();
    const setNoDelay = vi.fn();
    const setTimeout = vi.fn();
    const stream = newStream(
      requestWith(2, { setKeepAlive, setNoDelay, setTimeout }),
    );
    const { sink } = newSink();
    const writeHead = vi.fn();
    stream.pipe(Object.assign(sink, { writeHead }));
    stream.commitHeaders();
    expect(setKeepAlive).not.toHaveBeenCalled();
    expect(setNoDelay).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    );
    expect(writeHead.mock.calls[0][1]).not.toHaveProperty('Connection');
  });
});

describe('SseStream pipe() and commitHeaders()', () => {
  it('T05 commits default headers once, flushes, then short-circuits on repeat', () => {
    const stream = newStream();
    const { sink, chunks } = newSink();
    const writeHead = vi.fn();
    const flushHeaders = vi.fn();
    const destination = Object.assign(sink, { writeHead, flushHeaders });
    expect(stream.pipe(destination)).toBe(destination);

    stream.commitHeaders();
    expect(stream.headersCommitted).toBe(true);
    expect(writeHead).toHaveBeenCalledTimes(1);
    expect(writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control':
          'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Accel-Buffering': 'no',
      }),
    );
    expect(flushHeaders).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual(['\n']);

    stream.commitHeaders();
    expect(writeHead).toHaveBeenCalledTimes(1);
    expect(flushHeaders).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual(['\n']);
  });

  it('T06 returns before committing to a destination whose writable side ended', () => {
    const stream = newStream();
    const { sink, chunks } = newSink();
    const writeHead = vi.fn();
    stream.pipe(Object.assign(sink, { writeHead }), { end: false });
    sink.end();
    expect(sink.writableEnded).toBe(true);
    stream.commitHeaders();
    expect(stream.headersCommitted).toBe(false);
    expect(writeHead).not.toHaveBeenCalled();
    expect(chunks).toEqual([]);
  });

  it('T07 commits and writes a separator when the sink has no writeHead method', () => {
    const stream = newStream();
    const { sink, chunks } = newSink();
    stream.pipe(sink, { end: false });
    stream.commitHeaders();
    expect(stream.headersCommitted).toBe(true);
    expect(chunks).toEqual(['\n']);
  });

  it('T08 uses static sources and drops case-insensitive conflicting headers', () => {
    const statusCode = seededInteger(210, 250);
    const stream = newStream();
    const { sink, chunks } = newSink();
    const writeHead = vi.fn();
    const additionalHeaders: AdditionalHeaders = {
      'cOnTeNt-tYpE': 'application/ignored',
      cOnNeCtIoN: 'close',
      'cache-control': 'public',
      'X-Request-Id': `req-${seededInteger(1000, 9000)}`,
      'X-Count': 4,
    };
    stream.pipe(Object.assign(sink, { writeHead }), {
      statusCode,
      additionalHeaders,
    });
    stream.commitHeaders();
    expect(writeHead).toHaveBeenCalledWith(
      statusCode,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'X-Request-Id': additionalHeaders['X-Request-Id'],
        'X-Count': 4,
      }),
    );
    const headers = writeHead.mock.calls[0][1];
    expect(headers).not.toHaveProperty('cOnTeNt-tYpE');
    expect(headers).not.toHaveProperty('cOnNeCtIoN');
    expect(headers).not.toHaveProperty('cache-control');
    expect(chunks).toEqual(['\n']);
  });

  it('T09 reads factory status and headers lazily after pipe()', () => {
    const stream = newStream();
    const { sink } = newSink();
    const writeHead = vi.fn();
    let statusCode = 201;
    let additionalHeaders: AdditionalHeaders = { 'X-Late': 'old' };
    const readStatus = vi.fn(() => statusCode);
    const readHeaders = vi.fn(() => additionalHeaders);
    stream.pipe(Object.assign(sink, { writeHead }), {
      statusCode: readStatus,
      additionalHeaders: readHeaders,
    });
    expect(readStatus).not.toHaveBeenCalled();
    expect(readHeaders).not.toHaveBeenCalled();

    statusCode = seededInteger(210, 250);
    additionalHeaders = { 'X-Late': 'updated' };
    stream.commitHeaders();
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(readHeaders).toHaveBeenCalledTimes(1);
    expect(writeHead).toHaveBeenCalledWith(
      statusCode,
      expect.objectContaining({ 'X-Late': 'updated' }),
    );
  });

  it('T10 defaults a nullish factory status to 200 and additions to empty', () => {
    const stream = newStream();
    const { sink } = newSink();
    const writeHead = vi.fn();
    const readStatus = vi.fn(() => undefined);
    const readHeaders = vi.fn(() => undefined);
    stream.pipe(Object.assign(sink, { writeHead }), {
      statusCode: readStatus,
      additionalHeaders: readHeaders,
    });
    stream.commitHeaders();
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(readHeaders).toHaveBeenCalledTimes(1);
    expect(writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    );
    expect(writeHead.mock.calls[0][1]).not.toHaveProperty('X-Late');
  });

  it('T11 leaves headers uncommitted when writeHead throws, then retries', () => {
    const stream = newStream();
    const { sink, chunks } = newSink();
    const invalidHeader = new Error('invalid-header');
    const writeHead = vi.fn()
      .mockImplementationOnce(() => { throw invalidHeader; })
      .mockImplementation(() => undefined);
    stream.pipe(Object.assign(sink, { writeHead }));
    expect(() => stream.commitHeaders()).toThrow(invalidHeader);
    expect(stream.headersCommitted).toBe(false);
    expect(chunks).toEqual([]);
    stream.commitHeaders();
    expect(stream.headersCommitted).toBe(true);
    expect(writeHead).toHaveBeenCalledTimes(2);
    expect(chunks).toEqual(['\n']);
  });

  it('T12 leaves headers uncommitted when flushHeaders throws, then retries', () => {
    const stream = newStream();
    const { sink, chunks } = newSink();
    const writeHead = vi.fn();
    const flushError = new Error('flush-failed');
    const flushHeaders = vi.fn()
      .mockImplementationOnce(() => { throw flushError; })
      .mockImplementation(() => undefined);
    stream.pipe(Object.assign(sink, { writeHead, flushHeaders }));
    expect(() => stream.commitHeaders()).toThrow(flushError);
    expect(stream.headersCommitted).toBe(false);
    expect(chunks).toEqual([]);
    stream.commitHeaders();
    expect(stream.headersCommitted).toBe(true);
    expect(writeHead).toHaveBeenCalledTimes(2);
    expect(flushHeaders).toHaveBeenCalledTimes(2);
    expect(chunks).toEqual(['\n']);
  });

  it('T24 commits on the first piped transform and forwards the event', async () => {
    const stream = newStream();
    const { sink, chunks } = newSink();
    const writeHead = vi.fn();
    stream.pipe(Object.assign(sink, { writeHead }), { end: false });
    stream.write({ data: 'first' });
    expect(stream.headersCommitted).toBe(true);
    expect(writeHead).toHaveBeenCalledTimes(1);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(chunks).toEqual(['\n', 'data: first\n\n']);
  });
});

describe('SseStream _transform() and SSE formatting', () => {
  it('T13 forwards raw string chunks unchanged', () => {
    const stream = newStream();
    stream.write('already-formatted\n\n');
    expect(readOne(stream)).toBe('already-formatted\n\n');
    expect(stream.headersCommitted).toBe(false);
  });

  it('T14 sanitizes event/id and serializes mixed CR, LF and CRLF lines', () => {
    const stream = newStream();
    stream.write({
      type: 'create\r\nitem',
      id: 'user\r42\n',
      retry: 0,
      comment: 'one\r\ntwo\rthree\nfour',
      data: 'red\r\ngreen\rblue\nyellow',
    });
    expect(readOne(stream)).toBe(
      'event: createitem\n' +
        'id: user42\n' +
        'retry: 0\n' +
        ': one\n: two\n: three\n: four\n' +
        'data: red\ndata: green\ndata: blue\ndata: yellow\n\n',
    );
  });

  it('T15 stringifies object and array data before formatting', () => {
    const stream = newStream();
    const sample = seededInteger(100, 900);
    stream.write({ data: { sample, valid: true } });
    stream.write({ data: [sample, 'tail'] });
    expect(readOne(stream)).toBe(
      `data: ${JSON.stringify({ sample, valid: true })}\n\n`,
    );
    expect(readOne(stream)).toBe(
      `data: ${JSON.stringify([sample, 'tail'])}\n\n`,
    );
  });

  it('T16 differentiates omitted and explicitly empty fields', () => {
    const stream = newStream();
    stream.write({});
    stream.write({ type: '', comment: '', data: '' });
    expect(readOne(stream)).toBe('\n');
    expect(readOne(stream)).toBe(': \ndata: \n\n');
  });
});

describe('SseStream writeMessage()', () => {
  it('T17 handles comment-only heartbeat without advancing its generated id', async () => {
    const stream = newStream();
    const heartbeat = Object.freeze({ comment: 'heartbeat' });
    let inSynchronousCall = true;
    let callbackWasSynchronous: boolean | undefined;
    const completion = new Promise<void>((resolve, reject) => {
      stream.writeMessage(heartbeat, error => {
        callbackWasSynchronous = inSynchronousCall;
        if (error) reject(error);
        else resolve();
      });
    });
    inSynchronousCall = false;
    await completion;
    expect(callbackWasSynchronous).toBe(false);
    expect(readOne(stream)).toBe(': heartbeat\n\n');
    expect(await writeMessageAndRead(stream, { data: 'next' })).toBe(
      'id: 1\ndata: next\n\n',
    );
  });

  it('T18 reaches all short-circuit failure points of isCommentOnly()', async () => {
    const stream = newStream();
    const cases: { message: SseMessage; expected: string }[] = [
      {
        message: { comment: 'memo', data: 'body' },
        expected: 'id: 1\n: memo\ndata: body\n\n',
      },
      {
        message: { comment: 'memo', type: 'notice' },
        expected: 'event: notice\nid: 2\n: memo\n\n',
      },
      {
        message: { comment: 'memo', retry: 0 },
        expected: 'id: 3\nretry: 0\n: memo\n\n',
      },
      {
        message: { data: 'body' },
        expected: 'id: 4\ndata: body\n\n',
      },
    ];
    for (const testCase of cases) {
      expect(await writeMessageAndRead(stream, testCase.message)).toBe(
        testCase.expected,
      );
    }
  });

  it('T19 preserves explicit ids without increasing the generated id counter', async () => {
    const stream = newStream();
    expect(await writeMessageAndRead(stream, { data: 'a' })).toBe(
      'id: 1\ndata: a\n\n',
    );
    expect(await writeMessageAndRead(stream, { id: 'external', data: 'b' })).toBe(
      'id: external\ndata: b\n\n',
    );
    expect(await writeMessageAndRead(stream, { data: 'c' })).toBe(
      'id: 2\ndata: c\n\n',
    );
  });

  it('T20 treats runtime null id/data as nil and omits a data field', async () => {
    const stream = newStream();
    // Runtime-only boundary: the MessageEvent interface excludes null.
    const message = { id: null, data: null } as unknown as SseMessage;
    expect(await writeMessageAndRead(stream, message)).toBe('id: 1\n\n');
  });

  it('T21 copies frozen getter-backed fields before generating an id', async () => {
    const stream = newStream();
    let dataGetterCalls = 0;
    const message = Object.freeze({
      get id() { return undefined; },
      get type() { return 'signal'; },
      get data() { dataGetterCalls++; return 'fresh'; },
    });
    expect(await writeMessageAndRead(stream, message)).toBe(
      'event: signal\nid: 1\ndata: fresh\n\n',
    );
    expect(await writeMessageAndRead(stream, message)).toBe(
      'event: signal\nid: 2\ndata: fresh\n\n',
    );
    expect(dataGetterCalls).toBe(2);
    expect(message.id).toBeUndefined();
  });

  it('T22 calls back asynchronously with a serialization error without writing', async () => {
    const stream = newStream();
    const cyclic: { self?: object } = {};
    cyclic.self = cyclic;
    const callback = vi.fn();
    stream.writeMessage({ data: cyclic }, callback);
    expect(callback).not.toHaveBeenCalled();
    await new Promise<void>(resolve => process.nextTick(resolve));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(TypeError);
    expect(stream.read()).toBeNull();
    expect(stream.headersCommitted).toBe(false);
  });

  it('T23 waits for actual Transform backpressure and the drain event', async () => {
    const stream = newStream();
    // No spy on write(): pause reading and fill the real writable buffer.
    for (let index = 0; index < 48; index++) {
      stream.write(`prefill-${index}`);
    }
    expect(stream.writableNeedDrain).toBe(true);
    const callback = vi.fn();
    stream.writeMessage({ data: 'buffered' }, callback);
    expect(callback).not.toHaveBeenCalled();
    const chunks: string[] = [];
    const drained = new Promise<void>(resolve => {
      stream.once('drain', () => resolve());
    });
    stream.on('data', (chunk: string) => chunks.push(chunk));
    stream.resume();
    await drained;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith();
    expect(stream.writableNeedDrain).toBe(false);
    expect(chunks).toContain('id: 1\ndata: buffered\n\n');
  });
});
