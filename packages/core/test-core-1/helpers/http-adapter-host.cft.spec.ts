import { describe, expect, it } from 'vitest';
import type { AbstractHttpAdapter } from '../../adapters/http-adapter.js';
import { HttpAdapterHost } from '../../helpers/http-adapter-host.js';

// Reproducible LCG: seed 1808; salt selects a deterministic interior identifier.
// The host only stores an adapter reference; it never calls adapter methods.
const RANDOM_SEED = 1808;

function createAdapter(salt: number): AbstractHttpAdapter {
  const initialState = (RANDOM_SEED + salt) >>> 0;
  const state = (Math.imul(initialState, 1664525) + 1013904223) >>> 0;
  return Object.freeze({
    cftId: `adapter-${state}`,
  }) as unknown as AbstractHttpAdapter;
}

describe('HttpAdapterHost (CFT)', () => {
  it('T1: starts without an adapter or listening state, and neither stream emits', () => {
    const host = new HttpAdapterHost();
    const initEvents: string[] = [];
    const listenEvents: string[] = [];

    const initSubscription = host.init$.subscribe({
      next: () => initEvents.push('next'),
      complete: () => initEvents.push('complete'),
    });
    const listenSubscription = host.listen$.subscribe({
      next: () => listenEvents.push('next'),
      complete: () => listenEvents.push('complete'),
    });

    expect(host.httpAdapter).toBeUndefined();
    expect(host.listening).toBe(false);
    expect(initEvents).toEqual([]);
    expect(listenEvents).toEqual([]);

    initSubscription.unsubscribe();
    listenSubscription.unsubscribe();
  });

  it('T2: listening=false skips next/complete and retains an active listener', () => {
    const host = new HttpAdapterHost();
    const events: string[] = [];
    const subscription = host.listen$.subscribe({
      next: () => events.push('next'),
      complete: () => events.push('complete'),
    });

    host.listening = false;

    expect(host.listening).toBe(false);
    expect(events).toEqual([]);

    // The false branch has not completed the stream.
    host.listening = true;
    expect(events).toEqual(['next', 'complete']);

    subscription.unsubscribe();
  });

  it('T3: listening=true emits once, completes, and does not replay to late subscribers', () => {
    const host = new HttpAdapterHost();
    const earlyEvents: string[] = [];
    const earlySubscription = host.listen$.subscribe({
      next: () => earlyEvents.push('next'),
      complete: () => earlyEvents.push('complete'),
    });

    host.listening = true;

    const lateEvents: string[] = [];
    const lateSubscription = host.listen$.subscribe({
      next: () => lateEvents.push('next'),
      complete: () => lateEvents.push('complete'),
    });

    expect(host.listening).toBe(true);
    expect(earlyEvents).toEqual(['next', 'complete']);
    expect(lateEvents).toEqual(['complete']);

    earlySubscription.unsubscribe();
    lateSubscription.unsubscribe();
  });

  it('T4: true -> false -> true updates state without re-emitting after completion', () => {
    const host = new HttpAdapterHost();
    const events: string[] = [];
    const subscription = host.listen$.subscribe({
      next: () => events.push('next'),
      complete: () => events.push('complete'),
    });

    host.listening = true;
    expect(host.listening).toBe(true);
    expect(events).toEqual(['next', 'complete']);

    host.listening = false;
    expect(host.listening).toBe(false);
    expect(events).toEqual(['next', 'complete']);

    host.listening = true;
    expect(host.listening).toBe(true);
    expect(events).toEqual(['next', 'complete']);

    subscription.unsubscribe();
  });

  it('T5: assigning httpAdapter notifies/completes init$ and leaves listen$ untouched', () => {
    const host = new HttpAdapterHost();
    const adapter = createAdapter(17);
    const initEvents: string[] = [];
    const listenEvents: string[] = [];

    const initSubscription = host.init$.subscribe({
      next: () => initEvents.push('next'),
      complete: () => initEvents.push('complete'),
    });
    const listenSubscription = host.listen$.subscribe({
      next: () => listenEvents.push('next'),
      complete: () => listenEvents.push('complete'),
    });

    host.httpAdapter = adapter;

    expect(host.httpAdapter).toBe(adapter);
    expect(initEvents).toEqual(['next', 'complete']);
    expect(listenEvents).toEqual([]);
    expect(host.listening).toBe(false);

    initSubscription.unsubscribe();
    listenSubscription.unsubscribe();
  });

  it('T6: init$ replays the initialization signal and completion to a late subscriber', () => {
    const host = new HttpAdapterHost();
    const adapter = createAdapter(31);
    host.httpAdapter = adapter;

    const lateEvents: string[] = [];
    const subscription = host.init$.subscribe({
      next: () => lateEvents.push('next'),
      complete: () => lateEvents.push('complete'),
    });

    expect(host.httpAdapter).toBe(adapter);
    expect(lateEvents).toEqual(['next', 'complete']);

    subscription.unsubscribe();
  });

  it('T7: reassigning httpAdapter updates the getter without duplicating completed init$ events', () => {
    const host = new HttpAdapterHost();
    const firstAdapter = createAdapter(47);
    const secondAdapter = createAdapter(59);
    const earlyEvents: string[] = [];
    const earlySubscription = host.init$.subscribe({
      next: () => earlyEvents.push('next'),
      complete: () => earlyEvents.push('complete'),
    });

    host.httpAdapter = firstAdapter;
    expect(host.httpAdapter).toBe(firstAdapter);

    host.httpAdapter = secondAdapter;

    const lateEvents: string[] = [];
    const lateSubscription = host.init$.subscribe({
      next: () => lateEvents.push('next'),
      complete: () => lateEvents.push('complete'),
    });

    expect(secondAdapter).not.toBe(firstAdapter);
    expect(host.httpAdapter).toBe(secondAdapter);
    expect(earlyEvents).toEqual(['next', 'complete']);
    expect(lateEvents).toEqual(['next', 'complete']);

    earlySubscription.unsubscribe();
    lateSubscription.unsubscribe();
  });

  it('T8: the listen and init signals can complete independently in the opposite order', () => {
    const host = new HttpAdapterHost();
    const initEvents: string[] = [];
    const listenEvents: string[] = [];
    const initSubscription = host.init$.subscribe({
      next: () => initEvents.push('next'),
      complete: () => initEvents.push('complete'),
    });
    const listenSubscription = host.listen$.subscribe({
      next: () => listenEvents.push('next'),
      complete: () => listenEvents.push('complete'),
    });

    host.listening = true;
    expect(listenEvents).toEqual(['next', 'complete']);
    expect(initEvents).toEqual([]);

    const adapter = createAdapter(73);
    host.httpAdapter = adapter;

    expect(host.httpAdapter).toBe(adapter);
    expect(initEvents).toEqual(['next', 'complete']);
    expect(listenEvents).toEqual(['next', 'complete']);

    initSubscription.unsubscribe();
    listenSubscription.unsubscribe();
  });
});
