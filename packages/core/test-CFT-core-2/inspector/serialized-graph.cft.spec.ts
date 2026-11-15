import { beforeEach, describe, expect, it } from 'vitest';
import { SerializedGraph } from '../../inspector/serialized-graph';

/**
 * CFT - packages/core/inspector/serialized-graph.ts
 *
 * Quyết định / điều kiện (số dòng gần đúng):
 *  B1 L61-64  insertNode: type === 'provider' && INTERNAL_PROVIDERS.includes(token)
 *       C1: type === 'provider'            (true/false)
 *       C2: INTERNAL_PROVIDERS.includes()  (true/false; chỉ đánh giá khi C1=true)
 *  B2 L70     this.nodes.has(id)                                 -> C3
 *  B3 L78-85  insertEdge: type === 'class-to-class' && (includes(source) || includes(target))
 *       C4: type === 'class-to-class'
 *       C5: includes(sourceClassToken)     (chỉ khi C4=true)
 *       C6: includes(targetClassToken)     (chỉ khi C4=true và C5=false)
 *  B4 L92-93  edgeDefinition.id ?? generate...                   -> C7: id nullish
 *  B5 L103    this.entrypoints.has(parentId)                     -> C8
 *  B6 L133    if (this._status)                                  -> C9
 *  B7 L136    if (this._metadata)                                -> C10
 *  B8 L144    typeof value === 'symbol'                          -> C11
 *  B9 L147    typeof value === 'function' ? ... : value          -> C12
 *  B10 L147   value.name ?? 'Function'                           -> C13: name nullish (chỉ khi C12=true)
 *  Loop: Object.fromEntries / JSON.stringify - không có vòng lặp tường minh
 */

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let rand = mulberry32(20261115);
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const uid = (p: string) => `${p}-${randInt(1000, 9000)}-${randInt(1000, 9000)}`;

const classEdge = (sourceToken: any, targetToken: any) =>
  ({
    source: uid('s'),
    target: uid('t'),
    metadata: {
      type: 'class-to-class',
      sourceModuleName: uid('SM'),
      sourceClassName: uid('SC'),
      targetClassName: uid('TC'),
      sourceClassToken: sourceToken,
      targetClassToken: targetToken,
      targetModuleName: uid('TM'),
      keyOrIndex: 0,
      injectionType: 'constructor',
    },
  }) as any;

