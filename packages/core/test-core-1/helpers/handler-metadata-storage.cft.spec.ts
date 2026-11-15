import { describe, expect, it } from 'vitest';
import { HandlerMetadataStorage } from '../../helpers/handler-metadata-storage.js';

type SampleMetadata = Readonly<{
  id: number;
  label: string;
}>;

const RANDOM_SEED = 1808;

/**
 * Independent deterministic pseudo-random fixtures per test.
 * The disjoint prefixes guarantee distinct method keys; no test depends on
 * execution order or on chance to reach a particular control-flow branch.
 */
function makeFixture(testId: number) {
  let state = (RANDOM_SEED + testId * 997) >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const makeMetadata = (): SampleMetadata => ({
    id: 10_000 + (next() % 90_000),
    label: `metadata_${next().toString(36)}`,
  });

  return {
    method: `handle_${next().toString(36)}`,
    otherMethod: `other_${next().toString(36)}`,
    missingMethod: `missing_${next().toString(36)}`,
    first: makeMetadata(),
    second: makeMetadata(),
  };
}

describe('HandlerMetadataStorage (CFT)', () => {
  it('T1: returns early when controller.constructor is falsy (artificial_state)', () => {
    const storage = new HandlerMetadataStorage<SampleMetadata>();
    const { method, first } = makeFixture(1);
    // A deliberately invalid controller shape is required to reach B1=true.
    const controllerWithoutConstructor = { constructor: undefined };

    expect(storage.set(controllerWithoutConstructor, method, first)).toBeUndefined();
    expect(storage.get(controllerWithoutConstructor, method)).toBeUndefined();
  });

  it('T2: get returns undefined without a cached handlers map', () => {
    class Controller {}
    const storage = new HandlerMetadataStorage<SampleMetadata>();
    const { method } = makeFixture(2);

    expect(storage.get(new Controller(), method)).toBeUndefined();
  });

  it('T3: first set creates a handlers map and get returns the same metadata', () => {
    class Controller {}
    const storage = new HandlerMetadataStorage<SampleMetadata>();
    const { method, first } = makeFixture(3);
    const controller = new Controller();

    storage.set(controller, method, first);

    expect(storage.get(controller, method)).toBe(first);
  });

  it('T4: reuses an existing map for a different method and leaves absent keys undefined', () => {
    class Controller {}
    const storage = new HandlerMetadataStorage<SampleMetadata>();
    const { method, otherMethod, missingMethod, first, second } =
      makeFixture(4);
    const controller = new Controller();

    storage.set(controller, method, first);
    storage.set(controller, otherMethod, second);

    expect(storage.get(controller, method)).toBe(first);
    expect(storage.get(controller, otherMethod)).toBe(second);
    expect(storage.get(controller, missingMethod)).toBeUndefined();
  });

  it('T5: overwrites the metadata for an existing method on the same constructor', () => {
    class Controller {}
    const storage = new HandlerMetadataStorage<SampleMetadata>();
    const { method, first, second } = makeFixture(5);
    const controller = new Controller();

    storage.set(controller, method, first);
    storage.set(controller, method, second);

    expect(storage.get(controller, method)).toBe(second);
  });

  it('T6: separates equal-named classes by constructor identity and shares within each class', () => {
    const First = class SameName {};
    const Second = class SameName {};
    const storage = new HandlerMetadataStorage<SampleMetadata>();
    const { method, first, second } = makeFixture(6);

    expect(First.name).toBe(Second.name);

    storage.set(new First(), method, first);
    expect(storage.get(new Second(), method)).toBeUndefined();

    storage.set(new Second(), method, second);

    expect(storage.get(new First(), method)).toBe(first);
    expect(storage.get(new Second(), method)).toBe(second);
  });

  it('T7: does not share cached metadata between storage instances', () => {
    class Controller {}
    const firstStorage = new HandlerMetadataStorage<SampleMetadata>();
    const secondStorage = new HandlerMetadataStorage<SampleMetadata>();
    const { method, first } = makeFixture(7);
    const controller = new Controller();

    firstStorage.set(controller, method, first);

    expect(firstStorage.get(controller, method)).toBe(first);
    expect(secondStorage.get(controller, method)).toBeUndefined();
  });
});
