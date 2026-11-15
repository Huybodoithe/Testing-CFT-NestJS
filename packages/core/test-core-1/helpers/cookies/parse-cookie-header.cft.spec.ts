import { describe, expect, it } from 'vitest';
import { parseCookieHeader } from '../../../helpers/cookies/parse-cookie-header.js';

// Xorshift32: reproducible, branch-constrained alphabetic data; no Math.random.
const RANDOM_SEED = 1808;
function token(salt: number, length = 12): string {
  let state = (RANDOM_SEED + salt) >>> 0;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';

  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result += alphabet[(state >>> 0) % alphabet.length];
  }
  return result;
}

describe('parseCookieHeader — control-flow testing', () => {
  it('T1: returns a fresh prototype-less empty record for falsy headers', () => {
    for (const header of [undefined, null, ''] as const) {
      const result = parseCookieHeader(header);
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(Object.keys(result)).toEqual([]);
    }
  });

  it('T2: treats an empty array as truthy and skips its one empty pair', () => {
    const result = parseCookieHeader([]);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.keys(result)).toEqual([]);
  });

  it('T3: parses one ordinary pair without trimming, unquoting or decoding', () => {
    const name = `name-${token(1)}`;
    const value = token(2);

    const result = parseCookieHeader(`${name}=${value}`);

    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toBe(value);
  });

  it('T4: skips pairs without equals or with blank names and keeps the first duplicate', () => {
    const firstName = `first-${token(3)}`;
    const secondName = `second-${token(4)}`;
    const firstValue = token(5);
    const replacement = token(6);
    const otherValue = token(7);

    const header = [
      'unpaired',
      ' \t =rejected',
      `${firstName}=${firstValue}`,
      `\t${firstName}\t = ${replacement}`,
      `${secondName}=${otherValue}`,
      'also-unpaired',
    ].join(';');
    const result = parseCookieHeader(header);

    expect(Object.keys(result)).toEqual([firstName, secondName]);
    expect(result[firstName]).toBe(firstValue);
    expect(result[secondName]).toBe(otherValue);
  });

  it('T5: joins array entries with semicolons and splits each pair at its first equals', () => {
    const leftName = `left-${token(8)}`;
    const rightName = `right-${token(9)}`;
    const leftValue = token(10);
    const rightValue = token(11);

    const result = parseCookieHeader([
      `${leftName}=${leftValue}=remaining`,
      `${rightName}=${rightValue}`,
    ]);

    expect(Object.keys(result)).toEqual([leftName, rightName]);
    expect(result[leftName]).toBe(`${leftValue}=remaining`);
    expect(result[rightName]).toBe(rightValue);
  });

  it('T6: unquotes only when length, opening quote and closing quote all match', () => {
    const whole = token(12);
    const missingClose = token(13);
    const missingOpen = token(14);

    const result = parseCookieHeader([
      `quoted="${whole}"`,
      `noClose="${missingClose}`,
      `noOpen=${missingOpen}"`,
      'oneChar="',
      'zeroChars=',
      'emptyQuoted=""',
    ].join(';'));

    expect(result.quoted).toBe(whole);
    expect(result.noClose).toBe(`"${missingClose}`);
    expect(result.noOpen).toBe(`${missingOpen}"`);
    expect(result.oneChar).toBe('"');
    expect(result.zeroChars).toBe('');
    expect(result.emptyQuoted).toBe('');
  });

  it('T7: removes repeated spaces and tabs, but preserves NBSP and newlines', () => {
    const name = `key-${token(15)}`;
    const value = token(16);

    const result = parseCookieHeader(
      ` \t \t${name}\t \t = \t ${value} \t ;` +
        '\u00a0__Host-id=guarded; __Host-id=plain; ' +
        `line\nbreak=${value}\n`,
    );

    expect(result[name]).toBe(value);
    expect(result['\u00a0__Host-id']).toBe('guarded');
    expect(result['__Host-id']).toBe('plain');
    expect(result['line\nbreak']).toBe(`${value}\n`);
    expect(Object.keys(result)).toEqual([
      name,
      '\u00a0__Host-id',
      '__Host-id',
      'line\nbreak',
    ]);
  });

  it('T8: decodes valid percentages and returns raw values after decode errors', () => {
    const prefix = token(17);
    const result = parseCookieHeader(
      `decoded=${prefix}%20tail;` +
        'unicode=%E2%9C%93;' +
        'percent=%25;' +
        'badEscape=%ZZ;' +
        'badUtf8=%E0%A4%A;' +
        `plain=${prefix}`,
    );

    expect(result.decoded).toBe(`${prefix} tail`);
    expect(result.unicode).toBe('✓');
    expect(result.percent).toBe('%');
    expect(result.badEscape).toBe('%ZZ');
    expect(result.badUtf8).toBe('%E0%A4%A');
    expect(result.plain).toBe(prefix);
  });

  it('T9: stores prototype-like property names as own keys and rejects their duplicates', () => {
    const first = token(18);
    const second = token(19);
    const third = token(20);
    const fourth = token(21);

    const result = parseCookieHeader(
      `__proto__=${first};constructor=${second};` +
        `toString=${third};hasOwnProperty=${fourth};__proto__=ignored`,
    );

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.keys(result)).toEqual([
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
    ]);
    expect(result['__proto__']).toBe(first);
    expect(result.constructor).toBe(second);
    expect(result.toString).toBe(third);
    expect(result.hasOwnProperty).toBe(fourth);
  });

  it('T10: handles a whitespace-only value and decodes after removing double quotes', () => {
    const value = token(22);
    const result = parseCookieHeader(
      `blank= \t \t;encodedQuoted="%41%42";mixed= \t${value}\t `,
    );

    expect(result.blank).toBe('');
    expect(result.encodedQuoted).toBe('AB');
    expect(result.mixed).toBe(value);
  });
});
