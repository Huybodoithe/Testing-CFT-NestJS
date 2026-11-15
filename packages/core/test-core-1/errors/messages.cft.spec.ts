import { describe, expect, it } from 'vitest';
import type { InjectorDependencyContext } from '../../injector/injector.js';
import {
  DUPLICATE_ROUTE_MESSAGE,
  INVALID_CLASS_MESSAGE,
  INVALID_CLASS_SCOPE_MESSAGE,
  INVALID_EXCEPTION_FILTER,
  INVALID_MIDDLEWARE_CONFIGURATION,
  INVALID_MIDDLEWARE_MESSAGE,
  INVALID_MODULE_MESSAGE,
  INVALID_PROVIDER_MESSAGE,
  MICROSERVICES_PACKAGE_NOT_FOUND_EXCEPTION,
  MISSING_DECORATOR_METADATA_MESSAGE,
  REQUEST_SCOPED_CREATE_MESSAGE,
  REQUEST_SCOPED_GLOBAL_ENHANCER_MESSAGE,
  ROUTE_CONFLICT_MESSAGE,
  SHADOWED_ROUTE_MESSAGE,
  UNDEFINED_FORWARDREF_MESSAGE,
  UNDEFINED_MODULE_ENTRY_MESSAGE,
  UNDEFINED_MODULE_MESSAGE,
  UNHANDLED_RUNTIME_EXCEPTION,
  UNINSTANTIATED_GLOBAL_ENHANCER_MESSAGE,
  UNKNOWN_DEPENDENCIES_MESSAGE,
  UNKNOWN_EXPORT_MESSAGE,
  UNKNOWN_REQUEST_MAPPING,
  USING_INVALID_CLASS_AS_A_MODULE_MESSAGE,
} from '../../errors/messages.js';

// Local formatting fixture, not an instance of the injector Module class.
// The target reads only `moduleRef.metatype` in getModuleName().
type ModuleReference = NonNullable<Parameters<typeof UNKNOWN_DEPENDENCIES_MESSAGE>[2]>;
const moduleWith = (metatype: ModuleReference['metatype']): ModuleReference =>
  ({ metatype }) as unknown as ModuleReference;

class FeatureModule {}
class AlphaService {}
class BetaService {}
class ForwardedModule {}
class DynamicFeatureModule {}

// One-step LCG: reproducible non-boundary token within an equivalence class.
// Each salt is independent of test order. Initial seed = 1808.
const randomToken = (salt: number): string => {
  const state = (Math.imul(1664525, (1808 + salt) >>> 0) + 1013904223) >>> 0;
  return `token-${100000 + (state % 800000)}`;
};

const withoutIndex = (key: string | symbol): InjectorDependencyContext => ({
  key,
  name: randomToken(1),
});

