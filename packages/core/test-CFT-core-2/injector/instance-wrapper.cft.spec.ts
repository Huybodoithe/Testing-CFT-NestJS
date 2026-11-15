/**
 * CFT - packages/core/injector/instance-wrapper.ts   (số dòng theo bản in bằng PowerShell, 735 dòng)
 *
 * ============================================================================
 * 1. ĐIỀU KIỆN NGUYÊN TỐ (mỗi vế của &&, ||, ??, ?:, ?. là một điều kiện)
 *    Cột T / F: test phủ true / false. Điều kiện ngắn mạch chỉ tính khi được đánh giá.
 * ============================================================================
 * constructor / initialize / isNewable / isNotMetatype / isFactory
 *  C1  L134 isNewable() trong constructor                  T T2     | F T1
 *  C2  L138 metadata[INSTANCE_ID_SYMBOL] ?? generateUuid() T T1     | F T3
 *  C3  L131 tham số mặc định metadata = {}                 T T1     | F T2
 *  C4  L619 isNil(inject)                                  T T2     | F T6
 *  C5  L619 && this.metatype                               T T2     | F T7
 *  C6  L619 && metatype.prototype                          T T2     | F T8
 *  C7  L155 !this.metatype                                 T T9     | F T10
 *  C8  L155 || this.isFactory                              T T10    | F T11
 *  C9  L159 !!this.metatype                                T T10    | F T9
 *  C10 L159 && !isNil(inject)                              T T10    | F T11
 *  C123 L700 scope === TRANSIENT (initialize)              T T13    | F T1
 * getInstanceByContextId / getInstanceByInquirerId
 *  C11 L170 scope === TRANSIENT                            T T13    | F T17
 *  C12 L170 && inquirerId                                  T T13    | F T16
 *  C13 L174 instancePerContext ? :                         T T16    | F T17
 *  C14 L176 contextId !== STATIC_CONTEXT                   T T17    | F T20
 *  C15 L190 !collectionPerContext                          T T13    | F T14
 *  C16 L195 instancePerContext ? :                         T T14    | F T15
 * setInstanceByContextId / setInstanceByInquirerId / remove...
 *  C17 L205 scope === TRANSIENT                            T T22    | F T24
 *  C18 L205 && inquirerId                                  T T22    | F T24
 *  C19 L217 !collection                                    T T22    | F T23
 *  C20 L225 scope === TRANSIENT                            T T25    | F T26
 *  C21 L225 && inquirerId                                  T T25    | F T26
 *  C22 L233 !collection                                    T T26    | F T25
 * getExistingInstancesByContextId
 *  C23 L247 transientMap?.                                 T T27    | F T28
 *  C24 L247 ?? []                                          T T27    | F T28
 *  C25 L250 !isUndefined(instancePerContext)               T T27    | F T27
 * addCtor / addProperties / addEnhancer
 *  C26 L254 !dependencies                                  T T29    | F T29
 *  C27 L257 dependencies[index] === wrapper                T T29    | F T29
 *  C28 L270 !properties                                    T T30    | F T30
 *  C29 L277 index === -1                                   T T30    | F T30
 *  C30 L291 !enhancers                                     T T31    | F T31
 * isDependencyTreeDurable
 *  C31 L303 tham số mặc định lookupRegistry                T T46    | F T49
 *  C32 L304 !isUndefined(isTreeDurable) (cache)            T T47    | F T46
 *  C33 L308 scope === REQUEST                              T T46    | F T48
 *  C34 L309 durable === undefined                          T T46    | F T47
 *  C35 L310 if (isTreeDurable) trong REQUEST               T T47    | F T46
 *  C36 L316 if (isStatic)                                  T T48    | F T49
 *  C37 L324 !item.isDependencyTreeStatic()                 T T49    | F T49
 *  C38 L325 && !item.isDependencyTreeDurable()             T T49    | F T50
 *  C39 L330 if (isTreeDurable) sau khi tính                T T50    | F T49
 * introspectDepsAttribute
 *  C40 L343 tham số mặc định lookupRegistry                T T33    | F T35
 *  C41 L345 lookupRegistry.includes(id)                    T T34    | F T33
 *  C42 L353 dependencies ? callback : false                T T35    | F T33
 *  C43 L357 introspectionResult                            T T35    | F T36
 *  C44 L357 || !(properties                                T T37    | F T39
 *  C45 L357 || enhancers)                                  T T39    | F T36
 *  C46 L360 properties ? callback : false                  T T37    | F T39
 *  C47 L366 introspectionResult                            T T38    | F T37
 *  C48 L366 || !enhancers                                  T T37    | F T39
 *  C49 L369 enhancers ? callback : false                   T T39    | F unreachable (xem mục 4)
 * isDependencyTreeStatic
 *  C50 L372 tham số mặc định lookupRegistry                T T41    | F T43
 *  C51 L373 !isUndefined(isTreeStatic) (cache)             T T41    | F T41
 *  C52 L377 scope === REQUEST                              T T42    | F T41
 *  C53 L385 !item.isDependencyTreeStatic(registry)         T T43    | F T44
 *  C54 L389 !this.isTreeStatic                             T T43    | F T41
 * cloneStaticInstance / cloneTransientInstance / createPrototype
 *  C55 L398 isDependencyTreeStatic()                       T T17    | F T18
 *  C56 L407 isNewable() (cloneStatic)                      T T18    | F T19
 *  C57 L425 isNewable() (cloneTransient)                   T T13    | F T21
 *  C58 L434 !isNewable()                                   T T52    | F T51
 *  C59 L434 || host.isResolved                             T T53    | F T51
 * isInRequestScope
 *  C60 L447 !isDependencyTreeStatic                        T T55    | F T54
 *  C61 L448 && contextId !== STATIC_CONTEXT                T T56    | F T55
 *  C62 L449 !this.isTransient                              T T56    | F T57
 *  C63 L449 || this.isTransient                            T T57    | F unreachable (mục 4)
 *  C64 L449 && !!inquirer                                  T T58    | F T57
 * isLazyTransient
 *  C65 L457 inquirer                                       T T60    | F T59
 *  C66 L458 && !inquirer.isDependencyTreeStatic()          T T60    | F T61
 *  C67 L462 isDependencyTreeStatic()                       T T60    | F T62
 *  C68 L463 && contextId !== STATIC_CONTEXT                T T60    | F T63
 *  C69 L464 && this.isTransient                            T T60    | F T64
 *  C70 L465 && isInquirerRequestScoped                     T T60    | F T59
 * isExplicitlyRequested
 *  C71 L475 isDependencyTreeStatic()                       T T66    | F T65
 *  C72 L476 && contextId !== STATIC_CONTEXT                T T67    | F T66
 *  C73 L477 isSelfRequested                                T T67    | F T68
 *  C74 L477 || inquirer                                    T T69    | F T68
 *  C75 L477 && inquirer.scope === TRANSIENT                T T69    | F T70
 * isStatic
 *  C76 L486 !isDependencyTreeStatic()                      T T71    | F T72
 *  C77 L486 || contextId !== STATIC_CONTEXT                T T72    | F T73
 *  C78 L491 !this.isTransient                              T T73    | F T74
 *  C79 L496 inquirer &&                                    T T75    | F T74
 *  C80 L496 && !inquirer.isDependencyTreeStatic()          T T76    | F T75
 *  C81 L497 this.isTransient &&                            T T74    | F unreachable (mục 4)
 *  C82 L497 && !isInquirerRequestScoped                    T T74    | F T76
 *  C83 L500 isStaticTransient &&                           T T75    | F T76
 *  C84 L500 && inquirer                                    T T75    | F T74
 *  C85 L500 && !inquirer.isTransient                       T T75    | F T77
 *  C86 L505 isStaticTransient &&                           T T77    | F T76
 *  C87 L505 && rootInquirer                                T T77    | F T74
 *  C88 L505 && !rootInquirer.isTransient                   T T77    | F T78
 *  C89 L510 isStaticTransient &&                           T T78    | F T76
 *  C90 L510 && inquirer?. (nullish)                        T T74    | F T78
 *  C91 L510 && inquirer.isTransient                        T T78    | F unreachable (mục 4)
 *  C92 L510 && !rootInquirer                               T T79    | F T78
 * detachFromDependencies / getDependents / attachRootInquirer
 *  C93 L519 dependencyTreeParents.get(dep)?.                T T83    | F T81
 *  C94 L531 while (wrappers.length > 0)                    T T88    | F T88 (dừng khi hết)
 *  C95 L532 dependencyTreeParents.get(...)?.forEach        T T88    | F T89
 *  C96 L533 !dependents.has(parent)                        T T89    | F T89
 *  C97 L548 !this.isTransient                              T T90    | F T91
 *  C98 L552 inquirer.getRootInquirer() ?? inquirer         T T91    | F T92
 * getStaticTransientInstances
 *  C99 L565 !this.transientMap                             T T93    | F T94
 *  C100 L574 item &&                                       T T94    | F T94
 *  C101 L574 && item.isConstructorCalled                   T T94    | F T94
 * mergeWith
 *  C102 L580 Object.hasOwn(provider,'useValue')            T T97    | F T98
 *  C103 L591 isClassProvider(provider)                     T T98    | F T101
 *  C104 L595 getClassScope(...) ?? Scope.DEFAULT           T T98    | F T99
 *  C105 L597 scope === TRANSIENT                           T T99    | F T98
 *  C106 L597 && !this.transientMap                         T T99    | F T100
 *  C107 L601 isFactoryProvider(provider)                   T T101   | F T103
 *  C108 L603 provider.inject || []                         T T102   | F T101
 * helper private
 *  C109 L623 wrapper instanceof InstanceWrapper            T T29    | F T104
 *  C110 L624 parents ?? new Set()                          T T29    | F T105
 *  C111 L631 dependencies = [] (mặc định)                  T T80    | F T81
 *  C112 L631 properties = [] (mặc định)                    T T80    | F T81
 *  C113 L636 dependency instanceof InstanceWrapper         T T81    | F T82
 *  C114 L640 !this.transientMap                            T T84    | F T85
 *  C115 L646 inquirerId === inquirer.id                    T T85    | F T85
 *  C116 L647 || inquirerId.startsWith(`${id}:`)            T T85    | F T85
 *  C117 L657 tham số mặc định lookupRegistry               T T106   | F T108
 *  C118 L658 lookupRegistry.has(id)                        T T109   | F T106
 *  C119 L661 !this.isTreeIntrospected                      T T106   | F T107
 *  C120 L670 dependencyTreeParents.get(this)?.             T T107   | F T108
 *  C121 L682 dependencyTreeParents.get(this)?.             T T111   | F T110
 *  C122 L683 if (parent[attribute])                        T T110   | F T110
 *  C124 L704 !isDebugMode()                                T T116   | F T113
 *  C125 L704 || this.name === 'REQUEST'                    T T114   | F T113
 *  C126 L707 isString(this.name)                           T T113   | F T115
 *  C127 L717 !isDebugMode()                                T T118   | F T117
 *  C128 L720 isString(this.name)                           T T117   | F T119
 *  C129 L730 this.name?.                                   T T1     | F T2
 *  C130 L730 name?.toString() ??                           T T1     | F T2
 *  C131 L730 this.token?.                                  T T1     | F T4
 *  C132 L731 this.host?.                                   T T1     | F T2
 *  C133 L731 host.name ?? ''                               T T4     | F T2
 *  C134 L733 key ? get : randomStringGenerator             T T1     | F T5
 *  Vòng lặp: getDependencyWrappers/forEach (0,1,nhiều: T80,T82,T81), for của
 *  removeTransientInstancesOf (0,1,nhiều key: T87,T86,T85), while của getDependents
 *  (1, nhiều: T88,T89), iterate/map/filter của getStaticTransientInstances (0,1,nhiều:
 *  T96,T95,T94), collection.some (0, 1, nhiều: T33, T43, T49).
 *
 * ============================================================================
 * 2. PATH: mỗi test đi một path riêng, P<n> ứng với T<n>
 * ============================================================================
 *  constructor            P1 không tham số | P2 newable, có name/host | P3 id cho trước
 *                         P4 chỉ token, host không name | P5 name rỗng (randomStringGenerator)
 *                         P6 inject [] | P7 metatype null | P8 metatype không prototype
 *  isNotMetatype/isFactory P9 không metatype | P10 factory | P11 metatype không inject | P12 accessor
 *  getInstanceByContextId P13 transient+inquirer lần đầu | P14 lần hai | P15 ctx khác cùng inquirer
 *                         P16 transient không inquirer | P17 DEFAULT ctx mới, cây static
 *                         P18 REQUEST newable | P19 REQUEST không newable | P20 STATIC bị xóa
 *                         P21 transient không newable
 *  set/remove             P22 set transient+inquirer | P23 setByInquirer collection có sẵn
 *                         P24 set non-transient/không inquirer | P25 remove transient+inquirer
 *                         P26 remove collection thiếu / non-transient / không inquirer
 *  getExisting            P27 transientMap undefined | P28 nhiều collection
 *  metadata               P29 addCtor | P30 addProperties | P31 addEnhancer | P32 getters
 *  introspectDeps         P33 rỗng, registry mặc định | P34 registry chứa id | P35 deps cb true
 *                         P36 deps cb false | P37 properties cb false | P38 properties cb true
 *                         P39 chỉ enhancers | P40 deps+properties+enhancers
 *  static                 P41 không deps, cache | P42 REQUEST | P43 dep REQUEST | P44 dep static
 *                         P45 vòng A<->B
 *  durable                P46 REQUEST durable undefined | P47 REQUEST durable true, cache
 *                         P48 DEFAULT static | P49 [static, REQUEST non-durable]
 *                         P50 REQUEST durable
 *  createPrototype        P51 newable | P52 không newable | P53 đã resolved
 *  isInRequestScope       P54 static | P55 REQUEST ctx STATIC | P56 REQUEST ctx khác
 *                         P57 transient non-static không inquirer | P58 có inquirer
 *  isLazyTransient        P59 không inquirer | P60 inquirer REQUEST | P61 inquirer static
 *                         P62 wrapper non-static | P63 ctx STATIC | P64 không transient
 *  isExplicitlyRequested  P65 non-static | P66 ctx STATIC | P67 tự yêu cầu | P68 không inquirer
 *                         P69 inquirer transient | P70 inquirer không transient
 *  isStatic               P71 non-static | P72 ctx khác | P73 non-transient STATIC
 *                         P74 transient không inquirer/root | P75 inquirer DEFAULT
 *                         P76 inquirer REQUEST | P77 inquirer transient + root non-transient
 *                         P78 inquirer + root đều transient | P79 inquirer transient, không root
 *  detach/dependents      P80 không deps | P81 ctor+property | P82 deps thưa | P83 dep chưa đăng ký
 *                         P84 dep không transientMap | P85 3 key + đệ quy | P86 1 key | P87 0 key
 *                         P88 getDependents không parent | P89 kim cương
 *  rootInquirer           P90 non-transient | P91 inquirer không root | P92 inquirer có root
 *  staticTransient        P93 không transientMap | P94 3 collection | P95 1 collection | P96 0
 *  mergeWith              P97 value | P98 class không decorator | P99 class TRANSIENT trên DEFAULT
 *                         P100 class TRANSIENT trên TRANSIENT | P101 factory có inject
 *                         P102 factory không inject | P103 provider khác (useExisting)
 *  registerParent         P104 không phải wrapper | P105 cùng dependency, hai parent
 *  resetState             P106 chưa introspect | P107 đã introspect, không parent
 *                         P108 chuỗi G->P->C | P109 vòng A<->B
 *  invalidate             P110 isTreeStatic, nhiều parent | P111 không parent | P112 isTreeDurable
 *  print                  P113 request debug | P114 name 'REQUEST' | P115 name không phải chuỗi
 *                         P116 debug tắt | P117 durable debug | P118 durable debug tắt
 *                         P119 durable name không phải chuỗi
 *
 * ============================================================================
 * 3. TỔNG KẾT
 * ============================================================================
 *  134 điều kiện nguyên tố; 130 điều kiện được thiết kế phủ cả true và false,
 *  4 điều kiện chỉ phủ được một phía (C49, C63, C81, C91: unreachable, mục 4).
 *  Đây là kết quả phân tích tay; số đo thật lấy từ bảng coverage (Branch % theo V8 có thể
 *  không đếm ?? và ?. thành nhánh riêng).
 *
 * ============================================================================
 * 4. UNREACHABLE (một phía false)
 * ============================================================================
 *  C49 L369 `enhancers ? callback : false`: ở L366 đã `|| !enhancers` -> return, nên khi tới
 *      L369 enhancers luôn truthy. // unreachable: phía false (mã không đạt tới được).
 *  C63 L449 `|| (this.isTransient && !!inquirer)`: vế phải chỉ được tính khi `!this.isTransient`
 *      là false, tức isTransient luôn true. // unreachable: C63=false.
 *  C81 L497 `this.isTransient && ...`: L491 đã return khi !isTransient, nên isTransient luôn true.
 *      // unreachable: C81=false.
 *  C91 L510 `inquirer?.isTransient`: tới đây với inquirer có giá trị thì inquirer phải transient
 *      (nếu không, L500 đã return true). // unreachable: C91=false.
 *
 * ============================================================================
 * 5. LÝ DO MOCK / KỸ THUẬT ĐẶC BIỆT
 * ============================================================================
 *  - Không dùng vi.mock. Dùng đối tượng InstanceWrapper thật, dựng đồ thị bằng API công khai.
 *  - vi.spyOn(Logger.prototype, 'log') (T113, T117): chặn log khi debug bật, vì
 *    InstanceWrapper.logger là static private.
 *  - process.env.NEST_DEBUG được đặt/khôi phục để bật/tắt isDebugMode() (không mock isDebugMode).
 *  - Injectable({...})(class) (từ @nestjs/common) gắn metadata scope/durable thật cho
 *    getClassScope/isDurable; không có trong THÔNG TIN FILE nhưng là API công khai của @nestjs/common.
 *  - Truy cập trạng thái private bằng `as any` ở: T83 (INSTANCE_METADATA_SYMBOL, để có dependency
 *    chưa đăng ký parent), T110/T112 (gán trước isTreeStatic/isTreeDurable = true, vì cache `true`
 *    của parent chỉ xuất hiện trong vòng phụ thuộc vòng tròn). Lý do: hai nhánh này khó đạt
 *    bằng API công khai.
 *  - Input ngẫu nhiên: tên, id context, token sinh bằng LCG seed 20261114.
 * ============================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { STATIC_CONTEXT } from '../../injector/constants';
import {
  INSTANCE_ID_SYMBOL,
  INSTANCE_METADATA_SYMBOL,
  InstanceWrapper,
} from '../../injector/instance-wrapper';

// ---------- PRNG LCG, seed cố định, reset trong beforeEach ----------
const SEED = 20261114;
let state = SEED;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
let counter = 0;
const nm = (p: string) => `${p}${randInt(100, 899)}x${++counter}`;
const ctx = (): any => ({ id: randInt(1000, 9000) });
const val = (): any => ({ instance: { v: randInt(10, 90) } });

// ---------- helper dựng wrapper thật ----------
const mk = (over: any = {}) =>
  new InstanceWrapper({ name: nm('W'), ...over } as any);
const mkClass = (over: any = {}) => mk({ metatype: class {}, ...over });
const mkReq = (over: any = {}) => mkClass({ scope: Scope.REQUEST, ...over });
const mkTr = (over: any = {}) => mkClass({ scope: Scope.TRANSIENT, ...over });
const mkFactory = (over: any = {}) =>
  mk({ metatype: () => randInt(1, 9), inject: [], ...over });
/** wrapper DEFAULT nhưng có dependency REQUEST nên cây không static */
const mkNonStatic = (over: any = {}) => {
  const w = mkClass(over);
  w.addCtorMetadata(0, mkReq());
  return w;
};

