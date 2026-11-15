import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/internal';
import { MetadataScanner } from '../../metadata-scanner.js';
import { PathsExplorer } from '../../router/paths-explorer.js';

/**
 * A deterministic, local PRNG for path names (seed 1808).
 * Each salt starts a separate sequence, so tests do not depend on execution order.
 */
const RANDOM_SEED = 1808;
function pathSegment(salt: number): string {
  let state = (RANDOM_SEED ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return `route-${state.toString(36)}`;
}

function createController() {
  class ExampleController {
    first(): void {}
    unannotated(): void {}
    collection(): void {}
  }
  return {
    instance: new ExampleController(),
    prototype: ExampleController.prototype,
  };
}

function createExplorer() {
  const scanner = new MetadataScanner();
  return { scanner, explorer: new PathsExplorer(scanner) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PathsExplorer: CFT for scanForPaths', () => {
  it('T01 B1/default B2/true+false B3/defined+undefined B4/string+array: scans several methods and skips the unannotated one', () => {
    const { instance, prototype } = createController();
    const { scanner, explorer } = createExplorer();
    const getNames = vi.spyOn(scanner, 'getAllMethodNames');
    const single = pathSegment(1);
    const group = pathSegment(2);

    Reflect.defineMetadata(PATH_METADATA, single, prototype.first);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, prototype.first);
    Reflect.defineMetadata(
      PATH_METADATA,
      [group, '/already-prefixed'],
      prototype.collection,
    );
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.POST, prototype.collection);
    Reflect.defineMetadata(VERSION_METADATA, ['v2', 'v3'], prototype.collection);

    const routes = explorer.scanForPaths(instance);

    expect(getNames).toHaveBeenCalledTimes(1);
    expect(getNames).toHaveBeenCalledWith(prototype);
    expect(routes).toHaveLength(2);
    expect(routes.map(route => route.methodName)).toEqual(['first', 'collection']);
    expect(routes[0]).toEqual({
      path: [`/${single}`],
      requestMethod: RequestMethod.GET,
      targetCallback: instance.first,
      methodName: 'first',
      version: undefined,
    });
    expect(routes[1]).toEqual({
      path: [`/${group}`, '/already-prefixed'],
      requestMethod: RequestMethod.POST,
      targetCallback: instance.collection,
      methodName: 'collection',
      version: ['v2', 'v3'],
    });
  });

  it('T02 B1/explicit B2/true: honors the supplied prototype and uses the instance callback', () => {
    const callback = vi.fn();
    const instance = { execute: callback };
    const prototype = {
      execute(): void {},
    };
    const { scanner, explorer } = createExplorer();
    const getNames = vi.spyOn(scanner, 'getAllMethodNames');
    const segment = pathSegment(3);

    Reflect.defineMetadata(PATH_METADATA, segment, prototype.execute);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.PATCH, prototype.execute);

    const routes = explorer.scanForPaths(instance, prototype);

    expect(getNames).toHaveBeenCalledWith(prototype);
    expect(routes).toEqual([
      {
        path: [`/${segment}`],
        requestMethod: RequestMethod.PATCH,
        targetCallback: callback,
        methodName: 'execute',
        version: undefined,
      },
    ]);
    expect(routes[0].targetCallback).not.toBe(prototype.execute);
  });

  it('T03 B1/default P3: returns an empty array when the scanner finds zero methods', () => {
    class EmptyController {}
    const instance = new EmptyController();
    const { scanner, explorer } = createExplorer();
    const getNames = vi.spyOn(scanner, 'getAllMethodNames');

    expect(explorer.scanForPaths(instance)).toEqual([]);
    expect(getNames).toHaveBeenCalledWith(EmptyController.prototype);
  });

  it('T04 B2/false B3/undefined P4: skips a single method without PATH metadata', () => {
    class PlainController {
      plain(): void {}
    }
    const { explorer } = createExplorer();

    expect(explorer.scanForPaths(new PlainController())).toEqual([]);
  });
});

describe('PathsExplorer: CFT for exploreMethodMetadata', () => {
  it('T05 B3/undefined: returns null even when method and version metadata exist', () => {
    const { instance, prototype } = createController();
    const { explorer } = createExplorer();
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.DELETE, prototype.first);
    Reflect.defineMetadata(VERSION_METADATA, 'v5', prototype.first);

    expect(explorer.exploreMethodMetadata(instance, prototype, 'first')).toBeNull();
  });

  it('T06 B3/defined B4/string: returns normalized path, method, version and instance callback', () => {
    const { instance, prototype } = createController();
    const { explorer } = createExplorer();
    const callback = vi.fn();
    instance.first = callback;
    const segment = pathSegment(6);

    Reflect.defineMetadata(PATH_METADATA, segment, prototype.first);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.PUT, prototype.first);
    Reflect.defineMetadata(VERSION_METADATA, 'v6', prototype.first);

    expect(explorer.exploreMethodMetadata(instance, prototype, 'first')).toEqual({
      path: [`/${segment}`],
      requestMethod: RequestMethod.PUT,
      targetCallback: callback,
      methodName: 'first',
      version: 'v6',
    });
  });

  it('T07 B4/array P7: maps an empty path array zero times', () => {
    const { instance, prototype } = createController();
    const { explorer } = createExplorer();
    Reflect.defineMetadata(PATH_METADATA, [], prototype.first);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, prototype.first);

    expect(explorer.exploreMethodMetadata(instance, prototype, 'first')).toEqual({
      path: [],
      requestMethod: RequestMethod.GET,
      targetCallback: instance.first,
      methodName: 'first',
      version: undefined,
    });
  });

  it('T08 B4/array P8: maps a single path entry once', () => {
    const { instance, prototype } = createController();
    const { explorer } = createExplorer();
    const segment = pathSegment(8);
    Reflect.defineMetadata(PATH_METADATA, [segment], prototype.first);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.POST, prototype.first);

    const route = explorer.exploreMethodMetadata(instance, prototype, 'first');

    expect(route?.path).toEqual([`/${segment}`]);
    expect(route?.requestMethod).toBe(RequestMethod.POST);
    expect(route?.targetCallback).toBe(instance.first);
  });

  it('T09 B4/array P9: maps multiple path entries and preserves pre-prefixed paths', () => {
    const { instance, prototype } = createController();
    const { explorer } = createExplorer();
    const first = pathSegment(9);
    const second = pathSegment(10);
    Reflect.defineMetadata(
      PATH_METADATA,
      [first, `/${second}`, '{/custom}'],
      prototype.collection,
    );
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.OPTIONS, prototype.collection);

    const route = explorer.exploreMethodMetadata(instance, prototype, 'collection');

    expect(route?.path).toEqual([`/${first}`, `/${second}`, '{/custom}']);
    expect(route?.methodName).toBe('collection');
    expect(route?.version).toBeUndefined();
  });

  it('T10 B3/defined B4/string: retains a defined but empty route string', () => {
    const { instance, prototype } = createController();
    const { explorer } = createExplorer();
    Reflect.defineMetadata(PATH_METADATA, '', prototype.first);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.HEAD, prototype.first);

    const route = explorer.exploreMethodMetadata(instance, prototype, 'first');

    expect(route?.path).toEqual(['']);
    expect(route?.requestMethod).toBe(RequestMethod.HEAD);
    expect(route?.targetCallback).toBe(instance.first);
  });
});
