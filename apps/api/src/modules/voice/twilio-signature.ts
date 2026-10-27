import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Twilio request signature: base64(HMAC-SHA1(authToken, url + each POST
 * param name and value, params sorted by name)).
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(url: string, params: Record<string, unknown>, authToken: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + String(params[key] ?? ''), url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function verifyTwilioSignature(
  url: string,
  params: Record<string, unknown>,
  provided: string | string[] | undefined,
  authToken: string,
): boolean {
  const value = Array.isArray(provided) ? provided[0] : provided;
  if (!value || !authToken) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(twilioSignature(url, params, authToken));
  return a.length === b.length && timingSafeEqual(a, b);
}
