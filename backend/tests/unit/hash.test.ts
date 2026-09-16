import { randomToken, sha256, hmacSha256, safeEqualHash } from '../../src/utils/hash.js';

describe('credential hashing utilities', () => {
  test('random tokens are non-deterministic and sufficiently long', () => {
    const a = randomToken(32); const b = randomToken(32);
    expect(a).not.toEqual(b); expect(a.length).toBeGreaterThanOrEqual(64);
  });
  test('hash comparison is constant-time safe for matching hashes', () => {
    const value = 'credential-secret'; const hash = sha256(value);
    expect(safeEqualHash(value, hash)).toBe(true);
    expect(safeEqualHash('wrong', hash)).toBe(false);
  });
  test('HMAC differs from plain digest', () => {
    expect(hmacSha256('x', 'secret')).not.toEqual(sha256('x'));
  });
});
