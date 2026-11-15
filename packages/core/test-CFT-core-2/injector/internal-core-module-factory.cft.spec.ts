import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalContextCreator } from '../../helpers/external-context-creator';
import { HttpAdapterHost } from '../../helpers/http-adapter-host';
import { InternalCoreModuleFactory } from '../../injector/internal-core-module/internal-core-module-factory';
import { InternalCoreModule } from '../../injector/internal-core-module/internal-core-module';
import { LazyModuleLoader } from '../../injector/lazy-module-loader/lazy-module-loader';
import { ModulesContainer } from '../../injector/modules-container';
import { InitializeOnPreviewAllowlist } from '../../inspector/initialize-on-preview.allowlist';
import { SerializedGraph } from '../../inspector/serialized-graph';

// Input ngẫu nhiên có seed cố định (seed = 20261114), reset trước mỗi test
let seed = 20261114;
const rand = (min: number, max: number): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};

const makeContainer = (contextOptions?: unknown): any => ({
  contextOptions,
  getModules: vi.fn().mockReturnValue(new Map()),
  serializedGraph: { marker: rand(100, 900) },
});

// Hình dạng thật của ModuleOverride không có trong THÔNG TIN FILE nên dùng đối tượng đệm
const makeOverrides = (): any[] =>
  Array.from({ length: rand(2, 5) }, () => ({ marker: rand(100, 900) }));

describe('InternalCoreModuleFactory.create (CFT)', () => {
  let registerSpy: any;
  let allowlistSpy: any;
  let httpAdapterHost: any;

  const create = (container: any, overrides?: any[]) =>
    InternalCoreModuleFactory.create(
      container,
      {} as any,
      {} as any,
      httpAdapterHost,
      {} as any,
      overrides,
    );

  // Lấy useFactory của provider theo token từ mảng đã truyền vào register()
  const factoryOf = (token: unknown): (() => unknown) =>
    registerSpy.mock.calls[0][0].find((p: any) => p.provide === token)
      .useFactory;

  beforeEach(() => {
    seed = 20261114;
    vi.restoreAllMocks();
    httpAdapterHost = { marker: rand(100, 900) };
    // Spy register để bắt mảng provider (các nhánh B1..B4 nằm trong useFactory)
    registerSpy = vi
      .spyOn(InternalCoreModule, 'register')
      .mockImplementation(((providers: unknown) => ({
        module: InternalCoreModule,
        providers,
      })) as any);
    // Allowlist là trạng thái toàn cục dùng chung, nên cô lập để không ảnh hưởng test khác
    allowlistSpy = vi
      .spyOn(InitializeOnPreviewAllowlist, 'add')
      .mockImplementation((() => undefined) as any);
  });

  it('T1: đăng ký các provider lõi và thêm module vào allowlist', () => {
    // covers P1
    const result = create(makeContainer());
    expect(result).toBeDefined();
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(allowlistSpy).toHaveBeenCalled();
  });

  it('T2: useFactory của ExternalContextCreator', () => {
    // covers P5
    const fromContainer = vi
      .spyOn(ExternalContextCreator, 'fromContainer')
      .mockReturnValue({} as any);
    create(makeContainer());
    const result = factoryOf(ExternalContextCreator)();
    expect(result).toBeDefined();
    expect(fromContainer).toHaveBeenCalled();
  });

  it('T3: useFactory của ModulesContainer', () => {
    // covers P6
    const container = makeContainer();
    create(container);
    const result = factoryOf(ModulesContainer)();
    expect(result).toBeDefined();
    expect(container.getModules).toHaveBeenCalled();
  });

  it('T4: useFactory của HttpAdapterHost', () => {
    // covers P7
    create(makeContainer());
    const result = factoryOf(HttpAdapterHost)();
    expect(result).toBeDefined();
  });

  it('T5: useFactory của SerializedGraph', () => {
    // covers P8
    create(makeContainer());
    const result = factoryOf(SerializedGraph)();
    expect(result).toBeDefined();
  });

  it('T6: LazyModuleLoader khi contextOptions là undefined, không có overrides', () => {
    // covers P2, C1=true, C2=true, C3=true (C4 không được đánh giá)
    create(makeContainer(undefined));
    const loader = factoryOf(LazyModuleLoader)();
    expect(loader).toBeDefined();
  });

  it('T7: LazyModuleLoader khi contextOptions là object rỗng', () => {
    // covers P3, C1=false, C2=true, C3=false, C4=true
    create(makeContainer({}));
    const loader = factoryOf(LazyModuleLoader)();
    expect(loader).toBeDefined();
  });

  it('T8: LazyModuleLoader khi có preview, instrument và overrides', () => {
    // covers P4, C1=false, C2=false, C3=false, C4=false
    create(
      makeContainer({
        preview: true,
        instrument: { instanceDecorator: vi.fn() },
      }),
      makeOverrides(),
    );
    const loader = factoryOf(LazyModuleLoader)();
    expect(loader).toBeDefined();
  });
});
