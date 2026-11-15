import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CookieSigner,
  SIGNED_COOKIE_PREFIX,
} from '../../../helpers/cookies/cookie-signer.js';

// Seed 1808; LCG with fixed constants. The offset distinguishes test inputs.
function seededAlphanumeric(offset: number, length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let state = (1808 + offset) >>> 0;
  let result = '';

  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    result += alphabet[state % alphabet.length];
  }

  return result;
}

const FIRST_SECRET = `first-${seededAlphanumeric(1, 23)}`;
const SECOND_SECRET = `second-${seededAlphanumeric(2, 27)}`;
const THIRD_SECRET = `third-${seededAlphanumeric(3, 25)}`;
const UNRELATED_SECRET = `unrelated-${seededAlphanumeric(4, 29)}`;
const VALUE = seededAlphanumeric(5, 31);
const DOTTED_VALUE = [
  seededAlphanumeric(6, 13),
  seededAlphanumeric(7, 19),
  seededAlphanumeric(8, 17),
].join('.');

describe('CookieSigner (CFT)', () => {
  describe('constructor and sign', () => {
    it('T1 - accepts one valid string secret and signs with the canonical HMAC format', () => {
      const signer = new CookieSigner(FIRST_SECRET);
      const expectedSignature = createHmac('sha256', FIRST_SECRET)
        .update(VALUE)
        .digest('base64')
        .replace(/=+$/, '');

      const signed = signer.sign(VALUE);

      expect(signed).toBe(`${SIGNED_COOKIE_PREFIX}${VALUE}.${expectedSignature}`);
      expect(signer.unsign(signed)).toBe(VALUE);
    });

    it('T2 - accepts a non-empty secret array, uses its first secret, and copies the array', () => {
      const providedSecrets = [FIRST_SECRET, SECOND_SECRET];
      const signer = new CookieSigner(providedSecrets);

      providedSecrets[0] = THIRD_SECRET;
      const signed = signer.sign(VALUE);

      expect(new CookieSigner(FIRST_SECRET).unsign(signed)).toBe(VALUE);
      expect(new CookieSigner(THIRD_SECRET).unsign(signed)).toBeUndefined();
    });

    it('T3 - rejects an empty secret array before checking its elements', () => {
      expect(() => new CookieSigner([])).toThrowError(TypeError);
      expect(() => new CookieSigner([])).toThrowError(
        'The "cookies.secret" option must be a non-empty string or a non-empty array of non-empty strings.',
      );
    });

    it('T4 - rejects non-string secrets through the typeof short-circuit', () => {
      // Bounded casts are intentional: these inputs exercise runtime validation
      // beyond the public TypeScript parameter type.
      const nonString = 42 as unknown as string;
      const missing = undefined as unknown as string;

      expect(() => new CookieSigner([FIRST_SECRET, nonString])).toThrowError(
        TypeError,
      );
      expect(() => new CookieSigner(missing)).toThrowError(TypeError);
    });

    it('T5 - rejects empty string secrets, including after a valid array element', () => {
      expect(() => new CookieSigner('')).toThrowError(TypeError);
      expect(() => new CookieSigner([FIRST_SECRET, '', THIRD_SECRET])).toThrowError(
        TypeError,
      );
    });
  });

  describe('unsign', () => {
    it('T6 - returns undefined early for non-string runtime inputs', () => {
      const signer = new CookieSigner(FIRST_SECRET);
      const invalidInputs: unknown[] = [undefined, null, 73, { value: VALUE }];

      for (const input of invalidInputs) {
        expect(signer.unsign(input as string)).toBeUndefined();
      }
    });

    it('T7 - returns undefined without a dot, with or without the signed prefix', () => {
      const signer = new CookieSigner(FIRST_SECRET);

      expect(signer.unsign(VALUE)).toBeUndefined();
      expect(signer.unsign(`${SIGNED_COOKIE_PREFIX}${VALUE}`)).toBeUndefined();
    });

    it('T8 - accepts prefixed and unprefixed signatures for values containing dots', () => {
      const signer = new CookieSigner(FIRST_SECRET);
      const signed = signer.sign(DOTTED_VALUE);
      const unprefixed = signed.slice(SIGNED_COOKIE_PREFIX.length);

      expect(signer.unsign(signed)).toBe(DOTTED_VALUE);
      expect(signer.unsign(unprefixed)).toBe(DOTTED_VALUE);
    });

    it('T9 - rejects a signature whose byte length differs from the expected digest', () => {
      const signer = new CookieSigner(FIRST_SECRET);

      expect(signer.unsign(`${SIGNED_COOKIE_PREFIX}${VALUE}.short`)).toBeUndefined();
    });

    it('T10 - rejects a different signature of the correct byte length', () => {
      const signer = new CookieSigner(FIRST_SECRET);
      const signed = signer.sign(VALUE);
      const signatureStart = signed.lastIndexOf('.') + 1;
      const replacement = signed[signatureStart] === 'A' ? 'B' : 'A';
      const tampered =
        signed.slice(0, signatureStart) +
        replacement +
        signed.slice(signatureStart + 1);

      expect(Buffer.byteLength(tampered.slice(signatureStart))).toBe(
        Buffer.byteLength(signed.slice(signatureStart)),
      );
      expect(signer.unsign(tampered)).toBeUndefined();
    });

    it('T11 - verifies middle and last rotation secrets but rejects unrelated signatures', () => {
      const signer = new CookieSigner([
        FIRST_SECRET,
        SECOND_SECRET,
        THIRD_SECRET,
      ]);
      const middleSigned = new CookieSigner(SECOND_SECRET).sign(VALUE);
      const lastSigned = new CookieSigner(THIRD_SECRET).sign(DOTTED_VALUE);
      const unrelatedSigned = new CookieSigner(UNRELATED_SECRET).sign(VALUE);

      expect(signer.unsign(middleSigned)).toBe(VALUE);
      expect(signer.unsign(lastSigned)).toBe(DOTTED_VALUE);
      expect(signer.unsign(unrelatedSigned)).toBeUndefined();
    });
  });
});
