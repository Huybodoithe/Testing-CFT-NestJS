import { describe, expect, it } from 'vitest';
import { ExecutionContextHost } from '../../helpers/execution-context-host.js';

const RANDOM_SEED = 1808;

// PRNG xorshift32: mỗi fixture khởi tạo lại cùng seed, không dùng Math.random.
function makePrng(seed = RANDOM_SEED): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function makeMarker(prefix: string): { id: string } {
  const next = makePrng();
  const suffix = 100_000 + (next() % 900_000);
  return { id: `${prefix}-${suffix.toString(36)}` };
}

function makeArgs() {
  const next = makePrng();
  const request = { id: `req-${next().toString(36)}` };
  const response = { id: `res-${next().toString(36)}` };
  const nextHandler = () => `next-${next().toString(36)}`;
  return [request, response, nextHandler];
}

describe('ExecutionContextHost CFT', () => {
  describe('constructor and direct getters', () => {
    it('T1 - uses both constructor defaults and starts in http context', () => {
      const args = makeArgs();
      const host = new ExecutionContextHost(args);

      expect(host.getType()).toBe('http');
      expect(host.getClass()).toBeNull();
      expect(host.getHandler()).toBeNull();
      expect(host.getArgs()).toBe(args);
    });

    it('T2 - preserves explicitly supplied class and handler references', () => {
      class ExampleController {}
      function exampleHandler() {
        return makeMarker('handler');
      }

      const host = new ExecutionContextHost(
        makeArgs(),
        ExampleController,
        exampleHandler,
      );

      expect(host.getClass()).toBe(ExampleController);
      expect(host.getHandler()).toBe(exampleHandler);
    });

    it('T5 - returns original arguments by index, or undefined when missing', () => {
      const args = makeArgs();
      const host = new ExecutionContextHost(args);

      expect(host.getArgs()).toBe(args);
      expect(host.getArgByIndex(0)).toBe(args[0]);
      expect(host.getArgByIndex(1)).toBe(args[1]);
      expect(host.getArgByIndex(2)).toBe(args[2]);
      expect(host.getArgByIndex(args.length)).toBeUndefined();
    });
  });

  describe('setType short circuit', () => {
    it('T3 - assigns a non-empty context type (C1 true)', () => {
      const host = new ExecutionContextHost(makeArgs());

      expect(host.setType('rpc')).toBeUndefined();
      expect(host.getType()).toBe('rpc');
    });

    it('T4 - preserves the previous type for an empty string (C1 false)', () => {
      const host = new ExecutionContextHost(makeArgs());
      host.setType('ws');

      expect(host.setType('')).toBeUndefined();
      expect(host.getType()).toBe('ws');
    });
  });

  describe('switchToRpc', () => {
    it('T6 - returns the same host, mapping data/context to indices 0/1', () => {
      const args = makeArgs();
      const host = new ExecutionContextHost(args);
      const rpc = host.switchToRpc();

      expect(rpc).toBe(host);
      expect(rpc.getData()).toBe(args[0]);
      expect(rpc.getContext()).toBe(args[1]);
      expect(host.getType()).toBe('http');
    });
  });

  describe('switchToHttp', () => {
    it('T7 - returns the same host, mapping request/response/next to 0/1/2', () => {
      const args = makeArgs();
      const host = new ExecutionContextHost(args);
      const http = host.switchToHttp();

      expect(http).toBe(host);
      expect(http.getRequest()).toBe(args[0]);
      expect(http.getResponse()).toBe(args[1]);
      expect(http.getNext()).toBe(args[2]);
      expect(host.getType()).toBe('http');
    });

    it('T11 - reads updated elements from the original argument array', () => {
      const args = makeArgs();
      const host = new ExecutionContextHost(args);
      const http = host.switchToHttp();
      const replacement = makeMarker('updated-request');

      args[0] = replacement;

      expect(host.getArgs()).toBe(args);
      expect(http.getRequest()).toBe(replacement);
    });
  });

  describe('switchToWs', () => {
    it('T8 - maps client/data and evaluates the last pattern at call time', () => {
      const args = makeArgs();
      const initialPattern = makeMarker('pattern-initial');
      const nextPattern = makeMarker('pattern-updated');
      args.push(initialPattern);

      const host = new ExecutionContextHost(args);
      const ws = host.switchToWs();

      expect(ws).toBe(host);
      expect(ws.getClient()).toBe(args[0]);
      expect(ws.getData()).toBe(args[1]);
      expect(ws.getPattern()).toBe(initialPattern);

      args.push(nextPattern);
      expect(ws.getPattern()).toBe(nextPattern);
    });

    it('T9 - returns undefined for a last-pattern lookup on empty args', () => {
      const host = new ExecutionContextHost([]);
      const ws = host.switchToWs();

      expect(ws.getClient()).toBeUndefined();
      expect(ws.getData()).toBeUndefined();
      expect(ws.getPattern()).toBeUndefined();
    });
  });

  describe('switching multiple views on the same instance', () => {
    it('T10 - reuses the host and replaces colliding getData methods', () => {
      const args = makeArgs();
      const host = new ExecutionContextHost(args);
      const rpc = host.switchToRpc();

      expect(rpc.getData()).toBe(args[0]);

      const ws = host.switchToWs();
      expect(ws).toBe(host);
      expect(rpc.getData()).toBe(args[1]);
      expect(rpc.getContext()).toBe(args[1]);
      expect(ws.getPattern()).toBe(args[2]);

      const http = host.switchToHttp();
      expect(http).toBe(host);
      expect(http.getRequest()).toBe(args[0]);
      expect(http.getResponse()).toBe(args[1]);
      expect(http.getNext()).toBe(args[2]);
      expect(ws.getClient()).toBe(args[0]);
      expect(host.getType()).toBe('http');
    });
  });
});