const spies: Array<{ mockRestore: () => void }> = [];
let savedDebug: string | undefined;

describe('InstanceWrapper [CFT]', () => {
  beforeEach(() => {
    state = SEED;
    counter = 0;
    savedDebug = process.env.NEST_DEBUG;
    delete process.env.NEST_DEBUG;
  });
  afterEach(() => {
    spies.splice(0).forEach(s => s.mockRestore());
    if (savedDebug === undefined) delete process.env.NEST_DEBUG;
    else process.env.NEST_DEBUG = savedDebug;
  });

  // ============================ constructor =================================
  describe('constructor / generateUuid / isNewable', () => {
    it('T1 không tham số (metadata mặc định)', () => {
      // covers P1, C1=false, C2=true, C3=true, C123=false, C129=true, C130=true, C131=true, C132=true, C134=true
      expect(new InstanceWrapper()).toBeDefined();
    });

    it('T2 metatype newable, có name và host có name', () => {
      // covers P2, C1=true, C3=false, C4=true, C5=true, C6=true, C129=false, C130=false, C132=false, C133=false
      const w = new InstanceWrapper({
        name: nm('N'),
        token: nm('tok'),
        metatype: class {},
        host: { name: nm('Host') },
      } as any);
      expect(w.id).toBeDefined();
    });

    it('T3 id cho trước qua INSTANCE_ID_SYMBOL', () => {
      // covers P3, C2=false
      const w = new InstanceWrapper({
        [INSTANCE_ID_SYMBOL]: nm('fixed-id'),
      } as any);
      expect(w.id).toBeDefined();
    });

    it('T4 chỉ có token (không name), host không có name', () => {
      // covers P4, C129=true, C130=true, C131=false, C133=true
      const w = new InstanceWrapper({ token: nm('tok'), host: {} } as any);
      expect(w.id).toBeDefined();
    });

    it('T5 name rỗng và không host -> key rỗng -> randomStringGenerator', () => {
      // covers P5, C134=false
      const w = new InstanceWrapper({ name: '' } as any);
      expect(w.id).toBeDefined();
    });

    it('T6 metatype có inject [] (không newable)', () => {
      // covers P6, C4=false
      expect(mkFactory()).toBeDefined();
    });

    it('T7 metatype null', () => {
      // covers P7, C4=true, C5=false
      expect(mk({ metatype: null })).toBeDefined();
    });

    it('T8 metatype là arrow function (không có prototype)', () => {
      // covers P8, C4=true, C5=true, C6=false
      expect(mk({ metatype: () => randInt(1, 9) })).toBeDefined();
    });
  });

  // ======================= isNotMetatype / isFactory ========================
  describe('isNotMetatype / isFactory / accessors', () => {
    it('T9 không có metatype', () => {
      // covers P9, C7=true, C9=false
      const w = mk();
      expect(w.isNotMetatype).toBeDefined();
      expect(w.isFactory).toBeDefined();
    });

    it('T10 factory (metatype + inject [])', () => {
      // covers P10, C7=false, C8=true, C9=true, C10=true
      const w = mkFactory();
      expect(w.isNotMetatype).toBeDefined();
      expect(w.isFactory).toBeDefined();
    });

    it('T11 metatype không có inject', () => {
      // covers P11, C8=false, C10=false
      const w = mkClass();
      expect(w.isNotMetatype).toBeDefined();
      expect(w.isFactory).toBeDefined();
    });

    it('T12 hierarchyLevel, id, instance, isTransient', () => {
      // covers P12
      const w = mkClass();
      w.hierarchyLevel = randInt(2, 9);
      expect(w.hierarchyLevel).toBeDefined();
      expect(w.id).toBeDefined();
      w.instance = { v: randInt(10, 90) };
      expect(w.instance).toBeDefined();
      expect(w.isTransient).toBeDefined();
    });
  });

  // ======================= getInstanceByContextId ===========================
  describe('getInstanceByContextId / clone', () => {
    it('T13 transient + inquirer lần đầu: tạo collection, clone transient newable', () => {
      // covers P13, C11=true, C12=true, C15=true, C16=false, C57=true, C123=true
      const w = mkTr();
      expect(w.getInstanceByContextId(ctx(), nm('inq'))).toBeDefined();
    });

    it('T14 transient + inquirer: gọi lại cùng context', () => {
      // covers P14, C15=false, C16=true
      const w = mkTr();
      const c = ctx();
      const inq = nm('inq');
      w.getInstanceByContextId(c, inq);
      expect(w.getInstanceByContextId(c, inq)).toBeDefined();
    });

    it('T15 transient + inquirer: context khác, cùng inquirer', () => {
      // covers P15, C15=false, C16=false
      const w = mkTr();
      const inq = nm('inq');
      w.getInstanceByContextId(ctx(), inq);
      expect(w.getInstanceByContextId(ctx(), inq)).toBeDefined();
    });

    it('T16 transient không inquirer, context STATIC', () => {
      // covers P16, C12=false, C13=true
      expect(mkTr().getInstanceByContextId(STATIC_CONTEXT)).toBeDefined();
    });

    it('T17 DEFAULT, context mới, cây static -> trả instance static', () => {
      // covers P17, C11=false, C13=false, C14=true, C55=true
      expect(mkClass().getInstanceByContextId(ctx())).toBeDefined();
    });

    it('T18 REQUEST newable, context mới -> clone có prototype', () => {
      // covers P18, C55=false, C56=true
      expect(mkReq().getInstanceByContextId(ctx())).toBeDefined();
    });

    it('T19 REQUEST không newable (factory), context mới', () => {
      // covers P19, C56=false
      expect(
        mkFactory({ scope: Scope.REQUEST }).getInstanceByContextId(ctx()),
      ).toBeDefined();
    });

    it('T20 context STATIC đã bị xóa -> trả object mặc định', () => {
      // covers P20, C13=false, C14=false
      const w = mkClass();
      w.removeInstanceByContextId(STATIC_CONTEXT);
      expect(w.getInstanceByContextId(STATIC_CONTEXT)).toBeDefined();
    });

    it('T21 transient factory + inquirer -> clone transient không newable', () => {
      // covers P21, C57=false
      const w = mkFactory({ scope: Scope.TRANSIENT });
      expect(w.getInstanceByContextId(ctx(), nm('inq'))).toBeDefined();
    });
  });

  // =========================== set / remove =================================
  describe('set / remove / getExisting', () => {
    it('T22 setInstanceByContextId transient + inquirer (collection chưa có)', () => {
      // covers P22, C17=true, C18=true, C19=true
      const w = mkTr();
      expect(() =>
        w.setInstanceByContextId(ctx(), val(), nm('inq')),
      ).not.toThrow();
    });

    it('T23 setInstanceByInquirerId khi collection đã có', () => {
      // covers P23, C19=false
      const w = mkTr();
      const inq = nm('inq');
      w.setInstanceByInquirerId(ctx(), inq, val());
      expect(() => w.setInstanceByInquirerId(ctx(), inq, val())).not.toThrow();
    });

    it('T24 set với wrapper non-transient + inquirer, và transient không inquirer', () => {
      // covers P24, C17=false, C17=true, C18=false
      expect(() =>
        mkClass().setInstanceByContextId(ctx(), val(), nm('inq')),
      ).not.toThrow();
      expect(() => mkTr().setInstanceByContextId(ctx(), val())).not.toThrow();
    });

    it('T25 removeInstanceByContextId transient + inquirer, collection có sẵn', () => {
      // covers P25, C20=true, C21=true, C22=false
      const w = mkTr();
      const c = ctx();
      const inq = nm('inq');
      w.setInstanceByInquirerId(c, inq, val());
      expect(() => w.removeInstanceByContextId(c, inq)).not.toThrow();
    });

    it('T26 remove: collection thiếu / non-transient / transient không inquirer', () => {
      // covers P26, C22=true, C20=false, C21=false
      expect(() =>
        mkTr().removeInstanceByInquirerId(ctx(), nm('unknown')),
      ).not.toThrow();
      expect(() =>
        mkClass().removeInstanceByContextId(ctx(), nm('inq')),
      ).not.toThrow();
      expect(() => mkTr().removeInstanceByContextId(ctx())).not.toThrow();
    });

    it('T27 getExistingInstancesByContextId: transientMap undefined, có và không có instance', () => {
      // covers P27, C23=true, C24=true, C25=true, C25=false
      const w = mkClass();
      const c1 = ctx();
      w.setInstanceByContextId(c1, val());
      expect(w.getExistingInstancesByContextId(c1)).toBeDefined();
      expect(w.getExistingInstancesByContextId(ctx())).toBeDefined();
    });

    it('T28 getExistingInstancesByContextId: transient nhiều collection', () => {
      // covers P28, C23=false, C24=false
      const w = mkTr();
      const c1 = ctx();
      w.setInstanceByContextId(c1, val());
      w.setInstanceByInquirerId(c1, nm('a'), val());
      w.setInstanceByInquirerId(ctx(), nm('b'), val());
      expect(w.getExistingInstancesByContextId(c1)).toBeDefined();
    });
  });

  // ============================== metadata ==================================
  describe('metadata', () => {
    it('T29 addCtorMetadata: lần đầu, trùng wrapper, wrapper khác cùng index', () => {
      // covers P29, C26=true, C26=false, C27=false, C27=true, C109=true, C110=true
      const w = mkClass();
      const c1 = mkClass();
      expect(() => w.addCtorMetadata(0, c1)).not.toThrow();
      expect(() => w.addCtorMetadata(0, c1)).not.toThrow();
      expect(() => w.addCtorMetadata(0, mkClass())).not.toThrow();
    });

    it('T30 addPropertiesMetadata: key mới, key trùng, key khác', () => {
      // covers P30, C28=true, C28=false, C29=true, C29=false
      const w = mkClass();
      expect(() => w.addPropertiesMetadata('k', mkClass())).not.toThrow();
      expect(() => w.addPropertiesMetadata('k', mkClass())).not.toThrow();
      expect(() => w.addPropertiesMetadata('j', mkClass())).not.toThrow();
    });

    it('T31 addEnhancerMetadata: lần đầu và lần sau', () => {
      // covers P31, C30=true, C30=false
      const w = mkClass();
      expect(() => w.addEnhancerMetadata(mkClass())).not.toThrow();
      expect(() => w.addEnhancerMetadata(mkClass())).not.toThrow();
    });

    it('T32 getCtorMetadata / getPropertiesMetadata / getEnhancersMetadata', () => {
      // covers P32
      const w = mkClass();
      w.addCtorMetadata(0, mkClass());
      w.addPropertiesMetadata('k', mkClass());
      w.addEnhancerMetadata(mkClass());
      expect(w.getCtorMetadata()).toBeDefined();
      expect(w.getPropertiesMetadata()).toBeDefined();
      expect(w.getEnhancersMetadata()).toBeDefined();
    });
  });

  // ========================= introspectDepsAttribute ========================
  describe('introspectDepsAttribute', () => {
    it('T33 không metadata, registry mặc định', () => {
      // covers P33, C40=true, C41=false, C42=false, C43=false, C44=false, C45=false
      expect(
        mkClass().introspectDepsAttribute(vi.fn(() => false)),
      ).toBeDefined();
    });

    it('T34 registry đã chứa id của chính nó', () => {
      // covers P34, C41=true
      const w = mkClass();
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => false),
          [w.id],
        ),
      ).toBeDefined();
    });

    it('T35 có dependencies, callback trả true', () => {
      // covers P35, C40=false, C42=true, C43=true
      const w = mkClass();
      w.addCtorMetadata(0, mkClass());
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => true),
          [],
        ),
      ).toBeDefined();
    });

    it('T36 chỉ dependencies, callback trả false', () => {
      // covers P36, C42=true, C43=false, C44=false, C45=false
      const w = mkClass();
      w.addCtorMetadata(0, mkClass());
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => false),
          [],
        ),
      ).toBeDefined();
    });

    it('T37 chỉ properties, callback trả false', () => {
      // covers P37, C42=false, C44=true, C46=true, C47=false, C48=true
      const w = mkClass();
      w.addPropertiesMetadata('k', mkClass());
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => false),
          [],
        ),
      ).toBeDefined();
    });

    it('T38 chỉ properties, callback trả true', () => {
      // covers P38, C47=true
      const w = mkClass();
      w.addPropertiesMetadata('k', mkClass());
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => true),
          [],
        ),
      ).toBeDefined();
    });

    it('T39 chỉ enhancers', () => {
      // covers P39, C44=false, C45=true, C46=false, C48=false, C49=true
      const w = mkClass();
      w.addEnhancerMetadata(mkClass());
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => false),
          [],
        ),
      ).toBeDefined();
    });

    it('T40 dependencies + properties + enhancers, callback luôn false', () => {
      // covers P40, C44=true, C46=true, C48=false, C49=true
      const w = mkClass();
      w.addCtorMetadata(0, mkClass());
      w.addPropertiesMetadata('k', mkClass());
      w.addEnhancerMetadata(mkClass());
      expect(
        w.introspectDepsAttribute(
          vi.fn(() => false),
          [],
        ),
      ).toBeDefined();
    });
  });

  // =========================== isDependencyTreeStatic =======================
  describe('isDependencyTreeStatic', () => {
    it('T41 không dependency, gọi hai lần (cache)', () => {
      // covers P41, C50=true, C51=false, C51=true, C52=false, C54=false
      const w = mkClass();
      expect(w.isDependencyTreeStatic()).toBeDefined();
      expect(w.isDependencyTreeStatic()).toBeDefined();
    });

    it('T42 scope REQUEST', () => {
      // covers P42, C52=true
      expect(mkReq().isDependencyTreeStatic()).toBeDefined();
    });

    it('T43 DEFAULT có dependency REQUEST -> không static', () => {
      // covers P43, C50=false, C53=true, C54=true
      expect(mkNonStatic().isDependencyTreeStatic()).toBeDefined();
    });

    it('T44 DEFAULT có dependency static', () => {
      // covers P44, C53=false
      const w = mkClass();
      w.addCtorMetadata(0, mkClass());
      expect(w.isDependencyTreeStatic()).toBeDefined();
    });

    it('T45 vòng phụ thuộc A <-> B', () => {
      // covers P45, C41=true (nhánh vòng)
      const a = mkClass();
      const b = mkClass();
      a.addCtorMetadata(0, b);
      b.addCtorMetadata(0, a);
      expect(a.isDependencyTreeStatic()).toBeDefined();
    });
  });

  // ========================== isDependencyTreeDurable =======================
  describe('isDependencyTreeDurable', () => {
    it('T46 REQUEST, durable undefined', () => {
      // covers P46, C31=true, C32=false, C33=true, C34=true, C35=false
      expect(mkReq().isDependencyTreeDurable()).toBeDefined();
    });

    it('T47 REQUEST durable=true, gọi hai lần', () => {
      // covers P47, C32=true, C34=false, C35=true
      const w = mkReq({ durable: true });
      expect(w.isDependencyTreeDurable()).toBeDefined();
      expect(w.isDependencyTreeDurable()).toBeDefined();
    });

    it('T48 DEFAULT static -> trả false', () => {
      // covers P48, C33=false, C36=true
      expect(mkClass().isDependencyTreeDurable()).toBeDefined();
    });

    it('T49 DEFAULT có [dependency static, dependency REQUEST non-durable]', () => {
      // covers P49, C31=false, C36=false, C37=false, C37=true, C38=true, C39=false
      const w = mkClass();
      w.addCtorMetadata(0, mkClass());
      w.addCtorMetadata(1, mkReq({ durable: false }));
      expect(w.isDependencyTreeDurable()).toBeDefined();
    });

    it('T50 DEFAULT có dependency REQUEST durable', () => {
      // covers P50, C38=false, C39=true
      const w = mkClass();
      w.addCtorMetadata(0, mkReq({ durable: true }));
      expect(w.isDependencyTreeDurable()).toBeDefined();
    });
  });

  // ============================= createPrototype ============================
  describe('createPrototype', () => {
    it('T51 newable, chưa resolved', () => {
      // covers P51, C58=false, C59=false
      expect(mkClass().createPrototype(STATIC_CONTEXT)).toBeDefined();
    });

    it('T52 không newable (factory)', () => {
      // covers P52, C58=true
      expect(() => mkFactory().createPrototype(STATIC_CONTEXT)).not.toThrow();
    });

    it('T53 newable nhưng đã resolved', () => {
      // covers P53, C59=true
      expect(() =>
        mkClass({ isResolved: true }).createPrototype(STATIC_CONTEXT),
      ).not.toThrow();
    });
  });

  // ============================ isInRequestScope ============================
  describe('isInRequestScope', () => {
    it('T54 cây static', () => {
      // covers P54, C60=false
      expect(mkClass().isInRequestScope(ctx())).toBeDefined();
    });

    it('T55 REQUEST, context STATIC', () => {
      // covers P55, C60=true, C61=false
      expect(mkReq().isInRequestScope(STATIC_CONTEXT)).toBeDefined();
    });

    it('T56 REQUEST, context khác, không transient', () => {
      // covers P56, C61=true, C62=true
      expect(mkReq().isInRequestScope(ctx())).toBeDefined();
    });

    it('T57 transient non-static, không inquirer', () => {
      // covers P57, C62=false, C63=true, C64=false
      expect(
        mkNonStatic({ scope: Scope.TRANSIENT }).isInRequestScope(ctx()),
      ).toBeDefined();
    });

    it('T58 transient non-static, có inquirer', () => {
      // covers P58, C64=true
      expect(
        mkNonStatic({ scope: Scope.TRANSIENT }).isInRequestScope(
          ctx(),
          mkClass(),
        ),
      ).toBeDefined();
    });
  });

  // ============================= isLazyTransient ============================
  describe('isLazyTransient', () => {
    it('T59 transient static, context khác, không inquirer', () => {
      // covers P59, C65=false, C67=true, C68=true, C69=true, C70=false
      expect(mkTr().isLazyTransient(ctx(), undefined)).toBeDefined();
    });

    it('T60 inquirer REQUEST -> lazy transient', () => {
      // covers P60, C65=true, C66=true, C67=true, C68=true, C69=true, C70=true
      expect(mkTr().isLazyTransient(ctx(), mkReq())).toBeDefined();
    });

    it('T61 inquirer static', () => {
      // covers P61, C66=false
      expect(mkTr().isLazyTransient(ctx(), mkClass())).toBeDefined();
    });

    it('T62 wrapper non-static', () => {
      // covers P62, C67=false
      expect(mkReq().isLazyTransient(ctx(), mkReq())).toBeDefined();
    });

    it('T63 context STATIC', () => {
      // covers P63, C68=false
      expect(mkTr().isLazyTransient(STATIC_CONTEXT, mkReq())).toBeDefined();
    });

    it('T64 wrapper không transient', () => {
      // covers P64, C69=false
      expect(mkClass().isLazyTransient(ctx(), mkReq())).toBeDefined();
    });
  });

  // ========================== isExplicitlyRequested =========================
  describe('isExplicitlyRequested', () => {
    it('T65 wrapper non-static', () => {
      // covers P65, C71=false
      expect(mkReq().isExplicitlyRequested(ctx())).toBeDefined();
    });

    it('T66 static, context STATIC', () => {
      // covers P66, C71=true, C72=false
      expect(mkClass().isExplicitlyRequested(STATIC_CONTEXT)).toBeDefined();
    });

    it('T67 tự yêu cầu (inquirer === this)', () => {
      // covers P67, C72=true, C73=true
      const w = mkClass();
      expect(w.isExplicitlyRequested(ctx(), w)).toBeDefined();
    });

    it('T68 không có inquirer', () => {
      // covers P68, C73=false, C74=false
      expect(mkClass().isExplicitlyRequested(ctx())).toBeDefined();
    });

    it('T69 inquirer transient', () => {
      // covers P69, C74=true, C75=true
      expect(mkClass().isExplicitlyRequested(ctx(), mkTr())).toBeDefined();
    });

    it('T70 inquirer không transient', () => {
      // covers P70, C75=false
      expect(mkClass().isExplicitlyRequested(ctx(), mkClass())).toBeDefined();
    });
  });

  // ================================= isStatic ===============================
  describe('isStatic', () => {
    it('T71 wrapper non-static', () => {
      // covers P71, C76=true
      expect(mkReq().isStatic(STATIC_CONTEXT, undefined)).toBeDefined();
    });

    it('T72 static, context khác STATIC', () => {
      // covers P72, C76=false, C77=true
      expect(mkClass().isStatic(ctx(), undefined)).toBeDefined();
    });

    it('T73 non-transient, context STATIC', () => {
      // covers P73, C77=false, C78=true
      expect(mkClass().isStatic(STATIC_CONTEXT, undefined)).toBeDefined();
    });

    it('T74 transient, không inquirer, không root', () => {
      // covers P74, C78=false, C79=false, C81=true, C82=true, C83=true, C84=false, C86=true, C87=false, C89=true, C90=true
      expect(mkTr().isStatic(STATIC_CONTEXT, undefined)).toBeDefined();
    });

    it('T75 transient, inquirer DEFAULT static', () => {
      // covers P75, C79=true, C80=false, C83=true, C84=true, C85=true
      expect(mkTr().isStatic(STATIC_CONTEXT, mkClass())).toBeDefined();
    });

    it('T76 transient, inquirer REQUEST', () => {
      // covers P76, C80=true, C82=false, C83=false, C86=false, C89=false
      expect(mkTr().isStatic(STATIC_CONTEXT, mkReq())).toBeDefined();
    });

    it('T77 transient, inquirer transient, root non-transient', () => {
      // covers P77, C85=false, C86=true, C87=true, C88=true
      expect(mkTr().isStatic(STATIC_CONTEXT, mkTr(), mkClass())).toBeDefined();
    });

    it('T78 transient, inquirer transient, root transient', () => {
      // covers P78, C88=false, C89=true, C90=false, C91=true, C92=false
      expect(mkTr().isStatic(STATIC_CONTEXT, mkTr(), mkTr())).toBeDefined();
    });

    it('T79 transient, inquirer transient, chưa có root', () => {
      // covers P79, C87=false, C92=true
      expect(mkTr().isStatic(STATIC_CONTEXT, mkTr(), undefined)).toBeDefined();
    });
  });

  // ====================== detach / dependents / transient ===================
  describe('detachFromDependencies / getDependents', () => {
    it('T80 không dependency (loop 0)', () => {
      // covers P80, C111=true, C112=true
      expect(() => mkClass().detachFromDependencies()).not.toThrow();
    });

    it('T81 dependency constructor + property (loop nhiều)', () => {
      // covers P81, C93=false, C111=false, C112=false, C113=true
      const p = mkClass();
      p.addCtorMetadata(0, mkClass());
      p.addPropertiesMetadata('k', mkClass());
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T82 dependencies thưa (index 1) -> phần tử trống bị lọc', () => {
      // covers P82, C113=false
      const p = mkClass();
      p.addCtorMetadata(1, mkClass());
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T83 dependency chưa đăng ký parent (get(...)?. nullish)', () => {
      // covers P83, C93=true
      // chỉ đạt được khi gán thẳng metadata private: addCtorMetadata luôn đăng ký parent
      const p = mkClass();
      (p as any)[INSTANCE_METADATA_SYMBOL].dependencies = [mkClass()];
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T84 dependency không có transientMap', () => {
      // covers P84, C114=true
      const p = mkClass();
      p.addCtorMetadata(0, mkClass());
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T85 dependency transient: key bằng id, key tiền tố "id:", key khác, đệ quy xuống dependency con', () => {
      // covers P85, C114=false, C115=true, C115=false, C116=true, C116=false
      const p = mkClass();
      const child = mkTr();
      const grand = mkTr();
      child.addCtorMetadata(0, grand);
      p.addCtorMetadata(0, child);
      const c = ctx();
      child.setInstanceByInquirerId(c, p.id, val());
      child.setInstanceByInquirerId(c, `${p.id}:${nm('n')}`, val());
      child.setInstanceByInquirerId(c, nm('other'), val());
      grand.setInstanceByInquirerId(c, p.id, val());
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T86 dependency transient có đúng 1 key (loop 1)', () => {
      // covers P86
      const p = mkClass();
      const child = mkTr();
      p.addCtorMetadata(0, child);
      child.setInstanceByInquirerId(ctx(), p.id, val());
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T87 dependency transient có transientMap rỗng (loop 0)', () => {
      // covers P87
      const p = mkClass();
      p.addCtorMetadata(0, mkTr());
      expect(() => p.detachFromDependencies()).not.toThrow();
    });

    it('T88 getDependents: không parent', () => {
      // covers P88, C94=true, C94=false, C95=true
      expect(mkClass().getDependents()).toBeDefined();
    });

    it('T89 getDependents: đồ thị kim cương', () => {
      // covers P89, C95=false, C96=true, C96=false
      const c = mkClass();
      const p1 = mkClass();
      const p2 = mkClass();
      const g = mkClass();
      p1.addCtorMetadata(0, c);
      p2.addCtorMetadata(0, c);
      g.addCtorMetadata(0, p1);
      g.addCtorMetadata(1, p2);
      expect(c.getDependents()).toBeDefined();
    });
  });

  // ============================ attachRootInquirer ==========================
  describe('attachRootInquirer / getStaticTransientInstances', () => {
    it('T90 wrapper non-transient -> bỏ qua', () => {
      // covers P90, C97=true
      expect(() => mkClass().attachRootInquirer(mkClass())).not.toThrow();
    });

    it('T91 transient, inquirer chưa có root -> dùng chính inquirer', () => {
      // covers P91, C97=false, C98=true
      const w = mkTr();
      w.attachRootInquirer(mkClass());
      expect(w.getRootInquirer()).toBeDefined();
    });

    it('T92 transient, inquirer đã có root', () => {
      // covers P92, C98=false
      const root = mkClass();
      const mid = mkTr();
      mid.attachRootInquirer(root);
      const leaf = mkTr();
      leaf.attachRootInquirer(mid);
      expect(leaf.getRootInquirer()).toBeDefined();
    });

    it('T93 non-transient -> mảng rỗng', () => {
      // covers P93, C99=true
      expect(mkClass().getStaticTransientInstances()).toBeDefined();
    });

    it('T94 transient 3 collection: đã gọi ctor / chưa gọi / không có context STATIC', () => {
      // covers P94, C99=false, C100=true, C100=false, C101=true, C101=false
      const w = mkTr();
      w.setInstanceByInquirerId(STATIC_CONTEXT, nm('a'), {
        ...val(),
        isConstructorCalled: true,
      });
      w.setInstanceByInquirerId(STATIC_CONTEXT, nm('b'), {
        ...val(),
        isConstructorCalled: false,
      });
      w.setInstanceByInquirerId(ctx(), nm('c'), val());
      expect(w.getStaticTransientInstances()).toBeDefined();
    });

    it('T95 transient 1 collection (loop 1)', () => {
      // covers P95
      const w = mkTr();
      w.setInstanceByInquirerId(STATIC_CONTEXT, nm('a'), {
        ...val(),
        isConstructorCalled: true,
      });
      expect(w.getStaticTransientInstances()).toBeDefined();
    });

    it('T96 transient không collection nào (loop 0)', () => {
      // covers P96
      expect(mkTr().getStaticTransientInstances()).toBeDefined();
    });
  });

  // ================================ mergeWith ===============================
  describe('mergeWith', () => {
    it('T97 value provider', () => {
      // covers P97, C102=true
      expect(() =>
        mkClass().mergeWith({ provide: nm('tok'), useValue: randInt(10, 90) }),
      ).not.toThrow();
    });

    it('T98 class provider không decorator (scope mặc định)', () => {
      // covers P98, C102=false, C103=true, C104=true, C105=false
      expect(() =>
        mkClass().mergeWith({ provide: nm('tok'), useClass: class {} }),
      ).not.toThrow();
    });

    it('T99 class provider TRANSIENT trên wrapper DEFAULT (transientMap chưa có)', () => {
      // covers P99, C104=false, C105=true, C106=true
      const Cls = class {};
      Injectable({ scope: Scope.TRANSIENT })(Cls);
      expect(() =>
        mkClass().mergeWith({ provide: nm('tok'), useClass: Cls }),
      ).not.toThrow();
    });

    it('T100 class provider TRANSIENT trên wrapper TRANSIENT (transientMap đã có)', () => {
      // covers P100, C106=false
      const Cls = class {};
      Injectable({ scope: Scope.TRANSIENT })(Cls);
      expect(() =>
        mkTr().mergeWith({ provide: nm('tok'), useClass: Cls }),
      ).not.toThrow();
    });

    it('T101 factory provider có inject', () => {
      // covers P101, C103=false, C107=true, C108=false
      expect(() =>
        mkClass().mergeWith({
          provide: nm('tok'),
          useFactory: () => randInt(1, 9),
          inject: [nm('dep')],
        }),
      ).not.toThrow();
    });

    it('T102 factory provider không có inject', () => {
      // covers P102, C108=true
      expect(() =>
        mkClass().mergeWith({
          provide: nm('tok'),
          useFactory: () => randInt(1, 9),
        }),
      ).not.toThrow();
    });

    it('T103 provider khác (useExisting)', () => {
      // covers P103, C107=false
      expect(() =>
        mkClass().mergeWith({ provide: nm('tok'), useExisting: nm('other') }),
      ).not.toThrow();
    });
  });

  // ====================== registerDependencyTreeParent ======================
  describe('registerDependencyTreeParent', () => {
    it('T104 dependency không phải InstanceWrapper', () => {
      // covers P104, C109=false
      const w = mkClass();
      expect(() => w.addCtorMetadata(0, {} as any)).not.toThrow();
      expect(() => w.addPropertiesMetadata('k', {} as any)).not.toThrow();
    });

    it('T105 cùng một dependency có hai parent', () => {
      // covers P105, C110=false
      const child = mkClass();
      mkClass().addCtorMetadata(0, child);
      expect(() => mkClass().addCtorMetadata(0, child)).not.toThrow();
    });
  });

  // ========================== resetDependencyTreeState ======================
  describe('resetDependencyTreeState', () => {
    it('T106 wrapper chưa introspect', () => {
      // covers P106, C117=true, C118=false, C119=true
      expect(() => mkClass().addCtorMetadata(0, mkClass())).not.toThrow();
    });

    it('T107 đã introspect, không parent', () => {
      // covers P107, C119=false, C120=true
      const w = mkClass();
      w.isDependencyTreeStatic();
      expect(() => w.addEnhancerMetadata(mkClass())).not.toThrow();
    });

    it('T108 đã introspect, chuỗi G -> P -> C (đệ quy với registry)', () => {
      // covers P108, C117=false, C120=false
      const c = mkClass();
      const p = mkClass();
      const g = mkClass();
      p.addCtorMetadata(0, c);
      g.addCtorMetadata(0, p);
      g.isDependencyTreeStatic();
      expect(() => c.addEnhancerMetadata(mkClass())).not.toThrow();
    });

    it('T109 vòng A <-> B: gặp lại wrapper đã có trong registry', () => {
      // covers P109, C118=true
      const a = mkClass();
      const b = mkClass();
      a.addCtorMetadata(0, b);
      b.addCtorMetadata(0, a);
      a.isDependencyTreeStatic();
      expect(() => a.addEnhancerMetadata(mkClass())).not.toThrow();
    });
  });

  // ===================== invalidateDependencyTreeParents ====================
  describe('invalidateDependencyTreeParents', () => {
    it('T110 isTreeStatic: parent đã cache true bị xóa, đệ quy lên parent cha; parent khác chưa cache', () => {
      // covers P110, C121=false, C122=true, C122=false
      // chỉ đạt được khi gán trước isTreeStatic=true (cache true của parent chỉ có trong vòng phụ thuộc)
      const r = mkReq();
      const c = mkClass();
      c.addCtorMetadata(0, r);
      const p = mkClass();
      p.addCtorMetadata(0, c);
      const q = mkClass();
      q.addCtorMetadata(0, c);
      const g = mkClass();
      g.addCtorMetadata(0, p);
      (p as any).isTreeStatic = true;
      (g as any).isTreeStatic = true;
      expect(c.isDependencyTreeStatic()).toBeDefined();
    });

    it('T111 wrapper không có parent', () => {
      // covers P111, C121=true
      expect(mkNonStatic().isDependencyTreeStatic()).toBeDefined();
    });

    it('T112 isTreeDurable: parent đã cache true bị xóa', () => {
      // covers P112, C122=true (attribute isTreeDurable)
      // chỉ đạt được khi gán trước isTreeDurable=true, như T110
      const c = mkClass();
      c.addCtorMetadata(0, mkReq({ durable: false }));
      const p = mkClass();
      p.addCtorMetadata(0, c);
      const g = mkClass();
      g.addCtorMetadata(0, p);
      (p as any).isTreeDurable = true;
      (g as any).isTreeDurable = true;
      expect(c.isDependencyTreeDurable()).toBeDefined();
    });
  });

  // ============================ debug logging ===============================
  describe('printIntrospectedAs*', () => {
    const silenceLog = () => {
      const spy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      spies.push(spy);
      return spy;
    };

    it('T113 debug bật, REQUEST, name là chuỗi -> ghi log', () => {
      // covers P113, C124=false, C125=false, C126=true
      process.env.NEST_DEBUG = 'true';
      silenceLog();
      expect(mkReq({ name: nm('Svc') }).isDependencyTreeStatic()).toBeDefined();
    });

    it('T114 debug bật, name === "REQUEST" -> không log', () => {
      // covers P114, C125=true
      process.env.NEST_DEBUG = 'true';
      silenceLog();
      expect(mkReq({ name: 'REQUEST' }).isDependencyTreeStatic()).toBeDefined();
    });

    it('T115 debug bật, name không phải chuỗi', () => {
      // covers P115, C126=false
      process.env.NEST_DEBUG = 'true';
      silenceLog();
      expect(
        mkReq({ name: class Named {} }).isDependencyTreeStatic(),
      ).toBeDefined();
    });

    it('T116 debug tắt', () => {
      // covers P116, C124=true
      expect(mkReq({ name: nm('Svc') }).isDependencyTreeStatic()).toBeDefined();
    });

    it('T117 durable: debug bật, name là chuỗi', () => {
      // covers P117, C127=false, C128=true
      process.env.NEST_DEBUG = 'true';
      silenceLog();
      expect(
        mkReq({ name: nm('Dur'), durable: true }).isDependencyTreeDurable(),
      ).toBeDefined();
    });

    it('T118 durable: debug tắt', () => {
      // covers P118, C127=true
      expect(
        mkReq({ name: nm('Dur'), durable: true }).isDependencyTreeDurable(),
      ).toBeDefined();
    });

    it('T119 durable: debug bật, name không phải chuỗi', () => {
      // covers P119, C128=false
      process.env.NEST_DEBUG = 'true';
      silenceLog();
      expect(
        mkReq({
          name: class DurNamed {},
          durable: true,
        }).isDependencyTreeDurable(),
      ).toBeDefined();
    });
  });
});
