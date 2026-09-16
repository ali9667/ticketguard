import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export const safeEqualHash = (value: string, expectedHash: string): boolean => {
  const actual = Buffer.from(sha256(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export const hmacSha256 = (value: string, secret: string): string => createHmac('sha256', secret).update(value).digest('hex');