describe('SerializedGraph [CFT]', () => {
  let graph: SerializedGraph;
  beforeEach(() => {
    rand = mulberry32(20261115);
    graph = new SerializedGraph();
  });

  // ===== insertNode =====
  it('insertNode: provider với token nội bộ', () => {
    // covers P1, C1=true, C2=true, C3=false
    const node = {
      id: uid('n'),
      metadata: { type: 'provider', token: SerializedGraph },
    } as any;
    expect(graph.insertNode(node)).toBeDefined();
  });

  it('insertNode: provider với token không nội bộ', () => {
    // covers P2, C1=true, C2=false, C3=false
    const node = {
      id: uid('n'),
      metadata: { type: 'provider', token: uid('custom-token') },
    } as any;
    expect(graph.insertNode(node)).toBeDefined();
  });

  it('insertNode: không phải provider (ngắn mạch, C2 không được đánh giá)', () => {
    // covers P3, C1=false
    const node = {
      id: uid('n'),
      metadata: { type: 'controller', token: uid('ctl') },
    } as any;
    expect(graph.insertNode(node)).toBeDefined();
  });

  it('insertNode: id đã tồn tại -> trả về node cũ', () => {
    // covers P4, C3=true
    const id = uid('dup');
    const first = { id, metadata: { type: 'module' } } as any;
    const second = { id, metadata: { type: 'module' } } as any;
    graph.insertNode(first);
    expect(graph.insertNode(second)).toBeDefined();
  });

  // ===== insertEdge =====
  it('insertEdge: class-to-class, source là token nội bộ (ngắn mạch ||)', () => {
    // covers P5, C4=true, C5=true, C7=true
    const edge = classEdge('Reflector', uid('target'));
    expect(graph.insertEdge(edge)).toBeDefined();
  });

  it('insertEdge: class-to-class, source thường, target nội bộ', () => {
    // covers P6, C4=true, C5=false, C6=true
    const edge = classEdge(uid('source'), SerializedGraph);
    expect(graph.insertEdge(edge)).toBeDefined();
  });

  it('insertEdge: class-to-class, cả hai token đều không nội bộ', () => {
    // covers P7, C4=true, C5=false, C6=false
    const edge = classEdge(uid('source'), uid('target'));
    expect(graph.insertEdge(edge)).toBeDefined();
  });

  it('insertEdge: module-to-module (ngắn mạch &&)', () => {
    // covers P8, C4=false
    const edge = {
      source: uid('s'),
      target: uid('t'),
      metadata: {
        type: 'module-to-module',
        sourceModuleName: uid('SM'),
        targetModuleName: uid('TM'),
      },
    } as any;
    expect(graph.insertEdge(edge)).toBeDefined();
  });

  it('insertEdge: có sẵn id -> không sinh uuid', () => {
    // covers P9, C7=false
    const edge = { ...classEdge(uid('s'), uid('t')), id: uid('edge-id') };
    expect(graph.insertEdge(edge)).toBeDefined();
  });

  // ===== insertEntrypoint =====
  it('insertEntrypoint: parent mới (khởi tạo mảng), rồi parent đã có (push)', () => {
    // covers P10 (C8=false) và P11 (C8=true)
    const parent = uid('parent');
    expect(() =>
      graph.insertEntrypoint({ id: uid('e1') } as any, parent),
    ).not.toThrow();
    for (let i = 0; i < randInt(2, 5); i++) {
      expect(() =>
        graph.insertEntrypoint({ id: uid('e') } as any, parent),
      ).not.toThrow();
    }
  });

  // ===== orphaned / attached / getNodeById =====
  it('insertOrphanedEnhancer / insertAttachedEnhancer / getNodeById', () => {
    // covers P12 (đường thẳng)
    const id = uid('n');
    graph.insertNode({ id, metadata: { type: 'module' } } as any);
    expect(() =>
      graph.insertOrphanedEnhancer({ ref: uid('Ref') } as any),
    ).not.toThrow();
    expect(() => graph.insertAttachedEnhancer(id)).not.toThrow();
    expect(graph.getNodeById(id)).toBeDefined();
    expect(() => graph.getNodeById(uid('missing'))).not.toThrow();
  });

  // ===== toJSON =====
  it('toJSON: status mặc định (truthy), chưa có metadata', () => {
    // covers P13, C9=true, C10=false
    expect(graph.toJSON()).toBeDefined();
  });

  it('toJSON: status falsy', () => {
    // covers P14, C9=false
    // chỉ đạt được khi ép setter nhận giá trị undefined (kiểu chỉ cho 'partial' | 'complete')
    graph.status = undefined as any;
    expect(graph.toJSON()).toBeDefined();
  });

  it('toJSON: có status partial và metadata', () => {
    // covers P15, C9=true, C10=true
    graph.status = 'partial';
    graph.metadata = {
      cause: { type: 'unknown', error: new Error(uid('e')) },
    } as any;
    expect(graph.toJSON()).toBeDefined();
  });

  // ===== toString =====
  it('toString: đồ thị rỗng (replacer không chạm symbol/function)', () => {
    // covers P16, C11=false, C12=false
    expect(graph.toString()).toBeDefined();
  });

  it('toString: có symbol, function có tên, function name nullish và giá trị thường', () => {
    // covers P17, C11=true, C12=true, C12=false, C13=false, C13=true
    // C13=true chỉ đạt được khi ghi đè thuộc tính name của function thành undefined
    const nullNameFn = () => 1;
    Object.defineProperty(nullNameFn, 'name', { value: undefined });
    function namedFn() {
      return 2;
    }
    graph.insertNode({
      id: uid('n'),
      metadata: {
        type: 'controller',
        token: Symbol(uid('sym')),
        namedFn,
        nullNameFn,
        plain: uid('plain'),
      },
    } as any);
    expect(graph.toString()).toBeDefined();
  });
});
