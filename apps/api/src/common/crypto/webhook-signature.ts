import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Constant-time check of an HMAC webhook signature over the raw request body.
 * `provided` may carry an "sha256=" style prefix (Meta) or be a bare hex digest (WAHA).
 */
export function verifyHmacSignature(
  rawBody: Buffer | string | undefined,
  provided: string | string[] | undefined,
  secret: string,
  algorithm: 'sha256' | 'sha512',
): boolean {
  if (!rawBody || !provided || !secret) return false;
  const value = (Array.isArray(provided) ? provided[0] : provided).trim().replace(/^sha(256|512)=/i, '');
  const expected = createHmac(algorithm, secret).update(rawBody).digest('hex');
  const a = Buffer.from(value, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