describe('packages/core/errors/messages.ts (CFT)', () => {
  describe('UNKNOWN_DEPENDENCIES_MESSAGE', () => {
    it('T01 - returns early for a property key and a missing module', () => {
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        Symbol('Host'),
        withoutIndex(Symbol('field')),
        undefined,
      );

      expect(message).toContain('dependencies of the Symbol(Host)');
      expect(message).toContain('"Symbol(field)" property is available');
      expect(message).toContain('is it part of the current Module?');
      expect(message).not.toContain('at index [');
    });

    it('T02 - uses a named module, quoted token and unquoted dependency list', () => {
      const token = randomToken(2);
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 1, name: token, dependencies: [AlphaService, token, BetaService] },
        moduleWith(FeatureModule),
      );

      expect(message).toContain('(AlphaService, ?, BetaService)');
      expect(message).toContain(`argument "${token}" at index [1]`);
      expect(message).toContain('is available in the FeatureModule module.');
      expect(message).toContain('- Is FeatureModule a valid NestJS module?');
      expect(message).not.toContain("appears to be undefined at runtime");
    });

    it('T03 - falls back for missing name and missing dependency array', () => {
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 0 },
        undefined,
      );

      expect(message).toContain('Consumer (?)');
      expect(message).toContain('argument at index [0]');
      expect(message).toContain('current module.');
      expect(message).toContain('If dependency is a provider');
      expect(message).not.toContain('argument dependency at index');
    });

    it('T04 - diagnoses an undefined runtime dependency and suppresses token fragment', () => {
      // Deliberate undefined injection token: this is the condition under test.
      const dependencies = [
        AlphaService,
        undefined as unknown as typeof AlphaService,
        BetaService,
      ];
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 1, name: randomToken(4), dependencies },
        moduleWith(FeatureModule),
      );

      expect(message).toContain('argument at index [1] is available in the current module.');
      expect(message).toContain('dependency at index [1] appears to be undefined at runtime');
      expect(message).toContain("'import type' instead of 'import'");
      expect(message).not.toContain('is available in the FeatureModule module.');
    });

    it('T05 - treats the built-in Object dependency as an import-type issue', () => {
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 0, name: 'thing', dependencies: [Object] },
        moduleWith(FeatureModule),
      );

      expect(message).toContain('dependency at index [0] appears to be undefined at runtime');
      expect(message).toContain('argument at index [0] is available in the current module.');
    });

    it('T06 - treats a distinct function named Object as an import-type issue', () => {
      const FunctionNamedObject = function Object() {};
      expect(FunctionNamedObject).not.toBe(Object);

      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 0, name: 'thing', dependencies: [FunctionNamedObject] },
        moduleWith(FeatureModule),
      );

      expect(message).toContain('dependency at index [0] appears to be undefined at runtime');
      expect(message).toContain('current module.');
    });

    it('T07 - formats symbol names and short-circuits the import-type check for strings', () => {
      const token = Symbol('adapter');
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 1, name: token, dependencies: [randomToken(7), token, randomToken(8)] },
        moduleWith(FeatureModule),
      );

      expect(message).toContain(`(${randomToken(7)}, ?, ${randomToken(8)})`);
      expect(message).toContain('argument Symbol(adapter) at index [1]');
      expect(message).not.toContain('appears to be undefined at runtime');
    });

    it('T08 - falls back for an empty name and a module literally named current', () => {
      class current {}
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        { index: 0, name: '', dependencies: [AlphaService] },
        moduleWith(current),
      );

      expect(message).toContain('argument dependency at index [0]');
      expect(message).toContain('is available in the current module.');
      expect(message).toContain('part of the current Module?');
    });

    it('T09 - treats a runtime null index as a property branch (artificial_state)', () => {
      const context = {
        index: null,
        key: randomToken(9),
        dependencies: [AlphaService],
      } as unknown as InjectorDependencyContext;
      const message = UNKNOWN_DEPENDENCIES_MESSAGE(
        'Consumer',
        context,
        moduleWith(FeatureModule),
      );

      expect(message).toContain(`"${context.key}" property is available`);
      expect(message).not.toContain('at index [0]');
    });
  });

  describe('instance names and scope formatting through public functions', () => {
    it('T10 - resolves forwardRef, dynamic module and plain class names in order', () => {
      const scope: unknown[] = [
        { forwardRef: () => ForwardedModule },
        { module: DynamicFeatureModule },
        AlphaService,
      ];
      const message = INVALID_MODULE_MESSAGE(undefined, 2, scope, null);

      expect(message).toContain('Nest cannot create the module instance.');
      expect(message).toContain('Scope [ForwardedModule -> DynamicFeatureModule -> AlphaService]');
    });

    it('T11 - preserves an unresolved forwardRef result (runtime undefined)', () => {
      // An unresolved circular forward reference can evaluate to undefined.
      const unresolved = { forwardRef: () => undefined } as unknown as
        Parameters<typeof USING_INVALID_CLASS_AS_A_MODULE_MESSAGE>[0];
      const message = USING_INVALID_CLASS_AS_A_MODULE_MESSAGE(
        unresolved,
        [],
        'controller',
      );

      expect(message).toContain('"undefined" is decorated with @Controller()');
      expect(message).toContain('Scope []');
    });

    it('T12 - uses an empty scope for a missing scope array (artificial_state)', () => {
      const message = UNDEFINED_FORWARDREF_MESSAGE(
        undefined as unknown as Parameters<typeof UNDEFINED_FORWARDREF_MESSAGE>[0],
      );
      expect(message).toContain('Scope []');
    });
  });

  describe('fixed templates, scope map and invalid imports', () => {
    it('T13 - emits the missing decorator metadata hint for a symbol', () => {
      const message = MISSING_DECORATOR_METADATA_MESSAGE(Symbol('Ctor'), 2);
      expect(message).toContain('The Symbol(Ctor) has no decorator metadata');
      expect(message).toContain('index [2]');
      expect(message).toContain('emitDecoratorMetadata');
    });

    it('T14 - interpolates the middleware name in a tagged template call', () => {
      const name = randomToken(14);
      const message = INVALID_MIDDLEWARE_MESSAGE`unused ${name}`;
      expect(message).toBe(`The middleware doesn't provide the 'use' method (${name})`);
    });

    it('T15 - formats an empty forward-reference scope', () => {
      const message = UNDEFINED_FORWARDREF_MESSAGE([]);
      expect(message).toContain('circular dependency between modules');
      expect(message).toContain('Scope []');
    });

    it('T16 - formats a single-element forward-reference scope', () => {
      const message = UNDEFINED_FORWARDREF_MESSAGE([AlphaService]);
      expect(message).toContain('Scope [AlphaService]');
    });

    it('T17 - classifies a null invalid module import', () => {
      const message = INVALID_MODULE_MESSAGE(FeatureModule, 1, [], null);
      expect(message).toContain('The received value `null` is of type "null".');
      expect(message).toContain('index [1] of the FeatureModule "imports" array');
    });

    it('T18 - quotes a string invalid module import', () => {
      const value = randomToken(18);
      const message = INVALID_MODULE_MESSAGE(FeatureModule, 0, [AlphaService], value);
      expect(message).toContain(`The received value \`"${value}"\` is of type "string".`);
      expect(message).toContain('Scope [AlphaService]');
    });

    it('T19 - stringifies a number invalid module import', () => {
      const value = 100 + (Number(randomToken(19).slice(-3)) % 700);
      const message = INVALID_MODULE_MESSAGE(FeatureModule, 3, [], value);
      expect(message).toContain(`The received value \`${value}\` is of type "number".`);
    });

    it('T20 - stringifies an undefined invalid module import', () => {
      const message = INVALID_MODULE_MESSAGE(FeatureModule, 4, [], undefined);
      expect(message).toContain('The received value `undefined` is of type "undefined".');
    });

    it.each([
      ['controller', '@Controller()', '"controllers" array'],
      ['provider', '@Injectable()', '"providers" array'],
      ['filter', '@Catch()', 'APP_FILTER token'],
    ] as const)(
      'T21 - switch case %s supplies its distinct class-kind hint',
      (classKind, decorator, destination) => {
        const message = USING_INVALID_CLASS_AS_A_MODULE_MESSAGE(
          AlphaService,
          [FeatureModule, BetaService],
          classKind,
        );
        expect(message).toContain(`"AlphaService" is decorated with ${decorator}`);
        expect(message).toContain(destination);
        expect(message).toContain('Scope [FeatureModule -> BetaService]');
      },
    );

    it('T22 - reports undefined module with named parent and nonempty scope', () => {
      const message = UNDEFINED_MODULE_MESSAGE(FeatureModule, 2, [AlphaService]);
      expect(message).toContain('The module at index [2]');
      expect(message).toContain('Scope [AlphaService]');
      expect(message).toContain('Use forwardRef() to avoid it.');
    });

    it('T23 - falls back to module for an unnamed parent', () => {
      const unnamed = (() => class {})();
      expect(unnamed.name).toBe('');
      const message = UNDEFINED_MODULE_MESSAGE(unnamed, 1, []);
      expect(message).toContain('Nest cannot create the module instance.');
      expect(message).toContain('Scope []');
    });

    it.each([
      ['providers', 'provider'],
      ['controllers', 'controller'],
      ['exports', 'export'],
    ] as const)(
      'T24 - derives the singular entry for %s metadata',
      (metadataKey, singular) => {
        const message = UNDEFINED_MODULE_ENTRY_MESSAGE(undefined, metadataKey, 2);
        expect(message).toContain(`The ${singular} at index [2]`);
        expect(message).toContain(`"${metadataKey}" array is undefined`);
        expect(message).toContain('Nest cannot create the module instance.');
      },
    );

    it('T25 - formats a symbol provider token', () => {
      const message = INVALID_PROVIDER_MESSAGE(Symbol('data'), 'FeatureModule');
      expect(message).toContain('The provider Symbol(data) in the FeatureModule');
      expect(message).toContain('"useClass", "useValue", "useFactory" or "useExisting"');
    });

    it('T26 - uses the provider fallback for a falsy injection token', () => {
      const message = INVALID_PROVIDER_MESSAGE('', 'FeatureModule');
      expect(message).toContain('The provider provider in the FeatureModule');
    });

    it('T27 - uses the default export token when omitted', () => {
      const message = UNKNOWN_EXPORT_MESSAGE(undefined, 'FeatureModule');
      expect(message).toContain('exported item is available');
      expect(message).toContain('within FeatureModule?');
    });

    it('T28 - uses a supplied string export token', () => {
      const token = randomToken(28);
      const message = UNKNOWN_EXPORT_MESSAGE(token, 'FeatureModule');
      expect(message).toContain(`exported ${token} is available`);
      expect(message).toContain(`Is ${token} part of`);
    });

    it('T29 - stringifies a symbol export token', () => {
      const message = UNKNOWN_EXPORT_MESSAGE(Symbol('service'), 'FeatureModule');
      expect(message).toContain('exported Symbol(service) is available');
    });

    it('T30 - emits the invalid class tagged-template message', () => {
      const name = randomToken(30);
      const message = INVALID_CLASS_MESSAGE`ignored ${name}`;
      expect(message).toBe(`ModuleRef cannot instantiate class (${name} is not constructable).`);
    });

    it('T31 - uses the supplied scoped provider name', () => {
      const name = randomToken(31);
      const message = INVALID_CLASS_SCOPE_MESSAGE`ignored ${name}`;
      expect(message).toContain(`${name} is marked as a scoped provider.`);
      expect(message).toContain('use "resolve()" instead.');
    });

    it('T32 - uses the class-name fallback for undefined and empty names', () => {
      const missing: string | undefined = undefined;
      const fromUndefined = INVALID_CLASS_SCOPE_MESSAGE`ignored ${missing}`;
      const fromEmpty = INVALID_CLASS_SCOPE_MESSAGE`ignored ${''}`;
      expect(fromUndefined).toContain('This class is marked as a scoped provider.');
      expect(fromEmpty).toContain('This class is marked as a scoped provider.');
    });

    it('T33 - formats the request-scoped create guidance', () => {
      const name = randomToken(33);
      const message = REQUEST_SCOPED_CREATE_MESSAGE(name);
      expect(message).toContain(`${name} depends on a request-scoped provider`);
      expect(message).toContain('create(type, contextId)');
    });

    it.each([
      ['useClass', 'it would run with its dependencies undefined'],
      ['useExisting', 'it would never run. Point "useExisting"'],
      ['useFactory', 'it would never run. Set "scope: Scope.REQUEST"'],
    ] as const)(
      'T34 - selects the request-scoped global enhancer hint for %s',
      (kind, expectedHint) => {
        const message = REQUEST_SCOPED_GLOBAL_ENHANCER_MESSAGE(
          'APP_GUARD',
          'AuthGuard',
          kind,
        );
        expect(message).toContain('The APP_GUARD provider (AuthGuard)');
        expect(message).toContain(expectedHint);
      },
    );

    it('T35 - reports an uninstantiated global enhancer', () => {
      const message = UNINSTANTIATED_GLOBAL_ENHANCER_MESSAGE('APP_FILTER', 'Filter');
      expect(message).toContain('The APP_FILTER provider (Filter) was not instantiated');
      expect(message).toContain("can't be applied.");
    });

    it('T36 - names a controller lacking decorator metadata', () => {
      const message = UNKNOWN_REQUEST_MAPPING(AlphaService);
      expect(message).toContain('"AlphaService" does not have the @Controller() decorator');
    });

    it('T37 - uses the anonymous-controller fallback', () => {
      const unnamed = (() => class {})();
      expect(unnamed.name).toBe('');
      const message = UNKNOWN_REQUEST_MAPPING(unnamed);
      expect(message).toContain('Perhaps, one of your controllers is missing');
      expect(message).not.toContain('"" does not have');
    });
  });

  describe('HTTP route messages and constants', () => {
    it('T38 - accepts zero route conflicts', () => {
      const message = ROUTE_CONFLICT_MESSAGE([]);
      expect(message).toContain('Conflicting HTTP routes detected:');
      expect(message).toContain('routeConflictPolicy');
      expect(message).not.toContain('  - ');
    });

    it('T39 - formats one route conflict', () => {
      const route = randomToken(39);
      const message = ROUTE_CONFLICT_MESSAGE([route]);
      expect(message).toContain(`  - ${route}`);
      expect(message.match(/  - /g)).toHaveLength(1);
    });

    it('T40 - formats multiple route conflicts in input order', () => {
      const first = randomToken(40);
      const second = randomToken(41);
      const message = ROUTE_CONFLICT_MESSAGE([first, second]);
      expect(message).toContain(`  - ${first}\n  - ${second}`);
      expect(message.match(/  - /g)).toHaveLength(2);
    });

    it('T41 - formats duplicate-route method, path and both handler labels', () => {
      const message = DUPLICATE_ROUTE_MESSAGE('GET', '/items', 'First.handler', 'Next.handler');
      expect(message).toBe(
        'Duplicate route: GET /items is registered by both First.handler and Next.handler.',
      );
    });

    it('T42 - formats a shadowed route and its winning handler', () => {
      const message = SHADOWED_ROUTE_MESSAGE(
        'GET',
        '/items/:id',
        'ParamHandler',
        '/items/*rest',
        'CatchAllHandler',
      );
      expect(message).toContain('Route GET /items/:id (ParamHandler)');
      expect(message).toContain('shadowed by GET /items/*rest (CatchAllHandler)');
      expect(message).toContain('first-registered route');
    });

    it('T43 - exposes all four static error-message strings', () => {
      expect(INVALID_MIDDLEWARE_CONFIGURATION).toContain('invalid middleware configuration');
      expect(UNHANDLED_RUNTIME_EXCEPTION).toBe('Unhandled Runtime Exception.');
      expect(INVALID_EXCEPTION_FILTER).toContain('Invalid exception filters');
      expect(MICROSERVICES_PACKAGE_NOT_FOUND_EXCEPTION).toContain(
        'Unable to load @nestjs/microservices package.',
      );
    });
  });
});
