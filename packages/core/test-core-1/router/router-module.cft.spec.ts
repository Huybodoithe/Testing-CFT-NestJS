import 'reflect-metadata';
import { MODULE_PATH } from '@nestjs/common/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Module as InternalModule } from '../../injector/module.js';
import { ModulesContainer } from '../../injector/modules-container.js';
import {
  ROUTES,
  RouterModule,
  targetModulesByContainer,
} from '../../router/router-module.js';

type Routes = ConstructorParameters<typeof RouterModule>[1];

type MetadataRecord = { key: string; target: Function };
const metadataRecords: MetadataRecord[] = [];

/**
 * PRNG LCG, seed 1808. Mỗi salt tạo một segment cố định, không phụ thuộc
 * thứ tự thực thi của các test và không dùng Math.random/Date.now.
 */
function seededSegment(prefix: string, salt: number): string {
  let state = (1808 ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return `${prefix}-${1000 + (state % 8000)}`;
}

/**
 * Test double của Module: RouterModule chỉ quan sát `metatype` và thêm
 * reference vào WeakSet. Không cần chạy lifecycle của Module thật.
 */
function moduleRef(metatype: Function): InternalModule {
  return { metatype } as unknown as InternalModule;
}

function assertModulePath(
  container: ModulesContainer,
  moduleCtor: Function,
  expectedPath: string,
): void {
  const key = MODULE_PATH + container.applicationId;
  metadataRecords.push({ key, target: moduleCtor });
  expect(Reflect.getMetadata(key, moduleCtor)).toBe(expectedPath);
}

afterEach(() => {
  for (const { key, target } of metadataRecords) {
    Reflect.deleteMetadata(key, target);
  }
  metadataRecords.length = 0;
  vi.restoreAllMocks();
});

describe('RouterModule - CFT', () => {
  it('T01 register trả về đúng provider ROUTES và giữ tham chiếu routes', () => {
    class RegisteredModule {}
    const routes: Routes = [
      { path: seededSegment('register', 1), module: RegisteredModule },
    ];

    const dynamicModule = RouterModule.register(routes);

    expect(dynamicModule.module).toBe(RouterModule);
    expect(dynamicModule.providers).toHaveLength(1);
    const provider = dynamicModule.providers?.[0] as {
      provide: symbol;
      useValue: unknown;
    };
    expect(provider.provide).toBe(ROUTES);
    expect(provider.useValue).toBe(routes);
  });

  it('T02 routes rỗng: không lặp, không ghi metadata và không tạo cache', () => {
    const container = new ModulesContainer();
    const defineMetadata = vi.spyOn(Reflect, 'defineMetadata');

    new RouterModule(container, []);

    expect(defineMetadata).not.toHaveBeenCalled();
    expect(targetModulesByContainer.has(container)).toBe(false);
  });

  it('T03 một route leaf, module khớp: tạo cache và ghi đường dẫn chuẩn hóa', () => {
    class FeatureModule {}
    const container = new ModulesContainer();
    const reference = moduleRef(FeatureModule);
    container.set('feature', reference);
    const segment = seededSegment('feature', 3);

    new RouterModule(container, [{ path: segment, module: FeatureModule }]);

    assertModulePath(container, FeatureModule, `/${segment}`);
    expect(targetModulesByContainer.get(container)?.has(reference)).toBe(true);
  });

  it('T04 container không có Module: ghi metadata, tạo cache rồi return sớm', () => {
    class MissingModule {}
    const container = new ModulesContainer();
    const segment = seededSegment('missing', 4);

    new RouterModule(container, [{ path: segment, module: MissingModule }]);

    assertModulePath(container, MissingModule, `/${segment}`);
    expect(container.size).toBe(0);
    expect(targetModulesByContainer.has(container)).toBe(true);
  });

  it('T05 chỉ có Module không khớp: không đưa reference vào cache', () => {
    class RequestedModule {}
    class UnrelatedModule {}
    const container = new ModulesContainer();
    const unrelatedRef = moduleRef(UnrelatedModule);
    container.set('unrelated', unrelatedRef);
    const segment = seededSegment('unmatched', 5);

    new RouterModule(container, [
      { path: segment, module: RequestedModule },
    ]);

    assertModulePath(container, RequestedModule, `/${segment}`);
    expect(targetModulesByContainer.get(container)?.has(unrelatedRef)).toBe(
      false,
    );
  });

  it('T06 nhiều routes: tìm sau phần tử không khớp, tái sử dụng cache và cập nhật metadata', () => {
    class FirstModule {}
    class SecondModule {}
    class UnrelatedModule {}
    const container = new ModulesContainer();
    const unrelatedRef = moduleRef(UnrelatedModule);
    const firstRef = moduleRef(FirstModule);
    const secondRef = moduleRef(SecondModule);
    container.set('unrelated', unrelatedRef);
    container.set('first', firstRef);
    container.set('second', secondRef);
    const first = seededSegment('first', 6);
    const second = seededSegment('second', 7);
    const updated = seededSegment('updated', 8);

    new RouterModule(container, [
      { path: first, module: FirstModule },
      { path: second, module: SecondModule },
    ]);

    assertModulePath(container, FirstModule, `/${first}`);
    assertModulePath(container, SecondModule, `/${second}`);
    const existingCache = targetModulesByContainer.get(container);
    expect(existingCache?.has(firstRef)).toBe(true);
    expect(existingCache?.has(secondRef)).toBe(true);
    expect(existingCache?.has(unrelatedRef)).toBe(false);

    new RouterModule(container, [
      { path: updated, module: FirstModule },
    ]);

    expect(targetModulesByContainer.get(container)).toBe(existingCache);
    expect(existingCache?.has(firstRef)).toBe(true);
    expect(existingCache?.has(secondRef)).toBe(true);
    assertModulePath(container, FirstModule, `/${updated}`);
  });

  it('T07 cây lồng nhau: clone object/children, giữ function và không sửa routes gốc', () => {
    class RootModule {}
    class BranchModule {}
    class NestedFunctionModule {}
    class DirectFunctionModule {}
    class LeafModule {}
    const container = new ModulesContainer();
    const rootRef = moduleRef(RootModule);
    const branchRef = moduleRef(BranchModule);
    const nestedRef = moduleRef(NestedFunctionModule);
    const leafRef = moduleRef(LeafModule);
    container.set('root', rootRef);
    container.set('branch', branchRef);
    container.set('nested', nestedRef);
    container.set('leaf', leafRef);

    const rootSegment = seededSegment('root', 9);
    const branchSegment = seededSegment('branch', 10);
    const leafSegment = seededSegment('leaf', 11);
    const branch = {
      path: branchSegment,
      module: BranchModule,
      children: [NestedFunctionModule],
    };
    const leaf = { path: leafSegment, module: LeafModule, children: [] };
    const routes: Routes = [
      {
        path: rootSegment,
        module: RootModule,
        children: [branch, DirectFunctionModule, leaf],
      },
    ];

    new RouterModule(container, routes);

    // flattenRoutePaths biến đổi các path trong bản sao; nguồn vào không đổi.
    expect(routes[0].path).toBe(rootSegment);
    expect(branch.path).toBe(branchSegment);
    expect(leaf.path).toBe(leafSegment);
    expect(branch.children[0]).toBe(NestedFunctionModule);
    expect(routes[0].children?.[1]).toBe(DirectFunctionModule);

    assertModulePath(container, RootModule, `/${rootSegment}`);
    assertModulePath(
      container,
      BranchModule,
      `/${rootSegment}/${branchSegment}`,
    );
    assertModulePath(
      container,
      NestedFunctionModule,
      `/${rootSegment}/${branchSegment}`,
    );
    assertModulePath(container, DirectFunctionModule, `/${rootSegment}`);
    assertModulePath(
      container,
      LeafModule,
      `/${rootSegment}/${leafSegment}`,
    );
    const cache = targetModulesByContainer.get(container);
    expect(cache?.has(rootRef)).toBe(true);
    expect(cache?.has(branchRef)).toBe(true);
    expect(cache?.has(nestedRef)).toBe(true);
    expect(cache?.has(leafRef)).toBe(true);
  });

  it('T08 hai ModulesContainer dùng cache và metadata key riêng', () => {
    class SharedModule {}
    const left = new ModulesContainer();
    const right = new ModulesContainer();
    // Kiểm soát app ID để không phụ thuộc uid ngẫu nhiên của dependency.
    Object.defineProperty(left, 'applicationId', {
      value: 'cft-1808-left',
    });
    Object.defineProperty(right, 'applicationId', {
      value: 'cft-1808-right',
    });
    const leftRef = moduleRef(SharedModule);
    const rightRef = moduleRef(SharedModule);
    left.set('shared', leftRef);
    right.set('shared', rightRef);
    const leftPath = seededSegment('left', 12);
    const rightPath = seededSegment('right', 13);

    new RouterModule(left, [{ path: leftPath, module: SharedModule }]);
    new RouterModule(right, [{ path: rightPath, module: SharedModule }]);

    assertModulePath(left, SharedModule, `/${leftPath}`);
    assertModulePath(right, SharedModule, `/${rightPath}`);
    expect(MODULE_PATH + left.applicationId).not.toBe(
      MODULE_PATH + right.applicationId,
    );
    const leftCache = targetModulesByContainer.get(left);
    const rightCache = targetModulesByContainer.get(right);
    expect(leftCache).not.toBe(rightCache);
    expect(leftCache?.has(leftRef)).toBe(true);
    expect(leftCache?.has(rightRef)).toBe(false);
    expect(rightCache?.has(rightRef)).toBe(true);
    expect(rightCache?.has(leftRef)).toBe(false);
  });
});
